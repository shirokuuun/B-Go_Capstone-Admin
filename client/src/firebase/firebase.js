// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDjqLNklma1gr3IOwPxiMO5S38hu8UQ2Fc",
  authDomain: "it-capstone-6fe19.firebaseapp.com",
  projectId: "it-capstone-6fe19",
  storageBucket: "it-capstone-6fe19.firebasestorage.app",
  messagingSenderId: "183068104612",
  appId: "1:183068104612:web:26109c8ebb28585e265331",
  measurementId: "G-0MW2KZMGR2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

export { auth, db };
