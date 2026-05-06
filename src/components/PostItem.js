import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Image, ScrollView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../api/firebaseConfig';
import { doc, updateDoc, onSnapshot, collection, query, orderBy, addDoc, serverTimestamp, deleteDoc, arrayUnion, arrayRemove, where, getDocs } from 'firebase/firestore'; 
import { sendNotification } from '../utils/notifications';

import ImageViewerModal from './ImageViewerModal';
import AudioPlayer from './AudioPlayer';
import ChatInput from './ChatInput';
import { COLORS } from '../theme/colors';

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
          <ActivityIndicator size="small" color={COLORS.primary} />
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
  const [showComments, setShowComments] = useState(false);
  
  const [imageAspectRatio, setImageAspectRatio] = useState(null);

  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [currentImageUri, setCurrentImageUri] = useState('');

  const [replyingTo, setReplyingTo] = useState(null);

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
  }, [item.id, postRef]);

  useEffect(() => {
    const q = query(commentsRef, orderBy("createdAt", "asc"));
    return onSnapshot(q, (snapshot) => { setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); });
  }, [item.id, commentsRef]);

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
      Alert.alert("Успіх", "Пост репостнуто на вашу стіну!");

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
        Alert.alert("Помилка", "Сталася помилка при видаленні: " + error.message);
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
      try {
        const replies = comments.filter(c => c.parentId === commentId);
        for (const reply of replies) {
          await deleteDoc(doc(commentsRef, reply.id));
        }
        await deleteDoc(doc(commentsRef, commentId));
      } catch (error) {
        console.error("Помилка видалення коментаря:", error);
      }
    };
    if (Platform.OS === 'web') { if (window.confirm("Видалити коментар?")) confirmAction(); } 
    else { Alert.alert("Видалення", "Видалити коментар?", [{ text: "Ні", style: "cancel" }, { text: "Так", style: "destructive", onPress: confirmAction }]); }
  };

  const startReply = (comment) => setReplyingTo(comment);
  const cancelReply = () => setReplyingTo(null);

  const sendComment = async (text = null, imageUrl = null, audioUrl = null) => {
    const textToSend = text?.trim() || null;
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
      setReplyingTo(null);

      if (item.authorId !== currentUser.uid) {
        await sendNotification(item.authorId, 'comment', { id: currentUser.uid, name: userData?.nickname, avatarUrl: userData?.avatarUrl }, `залишив коментар під вашим записом.`, item.id);
      }
      if (replyingTo && replyingTo.authorId !== currentUser.uid && replyingTo.authorId !== item.authorId) {
        await sendNotification(replyingTo.authorId, 'comment', { id: currentUser.uid, name: userData?.nickname, avatarUrl: userData?.avatarUrl }, `відповів на ваш коментар.`, item.id);
      }
    } catch (e) { 
      console.error(e); 
      Alert.alert("Помилка", "Не вдалося відправити коментар.");
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
                <Ionicons name="arrow-undo-outline" size={14} color={COLORS.textMuted} />
              </TouchableOpacity>
              {(c.authorId === currentUser.uid || canDeletePost) ? (
                <TouchableOpacity style={Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined} onPress={() => handleDeleteComment(c.id)}>
                  <Ionicons name="trash-outline" size={14} color="rgba(239, 68, 68, 0.5)" />
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
          <Ionicons name="repeat" size={14} color={COLORS.primary} style={{ marginHorizontal: 6 }} />
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
                    <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
              )}
            </TouchableOpacity>
          ) : null}

          <View style={styles.actionRowBottom}>
            <View style={styles.actionRowLeft}>
              <TouchableOpacity style={styles.actionIcon} onPress={toggleLike}>
                <Ionicons name={hasLiked ? "heart" : "heart-outline"} size={26} color={hasLiked ? COLORS.danger : COLORS.textSecondary} />
                {likesCount > 0 ? <Text style={styles.actionCount}>{likesCount}</Text> : null}
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionIcon} onPress={() => { if (!hasImage) setShowComments(!showComments); }}>
                <Ionicons name="chatbubble-outline" size={24} color={(!hasImage && showComments) ? COLORS.primary : COLORS.textSecondary} />
                {comments.length > 0 && <Text style={styles.actionCount}>{comments.length}</Text>}
              </TouchableOpacity>
              
              {!isWallPost ? (
                <TouchableOpacity style={styles.actionIcon} onPress={toggleRepost}>
                  <Ionicons name="repeat" size={26} color={hasReposted ? COLORS.success : COLORS.textSecondary} />
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity style={styles.actionIcon} onPress={() => onShare(item)}>
                <Ionicons name="paper-plane-outline" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            {canDeletePost ? <TouchableOpacity onPress={handleDeletePost}><Ionicons name="ellipsis-vertical" size={24} color={COLORS.textMuted} /></TouchableOpacity> : null}
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

            <View style={{ position: 'relative', zIndex: 50, marginTop: 10 }}>
              <ChatInput 
                onSendMessage={sendComment}
                replyingTo={replyingTo}
                replyPreviewName={replyingTo?.authorName}
                replyPreviewText={replyingTo?.text || (replyingTo?.imageUrl ? '📷 Фото' : replyingTo?.audioUrl ? '🎤 Голосове повідомлення' : '...')}
                onCancelReply={cancelReply}
              />
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
  postCard: { width: '100%', maxWidth: 1000, alignSelf: 'center', marginBottom: 40, paddingVertical: 25, paddingHorizontal: 20, backgroundColor: COLORS.surface, borderRadius: 24, borderWidth: 1, borderColor: COLORS.surfaceLight, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 8, transitionProperty: 'background-color, border-color', transitionDuration: '0.3s' },
  repostHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(213, 196, 176, 0.1)', paddingBottom: 10 },
  repostText: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold' },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', marginBottom: 20, minHeight: 50, position: 'relative' },
  postAuthorAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(213, 196, 176, 0.2)', justifyContent: 'center', alignItems: 'center' },
  postAuthorAvatarText: { color: COLORS.textSecondary, fontWeight: 'bold', fontSize: 18 },
  postAuthorAvatarImage: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: COLORS.primary, position: 'absolute', left: 0 },
  postAuthorName: { color: COLORS.text, fontSize: 16, fontWeight: 'bold' },
  columnsContainer: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'stretch' },
  leftColumn: { flex: 1.2, paddingRight: 20 },
  rightColumn: { flex: 1, backgroundColor: 'transparent', paddingLeft: 10, flexDirection: 'column', position: 'relative' },
  singleColumnContainer: { flexDirection: 'column', width: '100%' },
  singleColumnLeft: { width: '100%', paddingRight: 0, paddingBottom: 5 },
  singleColumnRight: { width: '100%', backgroundColor: 'transparent', paddingLeft: 0, flexDirection: 'column', maxHeight: 500, marginTop: 10, paddingTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(213, 196, 176, 0.1)', position: 'relative' },
  postText: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 10 },
  postImageWrapper: { width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: COLORS.surfaceLight }, 
  postImage: { width: '100%', height: '100%' }, 
  actionRowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  actionRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 }, 
  actionIcon: { flexDirection: 'row', alignItems: 'center' },
  actionCount: { color: COLORS.textSecondary, marginLeft: 6, fontSize: 14, fontWeight: 'bold' },
  commentsTitle: { color: COLORS.textSecondary, fontWeight: 'bold', fontSize: 16, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(213, 196, 176, 0.1)', paddingBottom: 10 },
  commentsScrollArea: { flex: 1, marginBottom: 10 }, 
  noCommentsText: { color: 'rgba(213, 196, 176, 0.5)', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
  commentItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 15 },
  replyCommentItem: { marginLeft: 42, marginTop: -5 },
  commentAvatarContainer: { justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(213, 196, 176, 0.2)', justifyContent: 'center', alignItems: 'center' },
  commentAvatarText: { color: COLORS.textSecondary, fontWeight: 'bold', fontSize: 12 },
  commentAvatarImage: { width: 32, height: 32, borderRadius: 16 },
  commentContent: { flexShrink: 1, backgroundColor: COLORS.surfaceLight, padding: 12, borderRadius: 16 }, 
  commentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  commentAuthor: { color: COLORS.text, fontSize: 13, fontWeight: 'bold', marginRight: 15 }, 
  commentReplyTag: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold', marginBottom: 2 },
  commentText: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4 }, 
});