import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '/src/firebase/firebase.js';

// Helper to format timestamp
const formatDate = (timestamp) => {
  if (!timestamp) return 'N/A';
  // Handle Firestore Timestamp
  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
  // Handle standard Date object or string
  return new Date(timestamp).toLocaleDateString('en-US');
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
        timestamp: data.timestamp // Keep raw for sorting if needed later
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