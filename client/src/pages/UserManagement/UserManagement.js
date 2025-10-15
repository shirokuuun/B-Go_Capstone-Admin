import { collection, getDocs, doc, deleteDoc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, deleteUser as deleteAuthUser } from 'firebase/auth';
import { db } from "/src/firebase/firebase.js";
import { logActivity, ACTIVITY_TYPES } from '/src/pages/settings/auditService.js';

/**
 * Checks if a user account has been disabled/deleted by admin
 * This should be called during login process to prevent deleted users from accessing
 * @param {string} userId - The user ID to check
 * @returns {Promise<boolean>} True if user is disabled/deleted
 */
export const isUserDisabled = async (userId) => {
  try {
    const disabledUserRef = doc(db, "disabled_users", userId);
    const disabledUserSnap = await getDoc(disabledUserRef);
    return disabledUserSnap.exists();
  } catch (error) {
    console.error("Error checking user disabled status:", error);
    return false; // Allow login if check fails (failsafe)
  }
};

/**
 * Checks if a user exists in the main users collection
 * This should be called during login to ensure user profile exists
 * @param {string} userId - The user ID to check
 * @returns {Promise<boolean>} True if user profile exists
 */
export const doesUserProfileExist = async (userId) => {
  try {
    const userDocRef = doc(db, "users", userId);
    const userDocSnap = await getDoc(userDocRef);
    return userDocSnap.exists();
  } catch (error) {
    console.error("Error checking user profile existence:", error);
    return false;
  }
};

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
 * Sets up a real-time listener for users collection updates.
 * @param {Function} onUsersUpdate - Callback function that receives updated users array
 * @returns {Function} Unsubscribe function to stop listening
 */
export const subscribeToUsers = (onUsersUpdate) => {
  try {
    const usersCollection = collection(db, "users");
    
    const unsubscribe = onSnapshot(usersCollection, (snapshot) => {
      const users = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort users by creation date or last login (most recent first)
      users.sort((a, b) => {
        const dateA = a.lastLoginAt || a.createdAt || new Date(0);
        const dateB = b.lastLoginAt || b.createdAt || new Date(0);
        return new Date(dateB) - new Date(dateA);
      });
      
      onUsersUpdate(users);
    }, (error) => {
      console.error("Error in users real-time listener:", error);
      // Optionally call error handler
      onUsersUpdate(null, error);
    });

    return unsubscribe;
  } catch (error) {
    console.error("Error setting up users listener:", error);
    throw new Error("Failed to set up real-time listener: " + error.message);
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
 * Deletes a user directly from Firestore (superadmin only).
 * Note: This only deletes the Firestore profile, NOT the Firebase Auth account.
 * @param {string} userId - The user ID to delete.
 * @param {Object} adminInfo - Current admin information for role checking and logging.
 * @returns {Promise<void>}
 */
export const deleteUser = async (userId, adminInfo = null) => {
  try {
    // Check if admin has superadmin role
    if (!adminInfo || adminInfo.role !== 'superadmin') {
      throw new Error('Access denied. Only super administrators can delete users.');
    }

    // Get user data before deletion for activity logging
    const userDocRef = doc(db, "users", userId);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      throw new Error("User not found");
    }

    const userData = userDocSnap.data();
    const userName = userData.firstName && userData.lastName
      ? `${userData.firstName} ${userData.lastName}`
      : userData.name || userData.displayName || 'Unknown User';
    const userEmail = userData.email || 'No email';

    // Delete the user document from Firestore
    await deleteDoc(userDocRef);

    // Log the deletion activity
    const cleanUserData = {};
    if (userData.firstName !== undefined) cleanUserData.firstName = userData.firstName;
    if (userData.lastName !== undefined) cleanUserData.lastName = userData.lastName;
    if (userData.name !== undefined) cleanUserData.name = userData.name;
    if (userData.displayName !== undefined) cleanUserData.displayName = userData.displayName;
    if (userData.email !== undefined) cleanUserData.email = userData.email;
    if (userData.createdAt !== undefined) cleanUserData.createdAt = userData.createdAt;
    if (userData.lastLoginAt !== undefined) cleanUserData.lastLoginAt = userData.lastLoginAt;
    if (userData.emailVerified !== undefined) cleanUserData.emailVerified = userData.emailVerified;
    if (userData.idVerificationStatus !== undefined) cleanUserData.idVerificationStatus = userData.idVerificationStatus;

    const logMessage = `Deleted user profile: ${userName} (${userEmail}) - Profile deleted from Firestore (Auth account remains)`;

    await logActivity(
      ACTIVITY_TYPES.USER_DELETE,
      logMessage,
      {
        deletedUserId: userId,
        deletedUserName: userName,
        deletedUserEmail: userEmail,
        deletedUserData: cleanUserData,
        adminName: adminInfo?.name || 'Unknown Admin',
        adminEmail: adminInfo?.email || 'Unknown Email',
        authDeleted: false,
        deletionType: 'profile-only',
        deletionMethod: 'client-side',
        note: 'Firebase Auth account was not deleted (requires Admin SDK)',
        deletedAt: new Date().toISOString()
      }
    );

    return {
      success: true,
      authDeleted: false,
      message: 'User profile deleted successfully. Note: Firebase Auth account still exists.',
      details: 'User can no longer access the app as their profile was deleted.'
    };

  } catch (error) {
    console.error("Error deleting user:", error);
    throw new Error("Failed to delete user: " + error.message);
  }
};

/**
 * Deletes multiple users in bulk (superadmin only).
 * @param {Set<string>} userIds - Set of user IDs to delete.
 * @param {Object} adminInfo - Current admin information for role checking and logging.
 * @returns {Promise<Object>} Object containing success/fail counts and errors.
 */
export const bulkDeleteUsers = async (userIds, adminInfo = null) => {
  // Check if admin has superadmin role
  if (!adminInfo || adminInfo.role !== 'superadmin') {
    throw new Error('Access denied. Only super administrators can delete users.');
  }

  if (!userIds || userIds.size === 0) {
    throw new Error('No users selected for deletion.');
  }

  let successCount = 0;
  let failCount = 0;
  const errors = [];

  for (const userId of userIds) {
    try {
      await deleteUser(userId, adminInfo);
      successCount++;
    } catch (error) {
      failCount++;
      errors.push({ userId, error: error.message });
      console.error(`Failed to delete user ${userId}:`, error);
    }
  }

  return {
    successCount,
    failCount,
    errors,
    totalAttempted: userIds.size
  };
};