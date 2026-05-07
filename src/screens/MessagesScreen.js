import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Image, Dimensions, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../api/firebaseConfig';
import { collection, query, orderBy, doc, updateDoc, getDocs, limit, startAt, endAt, documentId, where } from 'firebase/firestore';
import { Helmet } from 'react-helmet-async';
import { useIsFocused } from '@react-navigation/native';

import ImageViewerModal from '../components/ImageViewerModal';
import UserCard from '../components/UserCard';
import ChatInput from '../components/ChatInput';
import MessageItem from '../components/MessageItem'; 
import { COLORS } from '../theme/colors';

import { useUser } from '../context/UserContext'; 
import { useChat } from '../hooks/useChat'; 
import { useToast } from '../context/ToastContext';

export default function MessagesScreen({ navigation }) {
  const { currentUser, userData } = useUser(); 
  const { showToast } = useToast();
  
  const [users, setUsers] = useState([]); 
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const userSearchTimeout = useRef(null);

  const screenWidth = Dimensions.get('window').width;
  const isLargeScreen = screenWidth > 768;

  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [currentImageUri, setCurrentImageUri] = useState('');
  const [isAllMediaVisible, setIsAllMediaVisible] = useState(false);
  const flatListRef = useRef(null);

  const lastPressMap = useRef({});
  const isFocused = useIsFocused();

  useEffect(() => {
    let isMounted = true; 

    const fetchContacts = async () => {
      const activeIds = userData?.activeContacts || [];
      const idsToFetch = [...activeIds];
      
      if (selectedUser?.id && !idsToFetch.includes(selectedUser.id)) {
        idsToFetch.push(selectedUser.id);
      }

      if (idsToFetch.length === 0) {
        if (isMounted) {
          setUsers([]);
          setLoading(false);
        }
        return;
      }

      const chunk = idsToFetch.slice(0, 30);
      const q = query(collection(db, "users"), where(documentId(), "in", chunk));
      
      try {
        const snapshot = await getDocs(q);
        const usersList = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        usersList.sort((a, b) => (b.isOnline === true) - (a.isOnline === true));
        
        if (isMounted) {
          setUsers(usersList);
          setSelectedUser(prevSelected => {
            if (!prevSelected) return null;
            const freshUserData = usersList.find(u => u.id === prevSelected.id);
            return freshUserData || prevSelected;
          });
        }
      } catch (error) {
        showToast('error', 'Помилка', 'Не вдалося завантажити контакти.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchContacts();

    return () => { isMounted = false; };
  }, [userData?.activeContacts, selectedUser?.id]);

  const handleSearchUsers = async (text) => {
    setSearchText(text);
    if (text.trim().length < 2) { setSearchResults([]); return; }
    if (userSearchTimeout.current) clearTimeout(userSearchTimeout.current);
    
    userSearchTimeout.current = setTimeout(async () => {
      setIsSearchingUsers(true);
      try {
        const cleanText = text.toLowerCase();
        const qUsername = query(collection(db, "users"), orderBy("username"), startAt(cleanText), endAt(cleanText + '\uf8ff'), limit(10));
        const snapUsername = await getDocs(qUsername);
        let results = snapUsername.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

        if (results.length === 0) {
          const qNickname = query(collection(db, "users"), orderBy("nickname"), startAt(text), endAt(text + '\uf8ff'), limit(10));
          const snapNickname = await getDocs(qNickname);
          results = snapNickname.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        }
        setSearchResults(results.filter(u => u.id !== currentUser?.uid));
      } catch (error) { 
        showToast('error', 'Помилка пошуку', 'Не вдалося виконати пошук.'); 
      } finally { 
        setIsSearchingUsers(false); 
      }
    }, 600);
  };

  const chatId = selectedUser ? [currentUser?.uid, selectedUser.id].sort().join('_') : null;
  const basePath = chatId ? `chats/${chatId}` : null;

  const {
    messages,
    replyingTo, setReplyingTo,
    editingMessageId, setEditingMessageId,
    reactingToMsgId, setReactingToMsgId,
    isPartnerTyping,
    sendMessage,
    handleReact,
    handleDeleteMessage,
    saveEditedMessage,
    handleTyping
  } = useChat({
    basePath,
    currentUserId: currentUser?.uid,
    currentUserData: userData,
    partnerId: selectedUser?.id 
  });

  useEffect(() => {
    if (isFocused && selectedUser?.id && userData?.unreadCounts?.[selectedUser.id] > 0 && currentUser?.uid) {
      updateDoc(doc(db, "users", currentUser.uid), { [`unreadCounts.${selectedUser.id}`]: 0 })
        .catch(e => console.warn("Фонове оновлення лічильника не вдалося", e));
    }
  }, [isFocused, selectedUser?.id, userData?.unreadCounts, currentUser?.uid]);

  useEffect(() => {
    if (!isFocused || !selectedUser?.id || messages.length === 0 || !currentUser?.uid) return;
    const unreadMessages = messages.filter(m => m.senderId === selectedUser.id && !m.isRead);
    if (unreadMessages.length > 0) {
      unreadMessages.forEach(async (msg) => { 
        try { 
          await updateDoc(doc(db, basePath, "messages", msg.id), { isRead: true }); 
        } catch (e) {
          console.warn(`Фонове оновлення статусу прочитання для ${msg.id} не вдалося`, e);
        } 
      });
    }
  }, [messages, selectedUser?.id, isFocused, currentUser?.uid, basePath]);

  const openImageViewer = (uri) => { setCurrentImageUri(uri); setIsImageViewerVisible(true); };
  const getUserAvatar = (uid) => { return uid === currentUser?.uid ? userData?.avatarUrl : users.find(u => u.id === uid)?.avatarUrl; };

  const handleMessagePress = (item) => {
    const now = Date.now();
    const lastPress = lastPressMap.current[item.id] || 0;
    if (now - lastPress < 300) { setReplyingTo(item); setEditingMessageId(null); lastPressMap.current[item.id] = 0; } 
    else { lastPressMap.current[item.id] = now; setReactingToMsgId(null); }
  };

  const startReply = (item) => { setReplyingTo(item); setEditingMessageId(null); };
  const cancelReply = () => setReplyingTo(null);
  const startEditing = (item) => { setEditingMessageId(item.id); setReplyingTo(null); };
  const cancelEditing = () => { setEditingMessageId(null); };

  const renderCell = useCallback(({ children, index, style, ...props }) => {
    const cellZIndex = 10000 - index;
    return <View style={[style, { zIndex: cellZIndex, elevation: cellZIndex }]} {...props}>{children}</View>;
  }, []);

  if (loading) return <View style={[styles.container, { justifyContent: 'center' }]}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  const chatMediaLinks = messages.map(m => m.imageUrl || (m.sharedPost ? m.sharedPost.imageUrl : null)).filter(uri => uri !== null);

  const renderContactsList = () => (
    <View style={[styles.contactsContainer, isLargeScreen && { flex: 1, minWidth: 320, maxWidth: 420 }]}>
      <View style={styles.contactsHeader}>
        <Text style={styles.headerTitle}>Діалоги</Text>
        <TouchableOpacity onPress={() => setIsSearchOpen(true)} style={[styles.searchIconBtn, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}><Ionicons name="search" size={20} color={COLORS.primary} /></TouchableOpacity>
      </View>
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 10, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={styles.emptyContactsText}>У вас поки немає діалогів. Натисніть на іконку пошуку, щоб знайти друзів!</Text>}
        renderItem={({ item }) => {
          const unreadCount = userData?.unreadCounts?.[item.id] || 0;
          return (
            <TouchableOpacity style={[styles.contactCard, selectedUser?.id === item.id && styles.contactCardActive, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} onPress={() => setSelectedUser(item)}>
              <View style={{ position: 'relative' }}>
                {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={styles.contactAvatar} resizeMode="cover" /> : <View style={styles.contactAvatarPlaceholder}><Text style={styles.contactAvatarText}>{item.nickname ? item.nickname[0].toUpperCase() : '?'}</Text></View>}
                <View style={[styles.onlineBadge, !item.isOnline && { backgroundColor: COLORS.textMuted, borderColor: COLORS.background }]} />
              </View>
              <View style={styles.contactInfo}>
                <Text style={[styles.contactName, selectedUser?.id === item.id && { color: COLORS.primary }]} numberOfLines={1}>{item.nickname}</Text>
                <Text style={styles.contactTag}>{item.guildTag ? `[${item.guildTag}]` : 'Вільний агент'}</Text>
              </View>
              {unreadCount > 0 && <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{unreadCount}</Text></View>}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );

  const renderChatArea = () => {
    if (!selectedUser) {
      return (
        <View style={styles.chatPane}>
          <View style={styles.emptyChatContainer}>
            <Ionicons name="paper-plane-outline" size={80} color="rgba(213, 196, 176, 0.1)" />
            <Text style={styles.emptyChatText}>Виберіть чат для початку спілкування</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.chatPane} onTouchStart={() => { setReactingToMsgId(null); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.chatHeader}>
            <View style={styles.chatHeaderLeft}>
              {!isLargeScreen && (
                <TouchableOpacity onPress={() => setSelectedUser(null)} style={[styles.backButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}><Ionicons name="arrow-back" size={24} color={COLORS.textSecondary} /></TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={[styles.chatHeaderCenter, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} onPress={() => navigation.navigate('Profile', { identifier: selectedUser.username || selectedUser.id })}>
              {selectedUser.avatarUrl ? <Image source={{ uri: selectedUser.avatarUrl }} style={styles.chatHeaderAvatar} resizeMode="cover" /> : <View style={styles.chatHeaderAvatarPlaceholder}><Text style={styles.chatHeaderAvatarText}>{selectedUser.nickname[0].toUpperCase()}</Text></View>}
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.chatHeaderName}>{selectedUser.nickname}</Text>
                {isPartnerTyping ? <Text style={styles.typingText}>друкує...</Text> : <Text style={[styles.onlineTextSmall, !selectedUser.isOnline && { color: COLORS.textMuted }]}>{selectedUser.isOnline ? 'Онлайн' : 'Офлайн'}</Text>}
              </View>
            </TouchableOpacity>
            <View style={styles.chatHeaderRight} />
          </View>

          <FlatList
            ref={flatListRef}
            data={messages} 
            keyExtractor={(item) => item.id} 
            inverted 
            contentContainerStyle={{ padding: 15 }}
            showsVerticalScrollIndicator={false}
            CellRendererComponent={renderCell}
            renderItem={({ item, index }) => {
              const isMe = item.senderId === currentUser?.uid;
              const nextMessage = messages[index - 1];
              const showTail = !nextMessage || nextMessage.senderId !== item.senderId;

              return (
                <MessageItem 
                  item={item}
                  isMe={isMe}
                  showTail={showTail}
                  reactingToMsgId={reactingToMsgId}
                  setReactingToMsgId={setReactingToMsgId}
                  onReact={handleReact}
                  onPress={handleMessagePress}
                  onReply={startReply}
                  onEdit={startEditing}
                  onDelete={handleDeleteMessage}
                  onOpenImageViewer={openImageViewer}
                  navigation={navigation}
                  getUserAvatar={getUserAvatar}
                  currentUserId={currentUser?.uid}
                />
              );
            }}
          />

          <ChatInput 
            onSendMessage={sendMessage}
            onTyping={handleTyping}
            replyingTo={replyingTo}
            replyPreviewName={replyingTo?.senderId === currentUser?.uid ? (userData?.nickname || 'Ви') : selectedUser.nickname}
            replyPreviewText={replyingTo?.text || (replyingTo?.imageUrl ? '📷 Фото' : replyingTo?.fileUrl ? '📄 Файл' : '🎤 Голосове повідомлення')}
            onCancelReply={cancelReply}
            editingMessage={messages.find(m => m.id === editingMessageId)}
            onSaveEdit={saveEditedMessage}
            onCancelEdit={cancelEditing}
          />
          
        </KeyboardAvoidingView>
      </View>
    );
  };

  const renderInfoArea = () => {
    if (!selectedUser) return null;
    const formatRegistrationDate = (timestamp) => {
      if (!timestamp) return '';
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getFullYear()).slice(-2)}`;
    };

    return (
      <View style={styles.infoPane}>
        <View style={styles.infoProfileSection}>
          {selectedUser.avatarUrl ? <Image source={{ uri: selectedUser.avatarUrl }} style={styles.infoAvatar} resizeMode="cover" /> : <View style={styles.infoAvatarPlaceholder}><Text style={styles.infoAvatarText}>{selectedUser.nickname[0].toUpperCase()}</Text></View>}
          <Text style={styles.infoName}>{selectedUser.nickname}</Text>
          <Text style={[styles.infoStatus, !selectedUser.isOnline && { color: COLORS.textMuted }]}>{selectedUser.isOnline ? 'Онлайн' : 'Офлайн'}</Text>
          {selectedUser.customStatus && <Text style={styles.infoCustomStatus} numberOfLines={3}>"{selectedUser.customStatus}"</Text>}
          {!selectedUser.customStatus && selectedUser.createdAt && <Text style={styles.infoJoinedDate}>В Антейку з {formatRegistrationDate(selectedUser.createdAt)}</Text>}
          <View style={styles.infoActionButtons}>
            <TouchableOpacity style={[styles.infoProfileBtn, { flex: 1, marginRight: 10 }]} onPress={() => navigation.navigate('Profile', { identifier: selectedUser.username || selectedUser.id })}><Text style={styles.infoProfileBtnText}>Профіль</Text></TouchableOpacity>
            <TouchableOpacity style={styles.infoIconBtn}><Ionicons name="notifications-off-outline" size={20} color={COLORS.textSecondary} /></TouchableOpacity>
          </View>
        </View>
        {selectedUser.guildTag && (
          <View style={styles.guildSection}>
            <Text style={styles.sectionLabel}>Гільдія</Text>
            <View style={styles.guildCard}><View style={styles.guildIcon}><Ionicons name="shield-outline" size={20} color={COLORS.background} /></View><Text style={styles.guildName}>[{selectedUser.guildTag}]</Text></View>
          </View>
        )}
        <View style={styles.divider} />
        <View style={styles.mediaSection}>
          <TouchableOpacity style={[styles.mediaHeaderRow, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} onPress={() => { if(chatMediaLinks.length > 0) setIsAllMediaVisible(true); }}>
            <Text style={styles.mediaTitle}>Медіа</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={styles.mediaCount}>{chatMediaLinks.length}</Text><Ionicons name="chevron-forward" size={18} color="rgba(213, 196, 176, 0.3)" style={{marginLeft: 5}}/></View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' && <Helmet><title>Повідомлення | Anteiku</title></Helmet>}
      
      {isLargeScreen ? (
        <View style={styles.splitContainer}>
          {renderContactsList()}
          {renderChatArea()}
          {renderInfoArea()}
        </View>
      ) : (
        <View style={styles.splitContainer}>
          {selectedUser ? renderChatArea() : renderContactsList()}
        </View>
      )}

      <Modal visible={isSearchOpen} animationType="slide" transparent={true} onRequestClose={() => {setIsSearchOpen(false); setSearchText(''); setSearchResults([]);}}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.searchModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Новий чат</Text>
              <TouchableOpacity onPress={() => {setIsSearchOpen(false); setSearchText(''); setSearchResults([]);}} style={Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined}>
                <Ionicons name="close" size={28} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchInputWrapper}>
              <Ionicons name="search" size={20} color={COLORS.textMuted} style={{ marginRight: 10 }} />
              <TextInput 
                style={[styles.searchModalInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} 
                placeholder="Пошук за нікнеймом або @тегом..." 
                placeholderTextColor={COLORS.textMuted} 
                value={searchText} 
                onChangeText={handleSearchUsers} 
                autoFocus={true} 
              />
              {isSearchingUsers && <ActivityIndicator size="small" color={COLORS.primary} style={{marginLeft: 10}} />}
            </View>
            <FlatList 
              data={searchResults} 
              keyExtractor={item => item.id} 
              ListEmptyComponent={
                <Text style={[styles.emptyContactsText, {marginTop: 20}]}>
                  {searchText.length > 1 && !isSearchingUsers ? "Користувача не знайдено" : "Введіть ім'я для пошуку"}
                </Text>
              } 
              renderItem={({item}) => (
                <UserCard 
                  item={item} 
                  onPress={() => { 
                    setSelectedUser(item); 
                    setIsSearchOpen(false); 
                    setSearchText(''); 
                    setSearchResults([]);
                  }} 
                  rightIconName="chatbubble-ellipses-outline" 
                />
              )} 
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={isAllMediaVisible} transparent={true} animationType="fade" onRequestClose={() => setIsAllMediaVisible(false)}>
        <View style={styles.allMediaOverlay}>
          <View style={styles.allMediaModalInner}>
            <View style={styles.allMediaHeader}>
              <Text style={styles.allMediaTitle}>Усі медіа ({chatMediaLinks.length})</Text>
              <TouchableOpacity onPress={() => setIsAllMediaVisible(false)} style={Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined}><Ionicons name="close" size={32} color={COLORS.textSecondary} /></TouchableOpacity>
            </View>
            <FlatList data={chatMediaLinks} keyExtractor={(item, index) => index.toString()} numColumns={5} contentContainerStyle={{ padding: 15 }} renderItem={({ item }) => (
                <TouchableOpacity style={styles.allMediaGridItem} onPress={() => openImageViewer(item)}>
                  <Image source={{ uri: item }} style={styles.allMediaImage} resizeMode="cover" />
                </TouchableOpacity>
              )} />
          </View>
        </View>
      </Modal>

      <ImageViewerModal 
        visible={isImageViewerVisible} 
        imageUri={currentImageUri} 
        onClose={() => setIsImageViewerVisible(false)} 
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  splitContainer: { flex: 1, flexDirection: 'row', maxWidth: 1850, width: '98%', alignSelf: 'center', paddingTop: Platform.OS === 'ios' ? 50 : 20, paddingBottom: Platform.OS === 'ios' ? 30 : 20 },
  contactsContainer: { flex: 1, backgroundColor: COLORS.background, borderRightWidth: 1, borderRightColor: COLORS.border, paddingRight: 10 },
  contactsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 10 : 0, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { color: COLORS.textSecondary, fontSize: 24, fontWeight: 'bold' },
  searchIconBtn: { backgroundColor: COLORS.primaryLight, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  emptyContactsText: { color: COLORS.textMuted, textAlign: 'center', fontSize: 15, paddingHorizontal: 20, lineHeight: 22 },
  contactCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, marginBottom: 8, backgroundColor: 'transparent' },
  contactCardActive: { backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.border },
  contactAvatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: COLORS.primary },
  contactAvatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.3)' },
  contactAvatarText: { color: COLORS.textSecondary, fontSize: 20, fontWeight: 'bold' },
  onlineBadge: { position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.success, borderWidth: 2, borderColor: COLORS.background },
  contactInfo: { marginLeft: 12, flex: 1, justifyContent: 'center' },
  contactName: { color: COLORS.text, fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  contactTag: { color: 'rgba(213, 196, 176, 0.4)', fontSize: 13 },
  unreadBadge: { backgroundColor: COLORS.danger, borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 10, paddingHorizontal: 6 },
  unreadBadgeText: { color: COLORS.text, fontSize: 10, fontWeight: 'bold' },
  chatPane: { flex: 2.2, backgroundColor: COLORS.surface, borderRadius: 24, marginLeft: 15, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.surfaceLight, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
  emptyChatContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyChatText: { color: COLORS.textMuted, fontSize: 18, marginTop: 20 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, zIndex: 10 },
  chatHeaderLeft: { flex: 1, alignItems: 'flex-start' },
  chatHeaderCenter: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  chatHeaderRight: { flex: 1 },
  backButton: { marginRight: 15 },
  chatHeaderAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: COLORS.primary, marginRight: 12 },
  chatHeaderAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceLight, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  chatHeaderAvatarText: { color: COLORS.textSecondary, fontSize: 18, fontWeight: 'bold' },
  chatHeaderName: { color: COLORS.text, fontSize: 16, fontWeight: 'bold' },
  typingText: { color: COLORS.primary, fontSize: 12, marginTop: 2, fontStyle: 'italic', fontWeight: '500' },
  onlineTextSmall: { color: COLORS.success, fontSize: 12, marginTop: 2 },
  infoPane: { flex: 1, minWidth: 320, maxWidth: 420, backgroundColor: COLORS.surface, borderRadius: 24, marginLeft: 15, borderWidth: 1, borderColor: COLORS.surfaceLight, alignItems: 'center', paddingVertical: 30, paddingHorizontal: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
  infoProfileSection: { alignItems: 'center', width: '100%' },
  infoAvatar: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: COLORS.primary, marginBottom: 15 },
  infoAvatarPlaceholder: { width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.surfaceLight, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: COLORS.primary, marginBottom: 15 },
  infoAvatarText: { color: COLORS.textSecondary, fontSize: 48, fontWeight: 'bold' },
  infoName: { color: COLORS.text, fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  infoStatus: { color: COLORS.success, fontSize: 14, marginTop: 5, marginBottom: 15 },
  infoCustomStatus: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 15, paddingHorizontal: 10, fontStyle: 'italic', opacity: 0.8 },
  infoJoinedDate: { color: 'rgba(213, 196, 176, 0.4)', fontSize: 12, textAlign: 'center', marginBottom: 15 },
  infoActionButtons: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingHorizontal: 10, marginBottom: 20 },
  infoProfileBtn: { backgroundColor: COLORS.primaryLight, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.3)', alignItems: 'center', justifyContent: 'center' },
  infoProfileBtnText: { color: COLORS.primary, fontWeight: 'bold', fontSize: 14 },
  infoIconBtn: { width: 40, height: 40, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' },
  guildSection: { width: '100%', marginTop: 5 },
  sectionLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 5 },
  guildCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primaryLight, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border },
  guildIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  guildName: { color: COLORS.text, fontSize: 15, fontWeight: 'bold' },
  divider: { width: '100%', height: 1, backgroundColor: COLORS.border, marginVertical: 25 },
  mediaSection: { width: '100%' },
  mediaHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 5 },
  mediaTitle: { color: COLORS.text, fontSize: 16, fontWeight: 'bold' },
  mediaCount: { color: COLORS.primary, fontSize: 16, fontWeight: 'bold' },
  allMediaOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.85)', justifyContent: 'center', alignItems: 'center' },
  allMediaModalInner: { width: '85%', height: '85%', backgroundColor: COLORS.surface, borderRadius: 24, borderWidth: 1, borderColor: COLORS.surfaceLight, overflow: 'hidden', paddingBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  allMediaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  allMediaTitle: { color: COLORS.text, fontSize: 24, fontWeight: 'bold' },
  allMediaGridItem: { flex: 1/5, margin: 4, aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: COLORS.surfaceLight },
  allMediaImage: { width: '100%', height: '100%' },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  searchModalContent: { backgroundColor: COLORS.surfaceLight, flex: 1, marginTop: 60, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, borderWidth: 1, borderColor: COLORS.border, maxWidth: 600, alignSelf: 'center', width: '100%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: COLORS.text, fontSize: 22, fontWeight: 'bold' },
  searchInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 16, paddingHorizontal: 15, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)' }, 
  searchModalInput: { flex: 1, color: COLORS.text, paddingVertical: 15, fontSize: 16 }, 
});