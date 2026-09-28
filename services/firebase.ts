/// <reference types="vite/client" />
import { initializeApp } from "firebase/app";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  deleteDoc, 
  query, 
  where 
} from "firebase/firestore";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from "firebase/auth";

const firebaseConfig = {
  projectId: "gen-lang-client-0166321154",
  appId: "1:175371211870:web:164bd456a27236c54d90cf",
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAlENOJpQIx1LJ639Pd6eROchswK7n8K5Q",
  authDomain: "gen-lang-client-0166321154.firebaseapp.com",
  storageBucket: "gen-lang-client-0166321154.firebasestorage.app",
  messagingSenderId: "175371211870"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use native persistent local cache to prevent exhausting daily quota upon refresh
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, "ai-studio-grimoireartifice-fa4b4d50-4092-4ab0-9cfe-109dee046a0c");

export const provider = new GoogleAuthProvider();

export { signInWithPopup, signOut, onAuthStateChanged };
export type { User };
