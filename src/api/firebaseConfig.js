import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDjFwTWIEBDFVR_P1pcy9O9JoP3p8HnDN0",
  authDomain: "anteiku-1beae.firebaseapp.com",
  projectId: "anteiku-1beae",
  storageBucket: "anteiku-1beae.firebasestorage.app",
  messagingSenderId: "996065600961",
  appId: "1:996065600961:web:bd1e8d0d5c8d9b9d8e7b40",
  measurementId: "G-YS0H1CSNDC"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);