import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Image, Dimensions, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../api/firebaseConfig';
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, doc, updateDoc, arrayUnion, arrayRemove, getDocs, setDoc, increment, limit, startAt, endAt, documentId, deleteDoc, where } from 'firebase/firestore';
import { Helmet } from 'react-helmet-async';
import { useIsFocused } from '@react-navigation/native';

import ImageViewerModal from '../components/ImageViewerModal';
import AudioPlayer from '../components/AudioPlayer';
import UserCard from '../components/UserCard';
import ChatInput from '../components/ChatInput';
import { COLORS } from '../theme/colors';

const ChatImageWrapper = ({ uri, onPress }) => {
  const [aspectRatio, setAspectRatio] = useState(null);
  useEffect(() => {
    if (uri) Image.getSize(uri, (w, h) => { if (w > 0 && h > 0) setAspectRatio(w / h); }, () => setAspectRatio(1));
  }, [uri]);
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={{ marginTop: 4, marginBottom: 4 }}>
      {aspectRatio ? <Image source={{ uri }} style={{ width: 240, aspectRatio: aspectRatio, borderRadius: 12 }} resizeMode="cover" /> : <View style={{ width: 240, height: 240, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="small" color={COLORS.primary} /></View>}
    </TouchableOpacity>
  );
};

export default function MessagesScreen({ navigation }) {
  const currentUser = auth.currentUser;
  const [userData, setUserData] = useState(null);
  const [users, setUsers] = useState([]); 
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const userSearchTimeout = useRef(null);

  const [editingMessageId, setEditingMessageId] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
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

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    const unsubscribeUser = onSnapshot(doc(db, "users", userId), (docSnap) => { 
      if (docSnap.exists()) setUserData(docSnap.data()); 
    });
    return () => unsubscribeUser();
  }, []);

  useEffect(() => {
    const activeIds = userData?.activeContacts || [];
    const idsToFetch = [...activeIds];
    
    if (selectedUser?.id && !idsToFetch.includes(selectedUser.id)) {
      idsToFetch.push(selectedUser.id);
    }

    if (idsToFetch.length === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    const chunk = idsToFetch.slice(0, 30);
    const q = query(collection(db, "users"), where(documentId(), "in", chunk));
    
    const unsubscribeUsers = onSnapshot(q, (snapshot) => {
      const usersList = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      usersList.sort((a, b) => (b.isOnline === true) - (a.isOnline === true));
      setUsers(usersList);
      setLoading(false);

      setSelectedUser(prevSelected => {
        if (!prevSelected) return null;
        const freshUserData = usersList.find(u => u.id === prevSelected.id);
        return freshUserData || prevSelected;
      });
    });
    
    return () => unsubscribeUsers();
  }, [userData?.activeContacts, selectedUser?.id]);

  const handleSearchUsers = async (text) => {
    setSearchText(text);
    if (text.trim().length < 2) {
      setSearchResults([]);
      return;
    }

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

        setSearchResults(results.filter(u => u.id !== auth.currentUser.uid));
      } catch (error) {
        console.error("Помилка пошуку:", error);
      } finally {
        setIsSearchingUsers(false);
      }
    }, 600);
  };

  const getChatId = (user1, user2) => [user1, user2].sort().join('_');

  useEffect(() => {
    setEditingMessageId(null); setReplyingTo(null); setReactingToMsgId(null); setIsPartnerTyping(false);
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
    if (!selectedUser) return;
    const myId = auth.currentUser.uid;
    const chatId = getChatId(myId, selectedUser.id);
    const typingRef = doc(db, "chats", chatId, "typingStatus", myId);

    setDoc(typingRef, { isTyping: true }, { merge: true }).catch(() => {});
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => { setDoc(typingRef, { isTyping: false }, { merge: true }).catch(() => {}); }, 2000);
  };

  const sendMessage = async (text = null, imageUrl = null, audioUrl = null, fileUrl = null, fileName = null) => {
    if (!text && !imageUrl && !audioUrl && !fileUrl) return;

    const myId = auth.currentUser.uid;
    const partnerId = selectedUser.id;
    const chatId = getChatId(myId, partnerId);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setDoc(doc(db, "chats", chatId, "typingStatus", myId), { isTyping: false }, { merge: true }).catch(() => {});

    const messageData = { text: text, imageUrl: imageUrl, audioUrl: audioUrl, fileUrl: fileUrl, fileName: fileName, senderId: myId, createdAt: serverTimestamp(), isRead: false };

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
    else { lastPressMap.current[item.id] = now; setReactingToMsgId(null); }
  };

  const startReply = (item) => { setReplyingTo(item); setEditingMessageId(null); };
  const cancelReply = () => setReplyingTo(null);
  const startEditing = (item) => { setEditingMessageId(item.id); setReplyingTo(null); };
  const cancelEditing = () => { setEditingMessageId(null); };

  const saveEditedMessage = async (textToSave) => {
    if (!textToSave || !editingMessageId) return;
    const chatId = getChatId(auth.currentUser.uid, selectedUser.id);
    try {
      await updateDoc(doc(db, "chats", chatId, "messages", editingMessageId), { text: textToSave, isEdited: true });
      setEditingMessageId(null);
    } catch (error) { console.error("Помилка редагування:", error); }
  };

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
                    <View style={[styles.messageReplyLine, { backgroundColor: isMe ? COLORS.text : COLORS.primary }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.messageReplyName, { color: isMe ? COLORS.text : COLORS.primary }]}>{item.replyTo.senderName}</Text>
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
                        <Ionicons name="document-text" size={24} color={isMe ? COLORS.text : COLORS.primary} />
                        <Text style={[styles.fileName, {color: isMe ? COLORS.text : COLORS.textSecondary}]} numberOfLines={1}>{item.fileName}</Text>
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
                      {isMe && <Ionicons name={item.isRead ? "checkmark-done-outline" : "checkmark-outline"} size={16} color={item.isRead ? COLORS.success : "rgba(255,255,255,0.6)"} style={{ marginLeft: 4, marginRight: 6 }} />}
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

          <ChatInput 
            onSendMessage={sendMessage}
            onTyping={handleTyping}
            replyingTo={replyingTo}
            replyPreviewName={replyingTo?.senderId === auth.currentUser.uid ? (userData?.nickname || 'Ви') : selectedUser.nickname}
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

  messageWrapper: { width: '100%', marginBottom: 6, position: 'relative' },
  messageWrapperMine: { alignItems: 'flex-end', paddingRight: 10 },
  messageWrapperTheirs: { alignItems: 'flex-start', paddingLeft: 10 },
  messageWrapperMineTail: { marginBottom: 15 },
  messageWrapperTheirsTail: { marginBottom: 15 },
  messageBubble: { maxWidth: '75%', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20, position: 'relative' },
  myMessage: { backgroundColor: '#8B5E34' },
  theirMessage: { backgroundColor: COLORS.surfaceLight },
  myMessageTail: { borderBottomRightRadius: 4 },
  theirMessageTail: { borderBottomLeftRadius: 4 },
  messageTail: { position: 'absolute', bottom: 0, width: 0, height: 0, borderTopWidth: 15, borderTopColor: 'transparent' },
  messageTailMine: { right: -8, borderLeftWidth: 15, borderLeftColor: '#8B5E34' },
  messageTailTheirs: { left: -8, borderRightWidth: 15, borderRightColor: COLORS.surfaceLight },
  messageText: { color: COLORS.text, fontSize: 15, lineHeight: 22 },
  messageFooterInfo: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 4 },
  messageTime: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 10 },
  editedText: { color: 'rgba(255, 255, 255, 0.5)', fontSize: 10, fontStyle: 'italic' },
  actionIconBtn: { marginLeft: 8, padding: 2, outlineStyle: 'none' },

  messageReplyContainer: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 6, marginBottom: 8, overflow: 'hidden' },
  messageReplyLine: { width: 3, borderRadius: 2, marginRight: 8 },
  messageReplyName: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  messageReplyText: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },

  sharedPostCard: { backgroundColor: 'rgba(0,0,0,0.25)', padding: 12, borderRadius: 16, borderLeftWidth: 4, borderLeftColor: COLORS.primary, minWidth: 260, maxWidth: '100%', marginBottom: 8, marginTop: 4 },
  sharedPostHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sharedPostAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 10 },
  sharedPostAvatarPlaceholder: { width: 32, height: 32, borderRadius: 16, marginRight: 10, backgroundColor: 'rgba(213, 196, 176, 0.1)', justifyContent: 'center', alignItems: 'center' },
  sharedPostAvatarText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: 'bold' },
  sharedPostName: { color: COLORS.text, fontWeight: 'bold', fontSize: 14 },
  sharedPostSubText: { color: COLORS.textMuted, fontSize: 11, fontStyle: 'italic' },
  sharedPostText: { color: COLORS.text, fontSize: 14, marginBottom: 10, lineHeight: 20 },
  sharedPostImage: { width: '100%', height: 200, borderRadius: 8 },

  fileContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 8, marginTop: 5, marginBottom: 5 },
  fileName: { fontSize: 14, marginLeft: 8, textDecorationLine: 'underline', flexShrink: 1 },
  
  reactionPickerBubble: { position: 'absolute', bottom: '100%', flexDirection: 'row', backgroundColor: COLORS.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginBottom: 5, borderWidth: 1, borderColor: COLORS.border, elevation: 15, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, zIndex: 1000 },
  reactionBtn: { paddingHorizontal: 6 },
  
  reactionsDisplayRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  reactionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, paddingLeft: 6, paddingRight: 4, paddingVertical: 2, marginRight: 4, marginTop: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  reactionBadgeActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  reactionBadgeText: { fontSize: 12, color: COLORS.text },
  reactionAvatarsRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  reactionMiniAvatar: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: COLORS.surface },
  reactionMiniAvatarPlaceholder: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: COLORS.surface, backgroundColor: COLORS.primary },

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