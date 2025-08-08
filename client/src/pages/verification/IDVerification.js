import { db } from '../../firebase/firebase.js';
import { collection, getDocs, addDoc, query, where, setDoc, doc, getDoc, updateDoc } from 'firebase/firestore';

// Fetch all users from Firestore
// Fetch all users from Firestore with their ID verification status
export const fetchUsers = async () => {
  try {
    const usersCollection = collection(db, 'users');
    const snapshot = await getDocs(usersCollection);
    
    const users = [];
    
    // For each user, get their main data AND their verification status
    for (const userDoc of snapshot.docs) {
      const userData = {
        id: userDoc.id,
        ...userDoc.data()
      };
      
      // Try to get verification status from subcollection
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
    
    console.log('All users with verification status:', users); // Debug log
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
      console.log(`ID data for user ${userId}:`, data); // Debug log
      return {
        id: idSnapshot.id,
        ...data
      };
    } else {
      console.log(`No ID document found for user ${userId}`);
      throw new Error('No ID data found for this user');
    }
  } catch (error) {
    console.error("Error fetching user ID data:", error);
    throw error;
  }
};

// Update ID verification status
export const updateIDVerificationStatus = async (userId, status) => {
  try {
    // Update the ID document status
    const idDocRef = doc(db, 'users', userId, 'VerifyID', 'id');
    await updateDoc(idDocRef, {
      status: status,
      verifiedAt: new Date(),
      verifiedBy: 'admin' // You can replace this with actual admin info
    });

    // Also update the user's main document with verification status
    const userDocRef = doc(db, 'users', userId);
    await updateDoc(userDocRef, {
      idVerificationStatus: status,
      idVerifiedAt: new Date()
    });

    console.log(`ID verification status updated to ${status} for user ${userId}`);
    return true;
  } catch (error) {
    console.error("Error updating ID verification status:", error);
    throw error;
  }
};

// Fetch all pending ID verifications
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
        pendingUsers.push({
          ...userData,
          idData: idData
        });
      } catch (error) {
        console.warn(`No ID data found for user ${userDoc.id}`);
        // Still include user but without ID data
        pendingUsers.push(userData);
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
    
    const verifiedUsers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return verifiedUsers;
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
    
    const rejectedUsers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return rejectedUsers;
  } catch (error) {
    console.error("Error fetching rejected verifications:", error);
    throw error;
  }

};

// Delete ID verification data for a user
export const deleteIDVerificationData = async (userId) => {
  try {
    const idDocRef = doc(db, 'users', userId, 'VerifyID', 'id');
    await deleteDoc(idDocRef); 
    console.log(`ID document deleted for user ${userId}`);
  } catch (error) {
    console.error("Error deleting ID verification data:", error);
    throw error;
  }
};
