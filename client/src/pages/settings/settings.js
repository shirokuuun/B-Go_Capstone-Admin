import { updatePassword, EmailAuthProvider, reauthenticateWithCredential, deleteUser } from 'firebase/auth';
import { doc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { auth, db } from '/src/firebase/firebase.js';
import { getCurrentAdminData, isSuperAdmin } from '/src/pages/auth/authService.js';
import { logActivity, logSystemError, ACTIVITY_TYPES } from './auditService.js';

/**
 * Fetches the current user's admin data from Firestore
 * @returns {Promise<Object|null>} The admin data or null if not found
 */
export const fetchCurrentUserData = async () => {
  try {
    if (!auth.currentUser) {
      throw new Error('No authenticated user found');
    }
    
    const adminData = await getCurrentAdminData(auth.currentUser.uid);
    return adminData;
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw error;
  }
};

/**
 * Changes the current user's password with re-authentication
 * @param {string} currentPassword - The current password for re-authentication
 * @param {string} newPassword - The new password
 * @param {string} confirmPassword - Password confirmation
 * @returns {Promise<string>} Success message
 * @throws {Error} If passwords don't match or other validation fails
 */
export const changeUserPassword = async (currentPassword, newPassword, confirmPassword) => {
  try {
    if (!auth.currentUser) {
      throw new Error('No authenticated user found');
    }

    if (!currentPassword) {
      throw new Error('Current password is required');
    }

    if (newPassword !== confirmPassword) {
      throw new Error('New passwords do not match');
    }

    if (newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters');
    }

    if (currentPassword === newPassword) {
      throw new Error('New password must be different from current password');
    }

    // Re-authenticate the user with their current password
    const credential = EmailAuthProvider.credential(
      auth.currentUser.email,
      currentPassword
    );
    
    await reauthenticateWithCredential(auth.currentUser, credential);
    
    // Now update the password
    await updatePassword(auth.currentUser, newPassword);
    
    // Log the password change activity
    await logActivity(
      ACTIVITY_TYPES.PASSWORD_CHANGE,
      'User successfully changed their password',
      { userId: auth.currentUser.uid }
    );
    
    return 'Password updated successfully';
  } catch (error) {
    console.error('Error changing password:', error);
    
    // Log the error
    await logSystemError(error, 'Password Change', { 
      userId: auth.currentUser?.uid,
      attemptedAction: 'changePassword' 
    });
    
    // Provide more user-friendly error messages
    if (error.code === 'auth/wrong-password') {
      throw new Error('Current password is incorrect');
    } else if (error.code === 'auth/weak-password') {
      throw new Error('New password is too weak');
    } else if (error.code === 'auth/requires-recent-login') {
      throw new Error('Please log out and log back in before changing your password');
    }
    
    throw error;
  }
};

/**
 * Uploads a profile image to Firebase Storage and updates user document
 * @param {File} imageFile - The image file to upload
 * @returns {Promise<Object>} Object containing success message and image URL
 * @throws {Error} If upload fails
 */
export const uploadProfileImage = async (imageFile) => {
  try {
    if (!auth.currentUser) {
      throw new Error('No authenticated user found');
    }

    if (!imageFile) {
      throw new Error('No image file provided');
    }

    // Validate file type
    if (!imageFile.type.startsWith('image/')) {
      throw new Error('Please select a valid image file');
    }

    // Validate file size (5MB limit)
    if (imageFile.size > 5 * 1024 * 1024) {
      throw new Error('Image size must be less than 5MB');
    }

    const storage = getStorage();
    const imageRef = ref(storage, `profileImages/${auth.currentUser.uid}`);
    
    // Upload the image
    await uploadBytes(imageRef, imageFile);
    const downloadURL = await getDownloadURL(imageRef);
    
    // Update Firestore document
    const userDocRef = doc(db, 'Admin', auth.currentUser.uid);
    await updateDoc(userDocRef, {
      profileImageUrl: downloadURL,
      updatedAt: new Date()
    });
    
    // Log the profile update activity
    await logActivity(
      ACTIVITY_TYPES.PROFILE_UPDATE,
      'User uploaded a new profile picture',
      { 
        userId: auth.currentUser.uid,
        imageUrl: downloadURL,
        fileSize: imageFile.size,
        fileType: imageFile.type
      }
    );
    
    return {
      message: 'Profile picture updated successfully',
      imageUrl: downloadURL
    };
  } catch (error) {
    console.error('Error uploading profile image:', error);
    
    // Log the error
    await logSystemError(error, 'Profile Image Upload', { 
      userId: auth.currentUser?.uid,
      fileSize: imageFile?.size,
      fileType: imageFile?.type,
      attemptedAction: 'uploadProfileImage' 
    });
    
    throw error;
  }
};

/**
 * Creates a preview URL for an image file
 * @param {File} file - The image file
 * @returns {Promise<string>} The preview URL
 */
export const createImagePreview = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'));
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

/**
 * Validates if a file is a valid image
 * @param {File} file - The file to validate
 * @returns {boolean} True if valid image file
 */
export const isValidImageFile = (file) => {
  if (!file) return false;
  
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  return validTypes.includes(file.type) && file.size <= 5 * 1024 * 1024; // 5MB limit
};

/**
 * Fetches all admin users (admin and superadmin roles only)
 * @returns {Promise<Array>} Array of admin user objects
 */
export const fetchAllAdminUsers = async () => {
  try {
    const adminCollection = collection(db, 'Admin');
    const adminSnapshot = await getDocs(adminCollection);
    
    const adminUsers = [];
    adminSnapshot.forEach((doc) => {
      const data = doc.data();
      // Only include admin and superadmin users
      if (data.role === 'admin' || data.role === 'superadmin') {
        adminUsers.push({
          id: doc.id,
          ...data
        });
      }
    });
    
    return adminUsers;
  } catch (error) {
    console.error('Error fetching admin users:', error);
    throw error;
  }
};

/**
 * Subscribes to real-time admin users updates
 * @param {Function} callback - Function to handle admin users data
 * @param {Function} errorCallback - Function to handle errors
 * @returns {Function} Unsubscribe function
 */
export const subscribeToAdminUsers = (callback, errorCallback) => {
  try {
    const adminCollection = collection(db, 'Admin');
    const q = query(adminCollection, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const adminUsers = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Only include admin and superadmin users
        if (data.role === 'admin' || data.role === 'superadmin') {
          adminUsers.push({
            id: doc.id,
            ...data
          });
        }
      });
      callback(adminUsers);
    }, (error) => {
      console.error('Error in admin users subscription:', error);
      errorCallback(error.message);
    });

    return unsubscribe;
  } catch (error) {
    console.error('Error setting up admin users subscription:', error);
    errorCallback(error.message);
  }
};

