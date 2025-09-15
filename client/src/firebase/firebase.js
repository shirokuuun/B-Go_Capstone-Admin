import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    "AIzaSyDjqLNklma1gr3IOwPxiMO5S38hu8UQ2Fc",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    "it-capstone-6fe19.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "it-capstone-6fe19",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    "it-capstone-6fe19.firebasestorage.app",
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "183068104612",
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    "1:183068104612:web:26109c8ebb28585e265331",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-0MW2KZMGR2",
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export { auth, db, storage, analytics };
export default app;
