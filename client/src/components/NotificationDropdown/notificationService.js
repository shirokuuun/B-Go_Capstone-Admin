import { collection, query, orderBy, onSnapshot, where, limit } from "firebase/firestore";
import { db } from "/src/firebase/firebase.js";

// Listen to SOS requests for notifications
export const listenToSOSNotifications = (callback) => {
  const q = query(
    collection(db, "sosRequests"), 
    orderBy("timestamp", "desc"),
    limit(10) // Get latest 10 for notifications
  );
  
  return onSnapshot(q, (querySnapshot) => {
    const notifications = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      
      // Only show notifications for pending SOS requests
      // Once status becomes 'received', they won't appear in notifications
      if (data.status?.toLowerCase() === 'pending') {
        notifications.push({
          id: `sos_${doc.id}`,
          title: `New SOS Request - ${data.emergencyType}`,
          message: `Emergency assistance requested on route ${data.route}`,
          type: 'error',
          timestamp: data.timestamp?.seconds ? new Date(data.timestamp.seconds * 1000) : new Date(),
          read: false, // Always unread for pending SOS
          category: 'sos',
          sourceId: doc.id,
          sourceData: data
        });
      }
    });
    
    callback(notifications);
  });
};

// Listen to new bus reservations for notifications
export const listenToReservationNotifications = (callback) => {
  const q = query(
    collection(db, "reservations"),
    orderBy("timestamp", "desc"),
    limit(10)
  );

  return onSnapshot(q, (querySnapshot) => {
    const notifications = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();

      // Show notification for new reservations (pending status)
      if (data.status === 'pending') {
        notifications.push({
          id: `reservation_${doc.id}`,
          title: `New Bus Reservation`,
          message: `${data.fullName || 'User'} reserved bus for ${data.from} → ${data.to}`,
          type: 'info',
          timestamp: data.timestamp?.seconds ? new Date(data.timestamp.seconds * 1000) : new Date(),
          read: false,
          category: 'reservation',
          sourceId: doc.id,
          sourceData: data
        });
      }
    });

    callback(notifications);
  });
};

// Listen to receipt uploads for notifications
export const listenToReceiptUploadNotifications = (callback) => {
  const q = query(
    collection(db, "reservations"),
    orderBy("receiptUploadedAt", "desc"),
    limit(10)
  );

  return onSnapshot(q, (querySnapshot) => {
    const notifications = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();

      // Show notification when receipt is uploaded (status: receipt_uploaded)
      if (data.status === 'receipt_uploaded' && data.receiptUrl) {
        notifications.push({
          id: `receipt_${doc.id}`,
          title: `Payment Receipt Uploaded`,
          message: `${data.fullName || 'User'} uploaded payment receipt - Needs verification`,
          type: 'warning',
          timestamp: data.receiptUploadedAt?.seconds ? new Date(data.receiptUploadedAt.seconds * 1000) : new Date(),
          read: false,
          category: 'receipt',
          sourceId: doc.id,
          sourceData: data
        });
      }
    });

    callback(notifications);
  });
};

// Combined notification listener
export const listenToAllNotifications = (callback) => {
  const notifications = [];
  let sosNotifications = [];
  let reservationNotifications = [];
  let receiptNotifications = [];

  // Listen to SOS notifications
  const unsubscribeSOS = listenToSOSNotifications((sosNotifs) => {
    sosNotifications = sosNotifs;
    const allNotifications = [...sosNotifications, ...reservationNotifications, ...receiptNotifications];

    // Sort by timestamp (newest first)
    allNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    callback(allNotifications);
  });

  // Listen to reservation notifications
  const unsubscribeReservations = listenToReservationNotifications((reservationNotifs) => {
    reservationNotifications = reservationNotifs;
    const allNotifications = [...sosNotifications, ...reservationNotifications, ...receiptNotifications];

    // Sort by timestamp (newest first)
    allNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    callback(allNotifications);
  });

  // Listen to receipt upload notifications
  const unsubscribeReceipts = listenToReceiptUploadNotifications((receiptNotifs) => {
    receiptNotifications = receiptNotifs;
    const allNotifications = [...sosNotifications, ...reservationNotifications, ...receiptNotifications];

    // Sort by timestamp (newest first)
    allNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    callback(allNotifications);
  });

  // Return cleanup function
  return () => {
    unsubscribeSOS();
    unsubscribeReservations();
    unsubscribeReceipts();
  };
};

// Helper function to mark notification as read
export const markNotificationAsRead = (notificationId) => {
  // This could update the source document or maintain read state locally
  // For now, we'll handle read state in the component
  console.log(`Marking notification ${notificationId} as read`);
};

// Helper function to get unread count
export const getUnreadCount = (notifications) => {
  return notifications.filter(n => !n.read).length;
};