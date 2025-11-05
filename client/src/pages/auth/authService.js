import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc } from "firebase/firestore";
import { auth, db, secondaryAuth } from "/src/firebase/firebase.js";
import { logActivity, ACTIVITY_TYPES } from "/src/pages/settings/auditService.js";

// Finds and reactivate a deleted admin account using pseudo delete
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

    // Regular admin permissions with no delete permissions
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
      uid: deletedData.uid,
      name: name,
      email: email,
      role: "admin",
      isSuperAdmin: false,
      permissions: regularAdminPermissions,
      isActive: true,
      isVerified: true,
      verificationStatus: "verified",
      status: "active",
      createdAt: deletedData.createdAt || new Date(), 
      reactivatedAt: new Date(), 
      reactivatedBy: "system", // Track who reactivated
      verifiedAt: new Date(),
      verifiedBy: "system",
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

// To signup a new admin/superadmin user
export const signupAdmin = async ({ name, email, password, role = 'admin' }) => {
  
  const currentUser = auth.currentUser;
  const currentUserUid = currentUser?.uid;

  try {
    // Create user in Firebase Auth using secondary auth instance to avoid logging out current user
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const user = userCredential.user;

    // Regular admin permissions with no delete permissions
    const regularAdminPermissions = [
      'read_all_users',
      'write_all_users',
      'manage_buses',
      'manage_routes',
      'manage_conductors',
      'view_all_reservations',
      'manage_system_settings',
      'view_analytics',
      'manage_trips',
      'update_booking_status',
      'view_payments',
      'manage_notifications'
    ];

    // Determine if this should be a superadmin
    const isSuperAdminRole = role === 'superadmin';

    await setDoc(doc(db, "Admin", user.uid), {
      uid: user.uid,
      name,
      email,
      role: role, 
      isSuperAdmin: isSuperAdminRole,
      permissions: regularAdminPermissions,
      isActive: true,
      isVerified: true,
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
    if (error.code === 'auth/email-already-in-use') {
      // Try to reactivate a deleted admin account
      const reactivatedUser = await reactivateDeletedAdmin(email, name);

      if (reactivatedUser) {
        return reactivatedUser;
      }

      throw new Error(
        'This email is already registered in Firebase Authentication. ' +
        'No deleted admin account was found to reactivate. ' +
        'Please use a different email address or contact an administrator to resolve this manually.'
      );
    }

    throw error;
  }
};

// Login admin user and checks roles
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

    if (userData.role === "admin" || userData.role === "superadmin") {
      user.adminRole = userData.role;
      user.isSuperAdmin = userData.isSuperAdmin || false;
      user.permissions = userData.permissions || [];
      user.isVerified = userData.isVerified || false;
      user.verificationStatus = userData.verificationStatus;
      
      // Log successful login activity
      await logActivity(
        ACTIVITY_TYPES.LOGIN,
        `User logged in successfully`,
        { 
          loginMethod: 'email_password',
          userRole: userData.role,
          isSuperAdmin: userData.isSuperAdmin || false,
          verificationStatus: userData.verificationStatus
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

// Fetches current admin user data
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

// Checks if the current user is a superadmin
export const isSuperAdmin = async (uid) => {
  try {
    const adminData = await getCurrentAdminData(uid);
    return adminData?.role === "superadmin" && adminData?.isSuperAdmin === true;
  } catch (error) {
    console.error("Error checking superadmin status:", error);
    return false;
  }
};

// Checks if the user has a specific permission
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


export const logoutUser = async () => {
  // Log logout activity before signing out
  await logActivity(
    ACTIVITY_TYPES.LOGOUT,
    `User logged out`,
    { logoutMethod: 'manual' }
  );
  
  return signOut(auth);
};