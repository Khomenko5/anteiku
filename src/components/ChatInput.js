import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, FlatList, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker'; 
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { COLORS } from '../theme/colors';

const EMOJI_LIST = ['😀','😂','🥰','😎','🤔','😢','😡','👍','👎','🙏','❤️','🔥','🎉','✨','👀', '🚀', '💯', '💩', '💀', '🤡'];

export default function ChatInput({ 
  onSendMessage, 
  onTyping, 
  replyingTo, 
  replyPreviewName, 
  replyPreviewText, 
  onCancelReply, 
  editingMessage, 
  onSaveEdit, 
  onCancelEdit 
}) {
  const [text, setText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState();

  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  
  const [pickerTab, setPickerTab] = useState('emoji'); 
  const [gifs, setGifs] = useState([]);
  const [gifSearchQuery, setGifSearchQuery] = useState('');
  const [loadingGifs, setLoadingGifs] = useState(false);
  const searchTimeout = useRef(null);

  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.text || '');
      setShowEmojiMenu(false);
      setShowAttachMenu(false);
    } else {
      setText('');
    }
  }, [editingMessage]);

  const fetchGifs = async (search = '') => {
    setLoadingGifs(true);
    try {
      const GIPHY_API_KEY = process.env.EXPO_PUBLIC_GIPHY_API_KEY;
      const url = search.trim() === '' 
        ? `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=24`
        : `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(search)}&limit=24`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.data) {
        const formattedGifs = data.data.map(item => item.images.fixed_height_small.url || item.images.downsized.url);
        setGifs(formattedGifs);
      }
    } catch (error) { 
      console.error("Помилка завантаження GIF:", error); 
    } finally { 
      setLoadingGifs(false); 
    }
  };

  useEffect(() => {
    if (showEmojiMenu && pickerTab === 'gif' && gifs.length === 0) fetchGifs();
  }, [showEmojiMenu, pickerTab]);

  const handleGifSearch = (queryText) => {
    setGifSearchQuery(queryText);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchGifs(queryText), 600); 
  };

  const handleTyping = (val) => {
    setText(val);
    if (onTyping) onTyping(val);
  };

  const handleSend = () => {
    if (editingMessage) {
      if (text.trim()) onSaveEdit(text.trim());
    } else {
      onSendMessage(text, null, null, null, null);
      setText('');
    }
  };

  const handlePickAndSendImage = async () => {
    setShowAttachMenu(false);
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.5, base64: true });
    if (!result.canceled) {
      setIsUploading(true);
      try {
        const formData = new FormData(); 
        formData.append('file', `data:image/jpeg;base64,${result.assets[0].base64}`); 
        formData.append('upload_preset', process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
        const cloudData = await res.json();
        if (cloudData.secure_url) {
          onSendMessage(null, cloudData.secure_url, null, null, null);
        }
      } catch (e) { 
        alert("Помилка завантаження фото"); 
      } finally { 
        setIsUploading(false); 
      }
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
      formData.append('upload_preset', process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET);
      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME}/raw/upload`, { method: 'POST', body: formData });
      const cloudData = await uploadRes.json();
      if (cloudData.secure_url) { 
        onSendMessage(null, null, null, cloudData.secure_url, fileName); 
      }
    } catch (err) { 
      alert("Помилка завантаження файлу"); 
    } finally { 
      setIsUploading(false); 
    }
  };

  const handleVoiceRecord = async () => {
    if (isRecording) {
      setIsRecording(false); 
      await recording.stopAndUnloadAsync(); 
      const uri = recording.getURI(); 
      setRecording(undefined);
      try {
        setIsUploading(true); 
        let base64Audio;
        if (Platform.OS === 'web') { 
          const res = await fetch(uri); 
          const blob = await res.blob(); 
          const reader = new FileReader(); 
          reader.readAsDataURL(blob); 
          base64Audio = await new Promise(resolve => { reader.onloadend = () => resolve(reader.result); }); 
        } else { 
          const base64Str = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }); 
          base64Audio = `data:audio/m4a;base64,${base64Str}`; 
        }
        const formData = new FormData(); 
        formData.append('file', base64Audio); 
        formData.append('upload_preset', process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME}/video/upload`, { method: 'POST', body: formData });
        const cloudData = await res.json();
        if (cloudData.secure_url) {
          onSendMessage(null, null, cloudData.secure_url, null, null);
        }
      } catch (e) { 
        alert("Помилка завантаження аудіо"); 
      } finally { 
        setIsUploading(false); 
      }
    } else {
      try {
        const perm = await Audio.requestPermissionsAsync();
        if (perm.status === 'granted') { 
          await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true }); 
          const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY); 
          setRecording(recording); 
          setIsRecording(true); 
        } else {
          alert("Потрібен дозвіл на мікрофон!");
        }
      } catch (err) { 
        console.error(err); 
      }
    }
  };

  return (
    <View style={styles.inputAreaWrapper}>
      {replyingTo && (
        <View style={styles.replyPreviewContainer}>
          <Ionicons name="arrow-undo" size={20} color={COLORS.primary} style={{ marginRight: 10 }} />
          <View style={styles.replyPreviewLine} />
          <View style={styles.replyPreviewContent}>
            <Text style={styles.replyPreviewName}>{replyPreviewName}</Text>
            <Text style={styles.replyPreviewText} numberOfLines={1}>{replyPreviewText}</Text>
          </View>
          <TouchableOpacity onPress={onCancelReply} style={[styles.replyPreviewClose, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
            <Ionicons name="close-circle" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {showEmojiMenu && (
        <View style={styles.emojiPickerContainer}>
          <View style={styles.pickerTabsHeader}>
            <TouchableOpacity onPress={() => setPickerTab('emoji')} style={[styles.pickerTabBtn, pickerTab === 'emoji' && styles.pickerTabBtnActive]}>
              <Text style={[styles.pickerTabBtnText, pickerTab === 'emoji' && {color: COLORS.primary}]}>Емодзі</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPickerTab('gif')} style={[styles.pickerTabBtn, pickerTab === 'gif' && styles.pickerTabBtnActive]}>
              <Text style={[styles.pickerTabBtnText, pickerTab === 'gif' && {color: COLORS.primary}]}>GIF</Text>
            </TouchableOpacity>
          </View>

          {pickerTab === 'emoji' ? (
            <View style={styles.emojiGrid}>
              {EMOJI_LIST.map(emoji => (
                <TouchableOpacity key={emoji} onPress={() => setText(text + emoji)} style={{padding: 6}}>
                  <Text style={{fontSize: 24}}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.gifContainer}>
              <TextInput 
                style={[styles.gifSearchInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} 
                placeholder="Пошук GIF..." 
                placeholderTextColor={COLORS.textMuted} 
                value={gifSearchQuery} 
                onChangeText={handleGifSearch} 
              />
              {loadingGifs ? (
                <ActivityIndicator size="small" color={COLORS.primary} style={{marginTop: 20}}/>
              ) : (
                <FlatList 
                  data={gifs} 
                  keyExtractor={(item, index) => index.toString()} 
                  numColumns={2} 
                  renderItem={({item}) => (
                    <TouchableOpacity onPress={() => { onSendMessage(null, item, null, null, null); setShowEmojiMenu(false); }} style={styles.gifBtn}>
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
                <Ionicons name="image" size={20} color={COLORS.primary} style={{marginRight: 8}}/>
                <Text style={{color: COLORS.text}}>Фото</Text>
              </TouchableOpacity>
              <View style={{height: 1, backgroundColor: COLORS.border, marginVertical: 4}}/>
              <TouchableOpacity onPress={handlePickAndSendDocument} style={styles.attachMenuItem}>
                <Ionicons name="document" size={20} color={COLORS.success} style={{marginRight: 8}}/>
                <Text style={{color: COLORS.text}}>Файл</Text>
              </TouchableOpacity>
            </View>
          )}
          
          {editingMessage ? (
            <TouchableOpacity onPress={onCancelEdit} style={[styles.iconButton, { paddingBottom: 15 }, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
              <Ionicons name="close-circle" size={28} color={COLORS.danger} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setShowAttachMenu(!showAttachMenu)} style={[styles.iconButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} disabled={isUploading}>
              {isUploading ? <ActivityIndicator color={COLORS.primary} size="small" /> : <Ionicons name="add-circle" size={28} color={COLORS.textMuted} />}
            </TouchableOpacity>
          )}
        </View>

        <TextInput 
          style={[styles.textInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]} 
          placeholder={editingMessage ? "Редагування повідомлення..." : replyingTo ? "Написати відповідь..." : "Написати повідомлення..."} 
          placeholderTextColor={COLORS.textMuted} 
          value={text} 
          onChangeText={handleTyping} 
          multiline
          onKeyPress={(e) => { 
            if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) { 
              e.preventDefault(); 
              handleSend(); 
            } 
          }}
        />
        
        {!editingMessage && (
          <TouchableOpacity onPress={() => setShowEmojiMenu(!showEmojiMenu)} style={[styles.iconButton, {marginLeft: 8}, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
            <Ionicons name="happy-outline" size={26} color={showEmojiMenu ? COLORS.primary : COLORS.textMuted} />
          </TouchableOpacity>
        )}
        
        {editingMessage ? (
          <TouchableOpacity onPress={handleSend} style={[styles.sendButton, { backgroundColor: COLORS.success }, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
            <Ionicons name="checkmark" size={20} color={COLORS.text} />
          </TouchableOpacity>
        ) : text.trim() === '' ? (
          <TouchableOpacity onPress={handleVoiceRecord} style={[styles.iconButton, isRecording && styles.recordingButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
            <Ionicons name={isRecording ? "stop" : "mic"} size={26} color={isRecording ? COLORS.text : COLORS.textSecondary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleSend} style={[styles.sendButton, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
            <Ionicons name="send" size={18} color={COLORS.background} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inputAreaWrapper: { backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, position: 'relative' },
  attachMenuPopover: { position: 'absolute', bottom: '100%', left: 5, backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: COLORS.border, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, zIndex: 1000 },
  attachMenuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10 },
  emojiPickerContainer: { position: 'absolute', bottom: '100%', right: 15, marginBottom: 10, backgroundColor: COLORS.surfaceLight, borderRadius: 16, padding: 15, width: 300, minHeight: 300, maxHeight: 400, borderWidth: 1, borderColor: COLORS.border, zIndex: 50 },
  pickerTabsHeader: { flexDirection: 'row', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerTabBtn: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  pickerTabBtnActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  pickerTabBtnText: { color: COLORS.textMuted, fontWeight: 'bold' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  gifContainer: { flex: 1 },
  gifSearchInput: { backgroundColor: 'rgba(0,0,0,0.2)', color: COLORS.text, borderRadius: 8, padding: 8, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  gifBtn: { flex: 1/2, padding: 2 },
  gifImage: { width: '100%', height: 100, borderRadius: 8 },

  replyPreviewContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surfaceLight, padding: 10, marginHorizontal: 15, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  replyPreviewLine: { width: 4, height: '100%', backgroundColor: COLORS.primary, borderRadius: 2, marginRight: 10 },
  replyPreviewContent: { flex: 1 },
  replyPreviewName: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold', marginBottom: 2 },
  replyPreviewText: { color: COLORS.textSecondary, fontSize: 13 },
  replyPreviewClose: { padding: 5, marginLeft: 10 },

  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 15 },
  iconButton: { paddingBottom: 10, paddingRight: 10 },
  recordingButton: { backgroundColor: COLORS.danger, borderRadius: 20, padding: 10 },
  textInput: { flex: 1, backgroundColor: COLORS.surfaceLight, color: COLORS.text, borderRadius: 20, paddingHorizontal: 15, paddingTop: 12, paddingBottom: 12, maxHeight: 100, fontSize: 15 },
  sendButton: { backgroundColor: COLORS.primary, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 10, marginBottom: 4 },
});