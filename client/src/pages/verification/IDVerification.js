import { db } from '/src/firebase/firebase.js';
import { 
  collection, getDocs, addDoc, query, where, setDoc, doc, getDoc, updateDoc, deleteDoc, onSnapshot, deleteField 
} from 'firebase/firestore';
import { logActivity, ACTIVITY_TYPES } from '/src/pages/settings/auditService.js';

// Real-time subscription to users with their ID verification status (only includes users with uploaded IDs)
export const subscribeToUsers = (callback) => {
  const usersCollection = collection(db, 'users');

  return onSnapshot(usersCollection, async (snapshot) => {
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
          const idData = idSnapshot.data();
          userData.idVerificationStatus = idData.status || 'pending';
          userData.verifiedAt = idData.verifiedAt;
          userData.verifiedBy = idData.verifiedBy;
          // Only include users who have uploaded ID data
          users.push(userData);
        }
        // Skip users who don't have ID data (haven't uploaded ID yet)
      } catch (error) {
        console.warn(`No ID verification data for user ${userDoc.id}`);
        // Skip users without ID data
      }
    }

    console.log('Real-time users update:', users);
    callback(users);
  }, (error) => {
    console.error("Error in users subscription:", error);
  });
};

// Real-time subscription to a specific user's ID verification data
export const subscribeToUserIDData = (userId, callback) => {
  const idDocRef = doc(db, 'users', userId, 'VerifyID', 'id');
  
  return onSnapshot(idDocRef, (docSnapshot) => {
    if (docSnapshot.exists()) {
      const data = {
        id: docSnapshot.id,
        ...docSnapshot.data()
      };
      console.log(`Real-time ID data update for user ${userId}:`, data);
      callback(data);
    } else {
      console.log(`No ID document found for user ${userId}`);
      callback(null);
    }
  }, (error) => {
    console.error(`Error in user ID subscription for ${userId}:`, error);
    callback(null);
  });
};

export const fetchUsers = async () => {
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
          const idData = idSnapshot.data();
          userData.idVerificationStatus = idData.status || 'pending';
          userData.verifiedAt = idData.verifiedAt;
          userData.verifiedBy = idData.verifiedBy;
        } else {
          userData.idVerificationStatus = 'pending';
        }
      } catch (error) {
        console.warn(`No ID verification data for user ${userDoc.id}`);
        userData.idVerificationStatus = 'pending';
      }
      
      users.push(userData);
    }
    return users;
  } catch (error) {
    console.error("Error fetching users:", error);
    throw error;
  }
};

// Fetch ID verification data for a specific user
export const fetchUserIDData = async (userId) => {
  try {
    const idDocRef = doc(db, 'users', userId, 'VerifyID', 'id');
    const idSnapshot = await getDoc(idDocRef);
    
    if (idSnapshot.exists()) {
      const data = idSnapshot.data();
      console.log(`ID data for user ${userId}:`, data);
      return {
        id: idSnapshot.id,
        ...data
      };
    } else {
      throw new Error('No ID data found for this user');
    }
  } catch (error) {
    console.error("Error fetching user ID data:", error);
    throw error;
  }
};

