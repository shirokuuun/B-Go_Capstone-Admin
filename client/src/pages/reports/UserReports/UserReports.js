import { fetchUsers } from "../../verification/IDVerification.js";

/**
 * Fetches all users for user reports
 * @returns {Promise<Array>} Array of user objects
 */
export const fetchUsersForReports = async () => {
  try {
    const users = await fetchUsers();
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
    idVerificationStatus: user.idVerificationStatus || 'pending',
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
  // Debug: log users data to see what fields are available
  console.log('Users data for stats:', users.slice(0, 2));
  
  const stats = {
    total: users.length,
    emailVerified: users.filter(user => {
      const isVerified = user.emailVerified === true || user.isEmailVerified === true;
      // Debug: log verification status
      if (isVerified) {
        console.log('Verified user found:', user.email, 'emailVerified:', user.emailVerified, 'isEmailVerified:', user.isEmailVerified);
      }
      return isVerified;
    }).length,
    idVerified: users.filter(user => user.idVerificationStatus === 'verified').length,
    recentUsers: users.filter(user => {
      if (!user.createdAt) return false;
      const createdDate = new Date(user.createdAt.seconds * 1000);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return createdDate > thirtyDaysAgo;
    }).length
  };

  console.log('Email verification stats:', stats.emailVerified, 'out of', stats.total);

  stats.emailVerificationRate = stats.total > 0 ? ((stats.emailVerified / stats.total) * 100).toFixed(1) : 0;
  stats.idVerificationRate = stats.total > 0 ? ((stats.idVerified / stats.total) * 100).toFixed(1) : 0;

  return stats;
};