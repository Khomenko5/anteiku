import { useState, useEffect, useRef } from 'react';
import { Platform, Alert } from 'react-native';
import { db } from '../api/firebaseConfig';
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, doc, updateDoc, arrayUnion, arrayRemove, deleteDoc, setDoc, increment } from 'firebase/firestore';
import { limit } from 'firebase/firestore';
import { useToast } from '../context/ToastContext';

export const useChat = ({ basePath, currentUserId, currentUserData, partnerId = null }) => {
  const [messages, setMessages] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [reactingToMsgId, setReactingToMsgId] = useState(null);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  
  const typingTimeoutRef = useRef(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (!basePath) {
      setMessages([]);
      return;
    }
    const q = query(collection(db, basePath, "messages"), orderBy("createdAt", "desc"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [basePath]);

  useEffect(() => {
    if (!basePath || !partnerId) {
      setIsPartnerTyping(false);
      return;
    }
    const typingRef = doc(db, basePath, "typingStatus", partnerId);
    const unsubscribe = onSnapshot(typingRef, (docSnap) => {
      if (docSnap.exists()) setIsPartnerTyping(docSnap.data().isTyping);
    });
    return () => unsubscribe();
  }, [basePath, partnerId]);

  const sendMessage = async (text = null, imageUrl = null, audioUrl = null, fileUrl = null, fileName = null) => {
    if (!text && !imageUrl && !audioUrl && !fileUrl) return;
    if (!basePath || !currentUserId) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setDoc(doc(db, basePath, "typingStatus", currentUserId), { isTyping: false }, { merge: true }).catch(() => {});

    const messageData = { 
      text, imageUrl, audioUrl, fileUrl, fileName, 
      senderId: currentUserId, 
      senderName: currentUserData?.nickname || 'Гість', 
      createdAt: serverTimestamp(), 
      ...(partnerId ? { isRead: false } : {})
    };

    if (replyingTo) {
      messageData.replyTo = { 
        id: replyingTo.id, 
        text: replyingTo.text || (replyingTo.imageUrl ? '📷 Фото' : replyingTo.fileUrl ? '📄 Файл' : '🎤 Голос'), 
        senderName: replyingTo.senderName || (replyingTo.senderId === currentUserId ? (currentUserData?.nickname || 'Ви') : 'Користувач')
      };
    }
    setReplyingTo(null);

    try {
      await addDoc(collection(db, basePath, "messages"), messageData);
      if (partnerId) {
        await updateDoc(doc(db, "users", currentUserId), { activeContacts: arrayUnion(partnerId) });
        await updateDoc(doc(db, "users", partnerId), { activeContacts: arrayUnion(currentUserId), [`unreadCounts.${currentUserId}`]: increment(1) });
      }
    } catch (error) { 
      showToast('error', 'Помилка', 'Не вдалося відправити повідомлення.'); 
    }
  };

  const handleReact = async (messageId, emoji, currentReactions = []) => {
    if (!basePath || !currentUserId) return;
    const existingReaction = currentReactions.find(r => r.userId === currentUserId && r.emoji === emoji);
    try {
      const msgRef = doc(db, basePath, "messages", messageId);
      if (existingReaction) { 
        await updateDoc(msgRef, { reactions: arrayRemove({ emoji, userId: currentUserId }) }); 
      } else { 
        await updateDoc(msgRef, { reactions: arrayUnion({ emoji, userId: currentUserId }) }); 
      }
      setReactingToMsgId(null); 
    } catch (error) { 
      showToast('error', 'Помилка', 'Не вдалося зберегти реакцію.'); 
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!basePath) return;
    const confirmAction = async () => {
      try { 
        await deleteDoc(doc(db, basePath, "messages", messageId)); 
      } catch (error) { 
        showToast('error', 'Помилка', 'Не вдалося видалити повідомлення.'); 
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm("Видалити це повідомлення?")) confirmAction();
    } else {
      Alert.alert("Видалення", "Видалити це повідомлення?", [{ text: "Скасувати", style: "cancel" }, { text: "Видалити", style: "destructive", onPress: confirmAction }]);
    }
  };

  const saveEditedMessage = async (textToSave) => {
    if (!textToSave || !editingMessageId || !basePath) return;
    try {
      await updateDoc(doc(db, basePath, "messages", editingMessageId), { text: textToSave, isEdited: true });
      setEditingMessageId(null);
    } catch (error) { 
      showToast('error', 'Помилка', 'Не вдалося відредагувати повідомлення.'); 
    }
  };

  const handleTyping = () => {
    if (!basePath || !currentUserId) return;
    const typingRef = doc(db, basePath, "typingStatus", currentUserId);
    setDoc(typingRef, { isTyping: true }, { merge: true }).catch(() => {});
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => { 
      setDoc(typingRef, { isTyping: false }, { merge: true }).catch(() => {}); 
    }, 2000);
  };

  return {
    messages,
    replyingTo, setReplyingTo,
    editingMessageId, setEditingMessageId,
    reactingToMsgId, setReactingToMsgId,
    isPartnerTyping,
    sendMessage,
    handleReact,
    handleDeleteMessage,
    saveEditedMessage,
    handleTyping
  };
};