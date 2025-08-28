import { collection, getDocs, doc, deleteDoc, getDoc } from "firebase/firestore";
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, deleteUser as deleteAuthUser } from 'firebase/auth';
import { db } from "/src/firebase/firebase.js";
import { logActivity, ACTIVITY_TYPES } from '/src/pages/settings/auditService.js';

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

    // Attempt to delete from Firebase Auth if email exists
    let authDeletionSuccess = false;
    let authDeletionError = null;
    
    if (userData.email) {
      try {
        console.log(`Attempting to delete auth user: ${userData.email}`);
        
        // For regular users, we'll need to prompt for their password since we don't store it
        // This is more secure than storing passwords like conductors do
        const userPassword = prompt(
          `To complete the deletion of ${userName}, please enter their password:\n\n` +
          `This is required to delete their login account from Firebase Authentication.\n` +
          `If you don't know the password, only the user profile will be deleted (not the login account).`
        );
        
        if (userPassword && userPassword.trim()) {
          // Create separate Firebase app instance for deletion
          const firebaseConfig = {
            apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDjqLNklma1gr3IOwPxiMO5S38hu8UQ2Fc",
            authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "it-capstone-6fe19.firebaseapp.com",
            projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "it-capstone-6fe19",
            storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "it-capstone-6fe19.firebasestorage.app",
            messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "183068104612",
            appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:183068104612:web:26109c8ebb28585e265331",
            measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-0MW2KZMGR2"
          };

          const tempApp = initializeApp(firebaseConfig, 'user-deletion-' + Date.now());
          const tempAuth = getAuth(tempApp);

          console.log('Signing in as user to delete account...');
          const userCredential = await signInWithEmailAndPassword(tempAuth, userData.email, userPassword.trim());
          
          console.log('User signed in successfully, deleting auth account...');
          await deleteAuthUser(userCredential.user);
          
          authDeletionSuccess = true;
          console.log(`Successfully deleted auth user: ${userData.email}`);

          // Clean up temporary app
          try {
            await tempApp.delete();
          } catch (cleanupError) {
            // Silent cleanup
          }
        } else {
          console.log('No password provided - skipping auth deletion');
        }
      } catch (authError) {
        authDeletionError = authError;
        console.error('Could not delete auth user:', authError);
        
        // Handle specific error types
        if (authError.code === 'auth/user-not-found') {
          console.log('Auth user not found - may already be deleted');
          authDeletionSuccess = true;
          authDeletionError = null;
        } else if (authError.code === 'auth/wrong-password') {
          console.error('Wrong password provided for user deletion');
        } else if (authError.code === 'auth/too-many-requests') {
          console.error('Too many requests - try again later');
        }
      }
    }

    // Log the deletion activity BEFORE actually deleting (in case deletion affects auth)
    console.log('Logging user deletion activity...', {
      activityType: ACTIVITY_TYPES.USER_DELETE,
      userName: userName,
      userEmail: userEmail,
      adminInfo: adminInfo
    });
    
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
    const logMessage = authDeletionSuccess 
      ? `Deleted user: ${userName} (${userEmail}) - Complete deletion (profile + login account)`
      : `Deleted user: ${userName} (${userEmail}) - Profile only (login account not deleted)`;

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
    
    console.log('User deletion activity logged successfully');

    // Now delete the user document
    await deleteDoc(userDocRef);
    console.log('User document deleted successfully');

    // Return success with auth deletion status
    return {
      success: true,
      authDeleted: authDeletionSuccess,
      authError: authDeletionError,
      message: authDeletionSuccess 
        ? 'User and login account deleted completely' 
        : 'User profile deleted (login account not deleted)',
      details: authDeletionSuccess 
        ? 'Both the user profile and Firebase Authentication account have been removed.'
        : authDeletionError?.code === 'auth/wrong-password' 
          ? 'User profile deleted, but login account remains (wrong password provided).'
          : 'User profile deleted, but login account remains (password not provided or auth error).'
    };

  } catch (error) {
    console.error("Error deleting user:", error);
    throw new Error("Failed to delete user: " + error.message);
  }
};