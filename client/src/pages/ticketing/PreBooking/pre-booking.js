// Firebase imports
import { getFirestore, collection, getDocs, doc, getDoc, query, orderBy, limit as limitQuery, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Get all conductors who have pre-bookings
 * @returns {Promise<Array>} Array of conductor objects with pre-booking counts
 */
export const getConductorsWithPreTickets = async () => {
  try {
    const db = getFirestore();
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    
    const conductorsWithTickets = [];
    
    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorData = conductorDoc.data();
      const preBookingsRef = collection(db, 'conductors', conductorDoc.id, 'preBookings');
      const preBookingsSnapshot = await getDocs(preBookingsRef);
      
      if (preBookingsSnapshot.size > 0) {
        conductorsWithTickets.push({
          id: conductorDoc.id,
          ...conductorData,
          preTicketsCount: preBookingsSnapshot.size
        });
      }
    }
    
    return conductorsWithTickets;
  } catch (error) {
    console.error('Error fetching conductors with pre-bookings:', error);
    throw error;
  }
};

/**
 * Get conductor information by ID
 * @param {string} conductorId - Conductor ID
 * @returns {Promise<Object>} Conductor object
 */
export const getConductorById = async (conductorId) => {
  try {
    const db = getFirestore();
    const conductorRef = doc(db, 'conductors', conductorId);
    const snapshot = await getDoc(conductorRef);
    
    if (!snapshot.exists()) {
      throw new Error('Conductor not found');
    }
    
    return {
      id: snapshot.id,
      ...snapshot.data()
    };
  } catch (error) {
    console.error('Error fetching conductor:', error);
    throw error;
  }
};

/**
 * Get pre-bookings for a specific conductor
 * @param {string} conductorId - Conductor ID
 * @param {number} limit - Number of bookings to fetch
 * @returns {Promise<Array>} Array of pre-booking objects
 */
export const getPreTicketsByConductor = async (conductorId, limit = 10) => {
  try {
    const db = getFirestore();
    const preBookingsRef = collection(db, 'conductors', conductorId, 'preBookings');
    const q = query(
      preBookingsRef, 
      orderBy('scannedAt', 'desc'), 
      limitQuery(limit)
    );
    const snapshot = await getDocs(q);
    
    const tickets = [];
    snapshot.forEach((doc) => {
      const docData = doc.data();
      const data = docData.data || {}; // Access the nested 'data' map
      tickets.push({
        id: doc.id,
        conductorId: conductorId,
        originalCollection: docData.originalCollection || '',
        originalDocumentId: docData.originalDocumentId || '',
        qr: docData.qr || false,
        qrData: docData.qrData || '',
        scannedAt: docData.scannedAt?.toDate?.()?.toISOString() || docData.scannedAt,
        scannedBy: docData.scannedBy || null,
        status: docData.status || 'pending',
        // Data from nested 'data' map
        amount: data.amount || 0,
        boardingStatus: data.boardingStatus || 'pending',
        direction: data.direction || '',
        discountBreakdown: data.discountBreakdown || [],
        fare: data.fare || 0,
        fareTypes: data.fareTypes || [],
        from: data.from || '',
        fromKm: data.fromKm || 0,
        fromLatitude: data.fromLatitude || 0,
        fromLongitude: data.fromLongitude || 0,
        passengerFares: data.passengerFares || [],
        passengerLatitude: data.passengerLatitude || 0,
        passengerLongitude: data.passengerLongitude || 0,
        quantity: data.quantity || 0,
        route: data.route || '',
        timestamp: data.timestamp || 0,
        to: data.to || '',
        toKm: data.toKm || 0,
        toLatitude: data.toLatitude || 0,
        toLongitude: data.toLongitude || 0,
        type: data.type || 'preBooking',
        userId: data.userId || '',
        // Format timestamp for display
        date: data.timestamp ? new Date(data.timestamp).toLocaleDateString() : '',
        time: data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : ''
      });
    });
    
    return tickets;
  } catch (error) {
    console.error('Error fetching pre-bookings by conductor:', error);
    throw error;
  }
};

