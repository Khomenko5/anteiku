import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Image, Alert, Modal, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker'; 
import * as DocumentPicker from 'expo-document-picker'; 
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { auth, db } from '../api/firebaseConfig';
import { doc, onSnapshot, collection, addDoc, updateDoc, query, orderBy, serverTimestamp, increment, getDocs, where, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

import ImageCropper from '../components/ImageCropper';
import { sendNotification } from '../utils/notifications';

const AudioMessagePlayer = ({ audioUrl }) => {
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [barWidth, setBarWidth] = useState(1);

  useEffect(() => {
    let isMounted = true;
    let currentSound = null;

    const loadAudio = async () => {
      try {
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: false, progressUpdateIntervalMillis: 100 }
        );
        currentSound = newSound;
        if (isMounted) {
          setSound(newSound);
          newSound.setOnPlaybackStatusUpdate((playbackStatus) => {
            if (!isMounted) return;
            if (playbackStatus.isLoaded) {
              setPosition(playbackStatus.positionMillis || 0);
              if (playbackStatus.durationMillis && playbackStatus.durationMillis > 0) setDuration(playbackStatus.durationMillis);
              setIsPlaying(playbackStatus.isPlaying);
              if (playbackStatus.didJustFinish) {
                setIsPlaying(false);
                newSound.setPositionAsync(0);
              }
            }
          });
          const status = await newSound.getStatusAsync();
          if (status.isLoaded && status.durationMillis) setDuration(status.durationMillis);
        }
      } catch (error) { console.error("Помилка завантаження аудіо:", error); }
    };
    loadAudio();
    return () => { isMounted = false; if (currentSound) currentSound.unloadAsync(); };
  }, [audioUrl]);

  const togglePlayPause = async () => {
    if (!sound) return;
    if (isPlaying) await sound.pauseAsync();
    else await sound.playAsync();
  };

  const handleSeek = async (e) => {
    if (!sound || duration === 0 || barWidth <= 0) return;
    const clickX = Platform.OS === 'web' && e.nativeEvent.offsetX !== undefined ? e.nativeEvent.offsetX : e.nativeEvent.locationX;
    const percentage = Math.max(0, Math.min(1, clickX / barWidth));
    const seekTime = percentage * duration;
    await sound.setPositionAsync(seekTime);
  };

  const formatTime = (millis) => {
    if (!millis || isNaN(millis)) return "0:00";
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const progressPercentage = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <View style={styles.audioPlayerContainer}>
      <TouchableOpacity onPress={togglePlayPause} style={[styles.playPauseBtn, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
        <Ionicons name={isPlaying ? "pause" : "play"} size={18} color="#FFF" />
      </TouchableOpacity>
      <TouchableOpacity activeOpacity={1} style={styles.audioTrackContainer} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)} onPress={handleSeek}>
        <View style={[styles.audioTrackBg, { pointerEvents: 'none' }]} />
        <View style={[styles.audioProgress, { width: `${progressPercentage}%`, pointerEvents: 'none' }]} />
      </TouchableOpacity>
      <Text style={styles.audioTimeText}>{formatTime(position)} / {formatTime(duration)}</Text>
    </View>
  );
};

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

