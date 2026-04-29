import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { auth, db } from '../../api/firebaseConfig';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth'; 
import { doc, setDoc } from 'firebase/firestore';

export default function RegisterScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email || !password || !nickname) {
      alert("Будь ласка, заповни всі поля, щоб приєднатися до Anteiku!");
      return;
    }

    try {
      setLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await sendEmailVerification(user);

      await setDoc(doc(db, "users", user.uid), {
        nickname: nickname,
        email: email,
        guildId: null,      
        guildTag: "",       
        status: 'full',     
        createdAt: new Date(),
        interests: { games: [], movies: [], music: [] },
        followers: [],
        following: [],
        friends: [],
        activeContacts: []
      });


    } catch (error) {
      console.error("Помилка при реєстрації:", error.code);

      if (error.code === 'auth/email-already-in-use') {
        alert("Цей Gmail уже зареєстрований в Anteiku! Будь ласка, УВІЙДИ у свій профіль, а не реєструй новий.");
        navigation.navigate('Login'); 
      } else if (error.code === 'auth/weak-password') {
        alert("Пароль занадто слабкий. Придумай щось надійніше (мінімум 6 символів).");
      } else {
        alert("Помилка реєстрації: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.logo}>Anteiku</Text>
      <Text style={styles.subtitle}>Створи свій затишний куточок</Text>

      <View style={styles.form}>
        <TextInput
          placeholder="Твій нікнейм"
          placeholderTextColor="#D5C4B080"
          value={nickname}
          onChangeText={setNickname}
          style={styles.input}
        />

        <TextInput
          placeholder="Твій Gmail"
          placeholderTextColor="#D5C4B080"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />

        <TextInput
          placeholder="Придумай пароль"
          placeholderTextColor="#D5C4B080"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={styles.input}
        />

        <TouchableOpacity onPress={handleRegister} style={styles.button} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Завантаження...' : 'Зареєструватися'}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={() => navigation.navigate('Login')} 
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>
            Вже маєш акаунт? <Text style={styles.linkTextBold}>Увійти</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#302D28', justifyContent: 'center', padding: 25 },
  logo: { color: '#D5C4B0', fontSize: 42, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { color: '#D5C4B080', textAlign: 'center', marginBottom: 40, fontSize: 16 },
  form: { width: '100%' },
  input: { backgroundColor: '#ffffff08', color: '#D5C4B0', padding: 18, borderRadius: 12, marginBottom: 15, fontSize: 16, borderWidth: 1, borderColor: '#D5C4B020' },
  button: { backgroundColor: '#D97706', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
  buttonText: { color: '#302D28', fontWeight: 'bold', fontSize: 18 },
  linkButton: { marginTop: 25, alignItems: 'center' },
  linkText: { color: '#D5C4B0', fontSize: 15, opacity: 0.8 },
  linkTextBold: { color: '#D97706', fontWeight: 'bold' }
});