/**
 * Get pre-booking statistics
 * @returns {Promise<Object>} Statistics object
 */
export const getPreTicketingStats = async () => {
  try {
    const db = getFirestore();
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    
    let totalTickets = 0;
    let onlineTickets = 0;
    let offlineTickets = 0;
    let totalTrips = 0;

    for (const conductorDoc of conductorsSnapshot.docs) {
      const preBookingsRef = collection(db, 'conductors', conductorDoc.id, 'preBookings');
      const snapshot = await getDocs(preBookingsRef);
      
      snapshot.forEach((doc) => {
        const docData = doc.data();
        totalTickets++;
        
        if (docData.status === 'boarded') {
          onlineTickets++;
        } else {
          offlineTickets++;
        }
        
        if (docData.scannedAt) {
          totalTrips++;
        }
      });
    }

    return {
      totalTickets,
      onlineTickets,
      offlineTickets,
      totalTrips
    };
  } catch (error) {
    console.error('Error fetching pre-booking stats:', error);
    throw error;
  }
};

/**
 * Get all recent pre-bookings (across all conductors)
 * @param {number} limit - Number of bookings to fetch
 * @returns {Promise<Array>} Array of booking objects with conductor info
 */
export const getAllRecentPreTickets = async (limitParam = 10) => {
  try {
    const db = getFirestore();
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    
    const allTickets = [];
    
    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorData = conductorDoc.data();
      const preBookingsRef = collection(db, 'conductors', conductorDoc.id, 'preBookings');
      const q = query(preBookingsRef, orderBy('scannedAt', 'desc'));
      const ticketsSnapshot = await getDocs(q);
      
      ticketsSnapshot.forEach((ticketDoc) => {
        const docData = ticketDoc.data();
        const data = docData.data || {}; // Access the nested 'data' map
        allTickets.push({
          id: ticketDoc.id,
          conductorId: conductorDoc.id,
          conductor: conductorData,
          originalCollection: docData.originalCollection || '',
          originalDocumentId: docData.originalDocumentId || '',
          qr: docData.qr || false,
          qrData: docData.qrData || '',
          scannedAt: docData.scannedAt?.toDate?.()?.toISOString() || docData.scannedAt,
          scannedBy: docData.scannedBy || null,
          status: docData.status || 'pending',
          // Data from nested 'data' map
          amount: data.amount || 0,
          boardingStatus: data.boardingStatus || 'pending',
          direction: data.direction || '',
          discountBreakdown: data.discountBreakdown || [],
          fare: data.fare || 0,
          fareTypes: data.fareTypes || [],
          from: data.from || '',
          fromKm: data.fromKm || 0,
          fromLatitude: data.fromLatitude || 0,
          fromLongitude: data.fromLongitude || 0,
          passengerFares: data.passengerFares || [],
          passengerLatitude: data.passengerLatitude || 0,
          passengerLongitude: data.passengerLongitude || 0,
          quantity: data.quantity || 0,
          route: data.route || '',
          timestamp: data.timestamp || 0,
          to: data.to || '',
          toKm: data.toKm || 0,
          toLatitude: data.toLatitude || 0,
          toLongitude: data.toLongitude || 0,
          type: data.type || 'preBooking',
          userId: data.userId || '',
          // Format timestamp for display
          date: data.timestamp ? new Date(data.timestamp).toLocaleDateString() : '',
          time: data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : ''
        });
      });
    }
    
    // Sort by scanned date and limit
    return allTickets
      .sort((a, b) => new Date(b.scannedAt || 0) - new Date(a.scannedAt || 0))
      .slice(0, limitParam);
  } catch (error) {
    console.error('Error fetching all recent pre-bookings:', error);
    throw error;
  }
};

