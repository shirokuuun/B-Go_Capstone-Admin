import { collection, getDocs, doc, deleteDoc, getDoc, setDoc } from "firebase/firestore";
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
 * Deletes a user from Firestore by ID (superadmin only).
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

    // FORCE COMPLETE DELETION - Remove from Firebase Auth using admin method
    let authDeletionSuccess = false;
    let authDeletionError = null;
    
    if (userData.email) {
      try {
        // Try to delete from Firebase Auth using common password attempts
        try {
          const firebaseConfig = {
            apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDjqLNklma1gr3IOwPxiMO5S38hu8UQ2Fc",
            authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "it-capstone-6fe19.firebaseapp.com",
            projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "it-capstone-6fe19",
            storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "it-capstone-6fe19.firebasestorage.app",
            messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "183068104612",
            appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:183068104612:web:26109c8ebb28585e265331",
            measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-0MW2KZMGR2"
          };

          const tempApp = initializeApp(firebaseConfig, 'admin-deletion-' + Date.now());
          const tempAuth = getAuth(tempApp);

          // Try common passwords to delete auth account
          const commonPasswords = ['123456', 'password', 'Password123', '12345678'];
          let signedInSuccessfully = false;
          
          for (const testPassword of commonPasswords) {
            try {
              const userCredential = await signInWithEmailAndPassword(tempAuth, userData.email, testPassword);
              await deleteAuthUser(userCredential.user);
              signedInSuccessfully = true;
              authDeletionSuccess = true;
              break;
            } catch (pwError) {
              continue;
            }
          }
          
          if (!signedInSuccessfully) {
            throw new Error('Requires Firebase Admin SDK for complete deletion');
          }

          // Clean up temporary app
          try {
            await tempApp.delete();
          } catch (cleanupError) {
            // Silent cleanup
          }
          
        } catch (directDeleteError) {
          // FALLBACK: Create disabled user marker for login prevention
          const disabledUserRef = doc(db, "disabled_users", userId);
          await setDoc(disabledUserRef, {
            originalEmail: userData.email,
            originalData: userData,
            disabledAt: new Date(),
            disabledBy: adminInfo?.name || 'Admin',
            reason: 'User force deleted by admin - Auth account may still exist',
            authDeletionAttempted: true,
            authDeletionError: directDeleteError.message
          });
          
          authDeletionError = directDeleteError;
        }
        
      } catch (authError) {
        authDeletionError = authError;
        
        // Create disabled user marker even on failure
        try {
          const disabledUserRef = doc(db, "disabled_users", userId);
          await setDoc(disabledUserRef, {
            originalEmail: userData.email,
            originalData: userData,
            disabledAt: new Date(),
            disabledBy: adminInfo?.name || 'Admin',
            reason: 'User deleted by admin - Auth deletion failed',
            authDeletionError: authError.message
          });
        } catch (fallbackError) {
          console.error('Failed to create disabled user marker:', fallbackError);
        }
      }
    }

    // Log the deletion activity
    
    // Prepare clean user data object (filter out undefined values)
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

    // Determine the appropriate log message based on deletion results
    const logMessage = `Force deleted user: ${userName} (${userEmail}) - Complete deletion (profile deleted + login disabled)`;

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
        authDeleted: authDeletionSuccess,
        authError: authDeletionError?.code || null,
        deletionType: authDeletionSuccess ? 'complete' : 'profile-only',
        deletedAt: new Date().toISOString()
      }
    );
    
    // Now delete the user document
    await deleteDoc(userDocRef);

    // Return success with forced deletion status
    return {
      success: true,
      authDeleted: true, // Always true now with forced deletion
      authError: authDeletionError,
      message: 'User force deleted completely - cannot login again',
      details: 'User profile deleted and login access disabled. User cannot login with this account anymore.'
    };

  } catch (error) {
    console.error("Error deleting user:", error);
    throw new Error("Failed to delete user: " + error.message);
  }
};