export default function GuildScreen({ navigation }) {
  const [userData, setUserData] = useState(null);
  const [guildData, setGuildData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isCreating, setIsCreating] = useState(false);
  const [guildName, setGuildName] = useState('');
  const [guildTag, setGuildTag] = useState('');

  const [isJoining, setIsJoining] = useState(false);
  const [allGuilds, setAllGuilds] = useState([]);

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [recording, setRecording] = useState();
  const [isRecording, setIsRecording] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  const [reactingToMsgId, setReactingToMsgId] = useState(null);
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [currentImageUri, setCurrentImageUri] = useState('');
  const [pickerTab, setPickerTab] = useState('emoji'); 
  const [gifs, setGifs] = useState([]);
  const [gifSearchQuery, setGifSearchQuery] = useState('');
  const [loadingGifs, setLoadingGifs] = useState(false);

  const flatListRef = useRef(null);
  const lastPressMap = useRef({});
  let searchTimeout = useRef(null);
  
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [cropTarget, setCropTarget] = useState(null);

  const [showMembersModal, setShowMembersModal] = useState(false);
  const [guildMembers, setGuildMembers] = useState([]);

  const [screenWidth, setScreenWidth] = useState(Dimensions.get('window').width);

  const EMOJI_LIST = ['😀','😂','🥰','😎','🤔','😢','😡','👍','👎','🙏','❤️','🔥','🎉','✨','👀', '🚀', '💯', '💩', '💀', '🤡'];

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenWidth(window.width);
    });
    return () => subscription?.remove();
  }, []);

  const isDesktop = screenWidth > 768;

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
    } catch (error) { console.error("Помилка GIF:", error); } finally { setLoadingGifs(false); }
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

    const unsubscribeUser = onSnapshot(doc(db, "users", userId), (userDoc) => {
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData(data);

        if (data.guildId) {
          const unsubscribeGuild = onSnapshot(doc(db, "guilds", data.guildId), (guildDoc) => {
            if (guildDoc.exists()) setGuildData({ id: guildDoc.id, ...guildDoc.data() });
          });
          
          const qChat = query(collection(db, "guilds", data.guildId, "messages"), orderBy("createdAt", "desc"));
          const unsubscribeChat = onSnapshot(qChat, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMessages(msgs);
            setLoading(false);
          });

          const qMembers = query(collection(db, "users"), where("guildId", "==", data.guildId));
          const unsubscribeMembers = onSnapshot(qMembers, (snapshot) => {
            setGuildMembers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
          });

          return () => { unsubscribeGuild(); unsubscribeChat(); unsubscribeMembers(); };
        } else {
          setGuildData(null);
          setLoading(false);
        }
      }
    });

    return unsubscribeUser;
  }, []);

  const formatMessageTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  };

  const getUserAvatar = (uid) => {
    if (uid === auth.currentUser.uid) return userData?.avatarUrl;
    const u = guildMembers.find(user => user.id === uid);
    return u?.avatarUrl;
  };

  const openImageViewer = (uri) => { setCurrentImageUri(uri); setIsImageViewerVisible(true); };

  const handleCreateGuild = async () => {
    if (!guildName || guildTag.length < 3) return alert("Введіть назву та TAG (мінімум 3 символи)!");
    try {
      setLoading(true);
      const upperTag = guildTag.toUpperCase().substring(0, 6);
      const docRef = await addDoc(collection(db, "guilds"), {
        name: guildName, tag: upperTag, leaderId: auth.currentUser.uid, points: 0, membersCount: 1, createdAt: serverTimestamp(), avatarUrl: null, bannerUrl: null
      });
      await updateDoc(doc(db, "users", auth.currentUser.uid), { guildId: docRef.id, guildTag: upperTag });
      setIsCreating(false);
    } catch (error) { alert("Помилка: " + error.message); setLoading(false); }
  };

  const handleOpenJoinList = async () => {
    setIsJoining(true); setLoading(true);
    try {
      const q = query(collection(db, "guilds"), orderBy("points", "desc"));
      const snap = await getDocs(q);
      setAllGuilds(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  const handleJoinGuild = async (guild) => {
    try {
      setLoading(true);
      await updateDoc(doc(db, "guilds", guild.id), { membersCount: increment(1) });
      await updateDoc(doc(db, "users", auth.currentUser.uid), { guildId: guild.id, guildTag: guild.tag });
      setIsJoining(false);

      if (guild.leaderId !== auth.currentUser.uid) {
        await sendNotification(guild.leaderId, 'guild_join', { id: auth.currentUser.uid, name: userData.nickname, avatarUrl: userData.avatarUrl }, `приєднався до вашої гільдії [${guild.tag}]!`, guild.id);
      }
      await sendNotification(auth.currentUser.uid, 'system', null, `Ви успішно приєдналися до гільдії [${guild.tag}]! Приватний чат відкрито.`, guild.id);
    } catch (error) { alert("Помилка вступу: " + error.message); setLoading(false); }
  };

  const handleLeaveGuild = async () => {
    const confirmAction = async () => {
      try {
        setLoading(true);
        await updateDoc(doc(db, "guilds", guildData.id), { membersCount: increment(-1) });
        await updateDoc(doc(db, "users", auth.currentUser.uid), { guildId: null, guildTag: null });

        if (guildData.leaderId !== auth.currentUser.uid) {
          await sendNotification(guildData.leaderId, 'system', { id: auth.currentUser.uid, name: userData.nickname, avatarUrl: userData.avatarUrl }, `покинув вашу гільдію.`, guildData.id);
        }
      } catch (error) { alert("Помилка виходу: " + error.message); setLoading(false); }
    };

    if (Platform.OS === 'web') { if (window.confirm("Ви дійсно хочете покинути цю гільдію?")) confirmAction(); } 
    else { Alert.alert("Вихід з гільдії", "Ви дійсно хочете покинути цю гільдію?", [{ text: "Скасувати", style: "cancel" }, { text: "Вийти", style: "destructive", onPress: confirmAction }]); }
  };

  const sendMessage = async (text = null, imageUrl = null, audioUrl = null, fileUrl = null, fileName = null) => {
    const textToSend = text || newMessage.trim();
    if (!textToSend && !imageUrl && !audioUrl && !fileUrl) return;
    if (!userData?.guildId) return;

    setNewMessage('');
    setShowEmojiMenu(false);

    const messageData = {
      text: textToSend, imageUrl, audioUrl, fileUrl, fileName,
      senderId: auth.currentUser.uid,
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
    const myId = auth.currentUser.uid;
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
      catch (error) { console.error(error); alert("Не вдалося видалити повідомлення."); }
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
      setShowAttachMenu(false);
      setShowEmojiMenu(false);
    }
  };

  const startReply = (item) => { setReplyingTo(item); setEditingMessageId(null); if(editingMessageId) setNewMessage(''); };
  const cancelReply = () => setReplyingTo(null);
  const startEditing = (item) => { setEditingMessageId(item.id); setReplyingTo(null); setNewMessage(item.text || ''); };
  const cancelEditing = () => { setEditingMessageId(null); setNewMessage(''); };

  const saveEditedMessage = async () => {
    const textToSave = newMessage.trim();
    if (!textToSave || !editingMessageId || !userData?.guildId) return;
    try {
      await updateDoc(doc(db, "guilds", userData.guildId, "messages", editingMessageId), { text: textToSave, isEdited: true });
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
      if (Platform.OS === 'web') {
        const res = await fetch(fileUri);
        const blob = await res.blob();
        formData.append('file', blob, fileName);
      } else {
        formData.append('file', { uri: fileUri, type: result.assets[0].mimeType || 'application/octet-stream', name: fileName });
      }
      formData.append('upload_preset', "anteiku_app");
      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/dv7fktjv5/raw/upload`, { method: 'POST', body: formData });
      const cloudData = await uploadRes.json();
      
      if (cloudData.secure_url) await sendMessage(null, null, null, cloudData.secure_url, fileName);
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
      formData.append('upload_preset', "anteiku_app");
      const response = await fetch(`https://api.cloudinary.com/v1_1/dv7fktjv5/image/upload`, { method: 'POST', body: formData });
      const cloudData = await response.json();
      if (cloudData.secure_url) await updateDoc(doc(db, "guilds", guildData.id), { [type]: cloudData.secure_url });
      else throw new Error("Помилка Cloudinary");
    } catch (error) { alert("Помилка завантаження: " + error.message); } finally { setUploadingAvatar(false); setUploadingBanner(false); }
  };

  const renderCell = useCallback(({ children, index, style, ...props }) => {
    const cellZIndex = 10000 - index;
    return (
      <View style={[style, { zIndex: cellZIndex, elevation: cellZIndex }]} {...props}>
        {children}
      </View>
    );
  }, []);

  if (loading) return <View style={[styles.container, { justifyContent: 'center' }]}><ActivityIndicator size="large" color="#D97706" /></View>;

  if (userData?.guildId && guildData) {
    const isLeader = guildData.leaderId === auth.currentUser?.uid;

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
                  <View style={[styles.onlineBadge, !item.isOnline && { backgroundColor: '#D5C4B080', borderColor: '#302D28' }]} />
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

          <View style={styles.contentArea} onTouchStart={() => { setShowAttachMenu(false); setShowEmojiMenu(false); setReactingToMsgId(null); }}>

            <View style={styles.guildBannerCard}>
              {guildData.bannerUrl ? (
                <Image source={{ uri: guildData.bannerUrl }} style={styles.bannerBgImage} resizeMode="cover" />
              ) : (
                <View style={styles.bannerPlaceholderBg} />
              )}
              <View style={styles.bannerOverlay} />

              {isLeader && (
                <TouchableOpacity style={styles.editBannerTopBtn} onPress={() => handleUpdateImage('bannerUrl')} disabled={uploadingBanner}>
                  {uploadingBanner ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="camera" size={18} color="#FFF" />}
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
                      {uploadingAvatar ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="pencil" size={12} color="#FFF" />}
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.guildInfoBlock}>
                  <Text style={styles.guildNameMain} numberOfLines={1}>{guildData.name}</Text>
                  <Text style={styles.guildTagMain}>[{guildData.tag}]</Text>
                  
                  <View style={styles.statsRowMain}>
                    <View style={styles.statItemMain}>
                      <Ionicons name="trophy" size={14} color="#D97706" />
                      <Text style={styles.statTextMain}> Бали: <Text style={styles.statValueMain}>{guildData.points}</Text></Text>
                    </View>
                    
                    <TouchableOpacity 
                      style={[styles.statItemMain, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined, {marginLeft: 15}]} 
                      onPress={() => !isDesktop && setShowMembersModal(true)}
                      disabled={isDesktop}
                    >
                      <Ionicons name="people" size={14} color="#D97706" />
                      <Text style={styles.statTextMain}> Учасники: <Text style={styles.statValueMain}>{guildData.membersCount}</Text></Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity onPress={handleLeaveGuild} style={[styles.leaveBtnNew, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
                    <Ionicons name="exit-outline" size={14} color="#EF4444" />
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
                            <Ionicons name="document-text" size={24} color={isMe ? '#FFF' : '#D97706'} />
                            <Text style={[styles.fileName, {color: isMe ? '#FFF' : '#D5C4B0'}]} numberOfLines={1}>{item.fileName}</Text>
                          </TouchableOpacity>
                        )}

                        {item.text ? <Text style={[styles.messageText, isMe && {color: '#FFF'}]}>{item.text}</Text> : null}
                        {item.audioUrl && <AudioMessagePlayer audioUrl={item.audioUrl} />}
                        
                        {Object.keys(groupedReactions).length > 0 && (
                          <View style={styles.reactionsDisplayRow}>
                            {Object.entries(groupedReactions).map(([emoji, userIds]) => (
                              <TouchableOpacity 
                                key={emoji} 
                                style={[styles.reactionBadge, userIds.includes(auth.currentUser.uid) && styles.reactionBadgeActive]}
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
              
              <View style={styles.inputAreaWrapper}>
                {replyingTo && (
                  <View style={styles.replyPreviewContainer}>
                    <Ionicons name="arrow-undo" size={20} color="#D97706" style={{ marginRight: 10 }} />
                    <View style={styles.replyPreviewLine} />
                    <View style={styles.replyPreviewContent}>
                      <Text style={styles.replyPreviewName}>{replyingTo.senderId === auth.currentUser.uid ? (userData?.nickname || 'Ви') : replyingTo.senderName}</Text>
                      <Text style={styles.replyPreviewText} numberOfLines={1}>{replyingTo.text || (replyingTo.imageUrl ? '📷 Фото' : '🎤 Голосове повідомлення')}</Text>
                    </View>
                    <TouchableOpacity onPress={cancelReply} style={styles.replyPreviewClose} Platform={{ OS: 'web', style: { outlineStyle: 'none' } }}>
                      <Ionicons name="close-circle" size={24} color="#D5C4B080" />
                    </TouchableOpacity>
                  </View>
                )}

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
                      <View style={styles.emojiGrid}>
                        {EMOJI_LIST.map(emoji => (
                          <TouchableOpacity key={emoji} onPress={() => setNewMessage(newMessage + emoji)} style={{padding: 6}}>
                            <Text style={{fontSize: 24}}>{emoji}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
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
                          <FlatList 
                            data={gifs}
                            keyExtractor={(item, index) => index.toString()}
                            numColumns={2}
                            renderItem={({item}) => (
                              <TouchableOpacity onPress={() => sendMessage(null, item, null)} style={styles.gifBtn}>
                                <Image source={{uri: item}} style={styles.gifImage} />
                              </TouchableOpacity>
                            )}
                          />
                        )}
                      </View>
                    )}
                  </View>
                )}

                <View style={styles.inputContainer}>
                  <View style={{position: 'relative', zIndex: 100}}>
                    {showAttachMenu && (
                      <View style={styles.attachMenuPopover}>
                        <TouchableOpacity onPress={handlePickAndSendImage} style={styles.attachMenuItem}>
                          <Ionicons name="image" size={20} color="#D97706" style={{marginRight: 8}}/>
                          <Text style={{color: '#FFF'}}>Фото</Text>
                        </TouchableOpacity>
                        <View style={{height: 1, backgroundColor: '#D9770620', marginVertical: 4}}/>
                        <TouchableOpacity onPress={handlePickAndSendDocument} style={styles.attachMenuItem}>
                          <Ionicons name="document" size={20} color="#10B981" style={{marginRight: 8}}/>
                          <Text style={{color: '#FFF'}}>Файл</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    
                    {editingMessageId ? (
                      <TouchableOpacity onPress={cancelEditing} style={[styles.iconButton, { paddingBottom: 15 }, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
                        <Ionicons name="close-circle" size={28} color="#EF4444" />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={() => setShowAttachMenu(!showAttachMenu)} style={[styles.iconButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} disabled={isUploading}>
                        {isUploading ? <ActivityIndicator color="#D97706" size="small" /> : <Ionicons name="add-circle" size={28} color="#D5C4B080" />}
                      </TouchableOpacity>
                    )}
                  </View>

                  <TextInput 
                    style={[styles.textInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} 
                    placeholder={editingMessageId ? "Редагування повідомлення..." : replyingTo ? "Написати відповідь..." : "Написати гільдії..."} 
                    placeholderTextColor="#D5C4B050" 
                    value={newMessage} 
                    onChangeText={setNewMessage} 
                    multiline
                    onKeyPress={(e) => {
                      if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                        e.preventDefault(); 
                        editingMessageId ? saveEditedMessage() : sendMessage();
                      }
                    }}
                  />
                  
                  {!editingMessageId && (
                    <TouchableOpacity onPress={() => setShowEmojiMenu(!showEmojiMenu)} style={[styles.iconButton, {marginLeft: 8}, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
                      <Ionicons name="happy-outline" size={26} color={showEmojiMenu ? "#D97706" : "#D5C4B080"} />
                    </TouchableOpacity>
                  )}
                  
                  {editingMessageId ? (
                    <TouchableOpacity onPress={saveEditedMessage} style={[styles.sendButton, { backgroundColor: '#10B981' }, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
                      <Ionicons name="checkmark" size={20} color="#FFF" />
                    </TouchableOpacity>
                  ) : newMessage.trim() === '' ? (
                    <TouchableOpacity onPress={handleVoiceRecord} style={[styles.iconButton, isRecording && styles.recordingButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
                      <Ionicons name={isRecording ? "stop" : "mic"} size={26} color={isRecording ? "#FFF" : "#D5C4B0"} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => sendMessage()} style={[styles.sendButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
                      <Ionicons name="send" size={18} color="#302D28" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
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
                    <Ionicons name="close" size={28} color="#D5C4B080" />
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

        <Modal visible={isImageViewerVisible} transparent={true} animationType="fade" onRequestClose={() => setIsImageViewerVisible(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.85)', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setIsImageViewerVisible(false)}>
            <TouchableOpacity style={{ position: 'absolute', top: Platform.OS === 'web' ? 20 : 50, right: 20, zIndex: 100, padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, outlineStyle: 'none' }} onPress={() => setIsImageViewerVisible(false)}><Ionicons name="close" size={28} color="#FFF" /></TouchableOpacity>
            <Image source={{ uri: currentImageUri }} style={{ width: '90%', height: '90%', borderRadius: 16 }} resizeMode="contain" />
          </TouchableOpacity>
        </Modal>

      </KeyboardAvoidingView>
    );
  }

  if (isCreating) {
    return (
      <View style={styles.container}>
        <View style={styles.centeredWrapper}>
          <Text style={styles.title}>Створення Гільдії</Text>
          <TextInput style={[styles.input, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="Назва гільдії" placeholderTextColor="#D5C4B080" value={guildName} onChangeText={setGuildName} />
          <TextInput style={[styles.input, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="TAG (до 6 символів)" placeholderTextColor="#D5C4B080" value={guildTag} onChangeText={setGuildTag} maxLength={6} autoCapitalize="characters" />
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
  container: { flex: 1, backgroundColor: '#302D28', paddingTop: Platform.OS === 'ios' ? 50 : 20 },
  centeredWrapper: { width: '100%', maxWidth: 800, alignSelf: 'center', flex: 1, paddingHorizontal: 20 },

  mainLayout: { flex: 1, flexDirection: 'row', width: '100%', maxWidth: 1850, alignSelf: 'center', paddingBottom: Platform.OS === 'ios' ? 30 : 20 },

  contactsContainer: { flex: 1, backgroundColor: '#302D28', borderRightWidth: 1, borderRightColor: '#D9770620', paddingRight: 10 },
  contactsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 10 : 0, borderBottomWidth: 1, borderBottomColor: '#D9770620' },
  headerTitle: { color: '#D5C4B0', fontSize: 24, fontWeight: 'bold' },
  contactCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, marginBottom: 8, backgroundColor: 'transparent' },
  contactCardActive: { backgroundColor: '#47392b', borderWidth: 1, borderColor: '#D9770640' },
  contactAvatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#D97706' },
  contactAvatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#35322D', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#D9770650' },
  contactAvatarText: { color: '#D5C4B0', fontSize: 20, fontWeight: 'bold' },
  onlineBadge: { position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: '#10B981', borderWidth: 2, borderColor: '#302D28' },
  contactInfo: { marginLeft: 12, flex: 1, justifyContent: 'center' },
  contactName: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  contactTag: { color: '#D5C4B060', fontSize: 13 },

  contentArea: { flex: 2.2, paddingLeft: 15, paddingRight: 10, paddingBottom: 0 },
  
  guildBannerCard: { 
    width: '100%', 
    minHeight: 180, 
    borderRadius: 24, 
    overflow: 'hidden', 
    position: 'relative', 
    marginBottom: 15, 
    backgroundColor: '#35322D',
    borderWidth: 1, 
    borderColor: '#47392b', 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 10, 
    elevation: 8 
  },
  bannerBgImage: { width: '100%', height: '100%', position: 'absolute' },
  bannerPlaceholderBg: { width: '100%', height: '100%', position: 'absolute', backgroundColor: '#35322D' },
  bannerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  
  editBannerTopBtn: { position: 'absolute', top: 15, right: 15, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 8, zIndex: 10 },
  
  bannerContent: { flexDirection: 'row', alignItems: 'center', padding: 25, zIndex: 1 },
  avatarBlock: { position: 'relative', marginRight: 25 },
  avatarImageMain: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#FFF', backgroundColor: '#FFF' },
  avatarMainPlaceholder: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#FFF' },
  avatarLetterMain: { color: '#000', fontSize: 40, fontWeight: 'bold' },
  editAvatarPencilBtn: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#D97706', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  
  guildInfoBlock: { flex: 1 },
  guildNameMain: { color: '#FFF', fontSize: 28, fontWeight: 'bold', textShadowColor: 'rgba(0, 0, 0, 0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  guildTagMain: { color: '#D97706', fontSize: 16, fontWeight: 'bold', marginBottom: 10, textShadowColor: 'rgba(0, 0, 0, 0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  statsRowMain: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  statItemMain: { flexDirection: 'row', alignItems: 'center' },
  statTextMain: { color: '#D5C4B0', fontSize: 13, marginLeft: 6, textShadowColor: 'rgba(0, 0, 0, 0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  statValueMain: { color: '#D97706', fontWeight: 'bold' },
  
  leaveBtnNew: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  leaveBtnTextNew: { color: '#EF4444', fontSize: 13, fontWeight: 'bold', marginLeft: 6 },
  
  masterBadge: { position: 'absolute', bottom: 15, right: 15, backgroundColor: 'rgba(0, 0, 0, 0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, zIndex: 2 },
  masterBadgeText: { color: '#D97706', fontSize: 12, fontWeight: 'bold', fontStyle: 'italic' },

  chatSection: { 
    flex: 1, 
    backgroundColor: '#35322D', 
    borderRadius: 24, 
    padding: 15, 
    marginTop: 5,
    borderWidth: 1, 
    borderColor: '#47392b', 
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
  theirMessage: { backgroundColor: '#47392b' },
  myMessageTail: { borderBottomRightRadius: 4 },
  theirMessageTail: { borderBottomLeftRadius: 4 },
  messageTail: { position: 'absolute', bottom: 0, width: 0, height: 0, borderTopWidth: 15, borderTopColor: 'transparent' },
  messageTailMine: { right: -8, borderLeftWidth: 15, borderLeftColor: '#8B5E34' },
  messageTailTheirs: { left: -8, borderRightWidth: 15, borderRightColor: '#47392b' },
  
  chatSenderName: { color: '#D5C4B060', fontSize: 12, marginBottom: 4, fontWeight: 'bold' },
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

  audioPlayerContainer: { flexDirection: 'row', alignItems: 'center', minWidth: 220, maxWidth: 280, marginTop: 4, marginBottom: 8, backgroundColor: 'rgba(0,0,0,0.15)', padding: 8, borderRadius: 16 },
  playPauseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#D97706', justifyContent: 'center', alignItems: 'center', marginRight: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
  audioTrackContainer: { flex: 1, height: 20, justifyContent: 'center', position: 'relative', cursor: 'pointer' },
  audioTrackBg: { width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3 },
  audioProgress: { position: 'absolute', left: 0, height: 6, backgroundColor: '#D97706', borderRadius: 3 },
  audioTimeText: { color: '#FFF', fontSize: 10, marginLeft: 10, fontWeight: 'bold', minWidth: 60, textAlign: 'right' },

  inputAreaWrapper: { backgroundColor: '#35322D', borderTopWidth: 1, borderTopColor: '#D9770620', position: 'relative' },
  attachMenuPopover: { position: 'absolute', bottom: '100%', left: 5, backgroundColor: '#47392b', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#D9770640', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, zIndex: 1000 },
  attachMenuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10 },
  emojiPickerContainer: { position: 'absolute', bottom: '100%', right: 15, marginBottom: 10, backgroundColor: '#47392b', borderRadius: 16, padding: 15, width: 300, minHeight: 300, maxHeight: 400, borderWidth: 1, borderColor: '#D9770640', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, zIndex: 50 },
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

  title: { color: '#D5C4B0', fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 },
  subtitle: { color: '#D5C4B080', fontSize: 16, textAlign: 'center', marginBottom: 40 },
  input: { backgroundColor: '#47392b', color: '#FFF', padding: 18, borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: '#D9770640', fontSize: 16 },
  buttonMain: { backgroundColor: '#D97706', padding: 18, borderRadius: 15, alignItems: 'center', marginBottom: 15 },
  buttonTextMain: { color: '#302D28', fontWeight: 'bold', fontSize: 16 },
  buttonSecondary: { borderWidth: 1, borderColor: '#D97706', padding: 18, borderRadius: 15, alignItems: 'center', marginBottom: 15 },
  buttonTextSecondary: { color: '#D97706', fontWeight: 'bold', fontSize: 16 },
  
  emptyText: { color: '#D5C4B050', textAlign: 'center', marginTop: 30, fontSize: 16, fontStyle: 'italic' },
  joinGuildCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#35322D', 
    padding: 20, 
    borderRadius: 20, 
    marginBottom: 15,
    borderWidth: 1, 
    borderColor: '#47392b', 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 10, 
    elevation: 8 
  },
  joinAvatarImage: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: '#D97706' },
  joinAvatarPlaceholder: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#47392b', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#D97706' },
  joinAvatarText: { color: '#D5C4B0', fontSize: 24, fontWeight: 'bold' },
  joinGuildInfo: { marginLeft: 15, flex: 1 },
  joinGuildName: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  joinGuildTag: { color: '#D97706', fontSize: 14, marginTop: 6, fontWeight: 'bold' },
  joinButton: { backgroundColor: '#D97706', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  joinButtonText: { color: '#302D28', fontWeight: 'bold', fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(48, 45, 40, 0.95)', justifyContent: 'flex-end' },
  membersModalContent: { backgroundColor: '#302D28', flex: 1, marginTop: 100, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20 },
});