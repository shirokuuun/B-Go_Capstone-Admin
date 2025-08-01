import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
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
 * Logs out the current user from Firebase Authentication.
 * @returns {Promise<void>}
 */
export const logoutUser = () => {
  return signOut(auth);
};