// Update ID verification status with activity logging
export const updateIDVerificationStatus = async (userId, status, adminInfo = null) => {
  try {
    // Get user information for activity logging
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);
    const userData = userDoc.exists() ? userDoc.data() : null;
    const userName = userData?.name || userData?.displayName || 'Unknown User';
    const userEmail = userData?.email || 'Unknown Email';

    if (status === 'rejected' || status === 'revoked') {
      const idDocRef = doc(db, 'users', userId, 'VerifyID', 'id');

      // Get the current ID document data to preserve original verification info
      const idDoc = await getDoc(idDocRef);
      const idData = idDoc.exists() ? idDoc.data() : null;

      // Prepare update object
      const updateData = {
        status: status === 'rejected' ? 'rejected' : 'revoked',
        revokedAt: new Date(),
        revokedBy: adminInfo?.name || adminInfo?.email || 'admin',
        previousStatus: idData?.status || userData?.idVerificationStatus || 'verified'
      };

      // Only add original verification data if it exists
      if (idData?.verifiedAt || userData?.idVerifiedAt || userData?.verifiedAt) {
        updateData.originalVerifiedAt = idData?.verifiedAt || userData?.idVerifiedAt || userData?.verifiedAt;
      }
      if (idData?.verifiedBy || userData?.verifiedBy) {
        updateData.originalVerifiedBy = idData?.verifiedBy || userData?.verifiedBy;
      }

      // Soft revocation - mark as revoked instead of deleting
      await updateDoc(idDocRef, updateData);

      // Update main user doc fields - use 'revoked' status instead of 'pending'
      await updateDoc(userDocRef, {
        idVerificationStatus: status === 'rejected' ? 'rejected' : 'revoked',
        idRevokedAt: new Date(),
        // Keep original verification timestamps for reference
        originalIdVerifiedAt: userData?.idVerifiedAt
      });

      // Log the revocation activity
      const actionLabel = status === 'rejected' ? 'Rejected' : 'Revoked';
      await logActivity(
        ACTIVITY_TYPES.ID_VERIFICATION_REJECT,
        `${actionLabel} ID verification for ${userName} (${userEmail})`,
        {
          userId: userId,
          userName: userName,
          userEmail: userEmail,
          adminName: adminInfo?.name || 'Unknown Admin',
          adminEmail: adminInfo?.email || 'Unknown Email',
          action: status === 'rejected' ? 'rejected' : 'revoked',
          previousStatus: userData?.idVerificationStatus || 'verified',
          revokedAt: new Date().toISOString(),
          revokedBy: adminInfo?.name || adminInfo?.email || 'admin'
        }
      );
    } else {
      // For verified status, update the ID document
      const idDocRef = doc(db, 'users', userId, 'VerifyID', 'id');
      await updateDoc(idDocRef, {
        status: status,
        verifiedAt: new Date(),
        verifiedBy: adminInfo?.name || adminInfo?.email || 'admin'
      });

      // Also update the user's main document
      await updateDoc(userDocRef, {
        idVerificationStatus: status,
        idVerifiedAt: new Date()
      });

      // Log the verification activity
      await logActivity(
        ACTIVITY_TYPES.ID_VERIFICATION_APPROVE,
        `Approved ID verification for ${userName} (${userEmail})`,
        {
          userId: userId,
          userName: userName,
          userEmail: userEmail,
          adminName: adminInfo?.name || 'Unknown Admin',
          adminEmail: adminInfo?.email || 'Unknown Email',
          action: 'verified',
          previousStatus: userData?.idVerificationStatus || 'pending',
          verifiedAt: new Date().toISOString(),
          verifiedBy: adminInfo?.name || adminInfo?.email || 'admin'
        }
      );
    }
    
    return true;
  } catch (error) {
    console.error("Error updating ID verification status:", error);
    throw error;
  }
};

// Fetch all pending ID verifications (only users who have uploaded ID documents)
export const fetchPendingVerifications = async () => {
  try {
    const usersCollection = collection(db, 'users');
    const q = query(usersCollection, where('idVerificationStatus', '==', 'pending'));
    const snapshot = await getDocs(q);

    const pendingUsers = [];
    for (const userDoc of snapshot.docs) {
      const userData = { id: userDoc.id, ...userDoc.data() };

      try {
        const idData = await fetchUserIDData(userDoc.id);
        // Only include users who have actually uploaded ID data
        pendingUsers.push({
          ...userData,
          idData: idData
        });
      } catch (error) {
        // Skip users who don't have ID data (haven't uploaded ID yet)
        console.warn(`No ID data found for user ${userDoc.id}, skipping from pending list`);
      }
    }

    return pendingUsers;
  } catch (error) {
    console.error("Error fetching pending verifications:", error);
    throw error;
  }
};

// Fetch all verified ID verifications
export const fetchVerifiedVerifications = async () => {
  try {
    const usersCollection = collection(db, 'users');
    const q = query(usersCollection, where('idVerificationStatus', '==', 'verified'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error("Error fetching verified verifications:", error);
    throw error;
  }
};

// Fetch all rejected ID verifications
export const fetchRejectedVerifications = async () => {
  try {
    const usersCollection = collection(db, 'users');
    const q = query(usersCollection, where('idVerificationStatus', '==', 'rejected'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error("Error fetching rejected verifications:", error);
    throw error;
  }
};

// Fetch all revoked ID verifications
export const fetchRevokedVerifications = async () => {
  try {
    const usersCollection = collection(db, 'users');
    const q = query(usersCollection, where('idVerificationStatus', '==', 'revoked'));
    const snapshot = await getDocs(q);

    const revokedUsers = [];
    for (const userDoc of snapshot.docs) {
      const userData = { id: userDoc.id, ...userDoc.data() };

      try {
        const idData = await fetchUserIDData(userDoc.id);
        revokedUsers.push({
          ...userData,
          idData: idData
        });
      } catch (error) {
        console.warn(`No ID data found for revoked user ${userDoc.id}`);
        revokedUsers.push(userData);
      }
    }

    return revokedUsers;
  } catch (error) {
    console.error("Error fetching revoked verifications:", error);
    throw error;
  }
};
