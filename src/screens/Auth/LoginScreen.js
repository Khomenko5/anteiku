import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { auth } from '../../api/firebaseConfig';
import { signInWithEmailAndPassword } from 'firebase/auth';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      Alert.alert("Помилка входу", "Неправильний email або пароль");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#302D28', padding: 20, justifyContent: 'center' }}>
      <Text style={{ color: '#D5C4B0', fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 40 }}>Вхід в Anteiku</Text>

      <TextInput
        placeholder="Email"
        placeholderTextColor="#D5C4B080"
        value={email}
        onChangeText={setEmail}
        style={{ backgroundColor: '#ffffff10', color: '#D5C4B0', padding: 15, borderRadius: 10, marginBottom: 15 }}
      />

      <TextInput
        placeholder="Пароль"
        placeholderTextColor="#D5C4B080"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{ backgroundColor: '#ffffff10', color: '#D5C4B0', padding: 15, borderRadius: 10, marginBottom: 30 }}
      />

      <TouchableOpacity onPress={handleLogin} style={{ backgroundColor: '#D97706', padding: 18, borderRadius: 12, alignItems: 'center' }}>
        <Text style={{ color: '#302D28', fontWeight: 'bold' }}>Увійти</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Register')} style={{ marginTop: 20 }}>
        <Text style={{ color: '#D5C4B0', textAlign: 'center', opacity: 0.8 }}>Немає акаунту? <Text style={{ color: '#D97706', fontWeight: 'bold' }}>Зареєструватися</Text></Text>
      </TouchableOpacity>
    </View>
  );
}