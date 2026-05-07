import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../api/firebaseConfig';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, updateDoc, increment, deleteDoc } from 'firebase/firestore';
import { COLORS } from '../theme/colors';
import { useToast } from '../context/ToastContext';

export default function NoticeBoardScreen({ navigation }) {
  const [userData, setUserData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bounty, setBounty] = useState('');

  const [selectedPost, setSelectedPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');

  const { showToast } = useToast();

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (userId) {
      const unsubscribeUser = onSnapshot(doc(db, "users", userId), (docSnap) => {
        if (docSnap.exists()) setUserData(docSnap.data());
      });
      
      const q = query(collection(db, "board_posts"), orderBy("createdAt", "desc"));
      const unsubscribePosts = onSnapshot(q, (snapshot) => {
        const fetchedPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPosts(fetchedPosts);
        setLoading(false);
      });

      return () => { unsubscribeUser(); unsubscribePosts(); };
    }
  }, []);

  useEffect(() => {
    if (!selectedPost) return;
    const q = query(collection(db, "board_posts", selectedPost.id, "comments"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snapshot) => {
      setComments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [selectedPost]);

  const handleCreatePost = async () => {
    if (!title || !description || !bounty) return showToast('error', 'Помилка', 'Заповніть усі поля!');
    const bountyNumber = parseInt(bounty);
    if (isNaN(bountyNumber) || bountyNumber <= 0) return showToast('error', 'Помилка', 'Некоректна нагорода!');

    try {
      setLoading(true);
      await addDoc(collection(db, "board_posts"), {
        title, description, bounty: bountyNumber,
        authorId: auth.currentUser.uid, authorName: userData.nickname, authorGuildTag: userData.guildTag || null,
        status: 'open', createdAt: serverTimestamp()
      });
      setTitle(''); setDescription(''); setBounty(''); setIsCreating(false); setLoading(false);
      showToast('success', 'Успіх', 'Завдання успішно створено!');
    } catch (error) { showToast('error', 'Помилка', error.message); setLoading(false); }
  };

  const handleSendComment = async () => {
    if (!newComment.trim()) return;
    try {
      await addDoc(collection(db, "board_posts", selectedPost.id, "comments"), {
        text: newComment,
        authorId: auth.currentUser.uid,
        authorName: userData.nickname,
        authorGuildId: userData.guildId || null, 
        authorGuildTag: userData.guildTag || null,
        isCorrect: false,
        createdAt: serverTimestamp()
      });
      setNewComment('');
    } catch (error) { console.error(error); showToast('error', 'Помилка', 'Не вдалося відправити відповідь'); }
  };

  const handleAcceptAnswer = async (comment) => {
    try {
      await updateDoc(doc(db, "board_posts", selectedPost.id), { status: 'resolved' });
      await updateDoc(doc(db, "board_posts", selectedPost.id, "comments", comment.id), { isCorrect: true });

      if (comment.authorGuildId) {
        await updateDoc(doc(db, "guilds", comment.authorGuildId), { points: increment(selectedPost.bounty) });
        showToast('success', 'Успіх!', `${selectedPost.bounty} балів успішно зараховано гільдії [${comment.authorGuildTag}]!`);
      } else {
        showToast('success', 'Успіх!', 'Відповідь прийнято! Але користувач не в гільдії, бали згоріли.');
      }
      setSelectedPost(null); 
    } catch (error) { showToast('error', 'Помилка нарахування', error.message); }
  };

  const handleDeletePost = async (postId) => {
    const confirmAction = async () => {
      try {
        await deleteDoc(doc(db, "board_posts", postId));
        if (selectedPost && selectedPost.id === postId) setSelectedPost(null); 
        showToast('success', 'Видалено', 'Завдання видалено');
      } catch (error) { showToast('error', 'Помилка видалення', error.message); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm("Видалити це завдання назавжди?")) confirmAction();
    } else {
      Alert.alert("Видалення", "Видалити це завдання?", [{ text: "Скасувати", style: "cancel" }, { text: "Видалити", style: "destructive", onPress: confirmAction }]);
    }
  };

  const handleDeleteComment = async (commentId) => {
    const confirmAction = async () => {
      try {
        await deleteDoc(doc(db, "board_posts", selectedPost.id, "comments", commentId));
        showToast('success', 'Видалено', 'Відповідь видалено');
      } catch (error) { showToast('error', 'Помилка видалення', error.message); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm("Видалити цю відповідь?")) confirmAction();
    } else {
      Alert.alert("Видалення", "Видалити цю відповідь?", [{ text: "Скасувати", style: "cancel" }, { text: "Видалити", style: "destructive", onPress: confirmAction }]);
    }
  };

  if (loading) return <View style={[styles.container, { justifyContent: 'center' }]}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  if (selectedPost) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListHeaderComponent={
            <View style={styles.headerContainerWrapper}>
              <TouchableOpacity onPress={() => setSelectedPost(null)} style={[styles.backButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
                <Ionicons name="arrow-back" size={20} color={COLORS.primary} style={{ marginRight: 5 }} />
                <Text style={styles.backButtonText}>Дошка Завдань</Text>
              </TouchableOpacity>

              <View style={styles.selectedPostCard}>
                <View style={styles.postHeader}>
                  <TouchableOpacity style={Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined} onPress={() => navigation.navigate('Profile', { identifier: selectedPost.authorId })}>
                    <Text style={styles.authorLink}>{selectedPost.authorName} {selectedPost.authorGuildTag ? `[${selectedPost.authorGuildTag}]` : ''}</Text>
                  </TouchableOpacity>
                  
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={styles.bountyBadge}>
                      <Ionicons name="trophy-outline" size={14} color={COLORS.primary} style={{ marginRight: 4 }} />
                      <Text style={styles.bountyText}>{selectedPost.bounty}</Text>
                    </View>

                    {(selectedPost.authorId === auth.currentUser?.uid || userData?.role === 'admin') && (
                      <TouchableOpacity style={{ marginLeft: 12, padding: 4 }} onPress={() => handleDeletePost(selectedPost.id)}>
                      <Ionicons name="ellipsis-horizontal" size={24} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <Text style={styles.postTitleLarge}>{selectedPost.title}</Text>
                <Text style={styles.postDescriptionLarge}>{selectedPost.description}</Text>
              </View>

              <Text style={styles.commentsTitle}>Відповіді учасників:</Text>
            </View>
          }
          ListEmptyComponent={<View style={styles.headerContainerWrapper}><Text style={styles.emptyText}>Поки немає відповідей. Будь першим!</Text></View>}
          renderItem={({ item }) => (
            <View style={styles.headerContainerWrapper}>
              <View style={[styles.commentCard, item.isCorrect && styles.correctCommentCard]}>
                <View style={styles.commentHeader}>
                  <TouchableOpacity style={Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined} onPress={() => navigation.navigate('Profile', { identifier: item.authorId })}>
                    <Text style={styles.authorLink}>{item.authorName} {item.authorGuildTag ? `[${item.authorGuildTag}]` : ''}</Text>
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {item.isCorrect && <Text style={styles.correctBadge}>✅ Правильна відповідь</Text>}
                    
                    {(item.authorId === auth.currentUser?.uid || userData?.role === 'admin') && (
                      <TouchableOpacity style={{ marginLeft: 10, padding: 4 }} onPress={(e) => { e.stopPropagation(); handleDeletePost(item.id); }}>
                      <Ionicons name="ellipsis-horizontal" size={24} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <Text style={styles.commentText}>{item.text}</Text>
                
                {selectedPost.status === 'open' && userData?.role === 'admin' && (
                  <TouchableOpacity onPress={() => handleAcceptAnswer(item)} style={[styles.adminAcceptButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
                    <Text style={styles.adminAcceptButtonText}>⭐ Прийняти і відправити бали</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />

        {selectedPost.status === 'open' ? (
          <View style={styles.inputRow}>
            <TextInput style={[styles.chatInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="Написати відповідь..." placeholderTextColor={COLORS.textMuted} value={newComment} onChangeText={setNewComment} multiline />
            <TouchableOpacity onPress={handleSendComment} style={[styles.sendButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
              <Ionicons name="send" size={16} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.resolvedFooterText}>Цей запит вже вирішено і закрито.</Text>
        )}
      </KeyboardAvoidingView>
    );
  }

  if (isCreating) {
    return (
      <View style={styles.container}>
        <View style={styles.headerContainerWrapper}>
          <Text style={styles.headerTitleCreate}>Нове завдання</Text>
          <TextInput style={[styles.input, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="Коротке питання..." placeholderTextColor={COLORS.textMuted} value={title} onChangeText={setTitle} />
          <TextInput style={[styles.input, { height: 120, textAlignVertical: 'top' }, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="Опишіть проблему детально..." placeholderTextColor={COLORS.textMuted} value={description} onChangeText={setDescription} multiline />
          <TextInput style={[styles.input, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="Нагорода (балів)" placeholderTextColor={COLORS.textMuted} value={bounty} onChangeText={setBounty} keyboardType="numeric" />
          <TouchableOpacity onPress={handleCreatePost} style={[styles.buttonMain, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}><Text style={styles.buttonTextMain}>Опублікувати на Дошці</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setIsCreating(false)} style={[styles.buttonSecondary, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}><Text style={styles.buttonTextSecondary}>Скасувати</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <View style={styles.headerContainerWrapper}>
            <View style={styles.headerRow}>
              <Text style={styles.headerTitle}>Дошка Завдань</Text>
              <TouchableOpacity onPress={() => setIsCreating(true)} style={[styles.addButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}><Text style={styles.addButtonText}>+ Запитати</Text></TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>Дошка поки порожня.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.postCard, item.status === 'resolved' && styles.postCardResolved, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} onPress={() => setSelectedPost(item)} activeOpacity={0.8}>
            <View style={styles.postHeader}>
              <TouchableOpacity style={Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined} onPress={(e) => { e.stopPropagation(); navigation.navigate('Profile', { identifier: item.authorId }); }}>
                <Text style={styles.authorLink}>{item.authorName} {item.authorGuildTag ? `[${item.authorGuildTag}]` : ''}</Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.bountyBadge}>
                  <Ionicons name="trophy-outline" size={12} color={COLORS.primary} style={{ marginRight: 4 }} />
                  <Text style={styles.bountyText}>{item.bounty}</Text>
                </View>

                {(item.authorId === auth.currentUser?.uid || userData?.role === 'admin') && (
                  <TouchableOpacity style={{ marginLeft: 10 }} onPress={(e) => { e.stopPropagation(); handleDeletePost(item.id); }}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            
            <Text style={styles.postTitle}>{item.title}</Text>
            <Text style={styles.postDescription} numberOfLines={2}>{item.description}</Text>
            
            <View style={styles.statusContainer}>
              <View style={item.status === 'open' ? styles.statusDotOpen : styles.statusDotResolved} />
              <Text style={styles.statusText}>{item.status === 'open' ? 'ВІДКРИТО' : 'ВИРІШЕНО'}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: 20 },
  headerContainerWrapper: { width: '100%', maxWidth: 1000, alignSelf: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 60 : 30, paddingBottom: 20 },
  headerTitle: { color: COLORS.textSecondary, fontSize: 24, fontWeight: 'bold' },
  headerTitleCreate: { color: COLORS.textSecondary, fontSize: 24, fontWeight: 'bold', paddingTop: Platform.OS === 'ios' ? 60 : 30, paddingBottom: 20, textAlign: 'center' },
  addButton: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  addButtonText: { color: COLORS.background, fontWeight: 'bold', fontSize: 14 },
  input: { backgroundColor: 'rgba(0,0,0,0.2)', color: COLORS.text, padding: 18, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, fontSize: 16, marginBottom: 15 },
  buttonMain: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center', marginBottom: 15 },
  buttonTextMain: { color: COLORS.background, fontWeight: 'bold', fontSize: 16 },
  buttonSecondary: { borderWidth: 1, borderColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center' },
  buttonTextSecondary: { color: COLORS.primary, fontWeight: 'bold', fontSize: 16 },
  emptyText: { color: COLORS.textMuted, textAlign: 'center', marginTop: 50, fontSize: 16, fontStyle: 'italic' },
  postCard: { width: '100%', maxWidth: 1000, alignSelf: 'center', backgroundColor: COLORS.surface, padding: 20, borderRadius: 24, marginBottom: 15, borderWidth: 1, borderColor: COLORS.surfaceLight, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 8 },
  postCardResolved: { opacity: 0.6 },
  postHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  authorLink: { color: COLORS.primary, fontSize: 14, fontWeight: 'bold' },
  bountyBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.4)' },
  bountyText: { color: COLORS.primary, fontWeight: 'bold', fontSize: 12 },
  postTitle: { color: COLORS.text, fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  postTitleLarge: { color: COLORS.text, fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  postDescription: { color: COLORS.textMuted, fontSize: 14, marginBottom: 15 },
  postDescriptionLarge: { color: COLORS.textSecondary, fontSize: 16, lineHeight: 24, marginBottom: 15 },
  statusContainer: { flexDirection: 'row', alignItems: 'center' },
  statusDotOpen: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success, marginRight: 8 },
  statusDotResolved: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.danger, marginRight: 8 },
  statusText: { color: COLORS.textMuted, fontSize: 12, fontWeight: 'bold' },
  backButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingTop: Platform.OS === 'ios' ? 60 : 30, marginBottom: 10 },
  backButtonText: { color: COLORS.primary, fontSize: 16, fontWeight: 'bold' },
  selectedPostCard: { backgroundColor: COLORS.surface, padding: 20, borderRadius: 24, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.4)' },
  commentsTitle: { color: COLORS.textSecondary, fontSize: 18, fontWeight: 'bold', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 10 },
  commentCard: { backgroundColor: COLORS.surfaceLight, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  correctCommentCard: { borderColor: COLORS.success, backgroundColor: 'rgba(16, 185, 129, 0.1)' }, 
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  correctBadge: { color: COLORS.success, fontSize: 12, fontWeight: 'bold' },
  commentText: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 20 },
  adminAcceptButton: { marginTop: 15, backgroundColor: 'rgba(217, 119, 6, 0.1)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.primary, alignItems: 'center' },
  adminAcceptButtonText: { color: COLORS.primary, fontWeight: 'bold', fontSize: 14 },
  inputRow: { width: '100%', maxWidth: 1000, alignSelf: 'center', flexDirection: 'row', marginTop: 10, alignItems: 'center', paddingBottom: 20, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 15 },
  chatInput: { flex: 1, backgroundColor: COLORS.surfaceLight, color: COLORS.text, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 20, marginHorizontal: 8, maxHeight: 100 },
  sendButton: { backgroundColor: COLORS.primary, width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginLeft: 5 },
  resolvedFooterText: { color: COLORS.textMuted, textAlign: 'center', paddingVertical: 20, fontStyle: 'italic', width: '100%', maxWidth: 1000, alignSelf: 'center' }
});