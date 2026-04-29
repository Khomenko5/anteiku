import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView, Modal, FlatList, Image, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../api/firebaseConfig';
import { signOut, updatePassword, deleteUser, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, deleteDoc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';

export default function SettingsScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('profile');

  const [nickname, setNickname] = useState('');
  const [customStatus, setCustomStatus] = useState('');
  const [username, setUsername] = useState(''); 
  const [favoriteGame, setFavoriteGame] = useState(null); 
  const [favoriteMusic, setFavoriteMusic] = useState(null); 
  const [favoriteWatch, setFavoriteWatch] = useState(null); 
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showDeletePassword, setShowDeletePassword] = useState(false);

  const [notifSettings, setNotifSettings] = useState({
    pushEnabled: true,
    soundEnabled: true,
    messages: true,
    guildUpdates: true,
    likesAndComments: true,
  });
  const [isSavingNotifs, setIsSavingNotifs] = useState(false);

  const [showGameSearchModal, setShowGameSearchModal] = useState(false);
  const [gameSearchQuery, setGameSearchQuery] = useState('');
  const [gameSearchResults, setGameSearchResults] = useState([]);
  const [isSearchingGames, setIsSearchingGames] = useState(false);
  const gameSearchTimeout = useRef(null);

  const [showMusicSearchModal, setShowMusicSearchModal] = useState(false);
  const [musicSearchQuery, setMusicSearchQuery] = useState('');
  const [musicSearchResults, setMusicSearchResults] = useState([]);
  const [isSearchingMusic, setIsSearchingMusic] = useState(false);
  const musicSearchTimeout = useRef(null);

  const [showMovieSearchModal, setShowMovieSearchModal] = useState(false);
  const [movieSearchQuery, setMovieSearchQuery] = useState('');
  const [movieSearchResults, setMovieSearchResults] = useState([]);
  const [isSearchingMovie, setIsSearchingMovie] = useState(false);
  const movieSearchTimeout = useRef(null);

  const [showAnimeSearchModal, setShowAnimeSearchModal] = useState(false);
  const [animeSearchQuery, setAnimeSearchQuery] = useState('');
  const [animeSearchResults, setAnimeSearchResults] = useState([]);
  const [isSearchingAnime, setIsSearchingAnime] = useState(false);
  const animeSearchTimeout = useRef(null);

  const TMDB_API_KEY = '596a2703a2c033e3502d9d591cc45e43'; 
  const RAWG_API_KEY = '5c1f2bab7f6e471b9a10520d9de853ba';

  useEffect(() => {
    const fetchUserData = async () => {
      if (auth.currentUser) {
        const docRef = doc(db, 'users', auth.currentUser.uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setNickname(data.nickname || '');
          setCustomStatus(data.customStatus || '');
          setUsername(data.username || '');
          setFavoriteGame(data.favoriteGame || null);
          setFavoriteMusic(data.favoriteMusic || null);
          setFavoriteWatch(data.favoriteWatch || data.favoriteMovie || data.favoriteAnime || null); 
          if (data.notificationSettings) {
            setNotifSettings(data.notificationSettings);
          }
        }
      }
    };
    fetchUserData();
  }, []);

  const handleSaveProfile = async () => {
    if (!nickname.trim()) return alert("Нікнейм не може бути пустим!");

    const cleanUsername = username.trim().toLowerCase();

    if (cleanUsername) {
      const usernameRegex = /^[a-z0-9_]{3,20}$/;
      if (!usernameRegex.test(cleanUsername)) {
        return alert("Унікальний тег має містити від 3 до 20 символів: тільки англійські літери, цифри або підкреслення (без пробілів).");
      }
      const q = query(collection(db, 'users'), where('username', '==', cleanUsername));
      const snap = await getDocs(q);
      if (!snap.empty && snap.docs[0].id !== auth.currentUser.uid) {
        return alert("Цей унікальний тег вже зайнятий іншим користувачем! Спробуйте інший.");
      }
    }

    setIsSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        nickname: nickname.trim(),
        customStatus: customStatus.trim(),
        username: cleanUsername || null,
        favoriteGame: favoriteGame,
        favoriteMusic: favoriteMusic,
        favoriteWatch: favoriteWatch 
      });
      alert("Профіль успішно оновлено!");
    } catch (error) {
      alert("Помилка: " + error.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveNotifications = async () => {
    setIsSavingNotifs(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        notificationSettings: notifSettings
      });
      alert("Налаштування сповіщень збережено!");
    } catch (error) {
      alert("Помилка: " + error.message);
    } finally {
      setIsSavingNotifs(false);
    }
  };

  const searchGamesAPI = async (text) => {
    setGameSearchQuery(text);
    if (text.length < 3) { setGameSearchResults([]); return; }
    if (gameSearchTimeout.current) clearTimeout(gameSearchTimeout.current);
    gameSearchTimeout.current = setTimeout(async () => {
      setIsSearchingGames(true);
      try {
        const res = await fetch(`https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(text)}&page_size=10`);
        const data = await res.json();
        setGameSearchResults(data.results || []);
      } catch (e) {} finally { setIsSearchingGames(false); }
    }, 800); 
  };

  const handleSelectGame = (game) => {
    setFavoriteGame({ id: game.id, name: game.name, slug: game.slug, image: game.background_image });
    setShowGameSearchModal(false); setGameSearchQuery(''); setGameSearchResults([]);
  };

  const searchMusicAPI = async (text) => {
    setMusicSearchQuery(text);
    if (text.length < 2) { setMusicSearchResults([]); return; }
    if (musicSearchTimeout.current) clearTimeout(musicSearchTimeout.current);
    musicSearchTimeout.current = setTimeout(async () => {
      setIsSearchingMusic(true);
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(text)}&entity=song&limit=15`);
        const data = await res.json();
        setMusicSearchResults(data.results || []);
      } catch (e) {} finally { setIsSearchingMusic(false); }
    }, 800); 
  };

  const handleSelectMusic = (track) => {
    setFavoriteMusic({ id: track.trackId, name: track.trackName, artist: track.artistName, image: track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '600x600bb') : null, previewUrl: track.previewUrl, url: track.trackViewUrl });
    setShowMusicSearchModal(false); setMusicSearchQuery(''); setMusicSearchResults([]);
  };

  const searchMovieAPI = async (text) => {
    setMovieSearchQuery(text);
    if (text.length < 2) { setMovieSearchResults([]); return; }
    if (movieSearchTimeout.current) clearTimeout(movieSearchTimeout.current);
    movieSearchTimeout.current = setTimeout(async () => {
      setIsSearchingMovie(true);
      try {
        const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=uk-UA&query=${encodeURIComponent(text)}&page=1`);
        const data = await res.json();
        const results = (data.results || []).filter(item => item.media_type === 'movie' || item.media_type === 'tv');
        setMovieSearchResults(results);
      } catch (e) {} finally { setIsSearchingMovie(false); }
    }, 800); 
  };

  const handleSelectMovie = (item) => {
    const title = item.title || item.name;
    const date = item.release_date || item.first_air_date;
    const year = date ? date.substring(0, 4) : 'Рік невідомий';
    const imagePath = item.backdrop_path || item.poster_path;
    const typeLabel = item.media_type === 'tv' ? 'Серіал' : 'Фільм';
    
    setFavoriteWatch({ 
      id: item.id, 
      title: title, 
      subtitle: `${typeLabel} • ${year}`, 
      image: imagePath ? `https://image.tmdb.org/t/p/w500${imagePath}` : null, 
      url: `https://www.themoviedb.org/${item.media_type}/${item.id}`,
      icon: 'film'
    });
    setShowMovieSearchModal(false); setMovieSearchQuery(''); setMovieSearchResults([]);
  };

  const searchAnimeAPI = async (text) => {
    setAnimeSearchQuery(text);
    if (text.length < 3) { setAnimeSearchResults([]); return; }
    if (animeSearchTimeout.current) clearTimeout(animeSearchTimeout.current);
    animeSearchTimeout.current = setTimeout(async () => {
      setIsSearchingAnime(true);
      try {
        const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(text)}&limit=10`);
        const data = await res.json();
        setAnimeSearchResults(data.data || []);
      } catch (e) {} finally { setIsSearchingAnime(false); }
    }, 800); 
  };

  const handleSelectAnime = (item) => {
    setFavoriteWatch({
      id: item.mal_id,
      title: item.title,
      subtitle: `${item.type} • ${item.year || 'Невідомо'}`,
      image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || null,
      url: item.url,
      icon: 'sparkles'
    });
    setShowAnimeSearchModal(false); setAnimeSearchQuery(''); setAnimeSearchResults([]);
  };

  const handleLogout = async () => {
    const performSignOut = async () => {
      try { await signOut(auth); } catch (error) {}
    };
    if (Platform.OS === 'web') { if (window.confirm("Ви дійсно хочете вийти з акаунта?")) performSignOut(); } 
    else { Alert.alert("Вихід", "Ви дійсно хочете вийти з акаунта?", [{ text: "Скасувати", style: "cancel" }, { text: "Вийти", style: "destructive", onPress: performSignOut }]); }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return alert("Будь ласка, заповніть обидва поля паролів.");
    if (newPassword.length < 6) return alert("Новий пароль має містити щонайменше 6 символів.");
    setIsChangingPassword(true);
    try {
      const user = auth.currentUser;
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      alert("Пароль успішно змінено!");
      setCurrentPassword(''); setNewPassword('');
    } catch (error) {
      if (error.code === 'auth/invalid-credential') alert("Неправильний поточний пароль!"); else alert("Помилка: " + error.message);
    } finally { setIsChangingPassword(false); }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) return alert("Для видалення акаунта потрібно ввести поточний пароль.");
    const confirmAction = async () => {
      setIsDeleting(true);
      try {
        const user = auth.currentUser;
        const credential = EmailAuthProvider.credential(user.email, deletePassword);
        await reauthenticateWithCredential(user, credential);
        await deleteDoc(doc(db, "users", user.uid));
        await deleteUser(user);
      } catch (error) {
        if (error.code === 'auth/invalid-credential') alert("Неправильний пароль! Акаунт не видалено."); else alert("Помилка: " + error.message);
        setIsDeleting(false);
      }
    };
    if (Platform.OS === 'web') { if (window.confirm("УВАГА! Це незворотна дія. Всі ваші дані будуть видалені назавжди. Ви впевнені?")) confirmAction(); } 
    else { Alert.alert("Видалення акаунта", "УВАГА! Це незворотна дія. Всі ваші дані будуть видалені назавжди. Ви впевнені?", [{ text: "Скасувати", style: "cancel" }, { text: "Видалити назавжди", style: "destructive", onPress: confirmAction }]); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.mainLayout}>
        <View style={styles.sidebar}>
          <View style={styles.sidebarHeader}>
            <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={[styles.backButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
              <Ionicons name="arrow-back" size={24} color="#D97706" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Налаштування</Text>
            <View style={{ width: 40 }} /> 
          </View>

          <View style={styles.sidebarTabsContainer}>
            <TouchableOpacity style={[styles.contactCard, activeTab === 'profile' && styles.contactCardActive, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} onPress={() => setActiveTab('profile')}>
              <View style={[styles.iconWrapper, activeTab === 'profile' ? { backgroundColor: '#D97706' } : { backgroundColor: '#47392b' }]}><Ionicons name="id-card" size={20} color={activeTab === 'profile' ? '#302D28' : '#D5C4B080'} /></View>
              <View style={styles.contactInfo}><Text style={[styles.contactName, activeTab === 'profile' && { color: '#D97706' }]}>Профіль</Text><Text style={styles.contactTag}>Особисті дані</Text></View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.contactCard, activeTab === 'account' && styles.contactCardActive, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} onPress={() => setActiveTab('account')}>
              <View style={[styles.iconWrapper, activeTab === 'account' ? { backgroundColor: '#D97706' } : { backgroundColor: '#47392b' }]}><Ionicons name="shield-checkmark" size={20} color={activeTab === 'account' ? '#302D28' : '#D5C4B080'} /></View>
              <View style={styles.contactInfo}><Text style={[styles.contactName, activeTab === 'account' && { color: '#D97706' }]}>Безпека</Text><Text style={styles.contactTag}>Пароль та акаунт</Text></View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.contactCard, activeTab === 'notifications' && styles.contactCardActive, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} onPress={() => setActiveTab('notifications')}>
              <View style={[styles.iconWrapper, activeTab === 'notifications' ? { backgroundColor: '#D97706' } : { backgroundColor: '#47392b' }]}><Ionicons name="notifications" size={20} color={activeTab === 'notifications' ? '#302D28' : '#D5C4B080'} /></View>
              <View style={styles.contactInfo}><Text style={[styles.contactName, activeTab === 'notifications' && { color: '#D97706' }]}>Сповіщення</Text><Text style={styles.contactTag}>Звуки та пуші</Text></View>
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }} /> 

          <TouchableOpacity onPress={handleLogout} style={[styles.logoutButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
            <View style={[styles.iconWrapper, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}><Ionicons name="log-out" size={20} color="#EF4444" /></View>
            <View style={styles.contactInfo}><Text style={[styles.contactName, { color: '#EF4444' }]}>Вихід</Text><Text style={[styles.contactTag, { color: '#EF444480' }]}>Покинути акаунт</Text></View>
          </TouchableOpacity>
        </View>

        <View style={styles.contentArea}>
          <View style={styles.chatPane}>
            {activeTab === 'profile' && (
              <ScrollView style={styles.rightPaneContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                <View style={styles.chatHeader}>
                  <Text style={styles.paneTitle}>Редагування профілю</Text>
                  <Text style={styles.paneSubtitle}>Налаштуйте те, як вас бачать інші учасники Anteiku.</Text>
                </View>

                <View style={styles.formContainer}>
                  <Text style={styles.inputLabel}>Відображуване ім'я (Нікнейм)</Text>
                  <TextInput style={[styles.input, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="Ваш нікнейм" placeholderTextColor="#D5C4B050" value={nickname} onChangeText={setNickname} />

                  <Text style={styles.inputLabel}>Унікальний тег (наприклад: @user123)</Text>
                  <TextInput style={[styles.input, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="Тільки англійські літери та цифри" placeholderTextColor="#D5C4B050" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />

                  <Text style={styles.inputLabel}>Статус (цитата)</Text>
                  <TextInput style={[styles.input, { height: 100, textAlignVertical: 'top' }, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="Напишіть коротку цитату або статус..." placeholderTextColor="#D5C4B050" value={customStatus} onChangeText={setCustomStatus} multiline maxLength={100} />

                  <Text style={styles.inputLabel}>Улюблена гра (RAWG API)</Text>
                  {favoriteGame ? (
                    <View style={styles.selectedItemCard}>
                      <Image source={{ uri: favoriteGame.image }} style={styles.selectedItemImage} resizeMode="cover" />
                      <View style={styles.selectedItemOverlay} />
                      <Text style={styles.selectedItemTitle} numberOfLines={1}>{favoriteGame.name}</Text>
                      <TouchableOpacity style={styles.removeItemBtn} onPress={() => setFavoriteGame(null)}><Ionicons name="trash" size={20} color="#FFF" /></TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addBtn} onPress={() => setShowGameSearchModal(true)}>
                      <Ionicons name="game-controller" size={24} color="#D97706" style={{ marginRight: 10 }} />
                      <Text style={styles.addBtnText}>Знайти та вибрати гру</Text>
                    </TouchableOpacity>
                  )}

                  <Text style={styles.inputLabel}>Улюблена музика (iTunes API)</Text>
                  {favoriteMusic ? (
                    <View style={styles.selectedItemCard}>
                      <Image source={{ uri: favoriteMusic.image }} style={styles.selectedItemImage} resizeMode="cover" />
                      <View style={styles.selectedItemOverlay} />
                      <View style={{position: 'absolute', bottom: 15, left: 15, right: 50}}>
                        <Text style={styles.selectedItemTitle} numberOfLines={1}>{favoriteMusic.name}</Text>
                        <Text style={styles.selectedItemSubtitle} numberOfLines={1}>{favoriteMusic.artist}</Text>
                      </View>
                      <TouchableOpacity style={styles.removeItemBtn} onPress={() => setFavoriteMusic(null)}><Ionicons name="trash" size={20} color="#FFF" /></TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addBtn} onPress={() => setShowMusicSearchModal(true)}>
                      <Ionicons name="musical-notes" size={24} color="#D97706" style={{ marginRight: 10 }} />
                      <Text style={styles.addBtnText}>Знайти та вибрати трек</Text>
                    </TouchableOpacity>
                  )}

                  <Text style={styles.inputLabel}>Що подивитися? (Кіно або Аніме)</Text>
                  {favoriteWatch ? (
                    <View style={styles.selectedItemCard}>
                      {favoriteWatch.image ? (
                        <Image source={{ uri: favoriteWatch.image }} style={styles.selectedItemImage} resizeMode="cover" />
                      ) : (
                         <View style={[styles.selectedItemImage, {backgroundColor: '#35322D'}]} />
                      )}
                      <View style={styles.selectedItemOverlay} />
                      <View style={{position: 'absolute', bottom: 15, left: 15, right: 50}}>
                        <Text style={styles.selectedItemTitle} numberOfLines={1}>{favoriteWatch.title}</Text>
                        <Text style={styles.selectedItemSubtitle} numberOfLines={1}>{favoriteWatch.subtitle}</Text>
                      </View>
                      <TouchableOpacity style={styles.removeItemBtn} onPress={() => setFavoriteWatch(null)}><Ionicons name="trash" size={20} color="#FFF" /></TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                      <TouchableOpacity style={[styles.addBtn, { flex: 1, marginBottom: 0, padding: 12 }]} onPress={() => setShowMovieSearchModal(true)}>
                        <Ionicons name="film" size={20} color="#D97706" style={{ marginRight: 5 }} />
                        <Text style={[styles.addBtnText, { fontSize: 13, textAlign: 'center' }]}>Кіно / Серіал</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.addBtn, { flex: 1, marginBottom: 0, padding: 12 }]} onPress={() => setShowAnimeSearchModal(true)}>
                        <Ionicons name="sparkles" size={20} color="#D97706" style={{ marginRight: 5 }} />
                        <Text style={[styles.addBtnText, { fontSize: 13, textAlign: 'center' }]}>Аніме</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  
                  <TouchableOpacity style={[styles.saveButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} onPress={handleSaveProfile} disabled={isSavingProfile}>
                    {isSavingProfile ? <ActivityIndicator color="#302D28" /> : <Text style={styles.saveButtonText}>Зберегти зміни</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {activeTab === 'account' && (
              <ScrollView style={styles.rightPaneContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                <View style={styles.chatHeader}>
                  <Text style={styles.paneTitle}>Безпека акаунта</Text>
                  <Text style={styles.paneSubtitle}>Управління паролями та даними вашого профілю.</Text>
                </View>

                <View style={styles.formContainer}>
                  <Text style={styles.cardTitle}>Змінити пароль</Text>
                  
                  <Text style={styles.inputLabel}>Поточний пароль</Text>
                  <View style={styles.passwordInputContainer}>
                    <TextInput 
                      style={[styles.passwordInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} 
                      placeholder="Введіть старий пароль" 
                      placeholderTextColor="#D5C4B050" 
                      secureTextEntry={!showCurrentPassword} 
                      value={currentPassword} 
                      onChangeText={setCurrentPassword} 
                    />
                    <TouchableOpacity onPress={() => setShowCurrentPassword(!showCurrentPassword)} style={styles.eyeIconBtn}>
                      <Ionicons name={showCurrentPassword ? "eye-off" : "eye"} size={24} color="#D5C4B080" />
                    </TouchableOpacity>
                  </View>
                  
                  <Text style={styles.inputLabel}>Новий пароль</Text>
                  <View style={styles.passwordInputContainer}>
                    <TextInput 
                      style={[styles.passwordInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} 
                      placeholder="Мінімум 6 символів" 
                      placeholderTextColor="#D5C4B050" 
                      secureTextEntry={!showNewPassword} 
                      value={newPassword} 
                      onChangeText={setNewPassword} 
                    />
                    <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)} style={styles.eyeIconBtn}>
                      <Ionicons name={showNewPassword ? "eye-off" : "eye"} size={24} color="#D5C4B080" />
                    </TouchableOpacity>
                  </View>
                  
                  <TouchableOpacity style={[styles.saveButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} onPress={handleChangePassword} disabled={isChangingPassword}>
                    {isChangingPassword ? <ActivityIndicator color="#302D28" /> : <Text style={styles.saveButtonText}>Оновити пароль</Text>}
                  </TouchableOpacity>
                </View>

                <View style={[styles.formContainer, { borderColor: '#EF444440', backgroundColor: 'rgba(239, 68, 68, 0.05)', marginTop: 30, borderWidth: 1 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
                    <Ionicons name="warning" size={20} color="#EF4444" style={{ marginRight: 8 }} />
                    <Text style={[styles.cardTitle, { color: '#EF4444', marginBottom: 0 }]}>Небезпечна зона</Text>
                  </View>
                  <Text style={styles.dangerText}>Видалення акаунта є незворотнім. Ваші друзі, повідомлення, пости та дані гільдії будуть втрачені назавжди.</Text>
                  
                  <Text style={[styles.inputLabel, { color: '#EF444480' }]}>Підтвердження (поточний пароль)</Text>
                  <View style={[styles.passwordInputContainer, { borderColor: '#EF444440', backgroundColor: '#35322D' }]}>
                    <TextInput 
                      style={[styles.passwordInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} 
                      placeholder="Введіть пароль для видалення" 
                      placeholderTextColor="#EF444440" 
                      secureTextEntry={!showDeletePassword} 
                      value={deletePassword} 
                      onChangeText={setDeletePassword} 
                    />
                    <TouchableOpacity onPress={() => setShowDeletePassword(!showDeletePassword)} style={styles.eyeIconBtn}>
                      <Ionicons name={showDeletePassword ? "eye-off" : "eye"} size={24} color="#EF444480" />
                    </TouchableOpacity>
                  </View>
                  
                  <TouchableOpacity style={[styles.deleteButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} onPress={handleDeleteAccount} disabled={isDeleting}>
                    {isDeleting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.deleteButtonText}>ВИДАЛИТИ АКАУНТ</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {activeTab === 'notifications' && (
              <ScrollView style={styles.rightPaneContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                <View style={styles.chatHeader}>
                  <Text style={styles.paneTitle}>Сповіщення</Text>
                  <Text style={styles.paneSubtitle}>Налаштуйте, про що ви хочете отримувати Push-повідомлення.</Text>
                </View>

                <View style={styles.formContainer}>
                  
                  <Text style={styles.cardTitle}>Основні налаштування</Text>
                  
                  <View style={styles.switchRow}>
                    <View style={styles.switchTextContainer}>
                      <Text style={styles.switchLabel}>Всі сповіщення</Text>
                      <Text style={styles.switchSubLabel}>Отримувати системні та Push-сповіщення від додатку.</Text>
                    </View>
                    <Switch 
                      value={notifSettings.pushEnabled} 
                      onValueChange={(val) => setNotifSettings({...notifSettings, pushEnabled: val})}
                      trackColor={{ false: '#47392b', true: '#D97706' }}
                      thumbColor={notifSettings.pushEnabled ? '#FFF' : '#D5C4B0'}
                    />
                  </View>

                  <View style={styles.switchRow}>
                    <View style={styles.switchTextContainer}>
                      <Text style={styles.switchLabel}>Звуки в додатку</Text>
                      <Text style={styles.switchSubLabel}>Відтворювати короткий звук при отриманні нового повідомлення.</Text>
                    </View>
                    <Switch 
                      value={notifSettings.soundEnabled} 
                      onValueChange={(val) => setNotifSettings({...notifSettings, soundEnabled: val})}
                      trackColor={{ false: '#47392b', true: '#D97706' }}
                      thumbColor={notifSettings.soundEnabled ? '#FFF' : '#D5C4B0'}
                      disabled={!notifSettings.pushEnabled}
                    />
                  </View>

                  <View style={styles.divider} />
                  <Text style={styles.cardTitle}>Сповіщення про події</Text>

                  <View style={styles.switchRow}>
                    <View style={styles.switchTextContainer}>
                      <Text style={styles.switchLabel}>Нові повідомлення</Text>
                      <Text style={styles.switchSubLabel}>Сповіщати, коли друзі надсилають вам особисті повідомлення.</Text>
                    </View>
                    <Switch 
                      value={notifSettings.messages} 
                      onValueChange={(val) => setNotifSettings({...notifSettings, messages: val})}
                      trackColor={{ false: '#47392b', true: '#D97706' }}
                      thumbColor={notifSettings.messages ? '#FFF' : '#D5C4B0'}
                      disabled={!notifSettings.pushEnabled}
                    />
                  </View>

                  <View style={styles.switchRow}>
                    <View style={styles.switchTextContainer}>
                      <Text style={styles.switchLabel}>Активність гільдії</Text>
                      <Text style={styles.switchSubLabel}>Нові учасники, згадки та важливі події в чаті вашої гільдії.</Text>
                    </View>
                    <Switch 
                      value={notifSettings.guildUpdates} 
                      onValueChange={(val) => setNotifSettings({...notifSettings, guildUpdates: val})}
                      trackColor={{ false: '#47392b', true: '#D97706' }}
                      thumbColor={notifSettings.guildUpdates ? '#FFF' : '#D5C4B0'}
                      disabled={!notifSettings.pushEnabled}
                    />
                  </View>

                  <View style={styles.switchRow}>
                    <View style={styles.switchTextContainer}>
                      <Text style={styles.switchLabel}>Лайки та Коментарі</Text>
                      <Text style={styles.switchSubLabel}>Коли хтось реагує на ваші пости або залишає коментар.</Text>
                    </View>
                    <Switch 
                      value={notifSettings.likesAndComments} 
                      onValueChange={(val) => setNotifSettings({...notifSettings, likesAndComments: val})}
                      trackColor={{ false: '#47392b', true: '#D97706' }}
                      thumbColor={notifSettings.likesAndComments ? '#FFF' : '#D5C4B0'}
                      disabled={!notifSettings.pushEnabled}
                    />
                  </View>

                  <TouchableOpacity style={[styles.saveButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} onPress={handleSaveNotifications} disabled={isSavingNotifs}>
                    {isSavingNotifs ? <ActivityIndicator color="#302D28" /> : <Text style={styles.saveButtonText}>Зберегти налаштування</Text>}
                  </TouchableOpacity>

                </View>
              </ScrollView>
            )}

          </View>
        </View>

      </View>

      <Modal visible={showGameSearchModal} animationType="slide" transparent={true} onRequestClose={() => setShowGameSearchModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.searchModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Пошук гри (RAWG)</Text>
              <TouchableOpacity onPress={() => { setShowGameSearchModal(false); setGameSearchQuery(''); setGameSearchResults([]); }}><Ionicons name="close" size={28} color="#D5C4B080" /></TouchableOpacity>
            </View>
            <View style={styles.searchInputWrapper}>
              <Ionicons name="search" size={20} color="#D5C4B050" style={{ marginRight: 10 }} />
              <TextInput style={[styles.searchModalInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="Наприклад: Cyberpunk 2077..." placeholderTextColor="#D5C4B050" value={gameSearchQuery} onChangeText={searchGamesAPI} autoFocus={true} />
              {isSearchingGames && <ActivityIndicator color="#D97706" size="small" />}
            </View>
            <FlatList data={gameSearchResults} keyExtractor={item => item.id.toString()} ListEmptyComponent={<Text style={[styles.emptyContactsText, {marginTop: 20}]}>{gameSearchQuery.length > 2 && !isSearchingGames ? "Гру не знайдено" : "Введіть назву гри"}</Text>} renderItem={({item}) => (
                <TouchableOpacity style={styles.apiResultCard} onPress={() => handleSelectGame(item)}>
                  {item.background_image ? <Image source={{ uri: item.background_image }} style={styles.apiResultImage} resizeMode="cover" /> : <View style={styles.apiResultPlaceholder}><Ionicons name="game-controller" size={24} color="#D97706" /></View>}
                  <View style={styles.apiResultInfo}><Text style={styles.apiResultName}>{item.name}</Text><Text style={styles.apiResultDate}>{item.released ? item.released.substring(0, 4) : 'Дата невідома'}</Text></View>
                  <Ionicons name="add-circle" size={28} color="#D97706" />
                </TouchableOpacity>
              )} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showMusicSearchModal} animationType="slide" transparent={true} onRequestClose={() => setShowMusicSearchModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.searchModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Пошук музики (iTunes)</Text>
              <TouchableOpacity onPress={() => { setShowMusicSearchModal(false); setMusicSearchQuery(''); setMusicSearchResults([]); }}><Ionicons name="close" size={28} color="#D5C4B080" /></TouchableOpacity>
            </View>
            <View style={styles.searchInputWrapper}>
              <Ionicons name="search" size={20} color="#D5C4B050" style={{ marginRight: 10 }} />
              <TextInput style={[styles.searchModalInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="Артист або назва треку..." placeholderTextColor="#D5C4B050" value={musicSearchQuery} onChangeText={searchMusicAPI} autoFocus={true} />
              {isSearchingMusic && <ActivityIndicator color="#D97706" size="small" />}
            </View>
            <FlatList data={musicSearchResults} keyExtractor={item => item.trackId.toString()} ListEmptyComponent={<Text style={[styles.emptyContactsText, {marginTop: 20}]}>{musicSearchQuery.length > 1 && !isSearchingMusic ? "Трек не знайдено" : "Введіть назву треку"}</Text>} renderItem={({item}) => (
                <TouchableOpacity style={styles.apiResultCard} onPress={() => handleSelectMusic(item)}>
                  {item.artworkUrl100 ? <Image source={{ uri: item.artworkUrl100 }} style={styles.apiResultImage} resizeMode="cover" /> : <View style={styles.apiResultPlaceholder}><Ionicons name="musical-notes" size={24} color="#D97706" /></View>}
                  <View style={styles.apiResultInfo}><Text style={styles.apiResultName} numberOfLines={1}>{item.trackName}</Text><Text style={styles.apiResultDate} numberOfLines={1}>{item.artistName}</Text></View>
                  <Ionicons name="add-circle" size={28} color="#D97706" />
                </TouchableOpacity>
              )} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showMovieSearchModal} animationType="slide" transparent={true} onRequestClose={() => setShowMovieSearchModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.searchModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Пошук кіно (TMDB)</Text>
              <TouchableOpacity onPress={() => { setShowMovieSearchModal(false); setMovieSearchQuery(''); setMovieSearchResults([]); }}><Ionicons name="close" size={28} color="#D5C4B080" /></TouchableOpacity>
            </View>
            <View style={styles.searchInputWrapper}>
              <Ionicons name="search" size={20} color="#D5C4B050" style={{ marginRight: 10 }} />
              <TextInput style={[styles.searchModalInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="Назва фільму чи серіалу..." placeholderTextColor="#D5C4B050" value={movieSearchQuery} onChangeText={searchMovieAPI} autoFocus={true} />
              {isSearchingMovie && <ActivityIndicator color="#D97706" size="small" />}
            </View>
            <FlatList data={movieSearchResults} keyExtractor={item => item.id.toString()} ListEmptyComponent={<Text style={[styles.emptyContactsText, {marginTop: 20}]}>{movieSearchQuery.length > 1 && !isSearchingMovie ? "Кіно не знайдено" : "Введіть назву фільму"}</Text>} renderItem={({item}) => {
                const title = item.title || item.name;
                const date = item.release_date || item.first_air_date;
                const year = date ? date.substring(0, 4) : '';
                const typeLabel = item.media_type === 'tv' ? 'Серіал' : 'Фільм';
                const imagePath = item.poster_path || item.backdrop_path;
                return (
                  <TouchableOpacity style={styles.apiResultCard} onPress={() => handleSelectMovie(item)}>
                    {imagePath ? <Image source={{ uri: `https://image.tmdb.org/t/p/w200${imagePath}` }} style={styles.apiResultImage} resizeMode="cover" /> : <View style={styles.apiResultPlaceholder}><Ionicons name="film" size={24} color="#D97706" /></View>}
                    <View style={styles.apiResultInfo}><Text style={styles.apiResultName} numberOfLines={1}>{title}</Text><Text style={styles.apiResultDate} numberOfLines={1}>{typeLabel} {year ? `• ${year}` : ''}</Text></View>
                    <Ionicons name="add-circle" size={28} color="#D97706" />
                  </TouchableOpacity>
                );
              }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showAnimeSearchModal} animationType="slide" transparent={true} onRequestClose={() => setShowAnimeSearchModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.searchModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Пошук аніме (MAL)</Text>
              <TouchableOpacity onPress={() => { setShowAnimeSearchModal(false); setAnimeSearchQuery(''); setAnimeSearchResults([]); }}><Ionicons name="close" size={28} color="#D5C4B080" /></TouchableOpacity>
            </View>
            <View style={styles.searchInputWrapper}>
              <Ionicons name="search" size={20} color="#D5C4B050" style={{ marginRight: 10 }} />
              <TextInput style={[styles.searchModalInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} placeholder="Назва аніме..." placeholderTextColor="#D5C4B050" value={animeSearchQuery} onChangeText={searchAnimeAPI} autoFocus={true} />
              {isSearchingAnime && <ActivityIndicator color="#D97706" size="small" />}
            </View>
            <FlatList data={animeSearchResults} keyExtractor={item => item.mal_id.toString()} ListEmptyComponent={<Text style={[styles.emptyContactsText, {marginTop: 20}]}>{animeSearchQuery.length > 2 && !isSearchingAnime ? "Аніме не знайдено" : "Введіть назву аніме"}</Text>} renderItem={({item}) => {
                const title = item.title;
                const year = item.year || 'Невідомо';
                const typeLabel = item.type;
                const imagePath = item.images?.jpg?.large_image_url || item.images?.jpg?.image_url;
                return (
                  <TouchableOpacity style={styles.apiResultCard} onPress={() => handleSelectAnime(item)}>
                    {imagePath ? <Image source={{ uri: imagePath }} style={styles.apiResultImage} resizeMode="cover" /> : <View style={styles.apiResultPlaceholder}><Ionicons name="sparkles" size={24} color="#D97706" /></View>}
                    <View style={styles.apiResultInfo}><Text style={styles.apiResultName} numberOfLines={1}>{title}</Text><Text style={styles.apiResultDate} numberOfLines={1}>{typeLabel} • {year}</Text></View>
                    <Ionicons name="add-circle" size={28} color="#D97706" />
                  </TouchableOpacity>
                );
              }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#302D28', paddingTop: Platform.OS === 'ios' ? 40 : 20 },
  mainLayout: { flex: 1, flexDirection: 'row', width: '100%', alignSelf: 'center' },
  sidebar: { width: 390, marginLeft: 20, paddingRight: 20, borderRightWidth: 1, borderRightColor: '#47392b', paddingBottom: 120 },
  sidebarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingTop: 10 },
  headerTitle: { color: '#D5C4B0', fontSize: 24, fontWeight: 'bold' },
  backButton: { padding: 8, backgroundColor: 'rgba(217, 119, 6, 0.1)', borderRadius: 12, borderWidth: 1, borderColor: '#D9770640' },
  sidebarTabsContainer: { flex: 1 },
  contactCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, marginBottom: 8, backgroundColor: 'transparent', borderWidth: 1, borderColor: 'transparent' },
  contactCardActive: { backgroundColor: '#47392b', borderWidth: 1, borderColor: '#D9770640' },
  iconWrapper: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#D5C4B010' },
  contactInfo: { marginLeft: 15, flex: 1, justifyContent: 'center' },
  contactName: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  contactTag: { color: '#D5C4B080', fontSize: 13 },
  logoutButton: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, backgroundColor: 'transparent', borderWidth: 1, borderColor: 'transparent' },
  contentArea: { flex: 1, paddingLeft: 30, paddingRight: 40, paddingBottom: 20, maxWidth: 1400 },
  chatPane: { flex: 1, backgroundColor: '#35322D', borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: '#47392b', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 },
  chatHeader: { padding: 25, borderBottomWidth: 1, borderBottomColor: '#D9770620', backgroundColor: '#35322D' },
  paneTitle: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginBottom: 5 },
  paneSubtitle: { color: '#D5C4B080', fontSize: 14 },
  rightPaneContent: { flex: 1 },
  formContainer: { padding: 30, maxWidth: 800 },
  cardTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  inputLabel: { color: '#D5C4B090', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5, marginTop: 10 },
  
  input: { backgroundColor: '#47392b', color: '#FFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#D5C4B020', marginBottom: 10, fontSize: 16 },
  
  passwordInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#47392b', borderRadius: 16, borderWidth: 1, borderColor: '#D5C4B020', marginBottom: 10 },
  passwordInput: { flex: 1, color: '#FFF', padding: 16, fontSize: 16 },
  eyeIconBtn: { padding: 15 },

  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#47392b', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#D5C4B020', marginBottom: 10 },
  switchTextContainer: { flex: 1, paddingRight: 15 },
  switchLabel: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  switchSubLabel: { color: '#D5C4B080', fontSize: 12, marginTop: 4, lineHeight: 16 },
  divider: { height: 1, backgroundColor: '#D9770620', marginVertical: 20 },

  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(217, 119, 6, 0.1)', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#D9770640', borderStyle: 'dashed', marginBottom: 10 },
  addBtnText: { color: '#D97706', fontSize: 16, fontWeight: 'bold' },
  
  selectedItemCard: { width: '100%', height: 120, borderRadius: 16, overflow: 'hidden', marginBottom: 10, borderWidth: 1, borderColor: '#D9770640' },
  selectedItemImage: { width: '100%', height: '100%', position: 'absolute' },
  selectedItemOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  selectedItemTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 0, height: 2}, textShadowRadius: 4 },
  selectedItemSubtitle: { color: '#D5C4B0', fontSize: 14, marginTop: 4, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 3 },
  removeItemBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(239, 68, 68, 0.8)', padding: 8, borderRadius: 12 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(48, 45, 40, 0.95)', justifyContent: 'flex-end' },
  searchModalContent: { backgroundColor: '#47392b', flex: 1, marginTop: 60, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, borderWidth: 1, borderColor: '#D9770640', maxWidth: 600, alignSelf: 'center', width: '100%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  searchInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 16, paddingHorizontal: 15, marginBottom: 20, borderWidth: 1, borderColor: '#FFF20' }, 
  searchModalInput: { flex: 1, color: '#FFF', paddingVertical: 15, fontSize: 16 }, 
  emptyContactsText: { color: '#D5C4B050', textAlign: 'center', fontSize: 15, paddingHorizontal: 20, lineHeight: 22 },
  
  apiResultCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#FFF10' },
  apiResultImage: { width: 60, height: 60, borderRadius: 8, borderWidth: 1, borderColor: '#D97706' },
  apiResultPlaceholder: { width: 60, height: 60, borderRadius: 8, backgroundColor: '#35322D', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#D9770650' },
  apiResultInfo: { flex: 1, marginLeft: 15, marginRight: 10 },
  apiResultName: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  apiResultDate: { color: '#D5C4B080', fontSize: 12 },

  saveButton: { backgroundColor: '#D97706', padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 20 },
  saveButtonText: { color: '#302D28', fontSize: 16, fontWeight: 'bold' },

  dangerText: { color: '#EF444490', fontSize: 15, marginBottom: 20, lineHeight: 22 },
  deleteButton: { backgroundColor: '#EF4444', padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  deleteButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' }
});