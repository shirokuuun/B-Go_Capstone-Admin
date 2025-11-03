import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc } from "firebase/firestore";
import { auth, db, secondaryAuth } from "/src/firebase/firebase.js";
import { logActivity, ACTIVITY_TYPES } from "/src/pages/settings/auditService.js";

/**
 * Finds and reactivates a deleted admin account for re-registration
 * @param {string} email - The email to search for in deleted accounts
 * @param {string} name - New name for the reactivated account
 * @returns {Promise<Object|null>} The reactivated user data or null if not found
 */
const reactivateDeletedAdmin = async (email, name) => {
  try {
    // Search for deleted admin with this original email
    const adminRef = collection(db, 'Admin');
    const deletedQuery = query(
      adminRef, 
      where('originalEmail', '==', email), 
      where('status', '==', 'deleted')
    );
    const deletedSnapshot = await getDocs(deletedQuery);
    
    if (deletedSnapshot.empty) {
      return null;
    }
    
    // Get the first deleted admin document
    const deletedDoc = deletedSnapshot.docs[0];
    const deletedData = deletedDoc.data();
    const adminDocId = deletedDoc.id;

    // Regular admin permissions (NO delete permissions)
    const regularAdminPermissions = [
      'read_all_users',
      'write_all_users',
      'manage_buses', 
      'manage_conductors',
      'view_all_reservations',
      'manage_system_settings',
      'view_analytics',
      'manage_trips',
      'update_booking_status',
      'view_payments',
      'manage_notifications'
    ];
    
    // Reactivate the admin account by updating the document
    const reactivatedData = {
      uid: deletedData.uid, // Keep the original UID
      name: name, // Use new name provided during signup
      email: email, // Restore original email
      // role field omitted until verified by superadmin
      isSuperAdmin: false,
      permissions: regularAdminPermissions,
      isActive: true,
      isVerified: false, // NEW: Require re-verification
      verificationStatus: "pending", // NEW: pending, verified, rejected
      status: "active", // Change from "deleted" to "active"
      createdAt: deletedData.createdAt || new Date(), // Preserve original creation date
      reactivatedAt: new Date(), // Mark when it was reactivated
      reactivatedBy: "system", // Track who reactivated
      // Remove deleted fields
      deletedAt: null,
      deletedBy: null,
      deletedByEmail: null,
      originalEmail: null,
      originalName: null,
      originalRole: null
    };
    
    // Update the existing document
    await updateDoc(doc(db, 'Admin', adminDocId), reactivatedData);
    
    // Log the reactivation
    await logActivity(
      ACTIVITY_TYPES.USER_CREATE,
      `Reactivated deleted admin account during signup: ${email}`,
      { 
        reactivatedEmail: email,
        reactivatedName: name,
        originalUID: deletedData.uid,
        adminDocId: adminDocId,
        action: 'account_reactivation'
      }
    );

    return {
      uid: deletedData.uid,
      email: email,
      displayName: name,
      reactivated: true
    };
    
  } catch (error) {
    console.error('Error reactivating deleted admin:', error);
    return null;
  }
};

/**
 * Signs up an admin user and stores additional data in Firestore.
 * Uses a secondary auth instance to avoid logging out the current user.
 * @param {Object} data - The user data.
 * @param {string} data.name
 * @param {string} data.email
 * @param {string} data.password
 * @param {string} data.role - The role to assign ('admin' or 'superadmin')
 * @returns {Promise<Object>} The created Firebase user.
 */
export const signupAdmin = async ({ name, email, password, role = 'admin' }) => {
  // Get current user info before creating a new one
  const currentUser = auth.currentUser;
  const currentUserUid = currentUser?.uid;

  try {
    // Create the new admin user using secondary auth instance
    // This prevents logging out the current user
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const user = userCredential.user;

    // Regular admin permissions (NO delete permissions)
    const regularAdminPermissions = [
      'read_all_users',
      'write_all_users',
      // NO 'delete_all_users' - only superadmin can delete
      'manage_buses',
      'manage_routes',
      'manage_conductors',
      // NO 'delete_conductors' - only superadmin can delete
      'view_all_reservations',
      // NO 'delete_reservations' - only superadmin can delete
      'manage_system_settings',
      'view_analytics',
      'manage_trips',
      'scan_tickets', // Can help with conductor tasks
      'update_booking_status',
      'view_payments',
      'manage_notifications'
      // NO 'manage_admins' - only superadmin can manage other admins
      // NO 'delete_any_data' - only superadmin can delete
      // NO 'system_override' - only superadmin has override powers
    ];

    // Determine if this should be a superadmin
    const isSuperAdminRole = role === 'superadmin';

    await setDoc(doc(db, "Admin", user.uid), {
      uid: user.uid,
      name,
      email,
      role: role, // Set role directly based on input
      isSuperAdmin: isSuperAdminRole,
      permissions: regularAdminPermissions,
      isActive: true,
      isVerified: true, // No verification needed when created by superadmin
      verificationStatus: "verified",
      createdAt: new Date(),
      createdBy: currentUserUid || "system",
      verifiedAt: new Date(),
      verifiedBy: currentUserUid || "system"
    });

    // Sign out the newly created user from the secondary auth instance
    await signOut(secondaryAuth);

    return user;
  } catch (error) {
    // Handle the specific case of email already in use
    if (error.code === 'auth/email-already-in-use') {
      // Try to reactivate a deleted admin account
      const reactivatedUser = await reactivateDeletedAdmin(email, name);

      if (reactivatedUser) {
        // Successfully reactivated! Return the user object
        return reactivatedUser;
      }

      // No deleted account found, throw helpful error
      throw new Error(
        'This email is already registered in Firebase Authentication. ' +
        'No deleted admin account was found to reactivate. ' +
        'Please use a different email address or contact an administrator to resolve this manually.'
      );
    }

    // Re-throw the original error for other cases
    throw error;
  }
};

