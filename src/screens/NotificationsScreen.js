import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../api/firebaseConfig';
import { collection, query, orderBy, writeBatch, where, getDocs, doc, getDoc, limit, startAfter } from 'firebase/firestore';
import { Helmet } from 'react-helmet-async';

const NotificationAvatar = ({ senderId, fallbackName, initialAvatar }) => {
  const [avatar, setAvatar] = useState(initialAvatar);

  useEffect(() => {
    if (!senderId) return;
    
    const fetchLatestAvatar = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', senderId));
        if (userDoc.exists() && userDoc.data().avatarUrl) {
          setAvatar(userDoc.data().avatarUrl);
        }
      } catch (error) {
        console.error("Помилка завантаження аватара:", error);
      }
    };

    fetchLatestAvatar();
  }, [senderId]);

  if (avatar) {
    return <Image source={{ uri: avatar }} style={styles.avatarImage} resizeMode="cover" />;
  }

  return (
    <View style={styles.avatarPlaceholder}>
      <Text style={styles.avatarText}>
        {fallbackName ? fallbackName[0].toUpperCase() : '?'}
      </Text>
    </View>
  );
};

const formatTime = (timestamp) => {
  if (!timestamp) return 'Щойно';
  
  const now = new Date();
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'Щойно';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} хв тому`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} год тому`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} дн тому`;

  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
};

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const [lastDoc, setLastDoc] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchingRef = useRef(false);

  const fetchNotifications = async (isLoadMore = false) => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    if (fetchingRef.current) return;
    if (isLoadMore && !hasMore) return;

    fetchingRef.current = true;
    if (isLoadMore) setLoadingMore(true);

    try {
      let q = query(
        collection(db, 'users', userId, 'notifications'),
        orderBy('createdAt', 'desc'),
        limit(15) 
      );

      if (isLoadMore && lastDoc) {
        q = query(
          collection(db, 'users', userId, 'notifications'),
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(15)
        );
      }

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setHasMore(false);
      } else {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        const newNotifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (isLoadMore) {
          setNotifications(prev => [...prev, ...newNotifs]);
        } else {
          setNotifications(newNotifs);
        }

        setHasMore(snapshot.docs.length === 15);
      }
    } catch (error) {
      console.error("Помилка завантаження сповіщень:", error);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setHasMore(true);
    setLastDoc(null);
    await fetchNotifications(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchNotifications(false);
  }, []);

  useEffect(() => {
    const markAllAsRead = async () => {
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      try {
        const unreadQuery = query(
          collection(db, 'users', userId, 'notifications'),
          where('isRead', '==', false)
        );
        
        const snapshot = await getDocs(unreadQuery);
        
        if (!snapshot.empty) {
          const batch = writeBatch(db);
          snapshot.forEach((docSnap) => {
            batch.update(docSnap.ref, { isRead: true });
          });
          await batch.commit();
        }
      } catch (error) {
        console.error("Помилка автоматичного прочитання сповіщень:", error);
      }
    };

    markAllAsRead();
  }, []);

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'like': return { name: 'heart', color: '#EF4444' };
      case 'comment': return { name: 'chatbubble', color: '#D97706' };
      case 'repost': return { name: 'repeat', color: '#10B981' };
      case 'follow': return { name: 'person-add', color: '#3B82F6' };
      default: return { name: 'notifications', color: '#D5C4B0' };
    }
  };

  const renderItem = ({ item }) => {
    const icon = getNotificationIcon(item.type);

    const senderName = item.sender?.name || item.senderName || 'Користувач';
    const initialAvatar = item.sender?.avatarUrl || item.senderAvatar || item.avatarUrl || null;
    const messageText = item.text || item.message || 'взаємодіяв з вашим записом';
    const senderId = item.sender?.id || item.senderId;
    
    const timeString = formatTime(item.createdAt);

    return (
      <TouchableOpacity 
        style={[styles.notificationCard, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}
        onPress={() => {
          if (senderId) {
            navigation.navigate('Profile', { identifier: senderId });
          }
        }}
      >
        <View style={styles.avatarWrapper}>
          <NotificationAvatar 
            senderId={senderId} 
            fallbackName={senderName} 
            initialAvatar={initialAvatar} 
          />
          <View style={[styles.iconBadge, { backgroundColor: icon.color }]}>
            <Ionicons name={icon.name} size={12} color="#FFF" />
          </View>
        </View>

        <View style={styles.contentWrapper}>
          <Text style={styles.notificationText}>
            <Text style={styles.senderName}>{senderName}</Text> {messageText}
          </Text>
          <Text style={styles.timeText}>{timeString}</Text>
        </View>
        
        <Ionicons name="chevron-forward" size={20} color="#D5C4B050" />
      </TouchableOpacity>
    );
  };

  if (loading && notifications.length === 0) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#D97706" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' && (
        <Helmet>
          <title>Сповіщення | Anteiku</title>
        </Helmet>
      )}

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Сповіщення</Text>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={64} color="#D5C4B030" />
              <Text style={styles.emptyStateText}>У вас поки немає сповіщень.</Text>
            </View>
          )
        }
        renderItem={renderItem}
        onEndReached={() => fetchNotifications(true)}
        onEndReachedThreshold={0.1}
        ListFooterComponent={loadingMore ? <ActivityIndicator size="large" color="#D97706" style={{ marginVertical: 20 }} /> : null}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#302D28' 
  },
  header: { 
    paddingHorizontal: 20, 
    paddingTop: Platform.OS === 'ios' ? 60 : 30, 
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#D9770620',
    backgroundColor: '#302D28',
    zIndex: 10,
  },
  headerTitle: { 
    color: '#D5C4B0', 
    fontSize: 24, 
    fontWeight: 'bold',
    textAlign: 'center'
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100, 
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#35322D',
    padding: 15,
    borderRadius: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#47392b',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 15,
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#D97706',
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#47392b',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D97706',
  },
  avatarText: {
    color: '#D5C4B0',
    fontSize: 20,
    fontWeight: 'bold',
  },
  iconBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#35322D',
  },
  contentWrapper: {
    flex: 1,
    paddingRight: 10,
  },
  notificationText: {
    color: '#D5C4B090',
    fontSize: 15,
    lineHeight: 22,
  },
  senderName: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  timeText: {
    color: '#D5C4B050',
    fontSize: 12,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  },
  emptyStateText: {
    color: '#D5C4B050',
    fontSize: 16,
    marginTop: 15,
    fontStyle: 'italic',
  }
});