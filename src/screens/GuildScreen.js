import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Image, Alert, Modal, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker'; 
import { db } from '../api/firebaseConfig';
import { doc, onSnapshot, collection, addDoc, updateDoc, query, orderBy, serverTimestamp, increment, getDocs, where, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

import ImageCropper from '../components/ImageCropper';
import { sendNotification } from '../utils/notifications';
import AudioPlayer from '../components/AudioPlayer'; 
import ChatInput from '../components/ChatInput'; 
import ImageViewerModal from '../components/ImageViewerModal';

import { COLORS } from '../theme/colors';
import { useUser } from '../context/UserContext';

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

export default function GuildScreen({ navigation }) {
  // МАГІЯ: Беремо поточного юзера з глобального стану
  const { currentUser, userData } = useUser();

  const [guildData, setGuildData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isCreating, setIsCreating] = useState(false);
  const [guildName, setGuildName] = useState('');
  const [guildTag, setGuildTag] = useState('');

  const [isJoining, setIsJoining] = useState(false);
  const [allGuilds, setAllGuilds] = useState([]);

  const [messages, setMessages] = useState([]);
  
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [reactingToMsgId, setReactingToMsgId] = useState(null);
  
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [currentImageUri, setCurrentImageUri] = useState('');

  const flatListRef = useRef(null);
  const lastPressMap = useRef({});
  
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [cropTarget, setCropTarget] = useState(null);

  const [showMembersModal, setShowMembersModal] = useState(false);
  const [guildMembers, setGuildMembers] = useState([]);

  const [screenWidth, setScreenWidth] = useState(Dimensions.get('window').width);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenWidth(window.width);
    });
    return () => subscription?.remove();
  }, []);

  const isDesktop = screenWidth > 768;

  useEffect(() => {
    if (!userData?.guildId) {
      setGuildData(null);
      setLoading(false);
      return;
    }

    const unsubscribeGuild = onSnapshot(doc(db, "guilds", userData.guildId), (guildDoc) => {
      if (guildDoc.exists()) setGuildData({ id: guildDoc.id, ...guildDoc.data() });
    });
    
    const qChat = query(collection(db, "guilds", userData.guildId, "messages"), orderBy("createdAt", "desc"));
    const unsubscribeChat = onSnapshot(qChat, (snapshot) => {
      const msgs = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      setMessages(msgs);
      setLoading(false);
    });

    const qMembers = query(collection(db, "users"), where("guildId", "==", userData.guildId));
    const unsubscribeMembers = onSnapshot(qMembers, (snapshot) => {
      setGuildMembers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubscribeGuild(); unsubscribeChat(); unsubscribeMembers(); };
  }, [userData?.guildId]);

  const formatMessageTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  };

  const getUserAvatar = (uid) => {
    if (uid === currentUser?.uid) return userData?.avatarUrl;
    const u = guildMembers.find(user => user.id === uid);
    return u?.avatarUrl;
  };

  const openImageViewer = (uri) => { setCurrentImageUri(uri); setIsImageViewerVisible(true); };

  const handleCreateGuild = async () => {
    if (!guildName || guildTag.length < 3) return Alert.alert("Помилка", "Введіть назву та TAG (мінімум 3 символи)!");
    try {
      setLoading(true);
      const upperTag = guildTag.toUpperCase().substring(0, 6);
      const docRef = await addDoc(collection(db, "guilds"), {
        name: guildName, tag: upperTag, leaderId: currentUser.uid, points: 0, membersCount: 1, createdAt: serverTimestamp(), avatarUrl: null, bannerUrl: null
      });
      await updateDoc(doc(db, "users", currentUser.uid), { guildId: docRef.id, guildTag: upperTag });
      setIsCreating(false);
    } catch (error) { Alert.alert("Помилка", error.message); setLoading(false); }
  };

  const handleOpenJoinList = async () => {
    setIsJoining(true); setLoading(true);
    try {
      const q = query(collection(db, "guilds"), orderBy("points", "desc"));
      const snap = await getDocs(q);
      setAllGuilds(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) { console.error("Помилка завантаження списку гільдій:", error); } finally { setLoading(false); }
  };

  const handleJoinGuild = async (guild) => {
    try {
      setLoading(true);
      await updateDoc(doc(db, "guilds", guild.id), { membersCount: increment(1) });
      await updateDoc(doc(db, "users", currentUser.uid), { guildId: guild.id, guildTag: guild.tag });
      setIsJoining(false);

      if (guild.leaderId !== currentUser.uid) {
        await sendNotification(guild.leaderId, 'guild_join', { id: currentUser.uid, name: userData.nickname, avatarUrl: userData.avatarUrl }, `приєднався до вашої гільдії [${guild.tag}]!`, guild.id);
      }
      await sendNotification(currentUser.uid, 'system', null, `Ви успішно приєдналися до гільдії [${guild.tag}]! Приватний чат відкрито.`, guild.id);
    } catch (error) { Alert.alert("Помилка вступу", error.message); setLoading(false); }
  };

  const handleLeaveGuild = async () => {
    const confirmAction = async () => {
      try {
        setLoading(true);
        await updateDoc(doc(db, "guilds", guildData.id), { membersCount: increment(-1) });
        await updateDoc(doc(db, "users", currentUser.uid), { guildId: null, guildTag: null });

        if (guildData.leaderId !== currentUser.uid) {
          await sendNotification(guildData.leaderId, 'system', { id: currentUser.uid, name: userData.nickname, avatarUrl: userData.avatarUrl }, `покинув вашу гільдію.`, guildData.id);
        }
      } catch (error) { Alert.alert("Помилка виходу", error.message); setLoading(false); }
    };

    if (Platform.OS === 'web') { if (window.confirm("Ви дійсно хочете покинути цю гільдію?")) confirmAction(); } 
    else { Alert.alert("Вихід з гільдії", "Ви дійсно хочете покинути цю гільдію?", [{ text: "Скасувати", style: "cancel" }, { text: "Вийти", style: "destructive", onPress: confirmAction }]); }
  };

  const sendMessage = async (text = null, imageUrl = null, audioUrl = null, fileUrl = null, fileName = null) => {
    if (!text && !imageUrl && !audioUrl && !fileUrl) return;
    if (!userData?.guildId) return;

    const messageData = {
      text: text, imageUrl, audioUrl, fileUrl, fileName,
      senderId: currentUser.uid,
      senderName: userData.nickname,
      createdAt: serverTimestamp()
    };

    if (replyingTo) {
      messageData.replyTo = {
        id: replyingTo.id,
        text: replyingTo.text || (replyingTo.imageUrl ? '📷 Фото' : replyingTo.fileUrl ? '📄 Файл' : '🎤 Голос'),
        senderName: replyingTo.senderName
      };
    }

    setReplyingTo(null);

    try {
      await addDoc(collection(db, "guilds", userData.guildId, "messages"), messageData);
    } catch (error) { console.error("Помилка відправки:", error); }
  };

  const handleReact = async (messageId, emoji, currentReactions = []) => {
    if (!userData?.guildId) return;
    const myId = currentUser.uid;
    const existingReaction = currentReactions.find(r => r.userId === myId && r.emoji === emoji);
    
    try {
      const msgRef = doc(db, "guilds", userData.guildId, "messages", messageId);
      if (existingReaction) await updateDoc(msgRef, { reactions: arrayRemove({ emoji, userId: myId }) });
      else await updateDoc(msgRef, { reactions: arrayUnion({ emoji, userId: myId }) });
      setReactingToMsgId(null); 
    } catch (error) { console.error("Помилка додавання/видалення реакції:", error); }
  };

  const handleDeleteMessage = async (messageId) => {
    const confirmAction = async () => {
      try { await deleteDoc(doc(db, "guilds", userData.guildId, "messages", messageId)); } 
      catch (error) { console.error("Помилка видалення повідомлення:", error); Alert.alert("Помилка", "Не вдалося видалити повідомлення."); }
    };
    if (Platform.OS === 'web') { if (window.confirm("Видалити це повідомлення?")) confirmAction(); } 
    else { Alert.alert("Видалення", "Видалити це повідомлення?", [{ text: "Скасувати", style: "cancel" }, { text: "Видалити", style: "destructive", onPress: confirmAction }]); }
  };

  const handleMessagePress = (item) => {
    const now = Date.now();
    const lastPress = lastPressMap.current[item.id] || 0;
    
    if (now - lastPress < 300) {
      startReply(item);
      lastPressMap.current[item.id] = 0; 
    } else {
      lastPressMap.current[item.id] = now;
      setReactingToMsgId(null);
    }
  };

  const startReply = (item) => { setReplyingTo(item); setEditingMessageId(null); };
  const cancelReply = () => setReplyingTo(null);
  const startEditing = (item) => { setEditingMessageId(item.id); setReplyingTo(null); };
  const cancelEditing = () => { setEditingMessageId(null); };

  const saveEditedMessage = async (textToSave) => {
    if (!textToSave || !editingMessageId || !userData?.guildId) return;
    try {
      await updateDoc(doc(db, "guilds", userData.guildId, "messages", editingMessageId), { text: textToSave, isEdited: true });
      setEditingMessageId(null);
    } catch (error) { console.error("Помилка збереження редагованого повідомлення:", error); }
  };

  const handleUpdateImage = async (type) => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 1 });
    if (!result.canceled) setCropTarget({ uri: result.assets[0].uri, width: result.assets[0].width, height: result.assets[0].height, type: type, aspectRatio: type === 'avatarUrl' ? 1 : 5/1 });
  };

  const processCroppedImage = async (croppedResult) => {
    try {
      const type = cropTarget.type;
      setCropTarget(null);
      if (type === 'avatarUrl') setUploadingAvatar(true); else setUploadingBanner(true);

      const formData = new FormData();
      formData.append('file', `data:image/jpeg;base64,${croppedResult.base64}`);
      formData.append('upload_preset', process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
      const cloudData = await response.json();
      if (cloudData.secure_url) await updateDoc(doc(db, "guilds", guildData.id), { [type]: cloudData.secure_url });
      else throw new Error("Помилка Cloudinary");
    } catch (error) { Alert.alert("Помилка завантаження", error.message); } finally { setUploadingAvatar(false); setUploadingBanner(false); }
  };

  const renderCell = useCallback(({ children, index, style, ...props }) => {
    const cellZIndex = 10000 - index;
    return (
      <View style={[style, { zIndex: cellZIndex, elevation: cellZIndex }]} {...props}>
        {children}
      </View>
    );
  }, []);

  if (loading) return <View style={[styles.container, { justifyContent: 'center' }]}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  if (userData?.guildId && guildData) {
    const isLeader = guildData.leaderId === currentUser?.uid;

    const renderMembersList = () => (
      <View style={[styles.contactsContainer, isDesktop && { flex: 1, minWidth: 320, maxWidth: 420 }]}>
        <View style={styles.contactsHeader}>
          <Text style={styles.headerTitle}>Учасники</Text>
        </View>
        <FlatList
          data={guildMembers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 10, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isMemberLeader = item.id === guildData.leaderId;
            return (
              <TouchableOpacity 
                style={[styles.contactCard, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} 
                onPress={() => { setShowMembersModal(false); navigation.navigate('Profile', { identifier: item.id }); }}
              >
                <View style={{ position: 'relative' }}>
                  {item.avatarUrl ? (
                    <Image source={{ uri: item.avatarUrl }} style={styles.contactAvatar} resizeMode="cover" />
                  ) : (
                    <View style={styles.contactAvatarPlaceholder}>
                      <Text style={styles.contactAvatarText}>{item.nickname ? item.nickname[0].toUpperCase() : '?'}</Text>
                    </View>
                  )}
                  <View style={[styles.onlineBadge, !item.isOnline && { backgroundColor: COLORS.textMuted, borderColor: COLORS.background }]} />
                </View>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName} numberOfLines={1}>{item.nickname}</Text>
                  <Text style={styles.contactTag}>{isMemberLeader ? '👑 Майстер гільдії' : 'Вільний агент'}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    );

    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
        <View style={[styles.mainLayout, !isDesktop && { flexDirection: 'column' }]}>

          {isDesktop && renderMembersList()}

          <View style={styles.contentArea} onTouchStart={() => { setReactingToMsgId(null); }}>

            <View style={styles.guildBannerCard}>
              {guildData.bannerUrl ? (
                <Image source={{ uri: guildData.bannerUrl }} style={styles.bannerBgImage} resizeMode="cover" />
              ) : (
                <View style={styles.bannerPlaceholderBg} />
              )}
              <View style={styles.bannerOverlay} />

              {isLeader && (
                <TouchableOpacity style={styles.editBannerTopBtn} onPress={() => handleUpdateImage('bannerUrl')} disabled={uploadingBanner}>
                  {uploadingBanner ? <ActivityIndicator color={COLORS.text} size="small" /> : <Ionicons name="camera" size={18} color={COLORS.text} />}
                </TouchableOpacity>
              )}

              {isLeader && (
                <View style={styles.masterBadge}>
                  <Text style={styles.masterBadgeText}>👑 Майстер гільдії</Text>
                </View>
              )}

              <View style={styles.bannerContent}>
                <View style={styles.avatarBlock}>
                  {guildData.avatarUrl ? (
                    <Image source={{ uri: guildData.avatarUrl }} style={styles.avatarImageMain} resizeMode="cover" />
                  ) : (
                    <View style={styles.avatarMainPlaceholder}>
                      <Text style={styles.avatarLetterMain}>{guildData.tag[0].toUpperCase()}</Text>
                    </View>
                  )}
                  {isLeader && (
                    <TouchableOpacity style={styles.editAvatarPencilBtn} onPress={() => handleUpdateImage('avatarUrl')} disabled={uploadingAvatar}>
                      {uploadingAvatar ? <ActivityIndicator color={COLORS.text} size="small" /> : <Ionicons name="pencil" size={12} color={COLORS.text} />}
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.guildInfoBlock}>
                  <Text style={styles.guildNameMain} numberOfLines={1}>{guildData.name}</Text>
                  <Text style={styles.guildTagMain}>[{guildData.tag}]</Text>
                  
                  <View style={styles.statsRowMain}>
                    <View style={styles.statItemMain}>
                      <Ionicons name="trophy" size={14} color={COLORS.primary} />
                      <Text style={styles.statTextMain}> Бали: <Text style={styles.statValueMain}>{guildData.points}</Text></Text>
                    </View>
                    
                    <TouchableOpacity 
                      style={[styles.statItemMain, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined, {marginLeft: 15}]} 
                      onPress={() => !isDesktop && setShowMembersModal(true)}
                      disabled={isDesktop}
                    >
                      <Ionicons name="people" size={14} color={COLORS.primary} />
                      <Text style={styles.statTextMain}> Учасники: <Text style={styles.statValueMain}>{guildData.membersCount}</Text></Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity onPress={handleLeaveGuild} style={[styles.leaveBtnNew, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
                    <Ionicons name="exit-outline" size={14} color={COLORS.danger} />
                    <Text style={styles.leaveBtnTextNew}>Покинути гільдію</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.chatSection}>
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
                    <View style={[
                      styles.messageWrapper, 
                      isMe ? styles.messageWrapperMine : styles.messageWrapperTheirs, 
                      showTail && (isMe ? styles.messageWrapperMineTail : styles.messageWrapperTheirsTail)
                    ]}>
                      
                      {reactingToMsgId === item.id && (
                        <View style={[styles.reactionPickerBubble, isMe ? { right: 15 } : { left: 15 }]}>
                          {['👍','❤️','😂','🔥','😢'].map(emoji => (
                            <TouchableOpacity key={emoji} onPress={() => handleReact(item.id, emoji, item.reactions)} style={styles.reactionBtn}>
                              <Text style={{fontSize: 22}}>{emoji}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      <TouchableOpacity 
                        activeOpacity={1} 
                        onPress={() => handleMessagePress(item)}
                        style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage, showTail && (isMe ? styles.myMessageTail : styles.theirMessageTail)]}
                      >
                        {showTail && <View style={[styles.messageTail, isMe ? styles.messageTailMine : styles.messageTailTheirs]} />}
                        
                        {!isMe && <Text style={styles.chatSenderName}>{item.senderName}</Text>}
                        
                        {renderReplyBlock()}

                        {item.sharedPost && (
                          <TouchableOpacity 
                            activeOpacity={0.85} 
                            style={[styles.sharedPostCard, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}
                            onPress={() => navigation.navigate('Profile', { identifier: item.sharedPost.authorId, highlightPostId: item.sharedPost.id })}
                          >
                            <View style={styles.sharedPostHeader}>
                              {item.sharedPost.authorAvatarUrl ? (
                                <Image source={{ uri: item.sharedPost.authorAvatarUrl }} style={styles.sharedPostAvatar} resizeMode="cover" />
                              ) : (
                                <View style={styles.sharedPostAvatarPlaceholder}>
                                  <Text style={styles.sharedPostAvatarText}>{item.sharedPost.authorName[0].toUpperCase()}</Text>
                                </View>
                              )}
                              <View style={{ flex: 1 }}>
                                <Text style={styles.sharedPostName}>{item.sharedPost.authorName}</Text>
                                <Text style={styles.sharedPostSubText}>Пересланий запис</Text>
                              </View>
                            </View>
                            
                            {item.sharedPost.text ? (
                              <Text style={styles.sharedPostText} numberOfLines={4}>{item.sharedPost.text}</Text>
                            ) : null}
                            
                            {item.sharedPost.imageUrl ? (
                              <Image source={{ uri: item.sharedPost.imageUrl }} style={styles.sharedPostImage} resizeMode="cover" />
                            ) : null}
                          </TouchableOpacity>
                        )}

                        {item.imageUrl && <ChatImageWrapper uri={item.imageUrl} onPress={() => openImageViewer(item.imageUrl)} />}
                        {item.fileUrl && (
                          <TouchableOpacity style={styles.fileContainer} onPress={() => Platform.OS === 'web' ? window.open(item.fileUrl, '_blank') : null}>
                            <Ionicons name="document-text" size={24} color={isMe ? COLORS.text : COLORS.primary} />
                            <Text style={[styles.fileName, {color: isMe ? COLORS.text : COLORS.textSecondary}]} numberOfLines={1}>{item.fileName}</Text>
                          </TouchableOpacity>
                        )}

                        {item.text ? <Text style={[styles.messageText, isMe && {color: COLORS.text}]}>{item.text}</Text> : null}
                        {item.audioUrl && <AudioPlayer audioUrl={item.audioUrl} />}
                        
                        {Object.keys(groupedReactions).length > 0 && (
                          <View style={styles.reactionsDisplayRow}>
                            {Object.entries(groupedReactions).map(([emoji, userIds]) => (
                              <TouchableOpacity 
                                key={emoji} 
                                style={[styles.reactionBadge, userIds.includes(currentUser?.uid) && styles.reactionBadgeActive]}
                                onPress={() => handleReact(item.id, emoji, item.reactions)}
                              >
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
                          
                          <TouchableOpacity onPress={() => setReactingToMsgId(reactingToMsgId === item.id ? null : item.id)} style={styles.actionIconBtn}>
                            <Ionicons name="add-circle-outline" size={14} color="rgba(255,255,255,0.6)" />
                          </TouchableOpacity>
                          
                          <TouchableOpacity onPress={() => startReply(item)} style={styles.actionIconBtn}>
                            <Ionicons name="arrow-undo-outline" size={14} color="rgba(255,255,255,0.6)" />
                          </TouchableOpacity>

                          {isMe && !item.audioUrl && (
                            <TouchableOpacity onPress={() => startEditing(item)} style={styles.actionIconBtn}>
                              <Ionicons name="pencil" size={14} color="rgba(255,255,255,0.6)" />
                            </TouchableOpacity>
                          )}
                          {(isMe || isLeader) && (
                            <TouchableOpacity onPress={() => handleDeleteMessage(item.id)} style={styles.actionIconBtn}>
                              <Ionicons name="trash-outline" size={14} color="rgba(239, 68, 68, 0.7)" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
              
              <ChatInput 
                onSendMessage={sendMessage}
                onTyping={() => {}} 
                replyingTo={replyingTo}
                replyPreviewName={replyingTo?.senderId === currentUser?.uid ? (userData?.nickname || 'Ви') : replyingTo?.senderName}
                replyPreviewText={replyingTo?.text || (replyingTo?.imageUrl ? '📷 Фото' : replyingTo?.fileUrl ? '📄 Файл' : '🎤 Голосове повідомлення')}
                onCancelReply={cancelReply}
                editingMessage={messages.find(m => m.id === editingMessageId)}
                onSaveEdit={saveEditedMessage}
                onCancelEdit={cancelEditing}
              />
              
            </View>

          </View>
        </View>

        {!isDesktop && (
          <Modal visible={showMembersModal} animationType="slide" transparent={true} onRequestClose={() => setShowMembersModal(false)}>
            <View style={styles.modalOverlay}>
              <View style={styles.membersModalContent}>
                <View style={styles.contactsHeader}>
                  <Text style={styles.headerTitle}>Учасники</Text>
                  <TouchableOpacity style={Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined} onPress={() => setShowMembersModal(false)}>
                    <Ionicons name="close" size={28} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
                {renderMembersList()}
              </View>
            </View>
          </Modal>
        )}

        <Modal visible={!!cropTarget} animationType="slide" transparent={false}>
          {cropTarget && (
            <ImageCropper 
              imageUri={cropTarget.uri} 
              imageWidth={cropTarget.width}
              imageHeight={cropTarget.height}
              aspectRatio={cropTarget.aspectRatio} 
              onCancel={() => setCropTarget(null)}
              onCrop={processCroppedImage}
            />
          )}
        </Modal>

        <ImageViewerModal 
          visible={isImageViewerVisible} 
          imageUri={currentImageUri} 
          onClose={() => setIsImageViewerVisible(false)} 
        />

      </KeyboardAvoidingView>
    );
  }

  if (isCreating) {
    return (
      <View style={styles.container}>
        <View style={styles.centeredWrapper}>
          <Text style={styles.title}>Створення Гільдії</Text>
          <TextInput style={[styles.input, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="Назва гільдії" placeholderTextColor={COLORS.textMuted} value={guildName} onChangeText={setGuildName} />
          <TextInput style={[styles.input, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="TAG (до 6 символів)" placeholderTextColor={COLORS.textMuted} value={guildTag} onChangeText={setGuildTag} maxLength={6} autoCapitalize="characters" />
          <TouchableOpacity onPress={handleCreateGuild} style={[styles.buttonMain, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}><Text style={styles.buttonTextMain}>Заснувати гільдію</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setIsCreating(false)} style={[styles.buttonSecondary, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}><Text style={styles.buttonTextSecondary}>Скасувати</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isJoining) {
    return (
      <View style={styles.container}>
        <View style={styles.centeredWrapper}>
          <Text style={styles.title}>Оберіть гільдію</Text>
          <FlatList
            data={allGuilds}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<Text style={styles.emptyText}>Гільдій ще немає. Створіть першу!</Text>}
            renderItem={({ item }) => (
              <View style={styles.joinGuildCard}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.joinAvatarImage} resizeMode="cover" />
                ) : (
                  <View style={styles.joinAvatarPlaceholder}><Text style={styles.joinAvatarText}>{item.tag[0].toUpperCase()}</Text></View>
                )}
                <View style={styles.joinGuildInfo}>
                  <Text style={styles.joinGuildName}>{item.name}</Text>
                  <Text style={styles.joinGuildTag}>[{item.tag}] • 👥 {item.membersCount} • 🏆 {item.points}</Text>
                </View>
                <TouchableOpacity onPress={() => handleJoinGuild(item)} style={[styles.joinButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
                  <Text style={styles.joinButtonText}>Вступити</Text>
                </TouchableOpacity>
              </View>
            )}
          />
          <TouchableOpacity onPress={() => setIsJoining(false)} style={[styles.buttonSecondary, {marginTop: 15}, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
            <Text style={styles.buttonTextSecondary}>Скасувати</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.centeredWrapper, {justifyContent: 'center', flex: 1, paddingBottom: 100}]}>
        <Text style={styles.title}>Ти ще не в гільдії</Text>
        <Text style={styles.subtitle}>Знайди своїх однодумців або створи власний клан!</Text>
        <View style={{width: '100%'}}>
          <TouchableOpacity onPress={handleOpenJoinList} style={[styles.buttonMain, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
            <Text style={styles.buttonTextMain}>Приєднатись до гільдії</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsCreating(true)} style={[styles.buttonSecondary, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
            <Text style={styles.buttonTextSecondary}>Створити свою гільдію</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: Platform.OS === 'ios' ? 50 : 20 },
  centeredWrapper: { width: '100%', maxWidth: 800, alignSelf: 'center', flex: 1, paddingHorizontal: 20 },

  mainLayout: { flex: 1, flexDirection: 'row', width: '100%', maxWidth: 1850, alignSelf: 'center', paddingBottom: Platform.OS === 'ios' ? 30 : 20 },

  contactsContainer: { flex: 1, backgroundColor: COLORS.background, borderRightWidth: 1, borderRightColor: COLORS.border, paddingRight: 10 },
  contactsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 10 : 0, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { color: COLORS.textSecondary, fontSize: 24, fontWeight: 'bold' },
  contactCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, marginBottom: 8, backgroundColor: 'transparent' },
  contactCardActive: { backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.border },
  contactAvatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: COLORS.primary },
  contactAvatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(217, 119, 6, 0.3)' },
  contactAvatarText: { color: COLORS.textSecondary, fontSize: 20, fontWeight: 'bold' },
  onlineBadge: { position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.success, borderWidth: 2, borderColor: COLORS.background },
  contactInfo: { marginLeft: 12, flex: 1, justifyContent: 'center' },
  contactName: { color: COLORS.text, fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  contactTag: { color: 'rgba(213, 196, 176, 0.4)', fontSize: 13 },

  contentArea: { flex: 2.2, paddingLeft: 15, paddingRight: 10, paddingBottom: 0 },
  
  guildBannerCard: { 
    width: '100%', 
    minHeight: 180, 
    borderRadius: 24, 
    overflow: 'hidden', 
    position: 'relative', 
    marginBottom: 15, 
    backgroundColor: COLORS.surface,
    borderWidth: 1, 
    borderColor: COLORS.surfaceLight, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 10, 
    elevation: 8 
  },
  bannerBgImage: { width: '100%', height: '100%', position: 'absolute' },
  bannerPlaceholderBg: { width: '100%', height: '100%', position: 'absolute', backgroundColor: COLORS.surface },
  bannerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  
  editBannerTopBtn: { position: 'absolute', top: 15, right: 15, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 8, zIndex: 10 },
  
  bannerContent: { flexDirection: 'row', alignItems: 'center', padding: 25, zIndex: 1 },
  avatarBlock: { position: 'relative', marginRight: 25 },
  avatarImageMain: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: COLORS.text, backgroundColor: COLORS.text },
  avatarMainPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: COLORS.text, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: COLORS.text },
  avatarLetterMain: { color: '#000', fontSize: 40, fontWeight: 'bold' },
  editAvatarPencilBtn: { position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.primary, width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.text },
  
  guildInfoBlock: { flex: 1 },
  guildNameMain: { color: COLORS.text, fontSize: 28, fontWeight: 'bold', textShadowColor: 'rgba(0, 0, 0, 0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  guildTagMain: { color: COLORS.primary, fontSize: 16, fontWeight: 'bold', marginBottom: 10, textShadowColor: 'rgba(0, 0, 0, 0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  statsRowMain: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  statItemMain: { flexDirection: 'row', alignItems: 'center' },
  statTextMain: { color: COLORS.textSecondary, fontSize: 13, marginLeft: 6, textShadowColor: 'rgba(0, 0, 0, 0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  statValueMain: { color: COLORS.primary, fontWeight: 'bold' },
  
  leaveBtnNew: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  leaveBtnTextNew: { color: COLORS.danger, fontSize: 13, fontWeight: 'bold', marginLeft: 6 },
  
  masterBadge: { position: 'absolute', bottom: 15, right: 15, backgroundColor: 'rgba(0, 0, 0, 0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, zIndex: 2 },
  masterBadgeText: { color: COLORS.primary, fontSize: 12, fontWeight: 'bold', fontStyle: 'italic' },

  chatSection: { 
    flex: 1, 
    backgroundColor: COLORS.surface, 
    borderRadius: 24, 
    padding: 15, 
    marginTop: 5,
    borderWidth: 1, 
    borderColor: COLORS.surfaceLight, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 10, 
    elevation: 8 
  },

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
  
  chatSenderName: { color: 'rgba(213, 196, 176, 0.4)', fontSize: 12, marginBottom: 4, fontWeight: 'bold' },
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

  title: { color: COLORS.textSecondary, fontSize: 28, fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center', marginBottom: 10 },
  subtitle: { color: COLORS.textMuted, fontSize: 16, textAlign: 'center', marginBottom: 40 },
  input: { backgroundColor: COLORS.surfaceLight, color: COLORS.text, padding: 18, borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: COLORS.border, fontSize: 16 },
  buttonMain: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center', marginBottom: 15 },
  buttonTextMain: { color: COLORS.background, fontWeight: 'bold', fontSize: 16 },
  buttonSecondary: { borderWidth: 1, borderColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center', marginBottom: 15 },
  buttonTextSecondary: { color: COLORS.primary, fontWeight: 'bold', fontSize: 16 },
  
  emptyText: { color: COLORS.textMuted, textAlign: 'center', marginTop: 30, fontSize: 16, fontStyle: 'italic' },
  joinGuildCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: COLORS.surface, 
    padding: 20, 
    borderRadius: 20, 
    marginBottom: 15,
    borderWidth: 1, 
    borderColor: COLORS.surfaceLight, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 10, 
    elevation: 8 
  },
  joinAvatarImage: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: COLORS.primary },
  joinAvatarPlaceholder: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.surfaceLight, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.primary },
  joinAvatarText: { color: COLORS.textSecondary, fontSize: 24, fontWeight: 'bold' },
  joinGuildInfo: { marginLeft: 15, flex: 1 },
  joinGuildName: { color: COLORS.text, fontSize: 18, fontWeight: 'bold' },
  joinGuildTag: { color: COLORS.primary, fontSize: 14, marginTop: 6, fontWeight: 'bold' },
  joinButton: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  joinButtonText: { color: COLORS.background, fontWeight: 'bold', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  membersModalContent: { backgroundColor: COLORS.background, flex: 1, marginTop: 100, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20 },
});