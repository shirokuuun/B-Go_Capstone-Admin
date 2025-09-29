import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '/src/firebase/firebase.js';

/**
 * Fetches all users for user reports with proper ID verification status
 * @returns {Promise<Array>} Array of user objects
 */
export const fetchUsersForReports = async () => {
  try {
    const usersCollection = collection(db, 'users');
    const snapshot = await getDocs(usersCollection);

    const users = [];

    for (const userDoc of snapshot.docs) {
      const userData = {
        id: userDoc.id,
        ...userDoc.data()
      };

      try {
        const idDocRef = doc(db, 'users', userDoc.id, 'VerifyID', 'id');
        const idSnapshot = await getDoc(idDocRef);

        if (idSnapshot.exists()) {
          // User has uploaded ID - use actual status
          const idData = idSnapshot.data();
          userData.idVerificationStatus = idData.status || 'pending';
          userData.verifiedAt = idData.verifiedAt;
          userData.verifiedBy = idData.verifiedBy;
          userData.hasUploadedID = true;
        } else {
          // User hasn't uploaded ID yet
          userData.idVerificationStatus = 'No ID Uploaded';
          userData.hasUploadedID = false;
        }
      } catch (error) {
        console.warn(`No ID verification data for user ${userDoc.id}`);
        userData.idVerificationStatus = 'No ID Uploaded';
        userData.hasUploadedID = false;
      }

      users.push(userData);
    }

    return users;
  } catch (error) {
    console.error("Error fetching users for reports:", error);
    throw new Error("Failed to fetch users for reports: " + error.message);
  }
};

/**
 * Formats user data for display in reports
 * @param {Object} user - User object
 * @returns {Object} Formatted user data
 */
export const formatUserForDisplay = (user) => {
  return {
    id: user.id,
    name: user.firstName && user.lastName 
      ? `${user.firstName} ${user.lastName}` 
      : user.name || user.displayName || 'N/A',
    email: user.email || 'N/A',
    phone: user.phone || 'N/A',
    authMethod: user.authMethod || 'N/A',
    createdAt: user.createdAt 
      ? new Date(user.createdAt.seconds * 1000).toLocaleDateString() 
      : 'N/A',
    emailVerified: (user.emailVerified || user.isEmailVerified) ? 'Yes' : 'No',
    idVerificationStatus: user.idVerificationStatus || 'No ID Uploaded',
    lastLoginAt: user.lastLoginAt 
      ? new Date(user.lastLoginAt.seconds * 1000).toLocaleDateString()
      : 'Never'
  };
};

/**
 * Gets user statistics for reports
 * @param {Array} users - Array of user objects
 * @returns {Object} User statistics
 */
export const getUserStats = (users) => {
  const stats = {
    total: users.length,
    emailVerified: users.filter(user => {
      const isVerified = user.emailVerified === true || user.isEmailVerified === true;
      return isVerified;
    }).length,
    idVerified: users.filter(user => user.idVerificationStatus === 'verified').length,
    idPending: users.filter(user => user.idVerificationStatus === 'pending').length,
    idRejected: users.filter(user => user.idVerificationStatus === 'rejected' || user.idVerificationStatus === 'revoked').length,
    noIdUploaded: users.filter(user => user.idVerificationStatus === 'No ID Uploaded').length,
    recentUsers: users.filter(user => {
      if (!user.createdAt) return false;
      const createdDate = new Date(user.createdAt.seconds * 1000);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return createdDate > thirtyDaysAgo;
    }).length
  };

  stats.emailVerificationRate = stats.total > 0 ? ((stats.emailVerified / stats.total) * 100).toFixed(1) : 0;
  stats.idVerificationRate = stats.total > 0 ? ((stats.idVerified / stats.total) * 100).toFixed(1) : 0;
  stats.idUploadRate = stats.total > 0 ? (((stats.total - stats.noIdUploaded) / stats.total) * 100).toFixed(1) : 0;

  return stats;
};