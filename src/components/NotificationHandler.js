import React, { useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import { auth, db } from '../api/firebaseConfig';
import { collection, query, onSnapshot, orderBy, limit, doc } from 'firebase/firestore';

export default function NotificationHandler() {
  const soundRef = useRef(null);

  const isFirstLoadNotifs = useRef(true);
  const isFirstLoadMsgs = useRef(true);
  const processedNotifs = useRef(new Set());
  const prevUnread = useRef({});
  const userSettings = useRef({});

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    let unsubNotifs = null;
    let unsubUser = null;

    const setupListeners = async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          require('../../assets/sounds/notif.mp3')
        );
        soundRef.current = sound;
        console.log('✅ Звук успішно завантажено!');
      } catch (e) {
        console.error("❌ Помилка завантаження звуку:", e);
      }

      const playSound = async () => {
        const settings = userSettings.current;
        if (settings?.pushEnabled === false || settings?.soundEnabled === false) {
          console.log('🔇 Звук вимкнено у налаштуваннях.');
          return;
        }
        try {
          if (soundRef.current) {
            await soundRef.current.setPositionAsync(0);
            await soundRef.current.playAsync();
            console.log('🔊 Відтворено звук!');
          }
        } catch (e) { 
          console.error("Помилка відтворення:", e); 
        }
      };

      unsubUser = onSnapshot(doc(db, "users", userId), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();

        userSettings.current = data.notificationSettings || {}; 
        
        const currentUnread = data.unreadCounts || {};

        if (isFirstLoadMsgs.current) {
          prevUnread.current = currentUnread;
          isFirstLoadMsgs.current = false;
          console.log('🔄 Слухач повідомлень готовий!');
          return;
        }

        let hasNewMsg = false;
        for (const [senderId, count] of Object.entries(currentUnread)) {
          const prevCount = prevUnread.current[senderId] || 0;
          if (count > prevCount) {
            hasNewMsg = true;
            break;
          }
        }
        
        prevUnread.current = currentUnread;

        if (hasNewMsg) {
          console.log('💬 Отримано нове повідомлення!');
          playSound();
        }
      });

      const qNotifs = query(collection(db, "users", userId, "notifications"), orderBy("createdAt", "desc"), limit(5));
      unsubNotifs = onSnapshot(qNotifs, (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return;

        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const notifId = change.doc.id;
            
            if (isFirstLoadNotifs.current) {
              processedNotifs.current.add(notifId);
              return;
            }

            if (!processedNotifs.current.has(notifId)) {
              processedNotifs.current.add(notifId);
              console.log('🔔 Нове системне сповіщення!');
              playSound();
            }
          }
        });

        if (isFirstLoadNotifs.current) {
            isFirstLoadNotifs.current = false;
            console.log('🔄 Слухач системних подій готовий!');
        }
      });
    };

    const timeout = setTimeout(() => {
      setupListeners();
    }, 1000);

    return () => {
      clearTimeout(timeout);
      if (unsubNotifs) unsubNotifs();
      if (unsubUser) unsubUser();
      if (soundRef.current) soundRef.current.unloadAsync();
    };
  }, []);

  return null;
}