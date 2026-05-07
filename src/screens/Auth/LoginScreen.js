import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform } from 'react-native';
import { auth } from '../../api/firebaseConfig';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { COLORS } from '../../theme/colors';
import { useToast } from '../../context/ToastContext';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { showToast } = useToast();

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      showToast('error', 'Помилка входу', 'Неправильний email або пароль');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background, padding: 20, justifyContent: 'center' }}>
      <Text style={{ color: COLORS.textSecondary, fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 40 }}>Вхід в Anteiku</Text>

      <TextInput
        placeholder="Email"
        placeholderTextColor={COLORS.textMuted}
        value={email}
        onChangeText={setEmail}
        style={[{ backgroundColor: COLORS.surfaceLight, color: COLORS.textSecondary, padding: 15, borderRadius: 10, marginBottom: 15 }, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}
      />

      <TextInput
        placeholder="Пароль"
        placeholderTextColor={COLORS.textMuted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={[{ backgroundColor: COLORS.surfaceLight, color: COLORS.textSecondary, padding: 15, borderRadius: 10, marginBottom: 30 }, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}
      />

      <TouchableOpacity onPress={handleLogin} style={[{ backgroundColor: COLORS.primary, padding: 18, borderRadius: 12, alignItems: 'center' }, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
        <Text style={{ color: COLORS.background, fontWeight: 'bold' }}>Увійти</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Register')} style={[{ marginTop: 20 }, Platform.OS === 'web' ? { outlineStyle: 'none' } : undefined]}>
        <Text style={{ color: COLORS.textSecondary, textAlign: 'center', opacity: 0.8 }}>Немає акаунту? <Text style={{ color: COLORS.primary, fontWeight: 'bold' }}>Зареєструватися</Text></Text>
      </TouchableOpacity>
    </View>
  );
}