/**
 * Get specific pre-booking by ID
 * @param {string} conductorId - Conductor ID
 * @param {string} bookingId - Booking ID (DocumentId)
 * @returns {Promise<Object>} Booking object
 */
export const getPreTicketById = async (conductorId, bookingId) => {
  try {
    const db = getFirestore();
    const bookingRef = doc(db, 'conductors', conductorId, 'preBookings', bookingId);
    const conductorRef = doc(db, 'conductors', conductorId);
    
    const [bookingSnapshot, conductorSnapshot] = await Promise.all([
      getDoc(bookingRef),
      getDoc(conductorRef)
    ]);
    
    if (!bookingSnapshot.exists()) {
      throw new Error('Booking not found');
    }
    
    const docData = bookingSnapshot.data();
    const data = docData.data || {}; // Access the nested 'data' map
    
    return {
      id: bookingSnapshot.id,
      conductorId: conductorId,
      conductor: conductorSnapshot.exists() ? conductorSnapshot.data() : { name: 'Unknown Conductor', email: 'N/A' },
      originalCollection: docData.originalCollection || '',
      originalDocumentId: docData.originalDocumentId || '',
      qr: docData.qr || false,
      qrData: docData.qrData || '',
      scannedAt: docData.scannedAt?.toDate?.()?.toISOString() || docData.scannedAt,
      scannedBy: docData.scannedBy || null,
      status: docData.status || 'pending',
      // Data from nested 'data' map
      amount: data.amount || 0,
      boardingStatus: data.boardingStatus || 'pending',
      direction: data.direction || '',
      discountBreakdown: data.discountBreakdown || [],
      fare: data.fare || 0,
      fareTypes: data.fareTypes || [],
      from: data.from || '',
      fromKm: data.fromKm || 0,
      fromLatitude: data.fromLatitude || 0,
      fromLongitude: data.fromLongitude || 0,
      passengerFares: data.passengerFares || [],
      passengerLatitude: data.passengerLatitude || 0,
      passengerLongitude: data.passengerLongitude || 0,
      quantity: data.quantity || 0,
      route: data.route || '',
      timestamp: data.timestamp || 0,
      to: data.to || '',
      toKm: data.toKm || 0,
      toLatitude: data.toLatitude || 0,
      toLongitude: data.toLongitude || 0,
      type: data.type || 'preBooking',
      userId: data.userId || '',
      // Format timestamp for display
      date: data.timestamp ? new Date(data.timestamp).toLocaleDateString() : '',
      time: data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : ''
    };
  } catch (error) {
    console.error('Error fetching pre-booking:', error);
    throw error;
  }
};

/**
 * Update booking status
 * @param {string} conductorId - Conductor ID
 * @param {string} bookingId - Booking ID (DocumentId)
 * @param {string} newStatus - New status
 * @returns {Promise<boolean>} Success status
 */
export const updateTicketStatus = async (conductorId, bookingId, newStatus) => {
  try {
    const db = getFirestore();
    const bookingRef = doc(db, 'conductors', conductorId, 'preBookings', bookingId);
    
    const updateData = { status: newStatus };
    if (newStatus === 'boarded') {
      updateData.scannedAt = serverTimestamp();
    }
    
    await updateDoc(bookingRef, updateData);
    return true;
  } catch (error) {
    console.error('Error updating booking status:', error);
    throw error;
  }
};

/**
 * Delete a pre-booking
 * @param {string} conductorId - Conductor ID
 * @param {string} bookingId - Booking ID (DocumentId) to delete
 * @returns {Promise<boolean>} Success status
 */
export const deletePreTicket = async (conductorId, bookingId) => {
  try {
    const db = getFirestore();
    const bookingRef = doc(db, 'conductors', conductorId, 'preBookings', bookingId);
    await deleteDoc(bookingRef);
    return true;
  } catch (error) {
    console.error('Error deleting pre-booking:', error);
    throw error;
  }
};