/**
 * Logs in an admin user and checks their role from Firestore.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object>} The logged-in Firebase user if role is 'admin' or 'superadmin'.
 * @throws {Error} If the user is not an admin/superadmin or not found.
 */
export const loginAdmin = async (email, password) => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  const userDocRef = doc(db, "Admin", user.uid);
  const userDocSnap = await getDoc(userDocRef);

  if (userDocSnap.exists()) {
    const userData = userDocSnap.data();
    
    // Check if account is deleted
    if (userData.status === 'deleted') {
      await signOut(auth);
      throw new Error("This account has been deleted and is no longer accessible.");
    }
    
    // Check if account is verified (NEW)
    // Skip verification check for superadmins or accounts without verification fields (backwards compatibility)
    const isExistingSuperadmin = userData.role === 'superadmin' && userData.isSuperAdmin === true;
    const isNewUser = userData.hasOwnProperty('isVerified') || userData.hasOwnProperty('verificationStatus');
    
    if (!isExistingSuperadmin && isNewUser) {
      if (userData.isVerified === false || userData.verificationStatus === 'pending') {
        await signOut(auth);
        throw new Error("Your account is pending verification by a superadmin. Please wait for approval before logging in.");
      }
      
      if (userData.verificationStatus === 'rejected') {
        await signOut(auth);
        throw new Error("Your account has been rejected by a superadmin. Please contact support for assistance.");
      }
    }
    
    // Now accepts both 'admin' and 'superadmin' roles
    if (userData.role === "admin" || userData.role === "superadmin") {
      // Optional: Add role info to the returned user object
      user.adminRole = userData.role;
      user.isSuperAdmin = userData.isSuperAdmin || false;
      user.permissions = userData.permissions || [];
      user.isVerified = userData.isVerified || false;
      user.verificationStatus = userData.verificationStatus || 'pending';
      
      // Log successful login activity
      await logActivity(
        ACTIVITY_TYPES.LOGIN,
        `User logged in successfully`,
        { 
          loginMethod: 'email_password',
          userRole: userData.role,
          isSuperAdmin: userData.isSuperAdmin || false,
          verificationStatus: userData.verificationStatus || 'pending'
        }
      );
      
      return user;
    } else {
      await signOut(auth);
      throw new Error(`Access denied. This account has role '${userData.role}' but requires 'admin' or 'superadmin'.`);
    }
  } else {
    await signOut(auth);
    throw new Error("Admin account not found.");
  }
};

/**
 * Gets the current user's admin data from Firestore
 * @param {string} uid - The user's UID
 * @returns {Promise<Object|null>} The admin data or null if not found
 */
export const getCurrentAdminData = async (uid) => {
  try {
    const userDocRef = doc(db, "Admin", uid);
    const userDocSnap = await getDoc(userDocRef);
    
    if (userDocSnap.exists()) {
      return userDocSnap.data();
    }
    return null;
  } catch (error) {
    console.error("Error getting admin data:", error);
    return null;
  }
};

/**
 * Checks if the current user is a superadmin
 * @param {string} uid - The user's UID
 * @returns {Promise<boolean>} True if user is superadmin
 */
export const isSuperAdmin = async (uid) => {
  try {
    const adminData = await getCurrentAdminData(uid);
    return adminData?.role === "superadmin" && adminData?.isSuperAdmin === true;
  } catch (error) {
    console.error("Error checking superadmin status:", error);
    return false;
  }
};

/**
 * Checks if the current user has a specific permission
 * @param {string} uid - The user's UID
 * @param {string} permission - The permission to check
 * @returns {Promise<boolean>} True if user has the permission
 */
export const hasPermission = async (uid, permission) => {
  try {
    const adminData = await getCurrentAdminData(uid);
    if (!adminData) return false;
    
    // Superadmin has all permissions
    if (adminData.role === "superadmin" && adminData.isSuperAdmin === true) {
      return true;
    }
    
    // Check if regular admin has the specific permission
    return adminData.permissions && adminData.permissions.includes(permission);
  } catch (error) {
    console.error("Error checking permission:", error);
    return false;
  }
};

