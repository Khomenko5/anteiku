import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Platform, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native'; 
import { auth, db } from './src/api/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import * as Linking from 'expo-linking'; 

import { HelmetProvider } from 'react-helmet-async'; 

import NotificationHandler from './src/components/NotificationHandler'; 

if (Platform.OS === 'web') {
  const style = document.createElement('style');
  style.type = 'text/css';
  style.appendChild(document.createTextNode(`
    @font-face {
      font-family: 'Ionicons';
      src: url('https://unpkg.com/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf') format('truetype');
    }
  `));
  document.head.appendChild(style);
}

import AppNavigation from './src/navigation/AppNavigation';
import AuthNavigator from './src/navigation/AuthNavigator';
import VerifyEmailScreen from './src/screens/VerifyEmailScreen'; 

const prefix = Linking.createURL('/');

const linking = {
  prefixes: [prefix, 'http://localhost:8081', 'https://anteiku.com', 'http://anteiku.com'],
  config: {
    screens: {
      Feed: 'feed',
      Board: 'board',
      Notifications: 'notifications',
      Chat: 'chat',
      Guild: 'guild',
      Profile: {
        path: 'profile/:identifier?', 
        parse: { identifier: (id) => `${id}` },
      },
      Settings: 'settings',
    },
  },
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  const appState = useRef(AppState.currentState);

  const setUserOnlineStatus = async (uid, isOnline) => {
    if (!uid) return;
    try {
      await updateDoc(doc(db, 'users', uid), {
        isOnline: isOnline,
        lastSeen: new Date()
      });
    } catch (error) {
      console.error("Помилка оновлення статусу онлайн:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsEmailVerified(currentUser?.emailVerified || false);
      setLoading(false); 

      if (currentUser) {
        setUserOnlineStatus(currentUser.uid, true);
      }
    });
    
    return unsubscribe;
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (auth.currentUser) setUserOnlineStatus(auth.currentUser.uid, true);
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (auth.currentUser) setUserOnlineStatus(auth.currentUser.uid, false);
      }
      appState.current = nextAppState;
    });

    const handleBeforeUnload = () => {
      if (auth.currentUser) {
        setUserOnlineStatus(auth.currentUser.uid, false);
      }
    };

    if (Platform.OS === 'web') {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      subscription.remove();
      if (Platform.OS === 'web') {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
    };
  }, []);

  const handleVerificationCheck = () => {
    setIsEmailVerified(auth.currentUser?.emailVerified || false);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#302D28', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#D97706" />
      </View>
    );
  }

  return (
    <HelmetProvider>
      {user && isEmailVerified && <NotificationHandler />}
      
      <NavigationContainer linking={linking}> 
        {!user ? (
          <AuthNavigator />
        ) : isEmailVerified ? (
          <AppNavigation />
        ) : (
          <VerifyEmailScreen onCheck={handleVerificationCheck} />
        )}
      </NavigationContainer>
    </HelmetProvider>
  );
}