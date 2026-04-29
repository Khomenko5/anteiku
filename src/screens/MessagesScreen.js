import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Image, Dimensions, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker'; 
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { auth, db } from '../api/firebaseConfig';
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, doc, updateDoc, arrayUnion, arrayRemove, getDocs, where, deleteDoc, setDoc, increment } from 'firebase/firestore';
import { Helmet } from 'react-helmet-async';
import { useIsFocused } from '@react-navigation/native';

import ImageViewerModal from '../components/ImageViewerModal';
import AudioPlayer from '../components/AudioPlayer';
import UserCard from '../components/UserCard';

const ChatImageWrapper = ({ uri, onPress }) => {
  const [aspectRatio, setAspectRatio] = useState(null);
  useEffect(() => {
    if (uri) Image.getSize(uri, (w, h) => { if (w > 0 && h > 0) setAspectRatio(w / h); }, () => setAspectRatio(1));
  }, [uri]);
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={{ marginTop: 4, marginBottom: 4 }}>
      {aspectRatio ? <Image source={{ uri }} style={{ width: 240, aspectRatio: aspectRatio, borderRadius: 12 }} resizeMode="cover" /> : <View style={{ width: 240, height: 240, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="small" color="#D97706" /></View>}
    </TouchableOpacity>
  );
};

export default function MessagesScreen({ navigation }) {
  const currentUser = auth.currentUser;
  const [userData, setUserData] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');

  const [recording, setRecording] = useState();
  const [isRecording, setIsRecording] = useState(false);

  const [editingMessageId, setEditingMessageId] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);

  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  const [reactingToMsgId, setReactingToMsgId] = useState(null);

  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef(null);

  const screenWidth = Dimensions.get('window').width;
  const isLargeScreen = screenWidth > 768;

  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [currentImageUri, setCurrentImageUri] = useState('');
  const [isAllMediaVisible, setIsAllMediaVisible] = useState(false);
  const flatListRef = useRef(null);

  const lastPressMap = useRef({});
  const isFocused = useIsFocused();

  const [pickerTab, setPickerTab] = useState('emoji'); 
  const [gifs, setGifs] = useState([]);
  const [gifSearchQuery, setGifSearchQuery] = useState('');
  const [loadingGifs, setLoadingGifs] = useState(false);
  let searchTimeout = useRef(null);

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
    } catch (error) { console.error("Помилка завантаження GIF:", error); } finally { setLoadingGifs(false); }
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
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    const unsubscribeUser = onSnapshot(doc(db, "users", userId), (docSnap) => { if (docSnap.exists()) setUserData(docSnap.data()); });
    const q = query(collection(db, "users"));
    
    const unsubscribeUsers = onSnapshot(q, (snapshot) => {
      const usersList = [];
      snapshot.forEach((docSnap) => { if (docSnap.id !== userId) usersList.push({ id: docSnap.id, ...docSnap.data() }); });
      setUsers(usersList);
      setLoading(false);

      setSelectedUser(prevSelected => {
        if (!prevSelected) return null;
        const freshUserData = usersList.find(u => u.id === prevSelected.id);
        return freshUserData || prevSelected;
      });
    });
    
    return () => { unsubscribeUser(); unsubscribeUsers(); };
  }, []);

  const getChatId = (user1, user2) => [user1, user2].sort().join('_');

  useEffect(() => {
    setEditingMessageId(null); setReplyingTo(null); setReactingToMsgId(null); setShowAttachMenu(false); setShowEmojiMenu(false); setNewMessage(''); setIsPartnerTyping(false);
    if (!selectedUser?.id) return;
    const myId = auth.currentUser.uid;
    const chatId = getChatId(myId, selectedUser.id);
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "desc"));
    const unsubscribeMessages = onSnapshot(q, (snapshot) => { setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); });
    const typingRef = doc(db, "chats", chatId, "typingStatus", selectedUser.id);
    const unsubscribeTyping = onSnapshot(typingRef, (docSnap) => { if (docSnap.exists()) setIsPartnerTyping(docSnap.data().isTyping); });

    return () => { unsubscribeMessages(); unsubscribeTyping(); };
  }, [selectedUser?.id]);

  useEffect(() => {
    if (isFocused && selectedUser?.id && userData?.unreadCounts?.[selectedUser.id] > 0) {
      updateDoc(doc(db, "users", auth.currentUser.uid), { [`unreadCounts.${selectedUser.id}`]: 0 }).catch(err => console.error(err));
    }
  }, [isFocused, selectedUser?.id, userData?.unreadCounts]);

  useEffect(() => {
    if (!isFocused || !selectedUser?.id || messages.length === 0) return;
    const myId = auth.currentUser?.uid;
    if (!myId) return;
    const unreadMessages = messages.filter(m => m.senderId === selectedUser.id && !m.isRead);
    if (unreadMessages.length > 0) {
      const chatId = getChatId(myId, selectedUser.id);
      unreadMessages.forEach(async (msg) => { try { await updateDoc(doc(db, "chats", chatId, "messages", msg.id), { isRead: true }); } catch (e) {} });
    }
  }, [messages, selectedUser?.id, isFocused]);

  const openImageViewer = (uri) => { setCurrentImageUri(uri); setIsImageViewerVisible(true); };

  const formatMessageTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  };

  const getUserAvatar = (uid) => {
    if (uid === auth.currentUser.uid) return userData?.avatarUrl;
    const u = users.find(user => user.id === uid);
    return u?.avatarUrl;
  };

  const handleTyping = (text) => {
    setNewMessage(text);
    if (!selectedUser) return;
    const myId = auth.currentUser.uid;
    const chatId = getChatId(myId, selectedUser.id);
    const typingRef = doc(db, "chats", chatId, "typingStatus", myId);

    setDoc(typingRef, { isTyping: true }, { merge: true }).catch(() => {});
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => { setDoc(typingRef, { isTyping: false }, { merge: true }).catch(() => {}); }, 2000);
  };

  const sendMessage = async (text = null, imageUrl = null, audioUrl = null, fileUrl = null, fileName = null) => {
    const textToSend = text || newMessage.trim();
    if (!textToSend && !imageUrl && !audioUrl && !fileUrl) return;

    const myId = auth.currentUser.uid;
    const partnerId = selectedUser.id;
    const chatId = getChatId(myId, partnerId);
    setNewMessage(''); setShowEmojiMenu(false);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setDoc(doc(db, "chats", chatId, "typingStatus", myId), { isTyping: false }, { merge: true }).catch(() => {});

    const messageData = { text: textToSend, imageUrl: imageUrl, audioUrl: audioUrl, fileUrl: fileUrl, fileName: fileName, senderId: myId, createdAt: serverTimestamp(), isRead: false };

    if (replyingTo) {
      messageData.replyTo = { id: replyingTo.id, text: replyingTo.text || (replyingTo.imageUrl ? '📷 Фото' : replyingTo.fileUrl ? '📄 Файл' : '🎤 Голос'), senderName: replyingTo.senderId === myId ? (userData?.nickname || 'Ви') : selectedUser.nickname };
    }
    setReplyingTo(null);

    try {
      await addDoc(collection(db, "chats", chatId, "messages"), messageData);
      await updateDoc(doc(db, "users", myId), { activeContacts: arrayUnion(partnerId) });
      await updateDoc(doc(db, "users", partnerId), { activeContacts: arrayUnion(myId), [`unreadCounts.${myId}`]: increment(1) });
    } catch (error) { console.error("Помилка відправки:", error); }
  };

  const handleReact = async (messageId, emoji, currentReactions = []) => {
    const myId = auth.currentUser.uid;
    const chatId = getChatId(myId, selectedUser.id);
    const existingReaction = currentReactions.find(r => r.userId === myId && r.emoji === emoji);
    
    try {
      const msgRef = doc(db, "chats", chatId, "messages", messageId);
      if (existingReaction) { await updateDoc(msgRef, { reactions: arrayRemove({ emoji: emoji, userId: myId }) }); } 
      else { await updateDoc(msgRef, { reactions: arrayUnion({ emoji: emoji, userId: myId }) }); }
      setReactingToMsgId(null); 
    } catch (error) { console.error("Помилка додавання/видалення реакції:", error); }
  };

  const handleDeleteMessage = async (messageId) => {
    if (Platform.OS === 'web') {
      if (window.confirm("Видалити це повідомлення?")) { await deleteDoc(doc(db, "chats", getChatId(auth.currentUser.uid, selectedUser.id), "messages", messageId)); }
    } else {
      Alert.alert("Видалення", "Видалити це повідомлення?", [{ text: "Скасувати", style: "cancel" }, { text: "Видалити", style: "destructive", onPress: async () => { await deleteDoc(doc(db, "chats", getChatId(auth.currentUser.uid, selectedUser.id), "messages", messageId)); }}]);
    }
  };

  const handleMessagePress = (item) => {
    const now = Date.now();
    const lastPress = lastPressMap.current[item.id] || 0;
    if (now - lastPress < 300) { startReply(item); lastPressMap.current[item.id] = 0; } 
    else { lastPressMap.current[item.id] = now; setReactingToMsgId(null); setShowAttachMenu(false); setShowEmojiMenu(false); }
  };

  const startReply = (item) => { setReplyingTo(item); setEditingMessageId(null); if(editingMessageId) setNewMessage(''); };
  const cancelReply = () => setReplyingTo(null);
  const startEditing = (item) => { setEditingMessageId(item.id); setReplyingTo(null); setNewMessage(item.text || ''); };
  const cancelEditing = () => { setEditingMessageId(null); setNewMessage(''); };

  const saveEditedMessage = async () => {
    const textToSave = newMessage.trim();
    if (!textToSave || !editingMessageId) return;
    const chatId = getChatId(auth.currentUser.uid, selectedUser.id);
    try {
      await updateDoc(doc(db, "chats", chatId, "messages", editingMessageId), { text: textToSave, isEdited: true });
      setEditingMessageId(null); setNewMessage('');
    } catch (error) {}
  };

  const handlePickAndSendImage = async () => {
    setShowAttachMenu(false);
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.5, base64: true });
    if (!result.canceled) {
      setIsUploading(true);
      try {
        const formData = new FormData(); formData.append('file', `data:image/jpeg;base64,${result.assets[0].base64}`); formData.append('upload_preset', "anteiku_app");
        const res = await fetch(`https://api.cloudinary.com/v1_1/dv7fktjv5/image/upload`, { method: 'POST', body: formData });
        const cloudData = await res.json();
        if (cloudData.secure_url) await sendMessage(null, cloudData.secure_url, null);
      } catch (e) { alert("Помилка фото"); } finally { setIsUploading(false); }
    }
  };

  const handlePickAndSendDocument = async () => {
    setShowAttachMenu(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      setIsUploading(true);
      const fileUri = result.assets[0].uri;
      const fileName = result.assets[0].name;

      const formData = new FormData();
      if (Platform.OS === 'web') { const res = await fetch(fileUri); const blob = await res.blob(); formData.append('file', blob, fileName); } 
      else { formData.append('file', { uri: fileUri, type: result.assets[0].mimeType || 'application/octet-stream', name: fileName }); }
      formData.append('upload_preset', "anteiku_app");
      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/dv7fktjv5/raw/upload`, { method: 'POST', body: formData });
      const cloudData = await uploadRes.json();
      if (cloudData.secure_url) { await sendMessage(null, null, null, cloudData.secure_url, fileName); }
    } catch (err) { alert("Помилка завантаження файлу"); } finally { setIsUploading(false); }
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
        if (cloudData.secure_url) await sendMessage(null, null, cloudData.secure_url);
      } catch (e) { alert("Помилка аудіо"); } finally { setIsUploading(false); }
    } else {
      try {
        const perm = await Audio.requestPermissionsAsync();
        if (perm.status === 'granted') { await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true }); const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY); setRecording(recording); setIsRecording(true); } 
        else alert("Потрібен дозвіл на мікрофон!");
      } catch (err) { console.error(err); }
    }
  };

  const renderCell = useCallback(({ children, index, style, ...props }) => {
    const cellZIndex = 10000 - index;
    return <View style={[style, { zIndex: cellZIndex, elevation: cellZIndex }]} {...props}>{children}</View>;
  }, []);

  if (loading) return <View style={[styles.container, { justifyContent: 'center' }]}><ActivityIndicator size="large" color="#D97706" /></View>;

  const activeContactIds = userData?.activeContacts || [];
  const displayedContacts = users.filter(u => activeContactIds.includes(u.id) || u.id === selectedUser?.id);

  const chatMediaLinks = messages.map(m => m.imageUrl || (m.sharedPost ? m.sharedPost.imageUrl : null)).filter(uri => uri !== null);

  const renderContactsList = () => (
    <View style={[styles.contactsContainer, isLargeScreen && { flex: 1, minWidth: 320, maxWidth: 420 }]}>
      <View style={styles.contactsHeader}>
        <Text style={styles.headerTitle}>Діалоги</Text>
        <TouchableOpacity onPress={() => setIsSearchOpen(true)} style={[styles.searchIconBtn, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}><Ionicons name="search" size={20} color="#D97706" /></TouchableOpacity>
      </View>
      <FlatList
        data={displayedContacts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 10, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const unreadCount = userData?.unreadCounts?.[item.id] || 0;
          return (
            <TouchableOpacity style={[styles.contactCard, selectedUser?.id === item.id && styles.contactCardActive, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} onPress={() => setSelectedUser(item)}>
              <View style={{ position: 'relative' }}>
                {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={styles.contactAvatar} resizeMode="cover" /> : <View style={styles.contactAvatarPlaceholder}><Text style={styles.contactAvatarText}>{item.nickname ? item.nickname[0].toUpperCase() : '?'}</Text></View>}
                <View style={[styles.onlineBadge, !item.isOnline && { backgroundColor: '#D5C4B080', borderColor: '#302D28' }]} />
              </View>
              <View style={styles.contactInfo}>
                <Text style={[styles.contactName, selectedUser?.id === item.id && { color: '#D97706' }]} numberOfLines={1}>{item.nickname}</Text>
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
            <Ionicons name="paper-plane-outline" size={80} color="#D5C4B010" />
            <Text style={styles.emptyChatText}>Виберіть чат для початку спілкування</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.chatPane} onTouchStart={() => { setShowAttachMenu(false); setShowEmojiMenu(false); setReactingToMsgId(null); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.chatHeader}>
            <View style={styles.chatHeaderLeft}>
              {!isLargeScreen && (
                <TouchableOpacity onPress={() => setSelectedUser(null)} style={[styles.backButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}><Ionicons name="arrow-back" size={24} color="#D5C4B0" /></TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={[styles.chatHeaderCenter, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} onPress={() => navigation.navigate('Profile', { identifier: selectedUser.username || selectedUser.id })}>
              {selectedUser.avatarUrl ? <Image source={{ uri: selectedUser.avatarUrl }} style={styles.chatHeaderAvatar} resizeMode="cover" /> : <View style={styles.chatHeaderAvatarPlaceholder}><Text style={styles.chatHeaderAvatarText}>{selectedUser.nickname[0].toUpperCase()}</Text></View>}
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.chatHeaderName}>{selectedUser.nickname}</Text>
                {isPartnerTyping ? <Text style={styles.typingText}>друкує...</Text> : <Text style={[styles.onlineTextSmall, !selectedUser.isOnline && { color: '#D5C4B080' }]}>{selectedUser.isOnline ? 'Онлайн' : 'Офлайн'}</Text>}
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
              const isMe = item.senderId === auth.currentUser.uid;
              const nextMessage = messages[index - 1];
              const showTail = !nextMessage || nextMessage.senderId !== item.senderId;

              const groupedReactions = item.reactions ? item.reactions.reduce((acc, curr) => {
                if (!acc[curr.emoji]) acc[curr.emoji] = [];
                acc[curr.emoji].push(curr.userId);
                return acc;
              }, {}) : {};

              const renderReplyBlock = () => {
                if (!item.replyTo) return null;
                return (
                  <View style={styles.messageReplyContainer}>
                    <View style={[styles.messageReplyLine, { backgroundColor: isMe ? '#FFF' : '#D97706' }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.messageReplyName, { color: isMe ? '#FFF' : '#D97706' }]}>{item.replyTo.senderName}</Text>
                      <Text style={styles.messageReplyText} numberOfLines={1}>{item.replyTo.text}</Text>
                    </View>
                  </View>
                );
              };

              return (
                <View style={[styles.messageWrapper, isMe ? styles.messageWrapperMine : styles.messageWrapperTheirs, showTail && (isMe ? styles.messageWrapperMineTail : styles.messageWrapperTheirsTail)]}>
                  
                  {reactingToMsgId === item.id && (
                    <View style={[styles.reactionPickerBubble, isMe ? { right: 15 } : { left: 15 }]}>
                      {['👍','❤️','😂','🔥','😢'].map(emoji => (
                        <TouchableOpacity key={emoji} onPress={() => handleReact(item.id, emoji, item.reactions)} style={styles.reactionBtn}>
                          <Text style={{fontSize: 22}}>{emoji}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <TouchableOpacity activeOpacity={1} onPress={() => handleMessagePress(item)} style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage, showTail && (isMe ? styles.myMessageTail : styles.theirMessageTail)]}>
                    {showTail && <View style={[styles.messageTail, isMe ? styles.messageTailMine : styles.messageTailTheirs]} />}
                    {renderReplyBlock()}

                    {item.sharedPost && (
                      <TouchableOpacity activeOpacity={0.85} style={[styles.sharedPostCard, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} onPress={() => navigation.navigate('Profile', { identifier: item.sharedPost.authorId, highlightPostId: item.sharedPost.id })}>
                        <View style={styles.sharedPostHeader}>
                          {item.sharedPost.authorAvatarUrl ? (
                            <Image source={{ uri: item.sharedPost.authorAvatarUrl }} style={styles.sharedPostAvatar} resizeMode="cover" />
                          ) : (
                            <View style={styles.sharedPostAvatarPlaceholder}><Text style={styles.sharedPostAvatarText}>{item.sharedPost.authorName[0].toUpperCase()}</Text></View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={styles.sharedPostName}>{item.sharedPost.authorName}</Text>
                            <Text style={styles.sharedPostSubText}>Пересланий запис</Text>
                          </View>
                        </View>
                        {item.sharedPost.text ? <Text style={styles.sharedPostText} numberOfLines={4}>{item.sharedPost.text}</Text> : null}
                        {item.sharedPost.imageUrl ? <Image source={{ uri: item.sharedPost.imageUrl }} style={styles.sharedPostImage} resizeMode="cover" /> : null}
                      </TouchableOpacity>
                    )}

                    {item.imageUrl && <ChatImageWrapper uri={item.imageUrl} onPress={() => openImageViewer(item.imageUrl)} />}
                    {item.fileUrl && (
                      <TouchableOpacity style={styles.fileContainer} onPress={() => Platform.OS === 'web' ? window.open(item.fileUrl, '_blank') : null}>
                        <Ionicons name="document-text" size={24} color={isMe ? '#FFF' : '#D97706'} />
                        <Text style={[styles.fileName, {color: isMe ? '#FFF' : '#D5C4B0'}]} numberOfLines={1}>{item.fileName}</Text>
                      </TouchableOpacity>
                    )}
                    {item.text ? <Text style={styles.messageText}>{item.text}</Text> : null}
                    {item.audioUrl && <AudioPlayer audioUrl={item.audioUrl} />}
                    
                    {Object.keys(groupedReactions).length > 0 && (
                      <View style={styles.reactionsDisplayRow}>
                        {Object.entries(groupedReactions).map(([emoji, userIds]) => (
                          <TouchableOpacity key={emoji} style={[styles.reactionBadge, userIds.includes(auth.currentUser.uid) && styles.reactionBadgeActive]} onPress={() => handleReact(item.id, emoji, item.reactions)}>
                            <Text style={styles.reactionBadgeText}>{emoji}</Text>
                            <View style={styles.reactionAvatarsRow}>
                              {userIds.slice(0, 3).map((uid, idx) => {
                                const avatar = getUserAvatar(uid);
                                return avatar ? (
                                  <Image key={uid} source={{ uri: avatar }} style={[styles.reactionMiniAvatar, { marginLeft: idx > 0 ? -6 : 4 }]} />
                                ) : (
                                  <View key={uid} style={[styles.reactionMiniAvatarPlaceholder, { marginLeft: idx > 0 ? -6 : 4 }]} />
                                );
                              })}
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <View style={styles.messageFooterInfo}>
                      {item.isEdited && <Text style={styles.editedText}>(ред.) </Text>}
                      <Text style={styles.messageTime}>{formatMessageTime(item.createdAt)}</Text>
                      {isMe && <Ionicons name={item.isRead ? "checkmark-done-outline" : "checkmark-outline"} size={16} color={item.isRead ? "#10B981" : "rgba(255,255,255,0.6)"} style={{ marginLeft: 4, marginRight: 6 }} />}
                      <TouchableOpacity onPress={() => setReactingToMsgId(reactingToMsgId === item.id ? null : item.id)} style={styles.actionIconBtn}><Ionicons name="add-circle-outline" size={14} color="rgba(255,255,255,0.6)" /></TouchableOpacity>
                      <TouchableOpacity onPress={() => startReply(item)} style={styles.actionIconBtn}><Ionicons name="arrow-undo-outline" size={14} color="rgba(255,255,255,0.6)" /></TouchableOpacity>
                      {isMe && !item.audioUrl && <TouchableOpacity onPress={() => startEditing(item)} style={styles.actionIconBtn}><Ionicons name="pencil" size={14} color="rgba(255,255,255,0.6)" /></TouchableOpacity>}
                      {isMe && <TouchableOpacity onPress={() => handleDeleteMessage(item.id)} style={styles.actionIconBtn}><Ionicons name="trash-outline" size={14} color="rgba(255,255,255,0.6)" /></TouchableOpacity>}
                    </View>
                  </TouchableOpacity>
                </View>
              );
            }}
          />

          <View style={styles.inputAreaWrapper}>
            {replyingTo && (
              <View style={styles.replyPreviewContainer}>
                <Ionicons name="arrow-undo" size={20} color="#D97706" style={{ marginRight: 10 }} />
                <View style={styles.replyPreviewLine} />
                <View style={styles.replyPreviewContent}>
                  <Text style={styles.replyPreviewName}>{replyingTo.senderId === auth.currentUser.uid ? (userData?.nickname || 'Ви') : selectedUser.nickname}</Text>
                  <Text style={styles.replyPreviewText} numberOfLines={1}>{replyingTo.text || (replyingTo.imageUrl ? '📷 Фото' : '🎤 Голосове повідомлення')}</Text>
                </View>
                <TouchableOpacity onPress={cancelReply} style={styles.replyPreviewClose} Platform={{ OS: 'web', style: { outlineStyle: 'none' } }}><Ionicons name="close-circle" size={24} color="#D5C4B080" /></TouchableOpacity>
              </View>
            )}

            {showEmojiMenu && (
              <View style={styles.emojiPickerContainer}>
                <View style={styles.pickerTabsHeader}>
                  <TouchableOpacity onPress={() => setPickerTab('emoji')} style={[styles.pickerTabBtn, pickerTab === 'emoji' && styles.pickerTabBtnActive]}><Text style={[styles.pickerTabBtnText, pickerTab === 'emoji' && {color: '#D97706'}]}>Емодзі</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setPickerTab('gif')} style={[styles.pickerTabBtn, pickerTab === 'gif' && styles.pickerTabBtnActive]}><Text style={[styles.pickerTabBtnText, pickerTab === 'gif' && {color: '#D97706'}]}>GIF</Text></TouchableOpacity>
                </View>

                {pickerTab === 'emoji' ? (
                  <View style={styles.emojiGrid}>
                    {EMOJI_LIST.map(emoji => (
                      <TouchableOpacity key={emoji} onPress={() => setNewMessage(newMessage + emoji)} style={{padding: 6}}><Text style={{fontSize: 24}}>{emoji}</Text></TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={styles.gifContainer}>
                    <TextInput style={[styles.gifSearchInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="Пошук GIF..." placeholderTextColor="#D5C4B080" value={gifSearchQuery} onChangeText={handleGifSearch} />
                    {loadingGifs ? <ActivityIndicator size="small" color="#D97706" style={{marginTop: 20}}/> : (
                      <FlatList data={gifs} keyExtractor={(item, index) => index.toString()} numColumns={2} renderItem={({item}) => (
                          <TouchableOpacity onPress={() => sendMessage(null, item, null)} style={styles.gifBtn}><Image source={{uri: item}} style={styles.gifImage} /></TouchableOpacity>
                        )} />
                    )}
                  </View>
                )}
              </View>
            )}

            <View style={styles.inputContainer}>
              <View style={{position: 'relative', zIndex: 100}}>
                {showAttachMenu && (
                  <View style={styles.attachMenuPopover}>
                    <TouchableOpacity onPress={handlePickAndSendImage} style={styles.attachMenuItem}><Ionicons name="image" size={20} color="#D97706" style={{marginRight: 8}}/><Text style={{color: '#FFF'}}>Фото</Text></TouchableOpacity>
                    <View style={{height: 1, backgroundColor: '#D9770620', marginVertical: 4}}/>
                    <TouchableOpacity onPress={handlePickAndSendDocument} style={styles.attachMenuItem}><Ionicons name="document" size={20} color="#10B981" style={{marginRight: 8}}/><Text style={{color: '#FFF'}}>Файл</Text></TouchableOpacity>
                  </View>
                )}
                
                {editingMessageId ? (
                  <TouchableOpacity onPress={cancelEditing} style={[styles.iconButton, { paddingBottom: 15 }, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}><Ionicons name="close-circle" size={28} color="#EF4444" /></TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => setShowAttachMenu(!showAttachMenu)} style={[styles.iconButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} disabled={isUploading}>{isUploading ? <ActivityIndicator color="#D97706" size="small" /> : <Ionicons name="add-circle" size={28} color="#D5C4B080" />}</TouchableOpacity>
                )}
              </View>

              <TextInput 
                style={[styles.textInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} 
                placeholder={editingMessageId ? "Редагування повідомлення..." : replyingTo ? "Написати відповідь..." : "Написати повідомлення..."} 
                placeholderTextColor="#D5C4B050" value={newMessage} onChangeText={handleTyping} multiline
                onKeyPress={(e) => { if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) { e.preventDefault(); editingMessageId ? saveEditedMessage() : sendMessage(); } }}
              />
              
              {!editingMessageId && <TouchableOpacity onPress={() => setShowEmojiMenu(!showEmojiMenu)} style={[styles.iconButton, {marginLeft: 8}, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}><Ionicons name="happy-outline" size={26} color={showEmojiMenu ? "#D97706" : "#D5C4B080"} /></TouchableOpacity>}
              
              {editingMessageId ? (
                <TouchableOpacity onPress={saveEditedMessage} style={[styles.sendButton, { backgroundColor: '#10B981' }, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}><Ionicons name="checkmark" size={20} color="#FFF" /></TouchableOpacity>
              ) : newMessage.trim() === '' ? (
                <TouchableOpacity onPress={handleVoiceRecord} style={[styles.iconButton, isRecording && styles.recordingButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}><Ionicons name={isRecording ? "stop" : "mic"} size={26} color={isRecording ? "#FFF" : "#D5C4B0"} /></TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => sendMessage()} style={[styles.sendButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}><Ionicons name="send" size={18} color="#302D28" /></TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  };

  const renderInfoArea = () => {
    if (!selectedUser) return null;
    const formatRegistrationDate = (timestamp) => {
      if (!timestamp) return '';
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      return `${day}.${month}.${year}`;
    };

    return (
      <View style={styles.infoPane}>
        <View style={styles.infoProfileSection}>
          {selectedUser.avatarUrl ? <Image source={{ uri: selectedUser.avatarUrl }} style={styles.infoAvatar} resizeMode="cover" /> : <View style={styles.infoAvatarPlaceholder}><Text style={styles.infoAvatarText}>{selectedUser.nickname[0].toUpperCase()}</Text></View>}
          <Text style={styles.infoName}>{selectedUser.nickname}</Text>
          <Text style={[styles.infoStatus, !selectedUser.isOnline && { color: '#D5C4B080' }]}>{selectedUser.isOnline ? 'Онлайн' : 'Офлайн'}</Text>
          {selectedUser.customStatus && <Text style={styles.infoCustomStatus} numberOfLines={3}>"{selectedUser.customStatus}"</Text>}
          {!selectedUser.customStatus && selectedUser.createdAt && <Text style={styles.infoJoinedDate}>В Антейку з {formatRegistrationDate(selectedUser.createdAt)}</Text>}
          <View style={styles.infoActionButtons}>
            <TouchableOpacity style={[styles.infoProfileBtn, { flex: 1, marginRight: 10 }]} onPress={() => navigation.navigate('Profile', { identifier: selectedUser.username || selectedUser.id })}><Text style={styles.infoProfileBtnText}>Профіль</Text></TouchableOpacity>
            <TouchableOpacity style={styles.infoIconBtn}><Ionicons name="notifications-off-outline" size={20} color="#D5C4B0" /></TouchableOpacity>
          </View>
        </View>
        {selectedUser.guildTag && (
          <View style={styles.guildSection}>
            <Text style={styles.sectionLabel}>Гільдія</Text>
            <View style={styles.guildCard}><View style={styles.guildIcon}><Ionicons name="shield-outline" size={20} color="#302D28" /></View><Text style={styles.guildName}>[{selectedUser.guildTag}]</Text></View>
          </View>
        )}
        <View style={styles.divider} />
        <View style={styles.mediaSection}>
          <TouchableOpacity style={[styles.mediaHeaderRow, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} onPress={() => { if(chatMediaLinks.length > 0) setIsAllMediaVisible(true); }}>
            <Text style={styles.mediaTitle}>Медіа</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={styles.mediaCount}>{chatMediaLinks.length}</Text><Ionicons name="chevron-forward" size={18} color="#D5C4B050" style={{marginLeft: 5}}/></View>
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

      <Modal visible={isSearchOpen} animationType="slide" transparent={true} onRequestClose={() => setIsSearchOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.searchModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Новий чат</Text>
              <TouchableOpacity onPress={() => setIsSearchOpen(false)} style={Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined}><Ionicons name="close" size={28} color="#D5C4B080" /></TouchableOpacity>
            </View>
            <View style={styles.searchInputWrapper}>
              <Ionicons name="search" size={20} color="#D5C4B050" style={{ marginRight: 10 }} />
              <TextInput style={[styles.searchModalInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="Пошук за нікнеймом..." placeholderTextColor="#D5C4B050" value={searchText} onChangeText={setSearchText} autoFocus={true} />
            </View>
            <FlatList 
              data={users.filter(u => (u.nickname || '').toLowerCase().includes(searchText.toLowerCase()))} 
              keyExtractor={item => item.id} 
              ListEmptyComponent={<Text style={[styles.emptyContactsText, {marginTop: 20}]}>Користувача не знайдено</Text>} 
              renderItem={({item}) => (
                <UserCard 
                  item={item} 
                  onPress={() => { 
                    setSelectedUser(item); 
                    setIsSearchOpen(false); 
                    setSearchText(''); 
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
              <TouchableOpacity onPress={() => setIsAllMediaVisible(false)} style={Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined}><Ionicons name="close" size={32} color="#D5C4B0" /></TouchableOpacity>
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
  container: { flex: 1, backgroundColor: '#302D28' },
  splitContainer: { flex: 1, flexDirection: 'row', maxWidth: 1850, width: '98%', alignSelf: 'center', paddingTop: Platform.OS === 'ios' ? 50 : 20, paddingBottom: Platform.OS === 'ios' ? 30 : 20 },
  contactsContainer: { flex: 1, backgroundColor: '#302D28', borderRightWidth: 1, borderRightColor: '#D9770620', paddingRight: 10 },
  contactsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 10 : 0, borderBottomWidth: 1, borderBottomColor: '#D9770620' },
  headerTitle: { color: '#D5C4B0', fontSize: 24, fontWeight: 'bold' },
  searchIconBtn: { backgroundColor: '#D9770620', padding: 8, borderRadius: 12, borderWidth: 1, borderColor: '#D9770640' },
  emptyContactsText: { color: '#D5C4B050', textAlign: 'center', fontSize: 15, paddingHorizontal: 20, lineHeight: 22 },
  contactCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, marginBottom: 8, backgroundColor: 'transparent' },
  contactCardActive: { backgroundColor: '#47392b', borderWidth: 1, borderColor: '#D9770640' },
  contactAvatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#D97706' },
  contactAvatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#35322D', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#D9770650' },
  contactAvatarText: { color: '#D5C4B0', fontSize: 20, fontWeight: 'bold' },
  onlineBadge: { position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: '#10B981', borderWidth: 2, borderColor: '#302D28' },
  contactInfo: { marginLeft: 12, flex: 1, justifyContent: 'center' },
  contactName: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  contactTag: { color: '#D5C4B060', fontSize: 13 },
  unreadBadge: { backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 10, paddingHorizontal: 6 },
  unreadBadgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },

  chatPane: { flex: 2.2, backgroundColor: '#35322D', borderRadius: 24, marginLeft: 15, overflow: 'hidden', borderWidth: 1, borderColor: '#47392b', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
  emptyChatContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyChatText: { color: '#D5C4B050', fontSize: 18, marginTop: 20 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, backgroundColor: '#35322D', borderBottomWidth: 1, borderBottomColor: '#D9770620', zIndex: 10 },
  chatHeaderLeft: { flex: 1, alignItems: 'flex-start' },
  chatHeaderCenter: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  chatHeaderRight: { flex: 1 },
  backButton: { marginRight: 15 },
  chatHeaderAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#D97706', marginRight: 12 },
  chatHeaderAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#47392b', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  chatHeaderAvatarText: { color: '#D5C4B0', fontSize: 18, fontWeight: 'bold' },
  chatHeaderName: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  typingText: { color: '#D97706', fontSize: 12, marginTop: 2, fontStyle: 'italic', fontWeight: '500' },
  onlineTextSmall: { color: '#10B981', fontSize: 12, marginTop: 2 },

  messageWrapper: { width: '100%', marginBottom: 6, position: 'relative' },
  messageWrapperMine: { alignItems: 'flex-end', paddingRight: 10 },
  messageWrapperTheirs: { alignItems: 'flex-start', paddingLeft: 10 },
  messageWrapperMineTail: { marginBottom: 15 },
  messageWrapperTheirsTail: { marginBottom: 15 },
  messageBubble: { maxWidth: '75%', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20, position: 'relative' },
  myMessage: { backgroundColor: '#8B5E34' },
  theirMessage: { backgroundColor: '#47392b' },
  myMessageTail: { borderBottomRightRadius: 4 },
  theirMessageTail: { borderBottomLeftRadius: 4 },
  messageTail: { position: 'absolute', bottom: 0, width: 0, height: 0, borderTopWidth: 15, borderTopColor: 'transparent' },
  messageTailMine: { right: -8, borderLeftWidth: 15, borderLeftColor: '#8B5E34' },
  messageTailTheirs: { left: -8, borderRightWidth: 15, borderRightColor: '#47392b' },
  messageText: { color: '#FFF', fontSize: 15, lineHeight: 22 },
  messageFooterInfo: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 4 },
  messageTime: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 10 },
  editedText: { color: 'rgba(255, 255, 255, 0.5)', fontSize: 10, fontStyle: 'italic' },
  actionIconBtn: { marginLeft: 8, padding: 2, outlineStyle: 'none' },

  messageReplyContainer: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 6, marginBottom: 8, overflow: 'hidden' },
  messageReplyLine: { width: 3, borderRadius: 2, marginRight: 8 },
  messageReplyName: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  messageReplyText: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },

  sharedPostCard: { backgroundColor: 'rgba(0,0,0,0.25)', padding: 12, borderRadius: 16, borderLeftWidth: 4, borderLeftColor: '#D97706', minWidth: 260, maxWidth: '100%', marginBottom: 8, marginTop: 4 },
  sharedPostHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sharedPostAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 10 },
  sharedPostAvatarPlaceholder: { width: 32, height: 32, borderRadius: 16, marginRight: 10, backgroundColor: '#D5C4B020', justifyContent: 'center', alignItems: 'center' },
  sharedPostAvatarText: { color: '#D5C4B0', fontSize: 14, fontWeight: 'bold' },
  sharedPostName: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  sharedPostSubText: { color: '#D5C4B080', fontSize: 11, fontStyle: 'italic' },
  sharedPostText: { color: '#FFF', fontSize: 14, marginBottom: 10, lineHeight: 20 },
  sharedPostImage: { width: '100%', height: 200, borderRadius: 8 },

  fileContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 8, marginTop: 5, marginBottom: 5 },
  fileName: { fontSize: 14, marginLeft: 8, textDecorationLine: 'underline', flexShrink: 1 },
  
  reactionPickerBubble: { position: 'absolute', bottom: '100%', flexDirection: 'row', backgroundColor: '#35322D', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginBottom: 5, borderWidth: 1, borderColor: '#D9770640', elevation: 15, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, zIndex: 1000 },
  reactionBtn: { paddingHorizontal: 6 },
  
  reactionsDisplayRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  reactionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, paddingLeft: 6, paddingRight: 4, paddingVertical: 2, marginRight: 4, marginTop: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  reactionBadgeActive: { borderColor: '#D97706', backgroundColor: 'rgba(217, 119, 6, 0.2)' },
  reactionBadgeText: { fontSize: 12, color: '#FFF' },
  reactionAvatarsRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  reactionMiniAvatar: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: '#35322D' },
  reactionMiniAvatarPlaceholder: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: '#35322D', backgroundColor: '#D97706' },

  inputAreaWrapper: { backgroundColor: '#35322D', borderTopWidth: 1, borderTopColor: '#D9770620', position: 'relative' },
  attachMenuPopover: { position: 'absolute', bottom: '100%', left: 5, backgroundColor: '#47392b', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#D9770640', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, zIndex: 1000 },
  attachMenuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10 },
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

  replyPreviewContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#47392b', padding: 10, marginHorizontal: 15, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: '#D9770640' },
  replyPreviewLine: { width: 4, height: '100%', backgroundColor: '#D97706', borderRadius: 2, marginRight: 10 },
  replyPreviewContent: { flex: 1 },
  replyPreviewName: { color: '#D97706', fontSize: 13, fontWeight: 'bold', marginBottom: 2 },
  replyPreviewText: { color: '#D5C4B0', fontSize: 13 },
  replyPreviewClose: { padding: 5, marginLeft: 10 },

  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 15 },
  iconButton: { paddingBottom: 10, paddingRight: 10 },
  recordingButton: { backgroundColor: '#EF4444', borderRadius: 20, padding: 10 },
  textInput: { flex: 1, backgroundColor: '#47392b', color: '#FFF', borderRadius: 20, paddingHorizontal: 15, paddingTop: 12, paddingBottom: 12, maxHeight: 100, fontSize: 15 },
  sendButton: { backgroundColor: '#D97706', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 10, marginBottom: 4 },

  infoPane: { flex: 1, minWidth: 320, maxWidth: 420, backgroundColor: '#35322D', borderRadius: 24, marginLeft: 15, borderWidth: 1, borderColor: '#47392b', alignItems: 'center', paddingVertical: 30, paddingHorizontal: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
  infoProfileSection: { alignItems: 'center', width: '100%' },
  infoAvatar: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#D97706', marginBottom: 15 },
  infoAvatarPlaceholder: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#47392b', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#D97706', marginBottom: 15 },
  infoAvatarText: { color: '#D5C4B0', fontSize: 48, fontWeight: 'bold' },
  infoName: { color: '#FFF', fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  infoStatus: { color: '#10B981', fontSize: 14, marginTop: 5, marginBottom: 15 },
  infoCustomStatus: { color: '#D5C4B0', fontSize: 14, textAlign: 'center', marginBottom: 15, paddingHorizontal: 10, fontStyle: 'italic', opacity: 0.8 },
  infoJoinedDate: { color: '#D5C4B060', fontSize: 12, textAlign: 'center', marginBottom: 15 },
  infoActionButtons: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingHorizontal: 10, marginBottom: 20 },
  infoProfileBtn: { backgroundColor: 'rgba(217, 119, 6, 0.1)', paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.3)', alignItems: 'center', justifyContent: 'center' },
  infoProfileBtnText: { color: '#D97706', fontWeight: 'bold', fontSize: 14 },
  infoIconBtn: { width: 40, height: 40, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' },
  guildSection: { width: '100%', marginTop: 5 },
  sectionLabel: { color: '#D5C4B080', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 5 },
  guildCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#D9770620', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#D9770640' },
  guildIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#D97706', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  guildName: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  divider: { width: '100%', height: 1, backgroundColor: '#D9770620', marginVertical: 25 },
  mediaSection: { width: '100%' },
  mediaHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 5 },
  mediaTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  mediaCount: { color: '#D97706', fontSize: 16, fontWeight: 'bold' },

  allMediaOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.85)', justifyContent: 'center', alignItems: 'center' },
  allMediaModalInner: { width: '85%', height: '85%', backgroundColor: '#35322D', borderRadius: 24, borderWidth: 1, borderColor: '#47392b', overflow: 'hidden', paddingBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  allMediaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#D9770620' },
  allMediaTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  allMediaGridItem: { flex: 1/5, margin: 4, aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: '#47392b' },
  allMediaImage: { width: '100%', height: '100%' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(48, 45, 40, 0.95)', justifyContent: 'flex-end' },
  searchModalContent: { backgroundColor: '#47392b', flex: 1, marginTop: 60, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, borderWidth: 1, borderColor: '#D9770640', maxWidth: 600, alignSelf: 'center', width: '100%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  searchInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 16, paddingHorizontal: 15, marginBottom: 20, borderWidth: 1, borderColor: '#FFF20' }, 
  searchModalInput: { flex: 1, color: '#FFF', paddingVertical: 15, fontSize: 16 }, 
  emptyContactsText: { color: '#D5C4B050', textAlign: 'center', fontSize: 15, paddingHorizontal: 20, lineHeight: 22 },
});