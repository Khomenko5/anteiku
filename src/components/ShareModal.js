import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../api/firebaseConfig';
import { collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion, increment } from 'firebase/firestore';
import { useToast } from '../context/ToastContext';

import UserCard from './UserCard';

export default function ShareModal({ visible, onClose, postToShare, currentUserData, allUsers }) {
  const [shareSearchText, setShareSearchText] = useState('');
  const { showToast } = useToast();

  if (!visible) return null;

  const shareDataList = [
    ...(currentUserData?.guildId && shareSearchText === '' ? [{
      id: currentUserData.guildId,
      isGuild: true,
      nickname: 'Чат гільдії',
      guildTag: currentUserData.guildTag,
    }] : []),
    ...allUsers.filter(u => (u.nickname || '').toLowerCase().includes(shareSearchText.toLowerCase()) && u.id !== auth.currentUser?.uid)
  ];

  const handleSendSharedPost = async (targetUser) => {
    if (!postToShare || !auth.currentUser) return;
    const myId = auth.currentUser.uid;
    const sharedData = { id: postToShare.id, authorId: postToShare.authorId, authorName: postToShare.authorName, authorAvatarUrl: postToShare.authorAvatarUrl || null, text: postToShare.text || null, imageUrl: postToShare.imageUrl || null };

    try {
      if (targetUser.isGuild) {
        await addDoc(collection(db, "guilds", targetUser.id, "messages"), { text: "", sharedPost: sharedData, senderId: myId, senderName: currentUserData.nickname, createdAt: serverTimestamp() });
        showToast('success', 'Успіх', 'Пост успішно переслано в чат гільдії!');
      } else {
        const targetId = targetUser.id;
        const chatId = myId < targetId ? `${myId}_${targetId}` : `${targetId}_${myId}`;
        await addDoc(collection(db, "chats", chatId, "messages"), { text: "", sharedPost: sharedData, senderId: myId, createdAt: serverTimestamp(), isRead: false });
        await updateDoc(doc(db, "users", myId), { activeContacts: arrayUnion(targetId) });
        await updateDoc(doc(db, "users", targetId), { activeContacts: arrayUnion(myId), [`unreadCounts.${myId}`]: increment(1) });
        showToast('success', 'Успіх', `Пост переслано до ${targetUser.nickname}!`);
      }
      setShareSearchText(''); 
      onClose(); 
    } catch (error) { 
      showToast('error', 'Помилка', 'Не вдалося переслати пост.'); 
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
        <View style={styles.searchModalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Переслати повідомлення</Text>
            <TouchableOpacity onPress={onClose} style={Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined}>
              <Ionicons name="close" size={28} color="#FFF80" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.searchInputWrapper}>
            <Ionicons name="search" size={20} color="#FFF80" style={{ marginRight: 10 }} />
            <TextInput 
              style={[styles.searchModalInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} 
              placeholder="Кому відправити?..." 
              placeholderTextColor="#FFF80"
              value={shareSearchText}
              onChangeText={setShareSearchText}
            />
          </View>

          <FlatList
            data={shareDataList}
            keyExtractor={item => item.id}
            ListEmptyComponent={<Text style={[styles.emptyText, { color: '#FFF80' }]}>Нікого не знайдено</Text>}
            renderItem={({item}) => (
              <UserCard 
                item={item} 
                onPress={() => handleSendSharedPost(item)} 
                rightIconName="paper-plane"
              />
            )}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(48, 45, 40, 0.95)', justifyContent: 'flex-end' },
  searchModalContent: { backgroundColor: '#47392b', flex: 1, marginTop: 60, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, borderWidth: 1, borderColor: '#D9770640', maxWidth: 600, alignSelf: 'center', width: '100%' }, 
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', textTransform: 'uppercase' }, 
  searchInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 16, paddingHorizontal: 15, marginBottom: 20, borderWidth: 1, borderColor: '#FFF20' }, 
  searchModalInput: { flex: 1, color: '#FFF', paddingVertical: 15, fontSize: 16 }, 
  emptyText: { color: '#D5C4B050', textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
});