/**
 * Deletes an admin user account (superadmin only)
 * @param {string} userId - The user ID to delete
 * @param {string} userEmail - The user email (for logging)
 * @param {string} userName - The user name (for logging)
 * @returns {Promise<string>} Success message
 * @throws {Error} If deletion fails or user is not superadmin
 */
export const deleteAdminUser = async (userId, userEmail, userName) => {
  try {
    if (!auth.currentUser) {
      throw new Error('No authenticated user found');
    }

    // Verify current user is superadmin
    const currentUserData = await getCurrentAdminData(auth.currentUser.uid);
    if (currentUserData?.role !== 'superadmin') {
      throw new Error('Only superadmin users can delete admin accounts');
    }

    // Prevent self-deletion
    if (userId === auth.currentUser.uid) {
      throw new Error('You cannot delete your own account');
    }

    // Get the user data before deletion for logging
    const userToDelete = await getCurrentAdminData(userId);
    if (!userToDelete) {
      throw new Error('Admin user not found');
    }

    // Delete from Firestore first
    const userDocRef = doc(db, 'Admin', userId);
    await deleteDoc(userDocRef);

    // Try to delete from Authentication (this might fail due to permissions)
    try {
      // This would require Firebase Admin SDK on the backend
      // For now, we'll use the API endpoint if available
      const response = await fetch(`/api/users/delete/${userId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await auth.currentUser.getIdToken()}`
        }
      });

      if (!response.ok) {
        console.warn('Failed to delete from Authentication, but Firestore deletion succeeded');
      }
    } catch (authError) {
      console.warn('Authentication deletion failed:', authError);
      // Continue - Firestore deletion was successful
    }

    // Log the deletion activity
    await logActivity(
      ACTIVITY_TYPES.USER_DELETE,
      `Superadmin deleted admin user: ${userName} (${userEmail})`,
      { 
        deletedUserId: userId,
        deletedUserEmail: userEmail,
        deletedUserName: userName,
        deletedUserRole: userToDelete.role
      },
      'warning'
    );

    return 'Admin user deleted successfully';
  } catch (error) {
    console.error('Error deleting admin user:', error);
    
    // Log the error
    await logSystemError(error, 'Admin User Deletion', { 
      userId,
      userEmail,
      userName,
      currentUserId: auth.currentUser?.uid,
      attemptedAction: 'deleteAdminUser' 
    });
    
    throw error;
  }
};

