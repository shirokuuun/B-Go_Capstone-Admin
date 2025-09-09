import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "/src/firebase/firebase.js";
import { logActivity, ACTIVITY_TYPES } from "/src/pages/settings/auditService.js";

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

    // Log the activity
    await logActivity(
      ACTIVITY_TYPES.SOS_MARK_RECEIVED,
      `Marked SOS request as ${newStatus}`,
      { sosId, newStatus },
      'info'
    );

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

    // Log the activity
    await logActivity(
      ACTIVITY_TYPES.SOS_DELETE,
      `Deleted SOS request`,
      { sosId },
      'warning'
    );

    return { success: true };
  } catch (error) {
    console.error('Error deleting SOS request:', error);
    return { success: false, error: error.message };
  }
};