import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '/src/firebase/firebase.js';

// Helper to format timestamp
const formatDateTime = (timestamp) => {
  if (!timestamp) return 'N/A';
  // Handle Firestore Timestamp
  const dateObj = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
  
  return dateObj.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  });
};

const formatDate = (timestamp) => {
  if (!timestamp) return 'N/A';
  const dateObj = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
  
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

// Helper to format currency
const formatCurrency = (amount) => {
  return `₱${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
};

// Fixed rate for private reservations as per your requirement
const FIXED_RESERVATION_RATE = 2000;

/**
 * Load all reservations from Firestore
 */
export const loadReservationsData = async () => {
  try {
    const reservationsRef = collection(db, 'reservations');
    // Order by timestamp descending (newest first)
    const q = query(reservationsRef, orderBy('timestamp', 'desc'));
    
    const querySnapshot = await getDocs(q);
    
    const reservations = [];
    let totalRevenue = 0;
    let stats = {
      total: 0,
      confirmed: 0,
      pending: 0,
      cancelled: 0,
      completed: 0
    };

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      
      // Calculate revenue: Only count completed or confirmed reservations
      // You can adjust this logic if pending reservations count as revenue
      let revenue = 0;
      if (['confirmed', 'completed'].includes(data.status)) {
        revenue = FIXED_RESERVATION_RATE;
        totalRevenue += revenue;
      }

      // Update stats counts
      stats.total++;
      if (stats[data.status] !== undefined) {
        stats[data.status]++;
      }

      const createdDateObj = data.timestamp && data.timestamp.seconds 
        ? new Date(data.timestamp.seconds * 1000) 
        : new Date(data.timestamp);

      const offset = createdDateObj.getTimezoneOffset() * 60000;
      const localISODate = new Date(createdDateObj.getTime() - offset).toISOString().split('T')[0];

      reservations.push({
        id: doc.id,
        fullName: data.fullName || 'N/A',
        email: data.email || 'N/A',
        route: `${data.from || '?'} → ${data.to || '?'}`,
        departureDate: formatDate(data.departureDate),
        departureTime: data.departureTime || 'N/A',
        status: data.status || 'pending',
        busId: data.selectedBusIds && data.selectedBusIds.length > 0 ? data.selectedBusIds.join(', ') : 'Pending Assignment',
        type: data.isRoundTrip ? 'Round Trip' : 'One Way',
        revenue: revenue,
        dateFiled: formatDateTime(data.timestamp),
        cancelledBy: data.cancelledBy || null,
        timestamp: data.timestamp,
        filedDateISO: localISODate
      });
    });

    return {
      reservations,
      stats,
      totalRevenue
    };

  } catch (error) {
    console.error("Error loading reservations:", error);
    throw error;
  }
};