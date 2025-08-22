import { db } from '/src/firebase/firebase.js';
import { 
  collection, getDocs, addDoc, query, where, setDoc, doc, getDoc, updateDoc, deleteDoc, onSnapshot, deleteField 
} from 'firebase/firestore';

// Real-time subscription to all users with their ID verification status
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
        } else {
          userData.idVerificationStatus = 'pending';
        }
      } catch (error) {
        console.warn(`No ID verification data for user ${userDoc.id}`);
        userData.idVerificationStatus = 'pending';
      }
      
      users.push(userData);
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
    
    console.log('All users with verification status:', users);
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
    if (status === 'rejected') {
      const idDocRef = doc(db, 'users', userId, 'VerifyID', 'id');

      // Remove verification fields from subcollection doc before deleting
      await updateDoc(idDocRef, {
        verifiedAt: deleteField(),
        verifiedBy: deleteField()
      });

      // Delete the ID document completely
      await deleteDoc(idDocRef);

      // Reset main user doc fields
      const userDocRef = doc(db, 'users', userId);
      await updateDoc(userDocRef, {
        idVerificationStatus: 'pending',
        idVerifiedAt: null,
        verifiedAt: deleteField(),
        verifiedBy: deleteField()
      });

      console.log(`ID verification revoked and date fields removed for user ${userId}`);
    } else {
      // For verified status, update the ID document
      const idDocRef = doc(db, 'users', userId, 'VerifyID', 'id');
      await updateDoc(idDocRef, {
        status: status,
        verifiedAt: new Date(),
        verifiedBy: 'admin' // Replace with actual admin info if needed
      });

      // Also update the user's main document
      const userDocRef = doc(db, 'users', userId);
      await updateDoc(userDocRef, {
        idVerificationStatus: status,
        idVerifiedAt: new Date()
      });

      console.log(`ID verification status updated to ${status} for user ${userId}`);
    }
    
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
