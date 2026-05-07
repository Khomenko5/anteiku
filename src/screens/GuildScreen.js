import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Image, Alert, Modal, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker'; 
import { db } from '../api/firebaseConfig';
import { doc, onSnapshot, collection, addDoc, updateDoc, query, orderBy, serverTimestamp, increment, getDocs, where } from 'firebase/firestore';

import ImageCropper from '../components/ImageCropper';
import { sendNotification } from '../utils/notifications';
import ChatInput from '../components/ChatInput'; 
import ImageViewerModal from '../components/ImageViewerModal';
import MessageItem from '../components/MessageItem'; 

import { COLORS } from '../theme/colors';
import { useUser } from '../context/UserContext';
import { useChat } from '../hooks/useChat'; 
import { useToast } from '../context/ToastContext';

export default function GuildScreen({ navigation }) {
  const { currentUser, userData } = useUser();
  const { showToast } = useToast();

  const [guildData, setGuildData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isCreating, setIsCreating] = useState(false);
  const [guildName, setGuildName] = useState('');
  const [guildTag, setGuildTag] = useState('');

  const [isJoining, setIsJoining] = useState(false);
  const [allGuilds, setAllGuilds] = useState([]);

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

    const qMembers = query(collection(db, "users"), where("guildId", "==", userData.guildId));
    const unsubscribeMembers = onSnapshot(qMembers, (snapshot) => {
      setGuildMembers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    setLoading(false);

    return () => { unsubscribeGuild(); unsubscribeMembers(); };
  }, [userData?.guildId]);

  const basePath = userData?.guildId ? `guilds/${userData.guildId}` : null;
  const {
    messages,
    replyingTo, setReplyingTo,
    editingMessageId, setEditingMessageId,
    reactingToMsgId, setReactingToMsgId,
    sendMessage,
    handleReact,
    handleDeleteMessage,
    saveEditedMessage
  } = useChat({
    basePath,
    currentUserId: currentUser?.uid,
    currentUserData: userData
  });

  const getUserAvatar = (uid) => {
    if (uid === currentUser?.uid) return userData?.avatarUrl;
    const u = guildMembers.find(user => user.id === uid);
    return u?.avatarUrl;
  };

  const openImageViewer = (uri) => { setCurrentImageUri(uri); setIsImageViewerVisible(true); };

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

  const handleCreateGuild = async () => {
    if (!guildName || guildTag.length < 3) return showToast('error', 'Помилка', 'Введіть назву та TAG (мінімум 3 символи)!');
    try {
      setLoading(true);
      const upperTag = guildTag.toUpperCase().substring(0, 6);
      const docRef = await addDoc(collection(db, "guilds"), {
        name: guildName, tag: upperTag, leaderId: currentUser.uid, points: 0, membersCount: 1, createdAt: serverTimestamp(), avatarUrl: null, bannerUrl: null
      });
      await updateDoc(doc(db, "users", currentUser.uid), { guildId: docRef.id, guildTag: upperTag });
      setIsCreating(false);
      showToast('success', 'Успіх', 'Гільдію успішно створено!');
    } catch (error) { showToast('error', 'Помилка', error.message); setLoading(false); }
  };

  const handleOpenJoinList = async () => {
    setIsJoining(true); setLoading(true);
    try {
      const q = query(collection(db, "guilds"), orderBy("points", "desc"));
      const snap = await getDocs(q);
      setAllGuilds(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) { showToast('error', 'Помилка', 'Не вдалося завантажити список гільдій.'); } finally { setLoading(false); }
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
      showToast('success', 'Успіх', `Ви успішно приєдналися до [${guild.tag}]!`);
    } catch (error) { showToast('error', 'Помилка вступу', error.message); setLoading(false); }
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
        showToast('success', 'Успіх', 'Ви покинули гільдію.');
      } catch (error) { showToast('error', 'Помилка виходу', error.message); setLoading(false); }
    };

    if (Platform.OS === 'web') { if (window.confirm("Ви дійсно хочете покинути цю гільдію?")) confirmAction(); } 
    else { Alert.alert("Вихід з гільдії", "Ви дійсно хочете покинути цю гільдію?", [{ text: "Скасувати", style: "cancel" }, { text: "Вийти", style: "destructive", onPress: confirmAction }]); }
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
      if (cloudData.secure_url) {
        await updateDoc(doc(db, "guilds", guildData.id), { [type]: cloudData.secure_url });
        showToast('success', 'Збережено', 'Зображення оновлено.');
      }
      else throw new Error("Помилка Cloudinary");
    } catch (error) { showToast('error', 'Помилка завантаження', error.message); } finally { setUploadingAvatar(false); setUploadingBanner(false); }
  };

  const renderCell = useCallback(({ children, index, style, ...props }) => {
    const cellZIndex = 10000 - index;
    return <View style={[style, { zIndex: cellZIndex, elevation: cellZIndex }]} {...props}>{children}</View>;
  }, []);

  if (loading && !guildData) return <View style={[styles.container, { justifyContent: 'center' }]}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

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

                  return (
                    <MessageItem 
                      item={item}
                      isMe={isMe}
                      isLeader={isLeader}
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
  guildBannerCard: { width: '100%', minHeight: 180, borderRadius: 24, overflow: 'hidden', position: 'relative', marginBottom: 15, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.surfaceLight, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
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
  chatSection: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 24, padding: 15, marginTop: 5, borderWidth: 1, borderColor: COLORS.surfaceLight, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
  title: { color: COLORS.textSecondary, fontSize: 28, fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center', marginBottom: 10 },
  subtitle: { color: COLORS.textMuted, fontSize: 16, textAlign: 'center', marginBottom: 40 },
  input: { backgroundColor: COLORS.surfaceLight, color: COLORS.text, padding: 18, borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: COLORS.border, fontSize: 16 },
  buttonMain: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center', marginBottom: 15 },
  buttonTextMain: { color: COLORS.background, fontWeight: 'bold', fontSize: 16 },
  buttonSecondary: { borderWidth: 1, borderColor: COLORS.primary, padding: 18, borderRadius: 15, alignItems: 'center', marginBottom: 15 },
  buttonTextSecondary: { color: COLORS.primary, fontWeight: 'bold', fontSize: 16 },
  emptyText: { color: COLORS.textMuted, textAlign: 'center', marginTop: 30, fontSize: 16, fontStyle: 'italic' },
  joinGuildCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, padding: 20, borderRadius: 20, marginBottom: 15, borderWidth: 1, borderColor: COLORS.surfaceLight, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
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