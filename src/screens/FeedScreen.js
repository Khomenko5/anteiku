import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Modal, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker'; 
import { auth, db } from '../api/firebaseConfig'; 
import { collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp, doc, updateDoc, arrayUnion, getDocs, startAfter } from 'firebase/firestore';
import { Helmet } from 'react-helmet-async';

import PostItem from '../components/PostItem';
import ShareModal from '../components/ShareModal';
import UserCard from '../components/UserCard';

export default function FeedScreen({ navigation }) {
  const [userData, setUserData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [topGuilds, setTopGuilds] = useState([]);
  const [allUsers, setAllUsers] = useState([]); 
  const [loading, setLoading] = useState(true);

  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [newPost, setNewPost] = useState('');
  const [selectedImage, setSelectedImage] = useState(null); 
  const [isUploading, setIsUploading] = useState(false); 

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');

  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [postToShare, setPostToShare] = useState(null);

  const fetchingRef = useRef(false);

  const fetchPosts = async (isLoadMore = false) => {
    if (isLoadMore && (!hasMore || loadingMore)) return;
    if (fetchingRef.current) return;

    fetchingRef.current = true;
    if (isLoadMore) setLoadingMore(true);

    try {
      let q = query(collection(db, "global_posts"), orderBy("createdAt", "desc"), limit(10));
      if (isLoadMore && lastDoc) q = query(collection(db, "global_posts"), orderBy("createdAt", "desc"), startAfter(lastDoc), limit(10));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setHasMore(false);
      } else {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        const newPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (isLoadMore) {
          setPosts(prev => [...prev, ...newPosts]); 
        } else { 
          setPosts(newPosts); 
          setHasMore(snapshot.docs.length === 10); 
        }
      }
    } catch (error) { 
      console.error(error); 
    } finally { 
      setLoading(false); 
      setLoadingMore(false); 
      fetchingRef.current = false; 
    }
  };

  const onRefresh = async () => { 
    setRefreshing(true); 
    setHasMore(true); 
    setLastDoc(null); 
    await fetchPosts(false); 
    setRefreshing(false); 
  };

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    
    const unsubscribeUser = onSnapshot(doc(db, "users", userId), (docSnap) => { 
      if (docSnap.exists()) setUserData(docSnap.data()); 
    });
    
    const qTopGuilds = query(collection(db, "guilds"), orderBy("points", "desc"), limit(5));
    const unsubscribeTopGuilds = onSnapshot(qTopGuilds, (snapshot) => { 
      setTopGuilds(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); 
    });
    
    const qUsers = query(collection(db, "users"));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => { 
      setAllUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); 
    });
    
    return () => { unsubscribeUser(); unsubscribeTopGuilds(); unsubscribeUsers(); };
  }, []);

  useEffect(() => { 
    fetchPosts(false); 
  }, []);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.5, base64: true });
    if (!result.canceled) setSelectedImage({ uri: result.assets[0].uri, base64: `data:image/jpeg;base64,${result.assets[0].base64}` });
  };

  const handleCreatePost = async () => {
    if (!newPost.trim() && !selectedImage) return;
    try {
      setIsUploading(true); 
      let imageUrl = null;
      
      if (selectedImage) {
        const formData = new FormData(); 
        formData.append('file', selectedImage.base64); 
        formData.append('upload_preset', "anteiku_app");
        const response = await fetch(`https://api.cloudinary.com/v1_1/dv7fktjv5/image/upload`, { method: 'POST', body: formData });
        const cloudData = await response.json();
        if (cloudData.secure_url) imageUrl = cloudData.secure_url; 
        else throw new Error("Помилка фото");
      }
      
      const postObj = { 
        text: newPost, 
        imageUrl: imageUrl, 
        authorId: auth.currentUser.uid, 
        authorName: userData.nickname, 
        authorAvatarUrl: userData.avatarUrl || null, 
        authorGuildTag: userData.guildTag || null, 
        likes: [], 
        reposts: [], 
        createdAt: serverTimestamp() 
      };
      
      const docRef = await addDoc(collection(db, "global_posts"), postObj);
      await addDoc(collection(db, "users", auth.currentUser.uid, "wall_posts"), { ...postObj, originalPostId: docRef.id });
      
      setPosts(prev => [{ id: docRef.id, ...postObj }, ...prev]);
      setNewPost(''); 
      setSelectedImage(null); 
      setIsUploading(false); 
      setIsCreatingPost(false);
    } catch (error) { 
      alert("Помилка: " + error.message); 
      setIsUploading(false); 
    }
  };

  const renderHeader = () => (
    <View style={styles.headerContainerWrapper}>
      <View style={styles.feedHeader}>
        <Text style={styles.feedTitle}>Стрічка</Text>
        <TouchableOpacity onPress={() => setIsSearchOpen(true)} style={[styles.searchIconBtn, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
          <Ionicons name="search" size={24} color="#D97706" />
        </TouchableOpacity>
      </View>
      <View style={styles.topGuildsSection}>
        <FlatList 
          data={topGuilds} 
          keyExtractor={(item) => item.id} 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          ListEmptyComponent={<Text style={styles.emptyText}>Гільдій ще немає</Text>} 
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.topGuildCard, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
              <View style={styles.topAvatar}>
                {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={styles.topAvatarImage} resizeMode="cover" /> : <Text style={styles.topAvatarText}>{item.tag[0].toUpperCase()}</Text>}
                {item.leaderId === auth.currentUser?.uid && <View style={[styles.leaderBadge, { backgroundColor: '#47392b' }]}><Text style={styles.leaderBadgeText}>👑</Text></View>}
              </View>
              <Text style={styles.topGuildTag}>[{item.tag}]</Text>
            </TouchableOpacity>
          )} 
        />
      </View>
    </View>
  );

  if (loading) return <View style={[styles.container, { justifyContent: 'center' }]}><ActivityIndicator size="large" color="#D97706" /></View>;

  return (
    <View style={styles.container}>
      <Helmet><title>Стрічка | Anteiku</title></Helmet>
      
      <FlatList 
        data={posts} 
        keyExtractor={(item) => item.id} 
        contentContainerStyle={{ paddingBottom: 100 }} 
        ListHeaderComponent={renderHeader} 
        ListEmptyComponent={!loading ? <Text style={[styles.emptyText, {marginTop: 50}]}>Стрічка порожня. Будь першим!</Text> : null}
        renderItem={({ item }) => (
          <PostItem 
            item={item} 
            targetUserId={item.authorId} 
            isMyProfile={false} 
            userData={userData} 
            navigation={navigation} 
            onShare={(post) => { setPostToShare(post); setShareModalVisible(true); }} 
            onDelete={() => setPosts(prevPosts => prevPosts.filter(p => p.id !== item.id))} 
          />
        )}
        showsVerticalScrollIndicator={false} 
        onEndReached={() => fetchPosts(true)} 
        onEndReachedThreshold={0.5} 
        ListFooterComponent={loadingMore ? <ActivityIndicator size="large" color="#D97706" style={{ marginVertical: 20 }} /> : null} 
        refreshing={refreshing} 
        onRefresh={onRefresh} 
      />
      
      <TouchableOpacity onPress={() => setIsCreatingPost(true)} style={[styles.floatingButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
        <Ionicons name="add" size={32} color="#302D28" />
      </TouchableOpacity>
      
      <Modal visible={isCreatingPost} animationType="slide" transparent={true} onRequestClose={() => setIsCreatingPost(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Новий пост</Text>
              <TouchableOpacity onPress={() => setIsCreatingPost(false)} style={Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined}>
                <Ionicons name="close" size={24} color="#FFF80" />
              </TouchableOpacity>
            </View>
            <TextInput style={[styles.input, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="Що у вас нового?" placeholderTextColor="#FFF80" value={newPost} onChangeText={setNewPost} multiline />
            
            {selectedImage && (
              <View style={styles.previewContainer}>
                <Image source={{ uri: selectedImage.uri }} style={styles.previewImage} resizeMode="cover" />
                <TouchableOpacity onPress={() => setSelectedImage(null)} style={[styles.removeImageButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
                  <Ionicons name="close-circle" size={28} color="#EF4444" />
                </TouchableOpacity>
              </View>
            )}
            
            <View style={styles.actionRowModal}>
              <TouchableOpacity onPress={pickImage} style={[styles.imagePickerButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
                <Ionicons name="image" size={24} color="#D97706" />
                <Text style={styles.imagePickerText}>Додати фото</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreatePost} style={[styles.postButton, isUploading && { opacity: 0.5 }, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} disabled={isUploading}>
                {isUploading ? <ActivityIndicator color="#302D28" /> : <Text style={styles.postButtonText}>Опублікувати</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={isSearchOpen} animationType="slide" transparent={true} onRequestClose={() => setIsSearchOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.searchModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Пошук користувачів</Text>
              <TouchableOpacity onPress={() => setIsSearchOpen(false)} style={Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined}>
                <Ionicons name="close" size={28} color="#FFF80" />
              </TouchableOpacity>
            </View>
            <View style={styles.searchInputWrapper}>
              <Ionicons name="search" size={20} color="#FFF80" style={{ marginRight: 10 }} />
              <TextInput style={[styles.searchModalInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="Пошук за нікнеймом..." placeholderTextColor="#FFF80" value={searchText} onChangeText={setSearchText} autoFocus={true} />
            </View>
            <FlatList 
              data={allUsers.filter(u => (u.nickname || '').toLowerCase().includes(searchText.toLowerCase()))} 
              keyExtractor={item => item.id} 
              ListEmptyComponent={<Text style={[styles.emptyText, { color: '#FFF80' }]}>Користувача не знайдено</Text>} 
              renderItem={({item}) => (
                <UserCard 
                  item={item} 
                  onPress={() => { 
                    setIsSearchOpen(false); 
                    setSearchText(''); 
                    navigation.navigate('Profile', { identifier: item.username || item.id }); 
                  }} 
                  rightIconName="chevron-forward" 
                />
              )} 
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ShareModal 
        visible={shareModalVisible} 
        onClose={() => { setShareModalVisible(false); setPostToShare(null); }} 
        postToShare={postToShare} 
        currentUserData={userData} 
        allUsers={allUsers} 
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#302D28', paddingHorizontal: 20 },
  headerContainerWrapper: { width: '100%', maxWidth: 1000, alignSelf: 'center', paddingBottom: 10 },
  feedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 0, paddingTop: Platform.OS === 'ios' ? 60 : 30 },
  feedTitle: { color: '#D5C4B0', fontSize: 24, fontWeight: 'bold' },
  searchIconBtn: { backgroundColor: '#D9770620', padding: 8, borderRadius: 12, borderWidth: 1, borderColor: '#D9770640' },
  topGuildsSection: { paddingVertical: 10, paddingHorizontal: 0, marginTop: 5 },
  topGuildCard: { alignItems: 'center', marginRight: 20, width: 80 },
  topAvatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#D97706', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#302D28', position: 'relative' },
  topAvatarText: { color: '#302D28', fontSize: 28, fontWeight: 'bold' },
  topAvatarImage: { width: '100%', height: '100%', borderRadius: 35 }, 
  leaderBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#47392b', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#D97706' }, 
  leaderBadgeText: { fontSize: 14 },
  topGuildTag: { color: '#D5C4B0', fontSize: 12, fontWeight: 'bold', marginTop: 10, textAlign: 'center' },
  emptyText: { color: '#D5C4B050', textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
  floatingButton: { position: 'absolute', bottom: 110, right: 20, backgroundColor: '#D97706', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', zIndex: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 5 }, 
  modalOverlay: { flex: 1, backgroundColor: 'rgba(48, 45, 40, 0.95)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#47392b', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, minHeight: '60%', borderWidth: 1, borderColor: '#D9770640', maxWidth: 600, alignSelf: 'center', width: '100%' }, 
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', textTransform: 'uppercase' }, 
  input: { backgroundColor: 'rgba(0,0,0,0.2)', color: '#FFF', padding: 18, borderRadius: 15, borderWidth: 1, borderColor: '#FFF20', fontSize: 16, minHeight: 120, textAlignVertical: 'top', marginBottom: 15 }, 
  actionRowModal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  imagePickerButton: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  imagePickerText: { color: '#D97706', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  previewContainer: { position: 'relative', marginBottom: 15, width: 100, aspectRatio: 4/5 },
  previewImage: { width: '100%', height: '100%', borderRadius: 12 },
  removeImageButton: { position: 'absolute', top: -10, right: -10, backgroundColor: '#47392b', borderRadius: 15 }, 
  postButton: { backgroundColor: '#D97706', paddingVertical: 15, paddingHorizontal: 25, borderRadius: 15, alignItems: 'center' },
  postButtonText: { color: '#302D28', fontWeight: 'bold', fontSize: 18 },
  searchModalContent: { backgroundColor: '#47392b', flex: 1, marginTop: 60, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, borderWidth: 1, borderColor: '#D9770640', maxWidth: 600, alignSelf: 'center', width: '100%' }, 
  searchInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 16, paddingHorizontal: 15, marginBottom: 20, borderWidth: 1, borderColor: '#FFF20' }, 
  searchModalInput: { flex: 1, color: '#FFF', paddingVertical: 15, fontSize: 16 }
});