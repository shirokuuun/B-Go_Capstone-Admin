import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "/src/firebase/firebase.js";

/**
 * Signs up an admin user and stores additional data in Firestore.
 * @param {Object} data - The user data.
 * @param {string} data.name
 * @param {string} data.email
 * @param {string} data.password
 * @returns {Promise<Object>} The created Firebase user.
 */
export const signupAdmin = async ({ name, email, password }) => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  await setDoc(doc(db, "Admin", user.uid), {
    uid: user.uid,
    name,
    email,
    role: "admin",
    createdAt: new Date(),
  });

  return user;
};

/**
 * Logs in an admin user and checks their role from Firestore.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object>} The logged-in Firebase user if role is 'admin'.
 * @throws {Error} If the user is not an admin or not found.
 */
export const loginAdmin = async (email, password) => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  const userDocRef = doc(db, "Admin", user.uid);
  const userDocSnap = await getDoc(userDocRef);

  if (userDocSnap.exists()) {
    const userData = userDocSnap.data();
    if (userData.role === "admin") {
      return user;
    } else {
      await signOut(auth);
      throw new Error("Access denied. This account is not an admin.");
    }
  } else {
    await signOut(auth);
    throw new Error("Admin account not found.");
  }
};

/**
 * Logs out the current user from Firebase Authentication.
 * @returns {Promise<void>}
 */
export const logoutUser = () => {
  return signOut(auth);
};
