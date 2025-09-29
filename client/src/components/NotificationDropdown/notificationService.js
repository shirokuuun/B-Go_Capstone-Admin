import { collection, query, orderBy, onSnapshot, where, limit, doc, getDoc } from "firebase/firestore";
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

// Listen to ID verification uploads for notifications
export const listenToIDVerificationNotifications = (callback) => {
  const usersCollection = collection(db, "users");

  return onSnapshot(usersCollection, async (querySnapshot) => {
    const notifications = [];

    // Process each user to check for pending ID verifications
    const userPromises = querySnapshot.docs.map(async (userDoc) => {
      const userData = userDoc.data();
      const userId = userDoc.id;

      try {
        // Check the VerifyID subcollection for pending verifications
        const idDocRef = doc(db, 'users', userId, 'VerifyID', 'id');
        const idSnapshot = await getDoc(idDocRef);

        if (idSnapshot.exists()) {
          const idData = idSnapshot.data();

          // Only show notifications for pending ID verifications
          if (idData.status === 'pending' || !idData.status) {
            return {
              id: `id_verification_${userId}`,
              title: `ID Verification Pending`,
              message: `${userData.name || userData.displayName || userData.email || 'User'} uploaded ID document - Needs verification`,
              type: 'warning',
              timestamp: idData.uploadedAt?.seconds ? new Date(idData.uploadedAt.seconds * 1000) :
                        userData.createdAt?.seconds ? new Date(userData.createdAt.seconds * 1000) : new Date(),
              read: false,
              category: 'id_verification',
              sourceId: userId,
              sourceData: {
                ...userData,
                idData: idData
              }
            };
          }
        }
      } catch (error) {
        console.warn(`Error checking ID verification for user ${userId}:`, error);
      }

      return null;
    });

    try {
      const results = await Promise.all(userPromises);
      const validNotifications = results.filter(notification => notification !== null);
      callback(validNotifications);
    } catch (error) {
      console.error('Error processing ID verification notifications:', error);
      callback([]);
    }
  });
};

// Combined notification listener
export const listenToAllNotifications = (callback) => {
  const notifications = [];
  let sosNotifications = [];
  let reservationNotifications = [];
  let receiptNotifications = [];
  let idVerificationNotifications = [];

  // Listen to SOS notifications
  const unsubscribeSOS = listenToSOSNotifications((sosNotifs) => {
    sosNotifications = sosNotifs;
    const allNotifications = [...sosNotifications, ...reservationNotifications, ...receiptNotifications, ...idVerificationNotifications];

    // Sort by timestamp (newest first)
    allNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    callback(allNotifications);
  });

  // Listen to reservation notifications
  const unsubscribeReservations = listenToReservationNotifications((reservationNotifs) => {
    reservationNotifications = reservationNotifs;
    const allNotifications = [...sosNotifications, ...reservationNotifications, ...receiptNotifications, ...idVerificationNotifications];

    // Sort by timestamp (newest first)
    allNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    callback(allNotifications);
  });

  // Listen to receipt upload notifications
  const unsubscribeReceipts = listenToReceiptUploadNotifications((receiptNotifs) => {
    receiptNotifications = receiptNotifs;
    const allNotifications = [...sosNotifications, ...reservationNotifications, ...receiptNotifications, ...idVerificationNotifications];

    // Sort by timestamp (newest first)
    allNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    callback(allNotifications);
  });

  // Listen to ID verification notifications
  const unsubscribeIDVerifications = listenToIDVerificationNotifications((idVerificationNotifs) => {
    idVerificationNotifications = idVerificationNotifs;
    const allNotifications = [...sosNotifications, ...reservationNotifications, ...receiptNotifications, ...idVerificationNotifications];

    // Sort by timestamp (newest first)
    allNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    callback(allNotifications);
  });

  // Return cleanup function
  return () => {
    unsubscribeSOS();
    unsubscribeReservations();
    unsubscribeReceipts();
    unsubscribeIDVerifications();
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

// Helper function to handle notification clicks and navigation
export const handleNotificationClick = (notification, navigate) => {
  console.log(`Handling notification click:`, notification);

  // Mark notification as read
  markNotificationAsRead(notification.id);

  // Handle navigation based on notification category
  switch (notification.category) {
    case 'id_verification':
      // Simply navigate to ID verification page
      navigate('/admin/verification');
      break;

    case 'sos':
      // Navigate to SOS management/dashboard
      navigate('/sos-requests');
      break;

    case 'reservation':
      // Navigate to reservations page
      navigate('/reservations');
      break;

    case 'receipt':
      // Navigate to payment verification
      navigate('/payment-verification');
      break;

    default:
      console.warn(`Unknown notification category: ${notification.category}`);
      break;
  }
};

// Helper function to get notification badge count by category
export const getNotificationCountByCategory = (notifications) => {
  const counts = {
    id_verification: 0,
    sos: 0,
    reservation: 0,
    receipt: 0,
    total: 0
  };

  notifications.forEach(notification => {
    if (!notification.read) {
      counts[notification.category] = (counts[notification.category] || 0) + 1;
      counts.total++;
    }
  });

  return counts;
};

// Helper function to format notification time
export const formatNotificationTime = (timestamp) => {
  if (!timestamp) return 'Just now';

  const now = new Date();
  const notificationTime = new Date(timestamp);
  const diffInSeconds = Math.floor((now - notificationTime) / 1000);

  if (diffInSeconds < 60) {
    return 'Just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
};