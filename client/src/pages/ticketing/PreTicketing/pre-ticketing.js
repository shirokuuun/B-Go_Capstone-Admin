// Firebase imports
import { getFirestore, collection, getDocs, doc, getDoc, query, orderBy, limit as limitQuery, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Get all users who have pre-tickets
 * @returns {Promise<Array>} Array of user objects with pre-ticket counts
 */
export const getUsersWithPreTickets = async () => {
  try {
    const db = getFirestore();
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    
    const usersWithTickets = [];
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const preTicketsRef = collection(db, 'users', userDoc.id, 'preTickets');
      const preTicketsSnapshot = await getDocs(preTicketsRef);
      
      if (preTicketsSnapshot.size > 0) {
        usersWithTickets.push({
          id: userDoc.id,
          ...userData,
          preTicketsCount: preTicketsSnapshot.size
        });
      }
    }
    
    return usersWithTickets;
  } catch (error) {
    console.error('Error fetching users with pre-tickets:', error);
    throw error;
  }
};

/**
 * Get user information by ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User object
 */
export const getUserById = async (userId) => {
  try {
    const db = getFirestore();
    const userRef = doc(db, 'users', userId);
    const snapshot = await getDoc(userRef);
    
    if (!snapshot.exists()) {
      throw new Error('User not found');
    }
    
    return {
      id: snapshot.id,
      ...snapshot.data()
    };
  } catch (error) {
    console.error('Error fetching user:', error);
    throw error;
  }
};

/**
 * Get pre-tickets for a specific user
 * @param {string} userId - User ID
 * @param {number} limit - Number of tickets to fetch
 * @returns {Promise<Array>} Array of pre-ticket objects
 */
export const getPreTicketsByUser = async (userId, limit = 10) => {
  try {
    const db = getFirestore();
    const preTicketsRef = collection(db, 'users', userId, 'preTickets');
    const q = query(
      preTicketsRef, 
      orderBy('createdAt', 'desc'), 
      limitQuery(limit)
    );
    const snapshot = await getDocs(q);
    
    const tickets = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      tickets.push({
        id: doc.id,
        userId: userId,
        boardedAt: data.boardedAt?.toDate?.()?.toISOString() || data.boardedAt,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        scannedAt: data.scannedAt?.toDate?.()?.toISOString() || data.scannedAt,
        discountBreakdown: data.discountBreakdown || [],
        fare: data.fare || '0.00',
        from: data.from || '',
        km: data.km || '',
        qrData: data.qrData || '',
        quantity: data.quantity || 0,
        scannedBy: data.scannedBy || null,
        status: data.status || 'pending',
        to: data.to || '',
        totalFare: data.totalFare || '0.00'
      });
    });
    
    return tickets;
  } catch (error) {
    console.error('Error fetching pre-tickets by user:', error);
    throw error;
  }
};

/**
 * Get pre-ticketing statistics
 * @returns {Promise<Object>} Statistics object
 */
