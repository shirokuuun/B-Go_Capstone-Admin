// Firebase imports
import { getFirestore, collection, getDocs, doc, getDoc, query, orderBy, limit as limitQuery, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { auth } from '/src/firebase/firebase.js';

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
            console.log(`✅ Found direction for ${tripName}: "${direction}"`);
            return direction;
          }
        }
        
        console.log(`❌ No direction found in trip map ${tripName}. Available fields:`, Object.keys(tripMap));
        return null;
      } else {
        console.log(`❌ Trip map ${tripName} not found in date document ${dateId}`);
        return null;
      }
    }
    
    console.log(`❌ Date document ${dateId} does not exist`);
    return null;
  } catch (error) {
    console.error(`❌ Could not get direction for trip ${tripName}:`, error);
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
      console.log(`❌ Date document ${dateId} does not exist`);
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
    
    console.log(`✅ Found ${tripNames.length} trip maps in ${conductorId}/${dateId}: ${tripNames.join(', ')}`);
    return tripNames;
  } catch (error) {
    console.error(`Error getting trip names for ${conductorId}/${dateId}:`, error);
    return [];
  }
};

/**
 * Get all conductors who have tickets in dailyTrips
 * @returns {Promise<Array>} Array of conductor objects with ticket counts
 */
export const getConductorsWithPreTickets = async () => {
  try {
    console.log('🔍 Starting getConductorsWithPreTickets...');
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    
    console.log(`👥 Found ${conductorsSnapshot.docs.length} conductors in database`);
    const conductorsWithTickets = [];
    
    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorData = conductorDoc.data();
      const conductorId = conductorDoc.id;
      
      console.log(`\n🔍 Checking conductor: ${conductorId} (${conductorData.name})`);
      
      // Get all daily trips for this conductor
      const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
      const dailyTripsSnapshot = await getDocs(dailyTripsRef);
      
      console.log(`📅 Found ${dailyTripsSnapshot.docs.length} daily trip documents for ${conductorId}`);
      
      let totalTicketCount = 0;
      let allTicketCount = 0; // Count all tickets regardless of type
      
      // Count tickets across all dates and trips
      for (const dateDoc of dailyTripsSnapshot.docs) {
        const dateId = dateDoc.id;
        console.log(`📅 Processing date: ${dateId}`);
        
        // Get all trip names for this date
        const tripNames = await getAllTripNames(conductorId, dateId);
        console.log(`🚌 Found trips for ${dateId}: ${tripNames.join(', ')}`);
        
        for (const tripName of tripNames) {
          try {
            const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets');
            const ticketsSnapshot = await getDocs(ticketsRef);
            
            console.log(`🎫 Found ${ticketsSnapshot.docs.length} tickets in ${tripName}`);
            
            // Count all tickets and check their types
            ticketsSnapshot.forEach(ticketDoc => {
              const ticketData = ticketDoc.data();
              allTicketCount++;
              
              console.log(`🎫 Ticket ${ticketDoc.id}: type="${ticketData.ticketType}", from="${ticketData.from}", to="${ticketData.to}"`);
              
              // Count tickets that are preTicket type OR if no ticketType is specified, count all
              if (ticketData.ticketType === 'preTicket' || !ticketData.ticketType) {
                totalTicketCount++;
              }
            });
          } catch (error) {
            console.log(`⚠️ No tickets found for ${tripName}: ${error.message}`);
            continue;
          }
        }
      }
      
      console.log(`📊 ${conductorId} summary: ${totalTicketCount} preTickets, ${allTicketCount} total tickets`);
      
      // Include conductor if they have any tickets (be more permissive)
      if (allTicketCount > 0) {
        console.log(`✅ Adding conductor ${conductorId} to list`);
        conductorsWithTickets.push({
          id: conductorId,
          ...conductorData,
          preTicketsCount: totalTicketCount > 0 ? totalTicketCount : allTicketCount
        });
      } else {
        console.log(`❌ Skipping conductor ${conductorId} (no tickets found)`);
      }
    }
    
    console.log(`\n🎯 Final result: ${conductorsWithTickets.length} conductors with tickets`);
    console.log('👥 Conductors found:', conductorsWithTickets.map(c => ({ id: c.id, name: c.name, tickets: c.preTicketsCount })));
    
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
 * Get tickets for a specific conductor from dailyTrips
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
              
              // Include preTicket type tickets OR tickets without a ticketType (be more permissive)
              if (ticketData.ticketType === 'preTicket' || !ticketData.ticketType || ticketData.ticketType === 'preBooking') {
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
                  ticketType: ticketData.ticketType,
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
              
              // Count tickets by type
              if (ticketData.ticketType === 'preTicket') {
                preTickets++;
                totalTickets++;
                conductorHasTickets = true;
              } else if (ticketData.ticketType === 'preBooking') {
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
      offlineTickets: 0, // Not applicable for this structure
      totalTrips
    };
  } catch (error) {
    console.error('Error fetching ticketing stats:', error);
    throw error;
  }
};

/**
 * Get all recent tickets (across all conductors) from dailyTrips
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
                
                // Include preTicket type tickets OR tickets without a ticketType (be more permissive)
                if (ticketData.ticketType === 'preTicket' || !ticketData.ticketType || ticketData.ticketType === 'preBooking') {
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
                    ticketType: ticketData.ticketType,
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
    console.log('🔍 Searching for ticket:', ticketId, 'for conductor:', conductorId);
    
    // We need to search through all dates and trips to find the ticket
    const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
    const dailyTripsSnapshot = await getDocs(dailyTripsRef);
    
    console.log(`📅 Found ${dailyTripsSnapshot.docs.length} daily trip documents`);
    
    for (const dateDoc of dailyTripsSnapshot.docs) {
      const dateId = dateDoc.id;
      console.log(`📅 Checking date: ${dateId}`);
      
      // Get all trip names for this date
      const tripNames = await getAllTripNames(conductorId, dateId);
      console.log(`🚌 Found trips for ${dateId}:`, tripNames);
      
      for (const tripName of tripNames) {
        try {
          console.log(`🔍 Checking trip ${tripName} for ticket ${ticketId}`);
          const ticketRef = doc(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets', ticketId);
          const ticketSnapshot = await getDoc(ticketRef);
          
          if (ticketSnapshot.exists()) {
            console.log(`✅ Found ticket ${ticketId} in ${tripName} on ${dateId}`);
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
              ticketType: ticketData.ticketType,
              scannedAt: ticketData.timestamp,
              time: ticketData.timestamp ? new Date(ticketData.timestamp.seconds * 1000).toLocaleTimeString() : '',
              dateFormatted: ticketData.timestamp ? new Date(ticketData.timestamp.seconds * 1000).toLocaleDateString() : dateId
            };
          } else {
            console.log(`❌ Ticket ${ticketId} not found in ${tripName}`);
          }
        } catch (error) {
          console.log(`⚠️ Error checking trip ${tripName}:`, error.message);
          // Continue searching in other trips
          continue;
        }
      }
    }
    
    console.log(`❌ Ticket ${ticketId} not found anywhere`);
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
    
    // Find the ticket first to get its location
    const ticket = await getPreTicketById(conductorId, ticketId);
    
    const ticketRef = doc(db, 'conductors', conductorId, 'dailyTrips', ticket.date, ticket.tripId, 'tickets', 'tickets', ticketId);
    
    await deleteDoc(ticketRef);
    
    return true;
  } catch (error) {
    console.error('Error deleting ticket:', error);
    throw error;
  }
};