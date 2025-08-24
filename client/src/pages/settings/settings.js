import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db } from '/src/firebase/firebase.js';
import { getCurrentAdminData } from '/src/pages/auth/authService.js';

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
    
    return 'Password updated successfully';
  } catch (error) {
    console.error('Error changing password:', error);
    
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
    
    return {
      message: 'Profile picture updated successfully',
      imageUrl: downloadURL
    };
  } catch (error) {
    console.error('Error uploading profile image:', error);
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

    // Update Firestore document
    const userDocRef = doc(db, 'Admin', auth.currentUser.uid);
    await updateDoc(userDocRef, {
      name: newUsername.trim(),
      updatedAt: new Date()
    });
    
    return 'Username updated successfully';
  } catch (error) {
    console.error('Error updating username:', error);
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