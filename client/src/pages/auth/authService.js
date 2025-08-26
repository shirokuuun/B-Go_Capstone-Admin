import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "/src/firebase/firebase.js";
import { logActivity, ACTIVITY_TYPES } from "/src/pages/settings/auditService.js";

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

  await setDoc(doc(db, "Admin", user.uid), {
    uid: user.uid,
    name,
    email,
    role: "admin", // Regular admin by default
    isSuperAdmin: false, // Explicitly not superadmin
    permissions: regularAdminPermissions, // ✅ NEW: Explicit permissions
    isActive: true,
    createdAt: new Date(),
    createdBy: "system", // Track who created this admin
  });


  return user;
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
    
    // ✅ FIXED: Now accepts both 'admin' and 'superadmin' roles
    if (userData.role === "admin" || userData.role === "superadmin") {
      // Optional: Add role info to the returned user object
      user.adminRole = userData.role;
      user.isSuperAdmin = userData.isSuperAdmin || false;
      user.permissions = userData.permissions || [];
      
      // Log successful login activity
      await logActivity(
        ACTIVITY_TYPES.LOGIN,
        `User logged in successfully`,
        { 
          loginMethod: 'email_password',
          userRole: userData.role,
          isSuperAdmin: userData.isSuperAdmin || false
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