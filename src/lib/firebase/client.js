import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyC1X4XwAwT59ZgVPiHPInFCQqPC6ibe2EQ",
  authDomain: "ucademy-87dc5.firebaseapp.com",
  projectId: "ucademy-87dc5",
  storageBucket: "ucademy-87dc5.firebasestorage.app",
  messagingSenderId: "858279201138",
  appId: "1:858279201138:web:c77e56c4082f12780b75eb",
  measurementId: "G-YPPCZH1FSN"
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Habilitar modo offline para Firestore
if (typeof window !== 'undefined') {
    enableMultiTabIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn("Múltiples pestañas abiertas, la persistencia offline solo funciona en una.");
        } else if (err.code == 'unimplemented') {
            console.warn("El navegador no soporta persistencia offline.");
        }
    });
}

// Secondary app for creating users without logging out
const secondaryApp = getApps().find(a => a.name === "SecondaryApp") || initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

const googleProvider = new GoogleAuthProvider();

export { app, auth, db, storage, secondaryAuth, googleProvider };
export { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut };
export { doc, getDoc, setDoc };
