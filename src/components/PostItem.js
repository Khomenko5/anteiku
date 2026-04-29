import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, TextInput, Image, ScrollView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker'; 
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { auth, db } from '../api/firebaseConfig';
import { doc, updateDoc, onSnapshot, collection, query, orderBy, addDoc, serverTimestamp, deleteDoc, arrayUnion, arrayRemove, where, getDocs } from 'firebase/firestore'; 
import { sendNotification } from '../utils/notifications';

import ImageViewerModal from './ImageViewerModal';
import AudioPlayer from './AudioPlayer';

const CommentImageWrapper = ({ uri, onPress }) => {
  const [aspectRatio, setAspectRatio] = useState(null);
  useEffect(() => {
    if (uri) {
      Image.getSize(uri, (w, h) => { if (w > 0 && h > 0) setAspectRatio(w / h); }, () => setAspectRatio(1));
    }
  }, [uri]);
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
      {aspectRatio ? (
        <Image source={{ uri }} style={{ width: 160, aspectRatio: aspectRatio, borderRadius: 8 }} resizeMode="cover" />
      ) : (
        <View style={{ width: 160, height: 160, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="small" color="#D97706" />
        </View>
      )}
    </TouchableOpacity>
  );
};

export default function PostItem({ item, targetUserId, isMyProfile, userData, navigation, onShare, isHighlighted, onDelete }) {
  const currentUser = auth.currentUser;
  const isWallPost = item.isWallPost === true;

  const postRef = isWallPost ? doc(db, "users", targetUserId, "wall_posts", item.id) : doc(db, "global_posts", item.originalPostId || item.id);
  const commentsRef = isWallPost ? collection(db, "users", targetUserId, "wall_posts", item.id, "comments") : collection(db, "global_posts", item.originalPostId || item.id, "comments");
  
  const [liveLikes, setLiveLikes] = useState(item.likes || []);
  const [liveReposts, setLiveReposts] = useState(item.reposts || []);

  const isMyPost = item.authorId === currentUser?.uid;
  const canDeletePost = isMyPost || isMyProfile || userData?.role === 'admin';
  const hasLiked = liveLikes.includes(currentUser?.uid);
  const likesCount = liveLikes.length;
  const hasReposted = liveReposts.includes(currentUser?.uid);

  const hasImage = !!item.imageUrl;

  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [showComments, setShowComments] = useState(false);
  
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState();

  const [imageAspectRatio, setImageAspectRatio] = useState(null);

  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [currentImageUri, setCurrentImageUri] = useState('');

  const [replyingTo, setReplyingTo] = useState(null);
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  const [pickerTab, setPickerTab] = useState('emoji'); 
  const [gifs, setGifs] = useState([]);
  const [gifSearchQuery, setGifSearchQuery] = useState('');
  const [loadingGifs, setLoadingGifs] = useState(false);
  const searchTimeout = useRef(null);

  const EMOJI_LIST = ['😀','😂','🥰','😎','🤔','😢','😡','👍','👎','🙏','❤️','🔥','🎉','✨','👀', '🚀', '💯', '💩', '💀', '🤡'];

  const fetchGifs = async (search = '') => {
    setLoadingGifs(true);
    try {
      const GIPHY_API_KEY = 'Q7DSXKZWyqxTVUSRt0Bv3knSyCiULypQ'; 
      const url = search.trim() === '' 
        ? `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=24`
        : `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(search)}&limit=24`;

      const response = await fetch(url);
      const data = await response.json();
      
      if (data.data) {
        const formattedGifs = data.data.map(item => item.images.fixed_height_small.url || item.images.downsized.url);
        setGifs(formattedGifs);
      }
    } catch (error) { console.error("Помилка завантаження GIF:", error); } 
    finally { setLoadingGifs(false); }
  };

  useEffect(() => {
    if (showEmojiMenu && pickerTab === 'gif' && gifs.length === 0) fetchGifs();
  }, [showEmojiMenu, pickerTab]);

  const handleGifSearch = (text) => {
    setGifSearchQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchGifs(text), 600); 
  };

  useEffect(() => {
    if (item.imageUrl) {
      Image.getSize(item.imageUrl, (w, h) => { if (w > 0 && h > 0) setImageAspectRatio(w / h); }, () => setImageAspectRatio(4 / 5));
    }
  }, [item.imageUrl]);

  useEffect(() => {
    const unsubscribe = onSnapshot(postRef, (docSnap) => {
      if (docSnap.exists()) { setLiveLikes(docSnap.data().likes || []); setLiveReposts(docSnap.data().reposts || []); }
    });
    return unsubscribe;
  }, [item.id]);

  useEffect(() => {
    const q = query(commentsRef, orderBy("createdAt", "asc"));
    return onSnapshot(q, (snapshot) => { setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); });
  }, [item.id]);

  const openImageViewer = (uri) => {
    setCurrentImageUri(uri);
    setIsImageViewerVisible(true);
  };

  const toggleLike = async () => {
    if (hasLiked) {
      await updateDoc(postRef, { likes: arrayRemove(currentUser.uid) });
    } else {
      await updateDoc(postRef, { likes: arrayUnion(currentUser.uid) });
      if (item.authorId !== currentUser.uid) {
        await sendNotification(item.authorId, 'like', { id: currentUser.uid, name: userData?.nickname, avatarUrl: userData?.avatarUrl }, `вподобав ваш запис.`, item.id);
      }
    }
  };

  const toggleRepost = async () => {
    const globalPostId = item.originalPostId || item.id;
    const myWallRef = collection(db, "users", currentUser.uid, "wall_posts");
    
    if (hasReposted) {
      await updateDoc(postRef, { reposts: arrayRemove(currentUser.uid) });
      const snap = await getDocs(query(myWallRef, where("originalPostId", "==", globalPostId)));
      snap.forEach(d => deleteDoc(d.ref));
    } else {
      await updateDoc(postRef, { reposts: arrayUnion(currentUser.uid) });
      await addDoc(myWallRef, {
        isRepost: true, originalPostId: globalPostId,
        originalAuthorId: item.isRepost ? item.originalAuthorId : item.authorId,
        originalAuthorName: item.isRepost ? item.originalAuthorName : item.authorName,
        text: item.text || null, imageUrl: item.imageUrl || null, authorAvatarUrl: item.authorAvatarUrl || null,
        reposterId: currentUser.uid, reposterName: userData?.nickname, createdAt: serverTimestamp()
      });
      alert("Пост репостнуто на вашу стіну!");

      const actualAuthorId = item.isRepost ? item.originalAuthorId : item.authorId;
      if (actualAuthorId !== currentUser.uid) {
        await sendNotification(actualAuthorId, 'repost', { id: currentUser.uid, name: userData?.nickname, avatarUrl: userData?.avatarUrl }, `зробив репост вашого запису.`, globalPostId);
      }
    }
  };

  const handleDeletePost = async () => {
    const confirmAction = async () => {
      try {
        const globalPostId = item.originalPostId || item.id;

        if (isWallPost) {
          await deleteDoc(postRef);
        } else {
          if (isMyPost || userData?.role === 'admin') {
            await deleteDoc(doc(db, "global_posts", globalPostId));
            
            const myWallRef = collection(db, "users", item.authorId, "wall_posts");
            const wallQ = query(myWallRef, where("originalPostId", "==", globalPostId));
            const wallSnap = await getDocs(wallQ);
            
            const deletePromises = [];
            wallSnap.forEach(d => deletePromises.push(deleteDoc(d.ref)));
            await Promise.all(deletePromises);
            
            const reposters = liveReposts || [];
            for (const reposterId of reposters) {
              const repRef = collection(db, "users", reposterId, "wall_posts");
              const repQ = query(repRef, where("originalPostId", "==", globalPostId));
              const repSnap = await getDocs(repQ);
              
              const repPromises = [];
              repSnap.forEach(d => repPromises.push(deleteDoc(d.ref)));
              await Promise.all(repPromises);
            }
          } else if (isMyProfile && item.isRepost) {
             await deleteDoc(doc(db, "users", currentUser.uid, "wall_posts", item.id));
             await updateDoc(doc(db, "global_posts", globalPostId), { 
               reposts: arrayRemove(currentUser.uid) 
             });
          }
        }
        
        if (onDelete) onDelete(); 

      } catch (error) { 
        console.error("Помилка видалення:", error); 
        alert("Сталася помилка при видаленні: " + error.message);
      }
    };

    if (Platform.OS === 'web') { 
      if (window.confirm("Видалити цей запис?")) confirmAction(); 
    } else { 
      Alert.alert("Видалення", "Видалити цей запис?", [
        { text: "Скасувати", style: "cancel" }, 
        { text: "Видалити", style: "destructive", onPress: confirmAction }
      ]); 
    }
  };

  const handleDeleteComment = async (commentId) => {
    const confirmAction = async () => {
      const replies = comments.filter(c => c.parentId === commentId);
      for (const reply of replies) {
        await deleteDoc(doc(commentsRef, reply.id));
      }
      await deleteDoc(doc(commentsRef, commentId));
    };
    if (Platform.OS === 'web') { if (window.confirm("Видалити коментар?")) confirmAction(); } 
    else { Alert.alert("Видалення", "Видалити коментар?", [{ text: "Ні", style: "cancel" }, { text: "Так", style: "destructive", onPress: confirmAction }]); }
  };

  const startReply = (comment) => setReplyingTo(comment);
  const cancelReply = () => setReplyingTo(null);

  const sendComment = async (text = null, imageUrl = null, audioUrl = null) => {
    const textToSend = text || newComment.trim();
    if (!textToSend && !imageUrl && !audioUrl) return;
    try {
      const commentData = { 
        text: textToSend, 
        imageUrl, 
        audioUrl, 
        authorId: currentUser.uid, 
        authorName: userData?.nickname || 'Гість', 
        authorAvatarUrl: userData?.avatarUrl || null, 
        createdAt: serverTimestamp() 
      };

      if (replyingTo) {
        const rootParentId = replyingTo.parentId ? replyingTo.parentId : replyingTo.id;
        commentData.parentId = rootParentId;
        commentData.replyingToName = replyingTo.authorName; 
      }

      await addDoc(commentsRef, commentData);
      setNewComment('');
      setShowEmojiMenu(false);
      setReplyingTo(null);

      if (item.authorId !== currentUser.uid) {
        await sendNotification(item.authorId, 'comment', { id: currentUser.uid, name: userData?.nickname, avatarUrl: userData?.avatarUrl }, `залишив коментар під вашим записом.`, item.id);
      }
      if (replyingTo && replyingTo.authorId !== currentUser.uid && replyingTo.authorId !== item.authorId) {
        await sendNotification(replyingTo.authorId, 'comment', { id: currentUser.uid, name: userData?.nickname, avatarUrl: userData?.avatarUrl }, `відповів на ваш коментар.`, item.id);
      }
    } catch (e) { console.error(e); }
  };

  const handlePickCommentImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.5, base64: true });
    if (!result.canceled) {
      setIsUploading(true);
      try {
        const formData = new FormData(); formData.append('file', `data:image/jpeg;base64,${result.assets[0].base64}`); formData.append('upload_preset', "anteiku_app");
        const res = await fetch(`https://api.cloudinary.com/v1_1/dv7fktjv5/image/upload`, { method: 'POST', body: formData });
        const cloudData = await res.json();
        if (cloudData.secure_url) await sendComment(null, cloudData.secure_url, null);
      } catch (e) { alert("Помилка фото"); } finally { setIsUploading(false); }
    }
  };

  const handleVoiceRecord = async () => {
    if (isRecording) {
      setIsRecording(false); await recording.stopAndUnloadAsync(); const uri = recording.getURI(); setRecording(undefined);
      try {
        setIsUploading(true); let base64Audio;
        if (Platform.OS === 'web') { const res = await fetch(uri); const blob = await res.blob(); const reader = new FileReader(); reader.readAsDataURL(blob); base64Audio = await new Promise(resolve => { reader.onloadend = () => resolve(reader.result); }); } 
        else { const base64Str = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }); base64Audio = `data:audio/m4a;base64,${base64Str}`; }
        const formData = new FormData(); formData.append('file', base64Audio); formData.append('upload_preset', "anteiku_app");
        const res = await fetch(`https://api.cloudinary.com/v1_1/dv7fktjv5/video/upload`, { method: 'POST', body: formData });
        const cloudData = await res.json();
        if (cloudData.secure_url) await sendComment(null, null, cloudData.secure_url);
      } catch (e) { alert("Помилка аудіо"); } finally { setIsUploading(false); }
    } else {
      try {
        const perm = await Audio.requestPermissionsAsync();
        if (perm.status === 'granted') { await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true }); const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY); setRecording(recording); setIsRecording(true); } 
        else alert("Потрібен дозвіл на мікрофон!");
      } catch (err) { console.error(err); }
    }
  };

  const renderCommentNode = (c, isReply = false) => {
    return (
      <View key={c.id} style={[styles.commentItem, isReply && styles.replyCommentItem]}>
        <TouchableOpacity style={[styles.commentAvatarContainer, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} onPress={() => navigation.push('Profile', { identifier: c.authorId })}>
          {c.authorAvatarUrl ? (
            <Image source={{ uri: c.authorAvatarUrl }} style={[styles.commentAvatarImage, isReply && { width: 24, height: 24, borderRadius: 12 }]} resizeMode="cover" />
          ) : (
            <View style={[styles.commentAvatar, isReply && { width: 24, height: 24, borderRadius: 12 }]}><Text style={[styles.commentAvatarText, isReply && { fontSize: 10 }]}>{c.authorName[0].toUpperCase()}</Text></View>
          )}
        </TouchableOpacity>
        
        <View style={styles.commentContent}>
          <View style={styles.commentHeaderRow}>
            <TouchableOpacity style={Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined} onPress={() => navigation.push('Profile', { identifier: c.authorId })}>
              <Text style={styles.commentAuthor}>{c.authorName}</Text>
            </TouchableOpacity>
            
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity style={[Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined, { marginRight: 10 }]} onPress={() => startReply(c)}>
                <Ionicons name="arrow-undo-outline" size={14} color="#D5C4B080" />
              </TouchableOpacity>
              {(c.authorId === currentUser.uid || canDeletePost) ? (
                <TouchableOpacity style={Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined} onPress={() => handleDeleteComment(c.id)}>
                  <Ionicons name="trash-outline" size={14} color="#EF444480" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {c.replyingToName && (
            <Text style={styles.commentReplyTag}>@{c.replyingToName}</Text>
          )}

          {c.text ? <Text style={styles.commentText}>{c.text}</Text> : null}
          {c.imageUrl && <CommentImageWrapper uri={c.imageUrl} onPress={() => openImageViewer(c.imageUrl)} />}

          {c.audioUrl && <AudioPlayer audioUrl={c.audioUrl} />}
        </View>
      </View>
    );
  };

  const topLevelComments = comments.filter(c => !c.parentId);

  return (
    <View style={[
      styles.postCard, 
      isHighlighted && { borderColor: 'rgba(217, 119, 6, 0.6)', backgroundColor: 'rgba(217, 119, 6, 0.08)' }
    ]}>
      {item.isRepost ? (
        <View style={styles.repostHeader}>
          <TouchableOpacity onPress={() => navigation.push('Profile', { identifier: item.reposterId })}>
            <Text style={styles.repostText}>{item.reposterName}</Text>
          </TouchableOpacity>
          <Ionicons name="repeat" size={14} color="#D97706" style={{ marginHorizontal: 6 }} />
          <TouchableOpacity onPress={() => navigation.push('Profile', { identifier: item.originalAuthorId })}>
            <Text style={styles.repostText}>{item.originalAuthorName}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity style={styles.postHeader} onPress={() => navigation.push('Profile', { identifier: item.authorId })}>
        {item.authorAvatarUrl ? <Image source={{ uri: item.authorAvatarUrl }} style={styles.postAuthorAvatarImage} resizeMode="cover" /> : <View style={styles.postAuthorAvatar}><Text style={styles.postAuthorAvatarText}>{item.authorName ? item.authorName[0].toUpperCase() : '?'}</Text></View>}
        <View><Text style={styles.postAuthorName}>{item.authorName}</Text></View>
      </TouchableOpacity>
      
      <View style={hasImage ? styles.columnsContainer : styles.singleColumnContainer}>
        
        <View style={hasImage ? styles.leftColumn : styles.singleColumnLeft}>
          {item.text ? <Text style={styles.postText}>{item.text}</Text> : null}
          
          {hasImage ? (
            <TouchableOpacity activeOpacity={0.9} onPress={() => openImageViewer(item.imageUrl)} style={styles.postImageWrapper}>
              {imageAspectRatio ? (
                <Image source={{ uri: item.imageUrl }} style={[styles.postImage, { aspectRatio: imageAspectRatio }]} resizeMode="cover" />
              ) : (
                <View style={{ width: '100%', aspectRatio: 4 / 5, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#D97706" />
                </View>
              )}
            </TouchableOpacity>
          ) : null}

          <View style={styles.actionRowBottom}>
            <View style={styles.actionRowLeft}>
              <TouchableOpacity style={styles.actionIcon} onPress={toggleLike}>
                <Ionicons name={hasLiked ? "heart" : "heart-outline"} size={26} color={hasLiked ? "#EF4444" : "#D5C4B0"} />
                {likesCount > 0 ? <Text style={styles.actionCount}>{likesCount}</Text> : null}
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionIcon} onPress={() => { if (!hasImage) setShowComments(!showComments); }}>
                <Ionicons name="chatbubble-outline" size={24} color={(!hasImage && showComments) ? "#D97706" : "#D5C4B0"} />
                {comments.length > 0 && <Text style={styles.actionCount}>{comments.length}</Text>}
              </TouchableOpacity>
              
              {!isWallPost ? (
                <TouchableOpacity style={styles.actionIcon} onPress={toggleRepost}>
                  <Ionicons name="repeat" size={26} color={hasReposted ? "#10B981" : "#D5C4B0"} />
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity style={styles.actionIcon} onPress={() => onShare(item)}>
                <Ionicons name="paper-plane-outline" size={24} color="#D5C4B0" />
              </TouchableOpacity>
            </View>
            {canDeletePost ? <TouchableOpacity onPress={handleDeletePost}><Ionicons name="ellipsis-vertical" size={24} color="#D5C4B080" /></TouchableOpacity> : null}
          </View>
        </View>

        {(hasImage || showComments) && (
          <View style={hasImage ? styles.rightColumn : styles.singleColumnRight}>
            <Text style={styles.commentsTitle}>Коментарі</Text>
            <ScrollView style={styles.commentsScrollArea} showsVerticalScrollIndicator={false}>
              {comments.length === 0 ? (
                <Text style={styles.noCommentsText}>Ще немає коментарів. Напишіть першим!</Text>
              ) : (
                topLevelComments.map(parentComment => {
                  const replies = comments.filter(c => c.parentId === parentComment.id);
                  return (
                    <View key={`thread-${parentComment.id}`}>
                      {renderCommentNode(parentComment, false)}
                      {replies.map(reply => renderCommentNode(reply, true))}
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={{ position: 'relative', zIndex: 50 }}>
              
              {showEmojiMenu && (
                <View style={styles.emojiPickerContainer}>
                  <View style={styles.pickerTabsHeader}>
                    <TouchableOpacity onPress={() => setPickerTab('emoji')} style={[styles.pickerTabBtn, pickerTab === 'emoji' && styles.pickerTabBtnActive]}>
                      <Text style={[styles.pickerTabBtnText, pickerTab === 'emoji' && {color: '#D97706'}]}>Емодзі</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setPickerTab('gif')} style={[styles.pickerTabBtn, pickerTab === 'gif' && styles.pickerTabBtnActive]}>
                      <Text style={[styles.pickerTabBtnText, pickerTab === 'gif' && {color: '#D97706'}]}>GIF</Text>
                    </TouchableOpacity>
                  </View>

                  {pickerTab === 'emoji' ? (
                    <ScrollView style={{ flex: 1, minHeight: 0 }} showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 15 }}>
                      <View style={styles.emojiGrid}>
                        {EMOJI_LIST.map(emoji => (
                          <TouchableOpacity key={emoji} onPress={() => setNewComment(newComment + emoji)} style={{padding: 6}}>
                            <Text style={{fontSize: 24}}>{emoji}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  ) : (
                    <View style={styles.gifContainer}>
                      <TextInput 
                        style={[styles.gifSearchInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}
                        placeholder="Пошук GIF..."
                        placeholderTextColor="#D5C4B080"
                        value={gifSearchQuery}
                        onChangeText={handleGifSearch}
                      />
                      {loadingGifs ? (
                        <ActivityIndicator size="small" color="#D97706" style={{marginTop: 20}}/>
                      ) : (
                        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 15 }}>
                          <View style={styles.gifGridWrapper}>
                            {gifs.map((item, index) => (
                              <TouchableOpacity key={index} onPress={() => sendComment(null, item, null)} style={styles.gifBtn}>
                                <Image source={{uri: item}} style={styles.gifImage} />
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      )}
                    </View>
                  )}
                </View>
              )}

              {replyingTo && (
                <View style={styles.replyPreviewContainer}>
                  <Ionicons name="arrow-undo" size={16} color="#D97706" style={{ marginRight: 8 }} />
                  <View style={styles.replyPreviewLine} />
                  <View style={styles.replyPreviewContent}>
                    <Text style={styles.replyPreviewName}>Відповідь {replyingTo.authorName}</Text>
                  </View>
                  <TouchableOpacity onPress={cancelReply} style={[styles.replyPreviewClose, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
                    <Ionicons name="close-circle" size={20} color="#D5C4B080" />
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.commentInputRow}>
                <TouchableOpacity onPress={handlePickCommentImage} style={[styles.commentIconButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} disabled={isUploading}>
                  {isUploading ? <ActivityIndicator size="small" color="#D97706" /> : <Ionicons name="image" size={24} color="#D97706" />}
                </TouchableOpacity>
                
                <TextInput 
                  style={[styles.commentInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} 
                  placeholder={replyingTo ? `Відповідь @${replyingTo.authorName}...` : "Написати..."} 
                  placeholderTextColor="#FFF80" 
                  value={newComment} 
                  onChangeText={setNewComment} 
                  multiline 
                  onKeyPress={(e) => {
                    if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                      e.preventDefault(); 
                      sendComment();
                    }
                  }}
                />
                
                <TouchableOpacity onPress={() => setShowEmojiMenu(!showEmojiMenu)} style={[styles.commentIconButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
                  <Ionicons name="happy-outline" size={24} color={showEmojiMenu ? "#D97706" : "#D5C4B080"} />
                </TouchableOpacity>

                {newComment.trim() === '' ? (
                  <TouchableOpacity onPress={handleVoiceRecord} style={[styles.commentIconButton, isRecording && styles.recordingButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
                    <Ionicons name={isRecording ? "stop" : "mic"} size={24} color={isRecording ? "#FFF" : "#D5C4B0"} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => sendComment()} style={[styles.commentSendButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined, {marginLeft: 5}]}><Ionicons name="send" size={14} color="#FFF" /></TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}
      </View>

      <ImageViewerModal 
        visible={isImageViewerVisible} 
        imageUri={currentImageUri} 
        onClose={() => setIsImageViewerVisible(false)} 
      />

    </View>
  );
}

const styles = StyleSheet.create({
  postCard: { width: '100%', maxWidth: 1000, alignSelf: 'center', marginBottom: 40, paddingVertical: 25, paddingHorizontal: 20, backgroundColor: '#35322D', borderRadius: 24, borderWidth: 1, borderColor: '#47392b', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 8, transitionProperty: 'background-color, border-color', transitionDuration: '0.3s' },
  repostHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#D5C4B010', paddingBottom: 10 },
  repostText: { color: '#D97706', fontSize: 13, fontWeight: 'bold' },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', marginBottom: 20, minHeight: 50, position: 'relative' },
  postAuthorAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#D5C4B020', justifyContent: 'center', alignItems: 'center' },
  postAuthorAvatarText: { color: '#D5C4B0', fontWeight: 'bold', fontSize: 18 },
  postAuthorAvatarImage: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#D97706', position: 'absolute', left: 0 },
  postAuthorName: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  columnsContainer: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'stretch' },
  leftColumn: { flex: 1.2, paddingRight: 20 },
  rightColumn: { flex: 1, backgroundColor: 'transparent', paddingLeft: 10, flexDirection: 'column', position: 'relative' },
  singleColumnContainer: { flexDirection: 'column', width: '100%' },
  singleColumnLeft: { width: '100%', paddingRight: 0, paddingBottom: 5 },
  singleColumnRight: { width: '100%', backgroundColor: 'transparent', paddingLeft: 0, flexDirection: 'column', maxHeight: 500, marginTop: 10, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#D5C4B010', position: 'relative' },
  postText: { color: '#D5C4B0', fontSize: 15, lineHeight: 22, marginBottom: 10 },
  postImageWrapper: { width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: '#47392b' }, 
  postImage: { width: '100%', height: '100%' }, 
  actionRowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  actionRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 }, 
  actionIcon: { flexDirection: 'row', alignItems: 'center' },
  actionCount: { color: '#D5C4B0', marginLeft: 6, fontSize: 14, fontWeight: 'bold' },
  commentsTitle: { color: '#D5C4B0', fontWeight: 'bold', fontSize: 16, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#D5C4B010', paddingBottom: 10 },
  commentsScrollArea: { flex: 1, marginBottom: 10 }, 
  noCommentsText: { color: '#D5C4B050', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
  commentItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 15 },
  replyCommentItem: { marginLeft: 42, marginTop: -5 },
  commentAvatarContainer: { justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#D5C4B020', justifyContent: 'center', alignItems: 'center' },
  commentAvatarText: { color: '#D5C4B0', fontWeight: 'bold', fontSize: 12 },
  commentAvatarImage: { width: 32, height: 32, borderRadius: 16 },
  commentContent: { flexShrink: 1, backgroundColor: '#47392b', padding: 12, borderRadius: 16 }, 
  commentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  commentAuthor: { color: '#FFF', fontSize: 13, fontWeight: 'bold', marginRight: 15 }, 
  commentReplyTag: { color: '#D97706', fontSize: 13, fontWeight: 'bold', marginBottom: 2 },
  commentText: { color: '#D5C4B0', fontSize: 13, marginTop: 4 }, 
  replyPreviewContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#47392b', padding: 8, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: '#D9770640', marginBottom: -5, zIndex: 10 },
  replyPreviewLine: { width: 3, height: '100%', backgroundColor: '#D97706', borderRadius: 2, marginRight: 8 },
  replyPreviewContent: { flex: 1 },
  replyPreviewName: { color: '#D97706', fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  replyPreviewClose: { padding: 4, marginLeft: 5 },
  commentInputRow: { flexDirection: 'row', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: '#D5C4B020', paddingTop: 10, position: 'relative', zIndex: 20 },
  commentInput: { flex: 1, backgroundColor: '#47392b', color: '#FFF', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20, maxHeight: 80, marginHorizontal: 8 }, 
  commentIconButton: { padding: 8 },
  recordingButton: { backgroundColor: '#EF4444', borderRadius: 20 },
  commentSendButton: { backgroundColor: '#D97706', width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emojiPickerContainer: { position: 'absolute', bottom: '100%', right: 15, marginBottom: 10, backgroundColor: '#47392b', borderRadius: 16, padding: 15, width: 300, minHeight: 300, maxHeight: 400, borderWidth: 1, borderColor: '#D9770640', zIndex: 50 },
  pickerTabsHeader: { flexDirection: 'row', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#D9770620' },
  pickerTabBtn: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  pickerTabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#D97706' },
  pickerTabBtnText: { color: '#D5C4B080', fontWeight: 'bold' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  gifContainer: { flex: 1 },
  gifSearchInput: { backgroundColor: 'rgba(0,0,0,0.2)', color: '#FFF', borderRadius: 8, padding: 8, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  gifBtn: { flex: 1/2, padding: 2 },
  gifImage: { width: '100%', height: 100, borderRadius: 8 },
});