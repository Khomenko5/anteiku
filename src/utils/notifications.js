import { db } from '../api/firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * 
 * * @param {string} receiverId
 * @param {string} type
 * @param {object} senderData
 * @param {string} message
 * @param {string} relatedId
 */
export const sendNotification = async (receiverId, type, senderData = null, message, relatedId = null) => {
  if (!receiverId) return;

  try {
    const notificationsRef = collection(db, 'users', receiverId, 'notifications');
    await addDoc(notificationsRef, {
      type: type,
      senderId: senderData?.id || 'system',
      senderName: senderData?.name || 'Система Anteiku',
      senderAvatarUrl: senderData?.avatarUrl || null,
      message: message,
      relatedId: relatedId,
      isRead: false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Помилка відправки сповіщення:", error);
  }
};