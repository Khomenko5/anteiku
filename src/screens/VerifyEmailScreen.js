import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../api/firebaseConfig';
import { sendEmailVerification, signOut } from 'firebase/auth';

export default function VerifyEmailScreen({ onCheck }) {
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const handleCheckVerification = async () => {
    setLoading(true);
    try {
      await auth.currentUser?.reload(); 
      
      if (auth.currentUser?.emailVerified) {
        Alert.alert("Успіх!", "Вашу пошту підтверджено. Ласкаво просимо!");
        if (onCheck) onCheck();
      } else {
        Alert.alert("Ще не підтверджено", "Будь ласка, перевірте свою пошту (та папку Спам) і перейдіть за посиланням.");
      }
    } catch (error) {
      Alert.alert("Помилка", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    setResendLoading(true);
    try {
      await sendEmailVerification(auth.currentUser);
      Alert.alert("Відправлено", "Новий лист відправлено на вашу пошту!");
    } catch (error) {
      if (error.code === 'auth/too-many-requests') {
        Alert.alert("Зачекайте", "Ми щойно відправили вам лист. Зачекайте пару хвилин перед наступною спробою.");
      } else {
        Alert.alert("Помилка", error.message);
      }
    } finally {
      setResendLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <View style={styles.container}>
      <Ionicons name="mail-unread-outline" size={100} color="#D97706" style={{ marginBottom: 20 }} />
      <Text style={styles.title}>Підтвердіть пошту</Text>
      <Text style={styles.subtitle}>
        Ми відправили лист з посиланням для підтвердження на адресу:{'\n'}
        <Text style={styles.emailText}>{auth.currentUser?.email}</Text>
      </Text>

      <TouchableOpacity style={styles.mainButton} onPress={handleCheckVerification} disabled={loading}>
        {loading ? <ActivityIndicator color="#302D28" /> : <Text style={styles.mainButtonText}>Я підтвердив(ла) пошту</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={handleResendEmail} disabled={resendLoading}>
        {resendLoading ? <ActivityIndicator color="#D97706" /> : <Text style={styles.secondaryButtonText}>Відправити лист ще раз</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
        <Text style={styles.logoutButtonText}>Вийти з акаунта</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#302D28', justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { color: '#D5C4B0', fontSize: 26, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  subtitle: { color: '#D5C4B090', fontSize: 16, textAlign: 'center', marginBottom: 30, lineHeight: 24 },
  emailText: { color: '#D97706', fontWeight: 'bold' },
  mainButton: { backgroundColor: '#D97706', width: '100%', padding: 18, borderRadius: 12, alignItems: 'center', marginBottom: 15 },
  mainButtonText: { color: '#302D28', fontWeight: 'bold', fontSize: 18 },
  secondaryButton: { borderWidth: 1, borderColor: '#D97706', width: '100%', padding: 18, borderRadius: 12, alignItems: 'center', marginBottom: 30 },
  secondaryButtonText: { color: '#D97706', fontWeight: 'bold', fontSize: 18 },
  logoutButton: { padding: 10 },
  logoutButtonText: { color: '#EF4444', fontSize: 16, fontWeight: 'bold' }
});