export const getPreTicketingStats = async () => {
  try {
    const db = getFirestore();
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    
    let totalTickets = 0;
    let onlineTickets = 0;
    let offlineTickets = 0;
    let totalTrips = 0;

    for (const userDoc of usersSnapshot.docs) {
      const preTicketsRef = collection(db, 'users', userDoc.id, 'preTickets');
      const snapshot = await getDocs(preTicketsRef);
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        totalTickets++;
        
        if (data.status === 'boarded') {
          onlineTickets++;
        } else {
          offlineTickets++;
        }
        
        if (data.boardedAt) {
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
    console.error('Error fetching pre-ticketing stats:', error);
    throw error;
  }
};

/**
 * Get all recent pre-tickets (across all users)
 * @param {number} limit - Number of tickets to fetch
 * @returns {Promise<Array>} Array of ticket objects with user info
 */
export const getAllRecentPreTickets = async (limitParam = 10) => {
  try {
    const db = getFirestore();
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    
    const allTickets = [];
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const preTicketsRef = collection(db, 'users', userDoc.id, 'preTickets');
      const q = query(preTicketsRef, orderBy('createdAt', 'desc'));
      const ticketsSnapshot = await getDocs(q);
      
      ticketsSnapshot.forEach((ticketDoc) => {
        const data = ticketDoc.data();
        allTickets.push({
          id: ticketDoc.id,
          userId: userDoc.id,
          user: userData,
          boardedAt: data.boardedAt?.toDate?.()?.toISOString() || data.boardedAt,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          scannedAt: data.scannedAt?.toDate?.()?.toISOString() || data.scannedAt,
          discountBreakdown: data.discountBreakdown || [],
          fare: data.fare || '0.00',
          from: data.from || '',
          km: data.km || '',
          qrData: data.qrData || '',
          quantity: data.quantity || 0,
          scannedBy: data.scannedBy || null,
          status: data.status || 'pending',
          to: data.to || '',
          totalFare: data.totalFare || '0.00'
        });
      });
    }
    
    // Sort by creation date and limit
    return allTickets
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limitParam);
  } catch (error) {
    console.error('Error fetching all recent pre-tickets:', error);
    throw error;
  }
};

/**
 * Get specific pre-ticket by ID
 * @param {string} userId - User ID
 * @param {string} ticketId - Ticket ID
 * @returns {Promise<Object>} Ticket object
 */
export const getPreTicketById = async (userId, ticketId) => {
  try {
    const db = getFirestore();
    const ticketRef = doc(db, 'users', userId, 'preTickets', ticketId);
    const userRef = doc(db, 'users', userId);
    
    const [ticketSnapshot, userSnapshot] = await Promise.all([
      getDoc(ticketRef),
      getDoc(userRef)
    ]);
    
    if (!ticketSnapshot.exists()) {
      throw new Error('Ticket not found');
    }
    
    const data = ticketSnapshot.data();
    
    return {
      id: ticketSnapshot.id,
      userId: userId,
      user: userSnapshot.exists() ? userSnapshot.data() : { name: 'Unknown User', email: 'N/A' },
      boardedAt: data.boardedAt?.toDate?.()?.toISOString() || data.boardedAt,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      scannedAt: data.scannedAt?.toDate?.()?.toISOString() || data.scannedAt,
      discountBreakdown: data.discountBreakdown || [],
      fare: data.fare || '0.00',
      from: data.from || '',
      km: data.km || '',
      qrData: data.qrData || '',
      quantity: data.quantity || 0,
      scannedBy: data.scannedBy || null,
      status: data.status || 'pending',
      to: data.to || '',
      totalFare: data.totalFare || '0.00'
    };
  } catch (error) {
    console.error('Error fetching pre-ticket:', error);
    throw error;
  }
};

/**
 * Update ticket status
 * @param {string} userId - User ID
 * @param {string} ticketId - Ticket ID
 * @param {string} newStatus - New status
 * @returns {Promise<boolean>} Success status
 */
export const updateTicketStatus = async (userId, ticketId, newStatus) => {
  try {
    const db = getFirestore();
    const ticketRef = doc(db, 'users', userId, 'preTickets', ticketId);
    
    const updateData = { status: newStatus };
    if (newStatus === 'boarded') {
      updateData.boardedAt = serverTimestamp();
    }
    
    await updateDoc(ticketRef, updateData);
    return true;
  } catch (error) {
    console.error('Error updating ticket status:', error);
    throw error;
  }
};

/**
 * Delete a pre-ticket
 * @param {string} userId - User ID
 * @param {string} ticketId - Ticket ID to delete
 * @returns {Promise<boolean>} Success status
 */
export const deletePreTicket = async (userId, ticketId) => {
  try {
    const db = getFirestore();
    const ticketRef = doc(db, 'users', userId, 'preTickets', ticketId);
    await deleteDoc(ticketRef);
    return true;
  } catch (error) {
    console.error('Error deleting pre-ticket:', error);
    throw error;
  }
};