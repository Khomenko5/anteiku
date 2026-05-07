import React, { createContext, useContext, useState, useRef } from 'react';
import { View, Text, Animated, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme/colors';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [toastConfig, setToastConfig] = useState(null);
  const translateY = useRef(new Animated.Value(-100)).current;
  const timeoutRef = useRef(null);

  const showToast = (type, title, message) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setToastConfig({ type, title, message });

    Animated.spring(translateY, {
      toValue: Platform.OS === 'ios' ? 60 : 40,
      useNativeDriver: true,
      speed: 12,
    }).start();

    timeoutRef.current = setTimeout(() => {
      hideToast();
    }, 3000);
  };

  const hideToast = () => {
    Animated.timing(translateY, {
      toValue: -150,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setToastConfig(null);
    });
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toastConfig && (
        <Animated.View style={[styles.toastContainer, { transform: [{ translateY }] }]}>
          <TouchableOpacity 
            activeOpacity={0.9} 
            onPress={hideToast} 
            style={[styles.toastContent, toastConfig.type === 'error' ? styles.toastError : styles.toastSuccess]}
          >
            <View style={styles.iconContainer}>
              <Ionicons 
                name={toastConfig.type === 'error' ? "warning" : "checkmark-circle"} 
                size={24} 
                color={COLORS.background} 
              />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.toastTitle}>{toastConfig.title}</Text>
              {toastConfig.message && <Text style={styles.toastMessage}>{toastConfig.message}</Text>}
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    zIndex: 99999,
    alignItems: 'center',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  toastSuccess: {
    backgroundColor: COLORS.success,
  },
  toastError: {
    backgroundColor: COLORS.danger,
  },
  iconContainer: {
    marginRight: 15,
  },
  textContainer: {
    flex: 1,
  },
  toastTitle: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: 'bold',
  },
  toastMessage: {
    color: COLORS.background,
    fontSize: 14,
    marginTop: 4,
    opacity: 0.9,
  },
});