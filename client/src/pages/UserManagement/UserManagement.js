import { collection, getDocs, doc, deleteDoc, getDoc } from "firebase/firestore";
import { db } from "/src/firebase/firebase.js";

/**
 * Fetches all users from the Firestore 'users' collection.
 * @returns {Promise<Array>} Array of user objects with their IDs.
 */
export const fetchAllUsers = async () => {
  try {
    const usersCollection = collection(db, "users");
    const usersSnapshot = await getDocs(usersCollection);
    
    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return users;
  } catch (error) {
    console.error("Error fetching users:", error);
    throw new Error("Failed to fetch users: " + error.message);
  }
};

/**
 * Fetches a specific user by ID from Firestore.
 * @param {string} userId - The user ID to fetch.
 * @returns {Promise<Object>} User object with ID.
 */
export const fetchUserById = async (userId) => {
  try {
    const userDocRef = doc(db, "users", userId);
    const userDocSnap = await getDoc(userDocRef);
    
    if (userDocSnap.exists()) {
      return {
        id: userDocSnap.id,
        ...userDocSnap.data()
      };
    } else {
      throw new Error("User not found");
    }
  } catch (error) {
    console.error("Error fetching user:", error);
    throw new Error("Failed to fetch user: " + error.message);
  }
};

/**
 * Deletes a user from Firestore by ID.
 * @param {string} userId - The user ID to delete.
 * @returns {Promise<void>}
 */
export const deleteUser = async (userId) => {
  try {
    const userDocRef = doc(db, "users", userId);
    await deleteDoc(userDocRef);
  } catch (error) {
    console.error("Error deleting user:", error);
    throw new Error("Failed to delete user: " + error.message);
  }
};