/**
 * Checks multiple permissions at once
 * @param {string} uid - The user's UID
 * @param {string[]} permissions - Array of permissions to check
 * @returns {Promise<Object>} Object with permission name as key and boolean as value
 */
export const hasPermissions = async (uid, permissions) => {
  const results = {};
  
  for (const permission of permissions) {
    results[permission] = await hasPermission(uid, permission);
  }
  
  return results;
};

/**
 * Gets user's role and key permissions for UI display
 * @param {string} uid - The user's UID
 * @returns {Promise<Object>} Object with role info and key permissions
 */
export const getUserPermissionSummary = async (uid) => {
  try {
    const adminData = await getCurrentAdminData(uid);
    if (!adminData) return null;
    
    const isSuperAdminUser = adminData.role === "superadmin" && adminData.isSuperAdmin === true;
    
    return {
      role: adminData.role,
      isSuperAdmin: isSuperAdminUser,
      displayName: isSuperAdminUser ? "Super Administrator" : "Administrator",
      canDelete: isSuperAdminUser,
      canManageAdmins: isSuperAdminUser,
      permissions: adminData.permissions || [],
      permissionCount: adminData.permissions ? adminData.permissions.length : 0
    };
  } catch (error) {
    console.error("Error getting permission summary:", error);
    return null;
  }
};

/**
 * Verifies an admin user (superadmin only)
 * @param {string} userId - The UID of the user to verify
 * @param {string} newRole - The role to assign ('admin' or 'superadmin')
 * @returns {Promise<Object>} Success result
 */
export const verifyAdminUser = async (userId, newRole = 'admin') => {
  try {
    const userDocRef = doc(db, "Admin", userId);
    const userDocSnap = await getDoc(userDocRef);
    
    if (!userDocSnap.exists()) {
      throw new Error("User not found");
    }
    
    const userData = userDocSnap.data();
    
    // Prepare update data
    const updateData = {
      isVerified: true,
      verificationStatus: 'verified',
      verifiedAt: new Date(),
      verifiedBy: auth.currentUser?.uid || 'system'
    };
    
    // Update role if specified
    if (newRole === 'superadmin') {
      updateData.role = 'superadmin';
      updateData.isSuperAdmin = true;
      // Superadmin gets all permissions (will be checked dynamically)
    } else {
      updateData.role = 'admin';
      updateData.isSuperAdmin = false;
      // Keep existing admin permissions
    }
    
    await updateDoc(userDocRef, updateData);
    
    // Log the verification activity
    await logActivity(
      ACTIVITY_TYPES.USER_UPDATE,
      `Admin user verified and role set to ${newRole}`,
      { 
        verifiedUserId: userId,
        verifiedUserEmail: userData.email,
        verifiedUserName: userData.name,
        newRole: newRole,
        action: 'account_verification'
      }
    );
    
    return {
      success: true,
      message: `User ${userData.name || userData.email} has been verified and assigned ${newRole} role.`
    };
    
  } catch (error) {
    console.error('Error verifying user:', error);
    throw error;
  }
};

/**
 * Rejects an admin user verification (superadmin only)
 * @param {string} userId - The UID of the user to reject
 * @param {string} reason - Optional reason for rejection
 * @returns {Promise<Object>} Success result
 */
export const rejectAdminUser = async (userId, reason = '') => {
  try {
    const userDocRef = doc(db, "Admin", userId);
    const userDocSnap = await getDoc(userDocRef);
    
    if (!userDocSnap.exists()) {
      throw new Error("User not found");
    }
    
    const userData = userDocSnap.data();
    
    await updateDoc(userDocRef, {
      isVerified: false,
      verificationStatus: 'rejected',
      rejectedAt: new Date(),
      rejectedBy: auth.currentUser?.uid || 'system',
      rejectionReason: reason
    });
    
    // Log the rejection activity
    await logActivity(
      ACTIVITY_TYPES.USER_UPDATE,
      `Admin user verification rejected`,
      { 
        rejectedUserId: userId,
        rejectedUserEmail: userData.email,
        rejectedUserName: userData.name,
        rejectionReason: reason,
        action: 'account_rejection'
      }
    );
    
    return {
      success: true,
      message: `User ${userData.name || userData.email} verification has been rejected.`
    };
    
  } catch (error) {
    console.error('Error rejecting user:', error);
    throw error;
  }
};

/**
 * Logs out the current user from Firebase Authentication.
 * @returns {Promise<void>}
 */
export const logoutUser = async () => {
  // Log logout activity before signing out
  await logActivity(
    ACTIVITY_TYPES.LOGOUT,
    `User logged out`,
    { logoutMethod: 'manual' }
  );
  
  return signOut(auth);
};