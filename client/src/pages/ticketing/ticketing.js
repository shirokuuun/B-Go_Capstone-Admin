import { getFirestore, collection, getDocs, doc, getDoc, query, orderBy, limit as limitQuery, updateDoc, deleteDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth } from '/src/firebase/firebase.js';
import { logActivity, ACTIVITY_TYPES } from '/src/pages/settings/auditService.js';

const db = getFirestore();

/**
 * Get trip direction from date document trip map
 */
const getTripDirection = async (conductorId, dateId, tripName) => {
  try {
    // Get the date document which contains the trip maps
    const dateDocRef = doc(db, `conductors/${conductorId}/dailyTrips/${dateId}`);
    const dateDocSnapshot = await getDoc(dateDocRef);
    
    if (dateDocSnapshot.exists()) {
      const dateData = dateDocSnapshot.data();
      
      // Look for the specific trip map in the date document
      if (dateData[tripName] && typeof dateData[tripName] === 'object') {
        const tripMap = dateData[tripName];
        
        if (tripMap.direction && typeof tripMap.direction === 'string') {
          const direction = tripMap.direction.trim();
          if (direction.length > 0) {
            return direction;
          }
        }
        return null;
      } else {
        return null;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
};

/**
 * Helper function to get all trip names from date document maps
 */
const getAllTripNames = async (conductorId, dateId) => {
  try {
    // Get the date document which contains trip maps
    const dateDocRef = doc(db, `conductors/${conductorId}/dailyTrips/${dateId}`);
    const dateDocSnapshot = await getDoc(dateDocRef);
    
    if (!dateDocSnapshot.exists()) {
      return [];
    }
    
    const dateData = dateDocSnapshot.data();
    const tripNames = [];
    
    // Look for all fields that start with "trip" and are objects (maps)
    for (const [key, value] of Object.entries(dateData)) {
      if (key.startsWith('trip') && typeof value === 'object' && value !== null) {
        tripNames.push(key);
      }
    }
    return tripNames;
  } catch (error) {
    console.error(`Error getting trip names for ${conductorId}/${dateId}:`, error);
    return [];
  }
};

/**
 * Get all conductors who have tickets in dailyTrips (all ticket types)
 * @returns {Promise<Array>} Array of conductor objects with ticket counts
 */
export const getConductorsWithPreTickets = async () => {
  try {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    const conductorsWithTickets = [];
    
    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorData = conductorDoc.data();
      const conductorId = conductorDoc.id;
      
      // Get all daily trips for this conductor
      const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
      const dailyTripsSnapshot = await getDocs(dailyTripsRef);
      
      let preTicketCount = 0; // Count pre-tickets
      let preBookingCount = 0; // Count pre-bookings  
      let conductorTicketCount = 0; // Count conductor tickets
      let allTicketCount = 0; // Count all tickets regardless of type
      
      // Count tickets across all dates and trips
      for (const dateDoc of dailyTripsSnapshot.docs) {
        const dateId = dateDoc.id;
        
        // Get all trip names for this date
        const tripNames = await getAllTripNames(conductorId, dateId);
        
        for (const tripName of tripNames) {
          try {
            const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets');
            const ticketsSnapshot = await getDocs(ticketsRef);
            
            // Count all tickets and check their types
            ticketsSnapshot.forEach(ticketDoc => {
              const ticketData = ticketDoc.data();
              allTicketCount++;
              
              // Count tickets by type - prioritize documentType for pre-tickets and pre-bookings
              if (ticketData.documentType === 'preTicket') {
                preTicketCount++;
              } else if (ticketData.documentType === 'preBooking') {
                preBookingCount++;
              } else {
                // All other tickets (including undefined, null, '', or any other value) are conductor tickets
                conductorTicketCount++;
              }
            });
          } catch (error) {
            console.log(`⚠️ No tickets found for ${tripName}: ${error.message}`);
            continue;
          }
        }
      }
      
      // Calculate total tickets
      allTicketCount = preTicketCount + preBookingCount + conductorTicketCount;
      
      // Include conductor if they have any tickets
      if (allTicketCount > 0) {
        conductorsWithTickets.push({
          id: conductorId,
          ...conductorData,
          preTicketsCount: allTicketCount, // now shows ALL tickets (conductor + pre-tickets + pre-bookings)
          totalTicketsCount: allTicketCount, // Total ticket count (same as above)
          preTicketsOnly: preTicketCount, // Actual pre-tickets count for statistics
          stats: {
            preTickets: preTicketCount,
            preBookings: preBookingCount,
            conductorTickets: conductorTicketCount,
            totalTickets: allTicketCount
          }
        });
      } 
    }
    return conductorsWithTickets;
  } catch (error) {
    console.error('Error fetching conductors with tickets:', error);
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
 * Get all tickets for a specific conductor from dailyTrips (all ticket types)
 * @param {string} conductorId - Conductor ID
 * @param {number} limit - Number of tickets to fetch
 * @returns {Promise<Array>} Array of ticket objects
 */
export const getPreTicketsByConductor = async (conductorId, limit = 50) => {
  try {
    const allTickets = [];
    
    // Get all daily trips for this conductor
    const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
    const dailyTripsSnapshot = await getDocs(dailyTripsRef);
    
    for (const dateDoc of dailyTripsSnapshot.docs) {
      const dateId = dateDoc.id;
      
      // Get all trip names for this date
      const tripNames = await getAllTripNames(conductorId, dateId);
      
      for (const tripName of tripNames) {
        try {
          const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets');
          const ticketsSnapshot = await getDocs(ticketsRef);
          
          if (ticketsSnapshot.docs.length > 0) {
            // Get trip direction for this trip
            const tripDirection = await getTripDirection(conductorId, dateId, tripName);
            
            ticketsSnapshot.forEach(ticketDoc => {
              const ticketData = ticketDoc.data();
              const ticketId = ticketDoc.id;
              
              // Include ALL tickets (preTicket, preBooking, and conductor tickets)
              // This allows viewing all tickets when clicking on a conductor
              if (true) { // Show all tickets
                allTickets.push({
                  id: ticketId,
                  conductorId: conductorId,
                  tripId: tripName,
                  date: dateId,
                  amount: ticketData.totalFare || 0,
                  quantity: ticketData.quantity || 0,
                  from: ticketData.from || '',
                  to: ticketData.to || '',
                  fromKm: ticketData.startKm || 0,
                  toKm: ticketData.endKm || 0,
                  route: `${ticketData.from} → ${ticketData.to}`,
                  direction: tripDirection || `${ticketData.from} → ${ticketData.to}`, // Use direction or fallback
                  timestamp: ticketData.timestamp,
                  discountBreakdown: ticketData.discountBreakdown || [],
                  status: ticketData.active ? 'active' : 'inactive',
                  ticketType: ticketData.ticketType || ticketData.documentType,
                  documentType: ticketData.documentType || ticketData.ticketType, // Add for consistency
                  scannedAt: ticketData.timestamp,
                  time: ticketData.timestamp ? new Date(ticketData.timestamp.seconds * 1000).toLocaleTimeString() : '',
                  dateFormatted: ticketData.timestamp ? new Date(ticketData.timestamp.seconds * 1000).toLocaleDateString() : dateId
                });
              }
            });
          }
        } catch (error) {
          // This is normal - not all trips will have tickets
          continue;
        }
      }
    }
    
    // Sort by timestamp (most recent first) and limit results
    const sortedTickets = allTickets
      .sort((a, b) => {
        const aTime = a.timestamp?.seconds || 0;
        const bTime = b.timestamp?.seconds || 0;
        return bTime - aTime;
      })
      .slice(0, limit);
    
    return sortedTickets;
  } catch (error) {
    console.error('Error fetching tickets by conductor:', error);
    throw error;
  }
};

/**
 * Get ticketing statistics from dailyTrips
 * @returns {Promise<Object>} Statistics object
 */
export const getPreTicketingStats = async () => {
  try {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    
    let totalTickets = 0;
    let preTickets = 0;
    let preBookings = 0;
    let conductorTickets = 0;
    let conductorsWithTickets = 0;
    let totalTrips = 0;

    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;
      let conductorHasTickets = false;
      
      // Get all daily trips for this conductor
      const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
      const dailyTripsSnapshot = await getDocs(dailyTripsRef);
      
      for (const dateDoc of dailyTripsSnapshot.docs) {
        const dateId = dateDoc.id;
        
        // Get all trip names for this date
        const tripNames = await getAllTripNames(conductorId, dateId);
        
        for (const tripName of tripNames) {
          try {
            const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets');
            const ticketsSnapshot = await getDocs(ticketsRef);
            
            if (ticketsSnapshot.docs.length > 0) {
              totalTrips++;
            }
            
            ticketsSnapshot.forEach(ticketDoc => {
              const ticketData = ticketDoc.data();
              
              // Count tickets by type - prioritize documentType for pre-tickets and pre-bookings
              if (ticketData.documentType === 'preTicket') {
                preTickets++;
                totalTickets++;
                conductorHasTickets = true;
              } else if (ticketData.documentType === 'preBooking') {
                preBookings++;
                totalTickets++;
                conductorHasTickets = true;
              } else {
                // All other tickets (including undefined, null, '', or any other value) are conductor tickets
                conductorTickets++;
                totalTickets++;
                conductorHasTickets = true;
              }
            });
          } catch (error) {
            // This is normal - not all trips will have tickets
            continue;
          }
        }
      }
      
      if (conductorHasTickets) {
        conductorsWithTickets++;
      }
    }

    return {
      totalTickets,
      preTickets,
      preBookings,
      conductorTickets,
      onlineTickets: conductorsWithTickets,
      totalTrips
    };
  } catch (error) {
    console.error('Error fetching ticketing stats:', error);
    throw error;
  }
};

/**
 * Get all recent tickets (across all conductors) from dailyTrips (all ticket types)
 * @param {number} limit - Number of tickets to fetch
 * @returns {Promise<Array>} Array of ticket objects with conductor info
 */
export const getAllRecentPreTickets = async (limitParam = 50) => {
  try {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    
    const allTickets = [];
    
    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorData = conductorDoc.data();
      const conductorId = conductorDoc.id;
      
      // Get all daily trips for this conductor
      const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
      const dailyTripsSnapshot = await getDocs(dailyTripsRef);
      
      for (const dateDoc of dailyTripsSnapshot.docs) {
        const dateId = dateDoc.id;
        
        // Get all trip names for this date
        const tripNames = await getAllTripNames(conductorId, dateId);
        
        for (const tripName of tripNames) {
          try {
            const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets');
            const ticketsSnapshot = await getDocs(ticketsRef);
            
            if (ticketsSnapshot.docs.length > 0) {
              // Get trip direction for this trip
              const tripDirection = await getTripDirection(conductorId, dateId, tripName);
              
              ticketsSnapshot.forEach(ticketDoc => {
                const ticketData = ticketDoc.data();
                const ticketId = ticketDoc.id;
                
                // Include ALL tickets (preTicket, preBooking, and conductor tickets)
                // This allows viewing all recent tickets across all conductors
                if (true) { // Show all tickets
                  allTickets.push({
                    id: ticketId,
                    conductorId: conductorId,
                    conductor: conductorData,
                    tripId: tripName,
                    date: dateId,
                    amount: ticketData.totalFare || 0,
                    quantity: ticketData.quantity || 0,
                    from: ticketData.from || '',
                    to: ticketData.to || '',
                    fromKm: ticketData.startKm || 0,
                    toKm: ticketData.endKm || 0,
                    route: `${ticketData.from} → ${ticketData.to}`,
                    direction: tripDirection || `${ticketData.from} → ${ticketData.to}`, // Use direction or fallback
                    timestamp: ticketData.timestamp,
                    discountBreakdown: ticketData.discountBreakdown || [],
                    status: ticketData.active ? 'active' : 'inactive',
                    ticketType: ticketData.ticketType || ticketData.documentType,
                    documentType: ticketData.documentType || ticketData.ticketType, // Add for consistency
                    scannedAt: ticketData.timestamp,
                    time: ticketData.timestamp ? new Date(ticketData.timestamp.seconds * 1000).toLocaleTimeString() : '',
                    dateFormatted: ticketData.timestamp ? new Date(ticketData.timestamp.seconds * 1000).toLocaleDateString() : dateId
                  });
                }
              });
            }
          } catch (error) {
            // This is normal - not all trips will have tickets
            continue;
          }
        }
      }
    }
    
    // Sort by timestamp and limit
    return allTickets
      .sort((a, b) => {
        const aTime = a.timestamp?.seconds || 0;
        const bTime = b.timestamp?.seconds || 0;
        return bTime - aTime;
      })
      .slice(0, limitParam);
  } catch (error) {
    console.error('Error fetching all recent tickets:', error);
    throw error;
  }
};

/**
 * Get specific ticket by ID from dailyTrips
 * @param {string} conductorId - Conductor ID
 * @param {string} ticketId - Ticket ID
 * @returns {Promise<Object>} Ticket object
 */
export const getPreTicketById = async (conductorId, ticketId) => {
  try {
    
    // We need to search through all dates and trips to find the ticket
    const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
    const dailyTripsSnapshot = await getDocs(dailyTripsRef);
    
    for (const dateDoc of dailyTripsSnapshot.docs) {
      const dateId = dateDoc.id;
      
      // Get all trip names for this date
      const tripNames = await getAllTripNames(conductorId, dateId);
      
      for (const tripName of tripNames) {
        try {
          const ticketRef = doc(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets', ticketId);
          const ticketSnapshot = await getDoc(ticketRef);
          
          if (ticketSnapshot.exists()) {
            const ticketData = ticketSnapshot.data();
            const conductorRef = doc(db, 'conductors', conductorId);
            const conductorSnapshot = await getDoc(conductorRef);
            
            // Get trip direction
            const tripDirection = await getTripDirection(conductorId, dateId, tripName);
            
            return {
              id: ticketId,
              conductorId: conductorId,
              conductor: conductorSnapshot.exists() ? conductorSnapshot.data() : { name: 'Unknown Conductor', email: 'N/A' },
              tripId: tripName,
              date: dateId,
              amount: ticketData.totalFare || 0,
              quantity: ticketData.quantity || 0,
              from: ticketData.from || '',
              to: ticketData.to || '',
              fromKm: ticketData.startKm || 0,
              toKm: ticketData.endKm || 0,
              route: `${ticketData.from} → ${ticketData.to}`,
              direction: tripDirection || `${ticketData.from} → ${ticketData.to}`, // Use direction or fallback
              timestamp: ticketData.timestamp,
              discountBreakdown: ticketData.discountBreakdown || [],
              status: ticketData.active ? 'active' : 'inactive',
              ticketType: ticketData.ticketType || ticketData.documentType,
              documentType: ticketData.documentType || ticketData.ticketType, // Add for consistency
              scannedAt: ticketData.timestamp,
              time: ticketData.timestamp ? new Date(ticketData.timestamp.seconds * 1000).toLocaleTimeString() : '',
              dateFormatted: ticketData.timestamp ? new Date(ticketData.timestamp.seconds * 1000).toLocaleDateString() : dateId
            };
          } 
        } catch (error) {
          console.log(`⚠️ Error checking trip ${tripName}:`, error.message);
          // Continue searching in other trips
          continue;
        }
      }
    }
    throw new Error('Ticket not found');
  } catch (error) {
    console.error('❌ Error fetching ticket:', error);
    throw error;
  }
};

/**
 * Update ticket status
 * @param {string} conductorId - Conductor ID
 * @param {string} ticketId - Ticket ID
 * @param {string} newStatus - New status
 * @returns {Promise<boolean>} Success status
 */
export const updateTicketStatus = async (conductorId, ticketId, newStatus) => {
  try {
    // We need to find the ticket first
    const ticket = await getPreTicketById(conductorId, ticketId);
    
    const ticketRef = doc(db, 'conductors', conductorId, 'dailyTrips', ticket.date, ticket.tripId, 'tickets', 'tickets', ticketId);
    
    const updateData = { 
      active: newStatus === 'active',
      status: newStatus
    };
    
    if (newStatus === 'boarded') {
      updateData.scannedAt = serverTimestamp();
    }
    
    await updateDoc(ticketRef, updateData);

    // Log the ticket status update activity
    const activityType = newStatus === 'boarded' ? ACTIVITY_TYPES.TICKET_SCAN : ACTIVITY_TYPES.TICKET_UPDATE;
    const actionDescription = newStatus === 'boarded' ? 'scanned' : `updated status to ${newStatus}`;
    
    // Create clean metadata object (filter out undefined values)
    const metadata = {
      ticketId: ticketId,
      conductorId: conductorId,
      passengerName: ticket.passengerName || 'Unknown Passenger',
      route: ticket.route || 'Unknown Route',
      tripDate: ticket.date || 'Unknown Date',
      tripId: ticket.tripId || 'Unknown Trip',
      previousStatus: ticket.status || 'unknown',
      newStatus: newStatus,
      isScanned: newStatus === 'boarded',
      ticketNumber: ticket.ticketNumber || ticketId,
      updatedAt: new Date().toISOString()
    };

    // Only add optional fields if they have values (not null/undefined)
    if (ticket.passengerEmail) metadata.passengerEmail = ticket.passengerEmail;
    if (ticket.seatNumber) metadata.seatNumber = ticket.seatNumber;
    
    await logActivity(
      activityType,
      `Ticket ${actionDescription}: ${ticket.passengerName || 'Unknown Passenger'} (${ticket.route || 'Unknown Route'})`,
      metadata
    );

    return true;
  } catch (error) {
    console.error('Error updating ticket status:', error);
    throw error;
  }
};

/**
 * Delete a ticket from dailyTrips
 * @param {string} conductorId - Conductor ID
 * @param {string} ticketId - Ticket ID to delete
 * @returns {Promise<boolean>} Success status
 */
export const deletePreTicket = async (conductorId, ticketId) => {
  try {
    // Check if current user is superadmin before attempting delete
    if (!auth.currentUser) {
      throw new Error('User not authenticated');
    }

    const adminDocRef = doc(db, 'Admin', auth.currentUser.uid);
    const adminDoc = await getDoc(adminDocRef);
    
    if (!adminDoc.exists()) {
      throw new Error('Access denied: Admin document not found');
    }

    const adminData = adminDoc.data();
    
    // Check if user is superadmin
    if (adminData.role !== 'superadmin' || adminData.isSuperAdmin !== true) {
      throw new Error('Access denied: Only superadmin users can delete tickets. You are logged in as a regular admin.');
    }
    
    // Find the ticket first to get its location and data for logging
    const ticket = await getPreTicketById(conductorId, ticketId);
    
    const ticketRef = doc(db, 'conductors', conductorId, 'dailyTrips', ticket.date, ticket.tripId, 'tickets', 'tickets', ticketId);
    
    // Log the ticket deletion activity BEFORE deleting
    // Create clean metadata object (filter out undefined values)
    const deletionMetadata = {
      ticketId: ticketId,
      conductorId: conductorId,
      passengerName: ticket.passengerName || 'Unknown Passenger',
      route: ticket.route || 'Unknown Route',
      tripDate: ticket.date || 'Unknown Date',
      tripId: ticket.tripId || 'Unknown Trip',
      ticketStatus: ticket.status || 'unknown',
      ticketNumber: ticket.ticketNumber || ticketId,
      wasScanned: ticket.status === 'boarded',
      deletedAt: new Date().toISOString(),
      deletedBy: 'superadmin'
    };

    // Only add optional fields if they have values
    if (ticket.passengerEmail) deletionMetadata.passengerEmail = ticket.passengerEmail;
    if (ticket.seatNumber) deletionMetadata.seatNumber = ticket.seatNumber;
    if (ticket.scannedAt) deletionMetadata.scannedAt = ticket.scannedAt;
    
    // Create clean ticket data object
    const cleanTicketData = {};
    if (ticket.timestamp !== undefined) cleanTicketData.timestamp = ticket.timestamp;
    if (ticket.active !== undefined) cleanTicketData.active = ticket.active;
    if (ticket.direction !== undefined) cleanTicketData.direction = ticket.direction;
    
    if (Object.keys(cleanTicketData).length > 0) {
      deletionMetadata.ticketData = cleanTicketData;
    }
    
    await logActivity(
      ACTIVITY_TYPES.TICKET_DELETE,
      `Deleted ticket: ${ticket.passengerName || 'Unknown Passenger'} (${ticket.route || 'Unknown Route'})`,
      deletionMetadata
    );
    
    await deleteDoc(ticketRef);
    
    return true;
  } catch (error) {
    console.error('Error deleting ticket:', error);
    throw error;
  }
};

// ==================== REAL-TIME FUNCTIONS ====================

/**
 * Subscribe to real-time conductor updates with tickets
 * @param {Function} onUpdate - Callback function that receives updated conductors array
 * @returns {Function} Unsubscribe function to stop listening
 */
export const subscribeToConductorsWithTickets = (onUpdate) => {
  try {
    const conductorsRef = collection(db, 'conductors');
    
    const unsubscribe = onSnapshot(conductorsRef, async (snapshot) => {
      try {
        // Process the conductors data using existing logic
        const conductorsWithTickets = [];
        
        for (const conductorDoc of snapshot.docs) {
          const conductorData = conductorDoc.data();
          const conductorId = conductorDoc.id;
          
          // Get all daily trips for this conductor
          const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
          const dailyTripsSnapshot = await getDocs(dailyTripsRef);
          
          let preTicketCount = 0;
          let preBookingCount = 0;
          let conductorTicketCount = 0;
          let allTicketCount = 0;
          
          // Count tickets across all dates and trips
          for (const dateDoc of dailyTripsSnapshot.docs) {
            const dateId = dateDoc.id;
            
            // Get all trip names for this date
            const tripNames = await getAllTripNames(conductorId, dateId);
            
            for (const tripName of tripNames) {
              try {
                const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets');
                const ticketsSnapshot = await getDocs(ticketsRef);
                
                ticketsSnapshot.forEach(ticketDoc => {
                  const ticketData = ticketDoc.data();
                  allTicketCount++;
                  
                  // Count tickets by type - prioritize documentType
                  if (ticketData.documentType === 'preTicket') {
                    preTicketCount++;
                  } else if (ticketData.documentType === 'preBooking') {
                    preBookingCount++;
                  } else {
                    conductorTicketCount++;
                  }
                });
              } catch (error) {
                continue;
              }
            }
          }
          
          // Calculate total tickets
          allTicketCount = preTicketCount + preBookingCount + conductorTicketCount;
          
          // Include conductor if they have any tickets
          if (allTicketCount > 0) {
            conductorsWithTickets.push({
              id: conductorId,
              ...conductorData,
              preTicketsCount: allTicketCount,
              totalTicketsCount: allTicketCount,
              preTicketsOnly: preTicketCount,
              stats: {
                preTickets: preTicketCount,
                preBookings: preBookingCount,
                conductorTickets: conductorTicketCount,
                totalTickets: allTicketCount
              }
            });
          }
        }
        onUpdate(conductorsWithTickets);
        
      } catch (error) {
        console.error('Error processing real-time conductor updates:', error);
        onUpdate(null, error);
      }
    }, (error) => {
      console.error('Error in conductors real-time listener:', error);
      onUpdate(null, error);
    });

    return unsubscribe;
  } catch (error) {
    console.error('Error setting up conductors real-time listener:', error);
    throw new Error('Failed to set up real-time listener: ' + error.message);
  }
};

/**
 * Subscribe to real-time ticket updates for a specific conductor
 * @param {string} conductorId - Conductor ID
 * @param {Function} onUpdate - Callback function that receives updated tickets array
 * @returns {Function} Unsubscribe function to stop listening
 */
export const subscribeToTicketsByConductor = (conductorId, onUpdate) => {
  try {
    const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
    
    const unsubscribe = onSnapshot(dailyTripsRef, async (snapshot) => {
      try {
        const allTickets = [];
        
        for (const dateDoc of snapshot.docs) {
          const dateId = dateDoc.id;
          
          // Get all trip names for this date
          const tripNames = await getAllTripNames(conductorId, dateId);
          
          for (const tripName of tripNames) {
            try {
              const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets');
              const ticketsSnapshot = await getDocs(ticketsRef);
              
              if (ticketsSnapshot.docs.length > 0) {
                // Get trip direction for this trip
                const tripDirection = await getTripDirection(conductorId, dateId, tripName);
                
                ticketsSnapshot.forEach(ticketDoc => {
                  const ticketData = ticketDoc.data();
                  const ticketId = ticketDoc.id;
                  
                  allTickets.push({
                    id: ticketId,
                    conductorId: conductorId,
                    tripId: tripName,
                    date: dateId,
                    amount: ticketData.totalFare || 0,
                    quantity: ticketData.quantity || 0,
                    from: ticketData.from || '',
                    to: ticketData.to || '',
                    fromKm: ticketData.startKm || 0,
                    toKm: ticketData.endKm || 0,
                    route: `${ticketData.from} → ${ticketData.to}`,
                    direction: tripDirection || `${ticketData.from} → ${ticketData.to}`,
                    timestamp: ticketData.timestamp,
                    discountBreakdown: ticketData.discountBreakdown || [],
                    status: ticketData.active ? 'active' : 'inactive',
                    ticketType: ticketData.ticketType || ticketData.documentType,
                    documentType: ticketData.documentType || ticketData.ticketType,
                    scannedAt: ticketData.timestamp,
                    time: ticketData.timestamp ? new Date(ticketData.timestamp.seconds * 1000).toLocaleTimeString() : '',
                    dateFormatted: ticketData.timestamp ? new Date(ticketData.timestamp.seconds * 1000).toLocaleDateString() : dateId
                  });
                });
              }
            } catch (error) {
              continue;
            }
          }
        }
        
        // Sort by timestamp (most recent first)
        const sortedTickets = allTickets
          .sort((a, b) => {
            const aTime = a.timestamp?.seconds || 0;
            const bTime = b.timestamp?.seconds || 0;
            return bTime - aTime;
          })
          .slice(0, 50); // Limit to 50 tickets
        onUpdate(sortedTickets);
        
      } catch (error) {
        console.error(`Error processing real-time ticket updates for conductor ${conductorId}:`, error);
        onUpdate(null, error);
      }
    }, (error) => {
      console.error(`Error in tickets real-time listener for conductor ${conductorId}:`, error);
      onUpdate(null, error);
    });

    return unsubscribe;
  } catch (error) {
    console.error(`Error setting up tickets real-time listener for conductor ${conductorId}:`, error);
    throw new Error('Failed to set up real-time listener: ' + error.message);
  }
};