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
      
      // Create notification object for SOS requests
      notifications.push({
        id: `sos_${doc.id}`,
        title: `New SOS Request - ${data.emergencyType}`,
        message: `Emergency assistance requested on route ${data.route}`,
        type: data.status?.toLowerCase() === 'pending' ? 'error' : 'warning',
        timestamp: data.timestamp?.seconds ? new Date(data.timestamp.seconds * 1000) : new Date(),
        read: data.status?.toLowerCase() !== 'pending', // Mark pending as unread
        category: 'sos',
        sourceId: doc.id,
        sourceData: data
      });
    });
    
    callback(notifications);
  });
};

// Listen to payment transactions for notifications (commented out for now)
/*
export const listenToPaymentNotifications = (callback) => {
  // Uncomment and modify this when you have payment data structure
  const q = query(
    collection(db, "payments"), // Replace with your actual payment collection name
    orderBy("timestamp", "desc"),
    limit(10)
  );
  
  return onSnapshot(q, (querySnapshot) => {
    const notifications = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      
      // Create notification object for payments
      notifications.push({
        id: `payment_${doc.id}`,
        title: `Payment ${data.status}`,
        message: `Payment of ₱${data.amount} has been ${data.status.toLowerCase()}`,
        type: data.status?.toLowerCase() === 'completed' ? 'success' : 'info',
        timestamp: data.timestamp?.seconds ? new Date(data.timestamp.seconds * 1000) : new Date(),
        read: false,
        category: 'payment',
        sourceId: doc.id,
        sourceData: data
      });
    });
    
    callback(notifications);
  });
};
*/

// Combined notification listener
export const listenToAllNotifications = (callback) => {
  const notifications = [];
  let sosNotifications = [];
  // let paymentNotifications = [];

  // Listen to SOS notifications
  const unsubscribeSOS = listenToSOSNotifications((sosNotifs) => {
    sosNotifications = sosNotifs;
    const allNotifications = [...sosNotifications /* , ...paymentNotifications */];
    
    // Sort by timestamp (newest first)
    allNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    callback(allNotifications);
  });

  /* 
  // Uncomment when payment data is available
  const unsubscribePayments = listenToPaymentNotifications((paymentNotifs) => {
    paymentNotifications = paymentNotifs;
    const allNotifications = [...sosNotifications, ...paymentNotifications];
    
    // Sort by timestamp (newest first)
    allNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    callback(allNotifications);
  });
  */

  // Return cleanup function
  return () => {
    unsubscribeSOS();
    // unsubscribePayments(); // Uncomment when payments are enabled
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