/**
 * Updates the current user's username in Firestore
 * @param {string} newUsername - The new username
 * @returns {Promise<string>} Success message
 * @throws {Error} If update fails
 */
export const updateUsername = async (newUsername) => {
  try {
    if (!auth.currentUser) {
      throw new Error('No authenticated user found');
    }

    if (!newUsername || newUsername.trim().length === 0) {
      throw new Error('Username cannot be empty');
    }

    if (newUsername.trim().length < 2) {
      throw new Error('Username must be at least 2 characters long');
    }

    if (newUsername.trim().length > 50) {
      throw new Error('Username must be less than 50 characters');
    }

    const oldUserData = await getCurrentAdminData(auth.currentUser.uid);
    const oldUsername = oldUserData?.name;
    
    // Update Firestore document
    const userDocRef = doc(db, 'Admin', auth.currentUser.uid);
    await updateDoc(userDocRef, {
      name: newUsername.trim(),
      updatedAt: new Date()
    });
    
    // Log the username update activity
    await logActivity(
      ACTIVITY_TYPES.PROFILE_UPDATE,
      `User updated username from "${oldUsername}" to "${newUsername.trim()}"`,
      { 
        userId: auth.currentUser.uid,
        oldUsername,
        newUsername: newUsername.trim()
      }
    );
    
    return 'Username updated successfully';
  } catch (error) {
    console.error('Error updating username:', error);
    
    // Log the error
    await logSystemError(error, 'Username Update', { 
      userId: auth.currentUser?.uid,
      attemptedUsername: newUsername,
      attemptedAction: 'updateUsername' 
    });
    
    throw error;
  }
};

/**
 * Deletes the current user's account (only for superadmin)
 * @param {string} currentPassword - The current password for re-authentication
 * @returns {Promise<string>} Success message
 * @throws {Error} If deletion fails or user is not superadmin
 */
export const deleteCurrentAccount = async (currentPassword) => {
  try {
    if (!auth.currentUser) {
      throw new Error('No authenticated user found');
    }

    // Check if current user is superadmin
    const isCurrentUserSuperAdmin = await isSuperAdmin(auth.currentUser.uid);
    if (!isCurrentUserSuperAdmin) {
      throw new Error('Only superadmin users can delete accounts');
    }

    if (!currentPassword) {
      throw new Error('Current password is required for account deletion');
    }

    // Get user data before deletion for logging
    const userData = await getCurrentAdminData(auth.currentUser.uid);

    // Re-authenticate the user with their current password
    const credential = EmailAuthProvider.credential(
      auth.currentUser.email,
      currentPassword
    );
    
    await reauthenticateWithCredential(auth.currentUser, credential);
    
    // Log the account deletion activity before deleting
    await logActivity(
      ACTIVITY_TYPES.USER_DELETE,
      `Superadmin deleted their own account: ${userData?.email}`,
      { 
        deletedUserId: auth.currentUser.uid,
        deletedUserEmail: userData?.email,
        deletedUserRole: userData?.role,
        deletionType: 'self_deletion'
      }
    );

    // Delete profile image if it exists
    if (userData?.profileImageUrl) {
      try {
        const storage = getStorage();
        const imageRef = ref(storage, `profileImages/${auth.currentUser.uid}`);
        await deleteObject(imageRef);
      } catch (imageError) {
        console.warn('Failed to delete profile image:', imageError);
        // Continue with account deletion even if image deletion fails
      }
    }

    // Delete Firestore document
    const userDocRef = doc(db, 'Admin', auth.currentUser.uid);
    await deleteDoc(userDocRef);
    
    // Delete the Firebase Auth user
    await deleteUser(auth.currentUser);
    
    return 'Account deleted successfully';
  } catch (error) {
    console.error('Error deleting account:', error);
    
    // Log the error
    await logSystemError(error, 'Account Deletion', { 
      userId: auth.currentUser?.uid,
      attemptedAction: 'deleteAccount' 
    });
    
    // Provide more user-friendly error messages
    if (error.code === 'auth/wrong-password') {
      throw new Error('Current password is incorrect');
    } else if (error.code === 'auth/requires-recent-login') {
      throw new Error('Please log out and log back in before deleting your account');
    }
    
    throw error;
  }
};

/**
 * Gets the display name for user role
 * @param {Object} userData - The user data object
 * @returns {string} Display name for the role
 */
export const getRoleDisplayName = (userData) => {
  if (!userData) return 'Unknown';
  
  if (userData.role === 'superadmin' && userData.isSuperAdmin === true) {
    return 'Super Administrator';
  } else if (userData.role === 'admin') {
    return 'Administrator';
  }
  
  return userData.role || 'Unknown';
};