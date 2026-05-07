import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Image, Modal, FlatList, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker'; 
import { db } from '../api/firebaseConfig';
import { doc, getDoc, updateDoc, onSnapshot, collection, query, orderBy, limit, addDoc, serverTimestamp, arrayUnion, arrayRemove, where, getDocs } from 'firebase/firestore'; 
import { Helmet } from 'react-helmet-async';
import ImageCropper from '../components/ImageCropper'; 
import { sendNotification } from '../utils/notifications';

import PostItem from '../components/PostItem'; 
import ShareModal from '../components/ShareModal'; 
import UserCard from '../components/UserCard';

import { COLORS } from '../theme/colors';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';

export default function ProfileScreen({ route, navigation }) {
  const { currentUser, userData: myUserData } = useUser();
  const myId = currentUser?.uid;

  const identifier = route?.params?.identifier || route?.params?.userId || myId;
  const highlightPostId = route?.params?.highlightPostId;

  const [targetUid, setTargetUid] = useState(null);
  const [userNotFound, setUserNotFound] = useState(false);

  const [userData, setUserData] = useState(null); 
  
  const [topGuilds, setTopGuilds] = useState([]);
  const [badges, setBadges] = useState([]);
  const [showBadgesModal, setShowBadgesModal] = useState(false); 

  const [wallPosts, setWallPosts] = useState([]);
  const [newWallPost, setNewWallPost] = useState('');
  
  const [wallImage, setWallImage] = useState(null);
  const [isUploadingWall, setIsUploadingWall] = useState(false);

  const [loading, setLoading] = useState(true);

  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [friendsList, setFriendsList] = useState([]);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [cropTarget, setCropTarget] = useState(null);

  const [allUsers, setAllUsers] = useState([]);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [postToShare, setPostToShare] = useState(null);

  const scrollViewRef = useRef(null);
  const [wallSectionY, setWallSectionY] = useState(0);
  const postPositions = useRef({});

  const { showToast } = useToast();

  const isMyProfile = targetUid === myId;

  useEffect(() => {
    const resolveIdentifier = async () => {
      if (!identifier) return;
      try {
        if (identifier === myId) {
          setTargetUid(myId);
          return;
        }
        const safeIdentifier = String(identifier).trim();
        const q = query(collection(db, "users"), where("username", "==", safeIdentifier.toLowerCase()), limit(1));
        const snap = await getDocs(q);

        if (!snap.empty) {
          setTargetUid(snap.docs[0].id);
        } else {
          const docSnap = await getDoc(doc(db, "users", safeIdentifier));
          if (docSnap.exists()) {
            setTargetUid(safeIdentifier); 
          } else {
            setUserNotFound(true);
            setLoading(false);
          }
        }
      } catch (error) {
        console.error("Помилка пошуку користувача:", error);
        setUserNotFound(true);
        setLoading(false);
      }
    };
    resolveIdentifier();
  }, [identifier, myId]);

  useEffect(() => {
    if (!targetUid || !myId) return;

    let unsubTarget = () => {};
    if (isMyProfile) {
      setUserData(myUserData);
    } else {
      unsubTarget = onSnapshot(doc(db, "users", targetUid), (docSnap) => {
        if (docSnap.exists()) setUserData({ id: docSnap.id, ...docSnap.data() });
      });
    }

    const qTopGuilds = query(collection(db, "guilds"), orderBy("points", "desc"), limit(5));
    const unsubGuilds = onSnapshot(qTopGuilds, (snapshot) => { setTopGuilds(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); });
    
    const qWall = query(collection(db, "users", targetUid, "wall_posts"), orderBy("createdAt", "desc"));
    const unsubWall = onSnapshot(qWall, (snapshot) => { setWallPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); setLoading(false); });

    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => { setAllUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); });

    return () => { unsubTarget(); unsubGuilds(); unsubWall(); unsubUsers(); };
  }, [targetUid, myId, isMyProfile, myUserData]); 

  useEffect(() => {
    if (highlightPostId && wallPosts.length > 0) {
      const targetPost = wallPosts.find(p => p.id === highlightPostId || p.originalPostId === highlightPostId);
      
      if (targetPost) {
        const tryScroll = () => {
          if (Platform.OS === 'web') {
            const element = document.getElementById(`post-${targetPost.id}`);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              return true;
            }
            return false;
          } else {
            if (wallSectionY > 0) {
              const postY = postPositions.current[targetPost.id];
              if (postY !== undefined) {
                scrollViewRef.current?.scrollTo({ y: wallSectionY + postY - 50, animated: true });
                return true;
              }
            }
            return false;
          }
        };

        let attempts = 0;
        const interval = setInterval(() => {
          const success = tryScroll();
          attempts++;
          if (success || attempts > 5) clearInterval(interval);
        }, 500);
        
        return () => clearInterval(interval);
      }
    }
  }, [highlightPostId, wallPosts, wallSectionY]);

  useEffect(() => {
    if (!userData) return;
    const newBadges = [];
    if (userData.role === 'admin') newBadges.push({ id: 'admin', title: 'Admin', color: COLORS.danger, bgColor: 'rgba(239, 68, 68, 0.2)' });
    if (userData.guildId) {
      const rankIndex = topGuilds.findIndex(g => g.id === userData.guildId);
      if (rankIndex !== -1) {
        const rankTitles = ['TOP 1 Guild', 'TOP 2 Guild', 'TOP 3 Guild', 'TOP 4 Guild', 'TOP 5 Guild'];
        const colors = ['#FBBF24', '#94A3B8', '#B45309', COLORS.primary, COLORS.primary];
        newBadges.push({ id: `top${rankIndex + 1}`, title: rankTitles[rankIndex], color: colors[rankIndex], bgColor: `${colors[rankIndex]}20` });
      }
    }
    setBadges(newBadges);
  }, [userData, topGuilds]);

  const isFollowing = myUserData?.following?.includes(targetUid);
  const pageTitle = userData ? `${userData.nickname} ${userData.username ? `(@${userData.username})` : ''} | Anteiku` : 'Профіль | Anteiku';

  const handleFollowToggle = async () => {
    const myRef = doc(db, "users", myId);
    const targetRef = doc(db, "users", targetUid);

    try {
      if (isFollowing) {
        await updateDoc(myRef, { following: arrayRemove(targetUid), friends: arrayRemove(targetUid) });
        await updateDoc(targetRef, { followers: arrayRemove(myId), friends: arrayRemove(myId) });
      } else {
        const isTargetFollowingMe = myUserData?.followers?.includes(targetUid);
        if (isTargetFollowingMe) {
          await updateDoc(myRef, { following: arrayUnion(targetUid), friends: arrayUnion(targetUid), activeContacts: arrayUnion(targetUid) });
          await updateDoc(targetRef, { followers: arrayUnion(myId), friends: arrayUnion(myId), activeContacts: arrayUnion(myId) });
          showToast('success', 'Успіх', 'Ви тепер друзі! Чат створено автоматично.');
          await sendNotification(targetUid, 'follow', { id: myId, name: myUserData.nickname, avatarUrl: myUserData.avatarUrl }, `також підписався на вас. Тепер ви друзі!`, myId);
        } else {
          await updateDoc(myRef, { following: arrayUnion(targetUid) });
          await updateDoc(targetRef, { followers: arrayUnion(myId) });
          await sendNotification(targetUid, 'follow', { id: myId, name: myUserData.nickname, avatarUrl: myUserData.avatarUrl }, `почав стежити за вами.`, myId);
        }
      }
    } catch(error) {
      showToast('error', 'Помилка', error.message);
    }
  };

  const handleOpenFriends = async () => {
    const friendIds = userData?.friends || [];
    if (friendIds.length === 0) { setFriendsList([]); setShowFriendsModal(true); return; }
    setLoading(true);
    try {
      const docs = await Promise.all(friendIds.map(id => getDoc(doc(db, "users", id))));
      setFriendsList(docs.map(d => ({ id: d.id, ...d.data() })));
      setShowFriendsModal(true);
    } catch (error) {
      console.error("Помилка завантаження друзів:", error);
      showToast('error', 'Помилка', 'Не вдалося завантажити список друзів');
    }
    setLoading(false);
  };

  const handleUpdateImage = async (type) => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 1 });
    if (!result.canceled) setCropTarget({ uri: result.assets[0].uri, width: result.assets[0].width, height: result.assets[0].height, type: type, aspectRatio: type === 'avatarUrl' ? 1 : 3/0.6 });
  };

  const processCroppedImage = async (croppedResult) => {
    try {
      const type = cropTarget.type;
      setCropTarget(null);
      if (type === 'avatarUrl') setUploadingAvatar(true); else setUploadingBanner(true);
      const formData = new FormData(); formData.append('file', `data:image/jpeg;base64,${croppedResult.base64}`); formData.append('upload_preset', process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
      const cloudData = await response.json();
      if (cloudData.secure_url) { await updateDoc(doc(db, "users", currentUser.uid), { [type]: cloudData.secure_url }); }
      showToast('success', 'Збережено', 'Зображення оновлено');
    } catch (error) { showToast('error', 'Помилка', error.message); } finally { setUploadingAvatar(false); setUploadingBanner(false); }
  };

  const handlePickWallImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.8, base64: true });
    if (!result.canceled) setWallImage({ uri: result.assets[0].uri, base64: `data:image/jpeg;base64,${result.assets[0].base64}` });
  };

  const handlePostOnWall = async () => {
    if (!newWallPost.trim() && !wallImage) return;
    setIsUploadingWall(true);
    try {
      const myNickname = myUserData?.nickname || "Гість";
      const myAvatar = myUserData?.avatarUrl || null;
      let finalImageUrl = null;

      if (wallImage) {
        const formData = new FormData(); formData.append('file', wallImage.base64); formData.append('upload_preset', process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
        const cloudData = await res.json();
        if (cloudData.secure_url) finalImageUrl = cloudData.secure_url;
      }

      const postObj = { text: newWallPost.trim() || null, imageUrl: finalImageUrl, authorId: myId, authorName: myNickname, authorAvatarUrl: myAvatar || null, likes: [], reposts: [], createdAt: serverTimestamp(), isWallPost: true };
      const docRef = await addDoc(collection(db, "users", targetUid, "wall_posts"), postObj);
      setNewWallPost(''); setWallImage(null);

      if (!isMyProfile) await sendNotification(targetUid, 'comment', { id: myId, name: myNickname, avatarUrl: myAvatar }, `залишив повідомлення на вашій стіні.`, docRef.id);
      showToast('success', 'Успіх', 'Повідомлення додано на стіну');
    } catch (error) { showToast('error', 'Помилка', error.message); } finally { setIsUploadingWall(false); }
  };

  if (userNotFound) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        {Platform.OS === 'web' && <Helmet><title>Користувача не знайдено | Anteiku</title></Helmet>}
        <Ionicons name="search-outline" size={64} color={COLORS.textMuted} />
        <Text style={{ color: COLORS.textSecondary, fontSize: 20, marginTop: 20, fontWeight: 'bold' }}>Користувача не знайдено</Text>
        <TouchableOpacity style={[styles.settingsButtonCompact, { marginTop: 30 }]} onPress={() => navigation.goBack()}><Text style={styles.settingsButtonTextCompact}>Повернутися назад</Text></TouchableOpacity>
      </View>
    );
  }

  if (loading) return <View style={[styles.container, { justifyContent: 'center' }]}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <>
      {Platform.OS === 'web' && <Helmet><title>{pageTitle}</title></Helmet>}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView ref={scrollViewRef} style={styles.container} showsVerticalScrollIndicator={false}>
          
          <View style={styles.bannerContainer}>
            {userData?.bannerUrl ? <Image source={{ uri: userData.bannerUrl }} style={styles.bannerImage} resizeMode="cover" /> : null}
            <View style={styles.bannerOverlay} />
            {!isMyProfile && <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={24} color={COLORS.text} /></TouchableOpacity>}
            {isMyProfile && <TouchableOpacity style={styles.editBannerButton} onPress={() => handleUpdateImage('bannerUrl')} disabled={uploadingBanner}>{uploadingBanner ? <ActivityIndicator color={COLORS.text} size="small" /> : <Ionicons name="camera" size={24} color={COLORS.text} />}</TouchableOpacity>}
            {userData?.customStatus && <View style={styles.statusWrapper}><Text style={styles.statusText} numberOfLines={3}>"{userData.customStatus}"</Text></View>}
            
            <View style={styles.profileHeaderContent}>
              <View style={styles.avatarContainer}>
                {userData?.avatarUrl ? <Image source={{ uri: userData.avatarUrl }} style={styles.avatarImage} resizeMode="cover" /> : <View style={styles.avatar}><Text style={styles.avatarText}>{userData?.nickname ? userData.nickname[0].toUpperCase() : 'A'}</Text></View>}
                {isMyProfile && <TouchableOpacity style={styles.editAvatarButton} onPress={() => handleUpdateImage('avatarUrl')} disabled={uploadingAvatar}>{uploadingAvatar ? <ActivityIndicator color={COLORS.text} size="small" /> : <Ionicons name="pencil" size={16} color={COLORS.text} />}</TouchableOpacity>}
              </View>
              <Text style={styles.nickname}>{userData?.nickname} {userData?.guildTag ? <Text style={styles.guildTag}>[{userData.guildTag}]</Text> : ''}</Text>
              {userData?.username && <Text style={styles.usernameText}>@{userData.username}</Text>}
              
              <View style={styles.statsRowProfile}>
                <TouchableOpacity onPress={handleOpenFriends} style={styles.statBox}><Text style={styles.statNumber}>{userData?.friends?.length || 0}</Text><Text style={styles.statLabel}>Друзів</Text></TouchableOpacity>
                <View style={styles.statBox}><Text style={styles.statNumber}>{userData?.followers?.length || 0}</Text><Text style={styles.statLabel}>Підписників</Text></View>
              </View>

              {!isMyProfile && (
                <TouchableOpacity onPress={handleFollowToggle} style={[styles.followButton, myUserData?.friends?.includes(targetUid) ? styles.btnFriend : myUserData?.following?.includes(targetUid) ? styles.btnFollowing : styles.btnFollow]}>
                  <Text style={styles.followButtonText}>{myUserData?.friends?.includes(targetUid) ? '🤝 Друзі' : myUserData?.following?.includes(targetUid) ? '✔️ Підписаний' : '➕ Підписатися'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.controlsRow}>
            {isMyProfile && <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.settingsButtonCompact}><Ionicons name="settings-outline" size={20} color={COLORS.textSecondary} /><Text style={styles.settingsButtonTextCompact}>Налаштування</Text></TouchableOpacity>}
          </View>

          <View style={styles.rowSectionsContainer}>
            <View style={styles.achievementsSide}>
              <TouchableOpacity style={styles.badgesHeaderButton} onPress={() => setShowBadgesModal(true)} activeOpacity={0.7}><Text style={styles.sectionTitle}>Досягнення [{badges.length}]</Text>{badges.length > 3 && <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />}</TouchableOpacity>
              {badges.length > 0 ? (
                <View style={styles.badgesContainer}>
                  {badges.slice(0, 3).map((badge) => (
                    <View key={badge.id} style={[styles.badgeItem, { backgroundColor: badge.bgColor, borderColor: badge.color }]}><Text style={[styles.badgeText, { color: badge.color }]}>{badge.title}</Text></View>
                  ))}
                </View>
              ) : <Text style={[styles.emptyText, { textAlign: 'left', marginTop: 0 }]}>Поки немає досягнень</Text>}
            </View>

            <View style={styles.favoritesSide}>
              <Text style={styles.sectionTitle}>Улюблене</Text>
              <View style={styles.favoritesRow}>
                {userData?.favoriteGame ? (
                  <TouchableOpacity style={styles.favoriteCard} activeOpacity={0.8} onPress={() => Platform.OS === 'web' && window.open(`https://rawg.io/games/${userData.favoriteGame.slug}`, '_blank')}>
                    <Image source={{ uri: userData.favoriteGame.image }} style={styles.favoriteCardImage} />
                    <View style={styles.favoriteOverlay} />
                    <View style={styles.favoriteInfo}><Ionicons name="game-controller" size={16} color={COLORS.primary} /><Text style={styles.favoriteTitle} numberOfLines={1}>{userData.favoriteGame.name}</Text></View>
                  </TouchableOpacity>
                ) : <View style={styles.favoritePlaceholder}><Ionicons name="game-controller-outline" size={24} color="rgba(213, 196, 176, 0.3)" /><Text style={styles.placeholderText}>Гра не обрана</Text></View>}

                {userData?.favoriteMusic ? (
                  <TouchableOpacity style={styles.favoriteCard} activeOpacity={0.8} onPress={() => Platform.OS === 'web' && window.open(userData.favoriteMusic.url, '_blank')}>
                    <Image source={{ uri: userData.favoriteMusic.image }} style={styles.favoriteCardImage} />
                    <View style={styles.favoriteOverlay} />
                    <View style={styles.favoriteInfo}><Ionicons name="musical-notes" size={16} color={COLORS.primary} /><Text style={styles.favoriteTitle} numberOfLines={1}>{userData.favoriteMusic.name}</Text><Text style={styles.favoriteSubtitle} numberOfLines={1}>{userData.favoriteMusic.artist}</Text></View>
                  </TouchableOpacity>
                ) : <View style={styles.favoritePlaceholder}><Ionicons name="musical-notes-outline" size={24} color="rgba(213, 196, 176, 0.3)" /><Text style={styles.placeholderText}>Трек не обрано</Text></View>}

                {userData?.favoriteWatch ? (
                  <TouchableOpacity style={styles.favoriteCard} activeOpacity={0.8} onPress={() => Platform.OS === 'web' && window.open(userData.favoriteWatch.url, '_blank')}>
                    <Image source={{ uri: userData.favoriteWatch.image }} style={styles.favoriteCardImage} />
                    <View style={styles.favoriteOverlay} />
                    <View style={styles.favoriteInfo}><Ionicons name={userData.favoriteWatch.icon || 'film'} size={16} color={COLORS.primary} /><Text style={styles.favoriteTitle} numberOfLines={1}>{userData.favoriteWatch.title}</Text><Text style={styles.favoriteSubtitle} numberOfLines={1}>{userData.favoriteWatch.subtitle}</Text></View>
                  </TouchableOpacity>
                ) : <View style={styles.favoritePlaceholder}><Ionicons name="film-outline" size={24} color="rgba(213, 196, 176, 0.3)" /><Text style={styles.placeholderText}>Кіно / Аніме</Text></View>}
              </View>
            </View>
          </View>

          <View style={styles.section} onLayout={(e) => setWallSectionY(e.nativeEvent.layout.y)}>
            <Text style={styles.sectionTitle}>Стіна</Text>
            {wallImage && (
              <View style={styles.wallImagePreviewContainer}>
                <Image source={{ uri: wallImage.uri }} style={styles.wallImagePreview} resizeMode="cover" />
                <TouchableOpacity style={styles.wallImageRemoveBtn} onPress={() => setWallImage(null)}><Ionicons name="close-circle" size={28} color={COLORS.danger} /></TouchableOpacity>
              </View>
            )}
            <View style={styles.wallInputContainer}>
              <TouchableOpacity style={styles.wallAttachBtn} onPress={handlePickWallImage} disabled={isUploadingWall}><Ionicons name="image-outline" size={28} color={COLORS.primary} /></TouchableOpacity>
              <TextInput style={styles.wallInput} placeholder={isMyProfile ? "Напишіть щось на своїй стіні..." : `Залиште повідомлення для ${userData?.nickname}...`} placeholderTextColor={COLORS.textMuted} value={newWallPost} onChangeText={setNewWallPost} multiline />
              <TouchableOpacity onPress={handlePostOnWall} style={styles.wallSendButton} disabled={isUploadingWall}>
                {isUploadingWall ? <ActivityIndicator size="small" color={COLORS.background} /> : <Text style={styles.wallSendButtonText}>➤</Text>}
              </TouchableOpacity>
            </View>
            
            {wallPosts.length === 0 ? <View style={styles.wallPlaceholder}><Text style={styles.wallText}>Стіна порожня.</Text></View> : wallPosts.map((post) => {
              const isTargetPost = highlightPostId ? (post.id === highlightPostId || post.originalPostId === highlightPostId) : false;
              return (
                <View key={post.id} nativeID={`post-${post.id}`} onLayout={(e) => { postPositions.current[post.id] = e.nativeEvent.layout.y; }}>
                  <PostItem 
                    item={post} 
                    targetUserId={targetUid} 
                    isMyProfile={isMyProfile} 
                    userData={myUserData} 
                    navigation={navigation} 
                    onShare={(p) => { setPostToShare(p); setShareModalVisible(true); }} 
                    isHighlighted={isTargetPost} 
                  />
                </View>
              );
            })}
          </View>

          <Modal visible={showFriendsModal} animationType="slide" transparent={true} onRequestClose={() => setShowFriendsModal(false)}>
            <View style={styles.modalOverlay}>
              <View style={styles.friendsModalContent}>
                <View style={styles.modalHeader}><Text style={styles.modalTitle}>Друзі ({friendsList.length})</Text><TouchableOpacity onPress={() => setShowFriendsModal(false)}><Ionicons name="close" size={28} color={COLORS.textMuted} /></TouchableOpacity></View>
                <FlatList 
                  data={friendsList} 
                  keyExtractor={item => item.id} 
                  ListEmptyComponent={<Text style={styles.emptyText}>У користувача поки немає друзів.</Text>} 
                  showsVerticalScrollIndicator={false} 
                  renderItem={({item}) => (
                    <UserCard 
                      item={item} 
                      onPress={() => { 
                        setShowFriendsModal(false); 
                        navigation.push('Profile', { identifier: item.username || item.id }); 
                      }} 
                      rightIconName="chevron-forward" 
                      rightIconColor={COLORS.textMuted} 
                    />
                  )} 
                />
              </View>
            </View>
          </Modal>

          <Modal visible={showBadgesModal} animationType="slide" transparent={true} onRequestClose={() => setShowBadgesModal(false)}>
            <View style={styles.modalOverlay}>
              <View style={styles.friendsModalContent}>
                <View style={styles.modalHeader}><Text style={styles.modalTitle}>Досягнення ({badges.length})</Text><TouchableOpacity onPress={() => setShowBadgesModal(false)}><Ionicons name="close" size={28} color={COLORS.textMuted} /></TouchableOpacity></View>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                  <View style={styles.badgesContainerModal}>
                    {badges.map((badge) => (
                      <View key={badge.id} style={[styles.badgeItemModal, { backgroundColor: badge.bgColor, borderColor: badge.color }]}><Text style={[styles.badgeTextModal, { color: badge.color }]}>{badge.title}</Text></View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>

          <Modal visible={!!cropTarget} animationType="slide" transparent={false}>
            {cropTarget && <ImageCropper imageUri={cropTarget.uri} imageWidth={cropTarget.width} imageHeight={cropTarget.height} aspectRatio={cropTarget.aspectRatio} onCancel={() => setCropTarget(null)} onCrop={processCroppedImage} />}
          </Modal>

          <ShareModal 
            visible={shareModalVisible} 
            onClose={() => { setShareModalVisible(false); setPostToShare(null); }} 
            postToShare={postToShare} 
            currentUserData={myUserData} 
            allUsers={allUsers} 
          />

        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  bannerContainer: { height: 380, position: 'relative', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1E293B', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  bannerImage: { width: '100%', height: '100%', position: 'absolute' },
  bannerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(30, 41, 59, 0.5)' },
  editBannerButton: { position: 'absolute', top: 40, right: 15, backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 20, zIndex: 10, elevation: 5 },
  backButton: { backgroundColor: 'rgba(0,0,0,0.5)', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', position: 'absolute', top: 40, left: 15, zIndex: 10 },
  statusWrapper: { position: 'absolute', bottom: 15, left: 20, zIndex: 10, maxWidth: '40%' },
  statusText: { color: COLORS.text, fontStyle: 'italic', fontSize: 16, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4, opacity: 0.9 },
  profileHeaderContent: { alignItems: 'center', zIndex: 2, marginTop: 40 },
  avatarContainer: { position: 'relative', width: 100, height: 100 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.textSecondary, borderWidth: 3, borderColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: COLORS.background },
  avatarText: { fontSize: 36, fontWeight: 'bold', color: COLORS.background },
  editAvatarButton: { position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.primary, width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.background, zIndex: 10 },
  nickname: { color: COLORS.text, fontSize: 24, fontWeight: 'bold', marginTop: 10, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  guildTag: { color: COLORS.primary, fontSize: 18 },
  usernameText: { color: COLORS.textMuted, fontSize: 16, marginTop: 2 }, 
  statsRowProfile: { flexDirection: 'row', marginTop: 15, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 10 },
  statBox: { alignItems: 'center', marginHorizontal: 15 },
  statNumber: { color: COLORS.text, fontSize: 18, fontWeight: 'bold' },
  statLabel: { color: COLORS.textMuted, fontSize: 12, marginTop: 2, textTransform: 'uppercase' },
  followButton: { marginTop: 15, paddingHorizontal: 25, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  btnFollow: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  btnFollowing: { backgroundColor: 'rgba(213, 196, 176, 0.2)', borderColor: 'rgba(213, 196, 176, 0.5)' },
  btnFriend: { backgroundColor: 'rgba(16, 185, 129, 0.2)', borderColor: COLORS.success },
  followButtonText: { color: COLORS.text, fontWeight: 'bold', fontSize: 14 },
  controlsRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 15, paddingBottom: 5 },
  settingsButtonCompact: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff10', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(213, 196, 176, 0.3)' },
  settingsButtonTextCompact: { color: COLORS.textSecondary, fontWeight: 'bold', fontSize: 14, marginLeft: 6 },
  
  section: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15 },
  sectionTitle: { color: COLORS.textSecondary, fontSize: 16, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 10 },
  
  rowSectionsContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15, gap: 40 },
  achievementsSide: { minWidth: 200, maxWidth: 300 },
  favoritesSide: { flex: 1, minWidth: 350, maxWidth: 750 },
  
  favoritesRow: { flexDirection: 'row', gap: 10 },
  favoriteCard: { flex: 1, height: 100, borderRadius: 16, overflow: 'hidden', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.surfaceLight, elevation: 4, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5 },
  favoriteCardImage: { width: '100%', height: '100%', position: 'absolute' },
  favoriteOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(48, 45, 40, 0.6)' },
  favoriteInfo: { flex: 1, justifyContent: 'flex-end', padding: 10 },
  favoriteTitle: { color: COLORS.text, fontSize: 12, fontWeight: 'bold', marginTop: 4, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 2 },
  favoriteSubtitle: { color: COLORS.textMuted, fontSize: 10, marginTop: 2, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 2 },
  favoritePlaceholder: { flex: 1, height: 100, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(213, 196, 176, 0.2)', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)' },
  placeholderText: { color: 'rgba(213, 196, 176, 0.3)', fontSize: 10, marginTop: 5 },

  badgesHeaderButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  badgesContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badgeItem: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontWeight: 'bold', fontSize: 14 },
  
  badgesContainerModal: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  badgeItemModal: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, borderWidth: 1, width: '45%', alignItems: 'center' },
  badgeTextModal: { fontWeight: 'bold', fontSize: 16, textAlign: 'center' },

  wallInputContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  wallAttachBtn: { padding: 10, marginRight: 5, justifyContent: 'center', alignItems: 'center' },
  wallImagePreviewContainer: { position: 'relative', alignSelf: 'flex-start', marginBottom: 15, marginLeft: 50 },
  wallImagePreview: { width: 120, height: 120, borderRadius: 16, borderWidth: 2, borderColor: COLORS.primary },
  wallImageRemoveBtn: { position: 'absolute', top: -10, right: -10, backgroundColor: COLORS.background, borderRadius: 14 },

  wallInput: { flex: 1, backgroundColor: '#ffffff05', color: COLORS.text, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(213, 196, 176, 0.2)', minHeight: 50 },
  wallSendButton: { backgroundColor: COLORS.primary, width: 50, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  wallSendButtonText: { color: COLORS.background, fontSize: 20, fontWeight: 'bold' },
  wallPlaceholder: { padding: 20, borderWidth: 1, borderColor: 'rgba(213, 196, 176, 0.3)', borderStyle: 'dashed', borderRadius: 12, alignItems: 'center' },
  wallText: { color: 'rgba(213, 196, 176, 0.4)' },
  
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  friendsModalContent: { backgroundColor: COLORS.surfaceLight, flex: 1, marginTop: 60, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, borderWidth: 1, borderColor: COLORS.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: COLORS.text, fontSize: 22, fontWeight: 'bold' },
  emptyText: { color: COLORS.textMuted, textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
});