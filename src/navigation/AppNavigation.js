import React, { useState, useEffect } from 'react';
import { View, Platform, Dimensions } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons'; 

import { auth, db } from '../api/firebaseConfig';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';

import FeedScreen from '../screens/FeedScreen';
import NoticeBoardScreen from '../screens/NoticeBoardScreen';
import MessagesScreen from '../screens/MessagesScreen';
import GuildScreen from '../screens/GuildScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';

const Tab = createBottomTabNavigator();

export default function AppNavigation() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [myIdentifier, setMyIdentifier] = useState(null);
  const [unreadChatCount, setUnreadChatCount] = useState(0); 
  const [screenWidth, setScreenWidth] = useState(Dimensions.get('window').width);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenWidth(window.width);
    });
    return () => subscription?.remove();
  }, []);

  const isLargeScreen = screenWidth > 768;

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const q = query(collection(db, 'users', userId, 'notifications'), where('isRead', '==', false));
    const unsubscribeNotifs = onSnapshot(q, (snapshot) => { setUnreadCount(snapshot.docs.length); });

    const unsubscribeUser = onSnapshot(doc(db, 'users', userId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setMyIdentifier(data.username || userId);
        if (data.unreadCounts) {
          const totalUnread = Object.values(data.unreadCounts).reduce((sum, count) => sum + (count || 0), 0);
          setUnreadChatCount(totalUnread);
        } else {
          setUnreadChatCount(0);
        }
      }
    });

    return () => { unsubscribeNotifs(); unsubscribeUser(); };
  }, []);

  return (
    <Tab.Navigator
      sceneContainerStyle={{ backgroundColor: '#302D28' }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,

        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 30 : 20,
          left: 20,
          right: isLargeScreen ? undefined : 20,
          alignSelf: isLargeScreen ? 'flex-start' : 'center',
          marginHorizontal: isLargeScreen ? 0 : 'auto',
          width: isLargeScreen ? 380 : undefined,
          maxWidth: 400,
          height: 70,
          borderRadius: 35,
          backgroundColor: '#47392b',
          borderTopWidth: 0,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.4,
          shadowRadius: 15,
          paddingHorizontal: 10,
        },

        tabBarIcon: ({ focused }) => {
          const activeColor = '#FFFFFF';
          const inactiveColor = 'rgba(255, 255, 255, 0.5)';
 
          const iconSize = focused ? 26 : 22;

          let IconComponent;

          if (route.name === 'Feed') {
            IconComponent = <Ionicons name="home-outline" size={iconSize} color={focused ? activeColor : inactiveColor} />;
          } else if (route.name === 'Board') {
            IconComponent = <Ionicons name="reader-outline" size={iconSize} color={focused ? activeColor : inactiveColor} />;
          } else if (route.name === 'Notifications') {
            IconComponent = <Ionicons name="notifications-outline" size={iconSize} color={focused ? activeColor : inactiveColor} />;
          } else if (route.name === 'Chat') {
            IconComponent = <Ionicons name="chatbubbles-outline" size={iconSize} color={focused ? activeColor : inactiveColor} />;
          } else if (route.name === 'Guild') {
            IconComponent = <Ionicons name="shield-outline" size={iconSize} color={focused ? activeColor : inactiveColor} />;
          } else if (route.name === 'Profile') {
            IconComponent = <Ionicons name="person-outline" size={iconSize} color={focused ? activeColor : inactiveColor} />;
          }

          return (
            <View style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: focused ? '#D97706' : 'transparent',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              {IconComponent}
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Board" component={NoticeBoardScreen} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ tabBarBadge: unreadCount > 0 ? unreadCount : null, tabBarBadgeStyle: { top: 10, backgroundColor: '#EF4444', color: '#FFF', fontSize: 12 } }} />
      <Tab.Screen name="Chat" component={MessagesScreen} options={{ tabBarBadge: unreadChatCount > 0 ? unreadChatCount : null, tabBarBadgeStyle: { top: 10, backgroundColor: '#EF4444', color: '#FFF', fontSize: 12 } }} />
      <Tab.Screen name="Guild" component={GuildScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} listeners={({ navigation }) => ({ tabPress: (e) => { e.preventDefault(); navigation.navigate('Profile', { identifier: myIdentifier || auth.currentUser?.uid }); }, })} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarItemStyle: { display: 'none' } }} />
    </Tab.Navigator>
  );
}