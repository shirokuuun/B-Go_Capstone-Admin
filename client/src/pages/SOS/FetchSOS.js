import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "/src/firebase/firebase.js";

export const listenToSOSRequests = (callback) => {
  const q = query(collection(db, "sosRequests"), orderBy("timestamp", "desc"));
  return onSnapshot(q, (querySnapshot) => {
    const sosList = [];
    querySnapshot.forEach((doc) => {
      sosList.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    callback(sosList);
  });
};

// Update SOS request status
export const updateSOSStatus = async (sosId, newStatus) => {
  try {
    const sosRef = doc(db, 'sosRequests', sosId);
    await updateDoc(sosRef, {
      status: newStatus,
      updatedAt: new Date()
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating SOS status:', error);
    return { success: false, error: error.message };
  }
};

// Delete SOS request
export const deleteSOSRequest = async (sosId) => {
  try {
    const sosRef = doc(db, 'sosRequests', sosId);
    await deleteDoc(sosRef);
    return { success: true };
  } catch (error) {
    console.error('Error deleting SOS request:', error);
    return { success: false, error: error.message };
  }
};