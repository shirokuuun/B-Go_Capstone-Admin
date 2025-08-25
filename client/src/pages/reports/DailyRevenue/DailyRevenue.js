import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '/src/firebase/firebase.js';

// Alternative helper function to get trip names by checking for tickets
const getAllTripNamesFromTickets = async (conductorId, dateId) => {
  try {
    const tripNames = [];
    let consecutiveNotFound = 0;
    
    // Check for trips from trip1 to trip50 by looking for tickets
    for (let i = 1; i <= 50; i++) {
      const tripName = `trip${i}`;
      try {
        // Check if tickets exist for this trip
        const ticketsRef = collection(db, `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/tickets/tickets`);
        const ticketsSnapshot = await getDocs(ticketsRef);
        
        if (ticketsSnapshot.docs.length > 0) {
          tripNames.push(tripName);
          consecutiveNotFound = 0; // Reset counter when we find tickets
        } else {
          consecutiveNotFound++;
          if (consecutiveNotFound >= 5) {
            break;
          }
        }
      } catch (error) {
        consecutiveNotFound++;
        if (consecutiveNotFound >= 5) {
          break;
        }
      }
    }
    
    console.log(`🎟️ Found ${tripNames.length} trips with tickets for ${conductorId}/${dateId}: ${tripNames.join(', ')}`);
    return tripNames;
  } catch (error) {
    console.error(`Error getting trip names from tickets for ${conductorId}/${dateId}:`, error);
    return [];
  }
};

// Helper function to get all trip names from date document maps
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
    
    console.log(`🗺️ Found ${tripNames.length} trip maps in ${conductorId}/${dateId}: ${tripNames.join(', ')}`);
    return tripNames;
  } catch (error) {
    console.error(`Error getting trip names for ${conductorId}/${dateId}:`, error);
    return [];
  }
};

// Helper function to get all trip maps from a date document
const getAllTripMapsFromDate = async (conductorId, dateId) => {
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
    
    console.log(`🗺️ Found ${tripNames.length} trip maps in date ${dateId}: ${tripNames.join(', ')}`);
    return tripNames;
  } catch (error) {
    console.error(`Error getting trip maps for ${conductorId}/${dateId}:`, error);
    return [];
  }
};

// Get available routes from the database based on trip directions in date documents
export const getAvailableRoutes = async () => {
  try {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    const availableRoutes = new Set();


    console.log('🚏 Fetching available routes from database...');

    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;
      console.log(`📍 Processing conductor: ${conductorId}`);
      
      try {
        // Get all daily trips for this conductor
        const dailyTripsRef = collection(db, `conductors/${conductorId}/dailyTrips`);
        const dailyTripsSnapshot = await getDocs(dailyTripsRef);
        
        console.log(`📦 Found ${dailyTripsSnapshot.docs.length} daily trip documents for conductor ${conductorId}`);
        
        for (const dateDoc of dailyTripsSnapshot.docs) {
          const dateId = dateDoc.id;
          const dateData = dateDoc.data();
          console.log(`📅 Processing date document: ${dateId}`);
          
          // Look for trip maps directly in the date document
          for (const [key, value] of Object.entries(dateData)) {
            if (key.startsWith('trip') && typeof value === 'object' && value !== null) {
              console.log(`🗺️ Found trip map ${key}:`, value);
              
              // Check if this trip map has a direction field
              if (value.direction && typeof value.direction === 'string') {
                const direction = value.direction.trim();
                if (direction.length > 0) {
                  availableRoutes.add(direction);
                  console.log(`✅ Added route from ${key}: "${direction}"`);
                } else {
                  console.log(`⚠️ Empty direction found in ${key}`);
                }
              } else {
                console.log(`❌ No direction found in trip map ${key}`);
              }
            }
          }
        }
      } catch (conductorError) {
        console.error(`❌ Error fetching routes for conductor ${conductorId}:`, conductorError);
        continue;
      }
    }

    const sortedRoutes = Array.from(availableRoutes).sort();
    console.log('🚏 Final available routes found (after exclusions):', sortedRoutes);
    console.log('🚏 Total unique routes:', sortedRoutes.length);
    
    return sortedRoutes;
  } catch (error) {
    console.error('❌ Error fetching available routes:', error);
    return [];
  }
};

// Get available dates from the database based on createdAt field
export const getAvailableDates = async () => {
  try {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    const availableDates = new Set();

    console.log('📅 Fetching available dates from database...');

    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;
      console.log(`📍 Processing conductor: ${conductorId}`);
      
      try {
        // Get all daily trips for this conductor
        const dailyTripsRef = collection(db, `conductors/${conductorId}/dailyTrips`);
        const dailyTripsSnapshot = await getDocs(dailyTripsRef);
        
        console.log(`📦 Found ${dailyTripsSnapshot.docs.length} daily trip documents for conductor ${conductorId}`);
        
        for (const dateDoc of dailyTripsSnapshot.docs) {
          const dateData = dateDoc.data();
          const dateId = dateDoc.id;
          
          console.log(`📅 Processing date document: ${dateId}`, dateData);
          
          // Check if the date document has a createdAt field
          if (dateData.createdAt) {
            const createdAt = dateData.createdAt.toDate ? dateData.createdAt.toDate() : new Date(dateData.createdAt);
            const dateString = createdAt.toISOString().split('T')[0];
            availableDates.add(dateString);
            console.log(`✅ Added date from createdAt: ${dateString}`);
          }
          
          // Also check if the document ID itself is a valid date (format: YYYY-MM-DD)
          if (dateId.match(/^\d{4}-\d{2}-\d{2}$/)) {
            availableDates.add(dateId);
            console.log(`✅ Added date from document ID: ${dateId}`);
          }
          
          // Additionally, check for any trips within this date to get more dates from tickets
          try {
            // Get all trip names dynamically
            const tripNames = await getAllTripNames(conductorId, dateId);
            
            for (const tripName of tripNames) {
              try {
                // Check for tickets in: /conductors/{conductorId}/dailyTrips/{dateId}/{tripName}/tickets/tickets/
                const ticketsRef = collection(db, `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/tickets/tickets`);
                const ticketsSnapshot = await getDocs(ticketsRef);
                
                for (const ticketDoc of ticketsSnapshot.docs) {
                  const ticketData = ticketDoc.data();
                  // Check if ticket has timestamp field
                  if (ticketData.timestamp) {
                    const timestamp = ticketData.timestamp.toDate ? ticketData.timestamp.toDate() : new Date(ticketData.timestamp);
                    const dateString = timestamp.toISOString().split('T')[0];
                    availableDates.add(dateString);
                    console.log(`✅ Added date from ticket timestamp: ${dateString}`);
                  }
                }
              } catch (tripError) {
                // This is normal - not all trip numbers will exist
              }
            }
          } catch (tripsError) {
            console.log(`ℹ️ No trips found for date ${dateId} (this is normal)`, tripsError.message);
          }
        }
      } catch (conductorError) {
        console.error(`❌ Error fetching dates for conductor ${conductorId}:`, conductorError);
        continue;
      }
    }

    const sortedDates = Array.from(availableDates).sort((a, b) => new Date(b) - new Date(a));
    console.log('📅 Available dates found:', sortedDates);
    
    return sortedDates;
  } catch (error) {
    console.error('❌ Error fetching available dates:', error);
    return [];
  }
};

// Enhanced function to get trip direction from date document trip map
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

// Fetch conductor trips and pre-booking data from new path structure with route filtering
export const fetchConductorTripsAndPreBooking = async (date, selectedRoute = null) => {
  try {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    let conductorTrips = [];
    let preBookingTrips = [];

    console.log('🎫 Fetching conductor trips and pre-booking for date:', date, 'route:', selectedRoute);

    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;
      console.log(`\n📍 Processing conductor: ${conductorId}`);

      try {
        // If no date is provided, get all trips from all dates
        if (!date) {
          // Get all daily trips dates for this conductor
          const dailyTripsRef = collection(db, `conductors/${conductorId}/dailyTrips`);
          const dailyTripsSnapshot = await getDocs(dailyTripsRef);
          
          for (const dateDoc of dailyTripsSnapshot.docs) {
            const dateId = dateDoc.id;
            await processTripsForDate(conductorId, dateId, conductorTrips, preBookingTrips, date, selectedRoute);
          }
        } else {
          // Process specific date
          await processTripsForDate(conductorId, date, conductorTrips, preBookingTrips, date, selectedRoute);
        }
      } catch (conductorError) {
        console.error(`Error processing conductor ${conductorId}:`, conductorError);
        continue;
      }
    }

    console.log('🎫 Total conductor trips found:', conductorTrips.length);
    console.log('🎫 Total pre-booking trips found:', preBookingTrips.length);
    
    return { conductorTrips, preBookingTrips };
  } catch (error) {
    console.error('Error fetching conductor trips and pre-booking:', error);
    return { conductorTrips: [], preBookingTrips: [] };
  }
};

// Helper function to process trips for a specific date with route filtering
const processTripsForDate = async (conductorId, dateId, conductorTrips, preBookingTrips, filterDate = null, selectedRoute = null) => {
  try {
    // Get all trip names dynamically instead of hardcoding
    const tripNames = await getAllTripNames(conductorId, dateId);
    
    console.log(`📦 Processing trips for conductor ${conductorId} on ${dateId} - Found trips: ${tripNames.join(', ')}`);
    
    for (const tripName of tripNames) {
      try {
        // Get trip direction first if route filtering is enabled
        let tripDirection = null;
        if (selectedRoute) {
          tripDirection = await getTripDirection(conductorId, dateId, tripName);
          
          // Skip this trip if it doesn't match the selected route
          if (tripDirection !== selectedRoute) {
            console.log(`⏭️ Skipping trip ${tripName}: route mismatch (${tripDirection} !== ${selectedRoute})`);
            continue;
          }
        }

        // Check if this trip exists by trying to get its tickets
        const ticketsCollectionRef = collection(db, `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/tickets/tickets`);
        const ticketsSnapshot = await getDocs(ticketsCollectionRef);
        
        if (ticketsSnapshot.docs.length > 0) {
          console.log(`🎟️ Found ${ticketsSnapshot.docs.length} tickets in ${tripName}/tickets/tickets`);
          
          // If we haven't fetched the trip direction yet, fetch it now for ticket processing
          if (!tripDirection) {
            tripDirection = await getTripDirection(conductorId, dateId, tripName);
          }
          
          for (const ticketDoc of ticketsSnapshot.docs) {
            const ticketData = ticketDoc.data();
            const ticketId = ticketDoc.id;
            
            console.log(`📝 Processing ticket: ${ticketId}`, {
              from: ticketData.from,
              to: ticketData.to,
              totalFare: ticketData.totalFare,
              quantity: ticketData.quantity,
              ticketType: ticketData.ticketType,
              documentType: ticketData.documentType,
              timestamp: ticketData.timestamp,
              tripDirection: tripDirection
            });
            
            // Check if we should include this ticket based on date filter
            if (filterDate) {
              const ticketTimestamp = ticketData.timestamp?.toDate ? ticketData.timestamp.toDate() : new Date(ticketData.timestamp);
              const ticketDateString = ticketTimestamp.toISOString().split('T')[0];
              
              if (ticketDateString !== filterDate) {
                console.log(`❌ Skipping ticket ${ticketId}: date mismatch (${ticketDateString} !== ${filterDate})`);
                continue;
              }
            }
            
            // Process valid tickets
            if (ticketData.totalFare && ticketData.quantity) {
              const processedTicket = {
                id: ticketId,
                conductorId: conductorId,
                tripId: tripName,
                tripDirection: tripDirection, // Add trip direction to ticket data
                totalFare: parseFloat(ticketData.totalFare),
                quantity: ticketData.quantity || 1,
                from: ticketData.from,
                to: ticketData.to,
                timestamp: ticketData.timestamp,
                discountAmount: parseFloat(ticketData.discountAmount || 0),
                ticketType: ticketData.ticketType || ticketData.documentType || null,
                documentType: ticketData.documentType || ticketData.ticketType || null, // Add documentType for consistency
                date: dateId,
                startKm: ticketData.startKm,
                endKm: ticketData.endKm,
                totalKm: ticketData.totalKm,
                farePerPassenger: ticketData.farePerPassenger,
                discountBreakdown: ticketData.discountBreakdown || [],
                discountList: ticketData.discountList || [],
                active: ticketData.active,
                // Include all ticket data for comprehensive reporting
                ...ticketData
              };

              // Categorize based on ticketType or documentType (fallback for consistency between DailyRevenue and Remittance)
              // Some tickets may use 'ticketType' while others use 'documentType'
              const ticketTypeField = ticketData.ticketType || ticketData.documentType || '';
              
              if (ticketTypeField === 'preBooking') {
                console.log(`✅ Adding to Pre-booking: ${ticketId} (Route: ${tripDirection}, Type: ${ticketTypeField})`);
                preBookingTrips.push({
                  ...processedTicket,
                  source: 'Pre-booking'
                });
              } else if (ticketTypeField === 'preTicket') {
                console.log(`✅ Adding to Pre-ticketing: ${ticketId} (Route: ${tripDirection}, Type: ${ticketTypeField})`);
                // Note: Pre-ticketing will be handled separately in fetchPreTicketing function
                // This is here for completeness but won't be used in the current flow
              } else {
                // conductorTicket or no ticketType/documentType = Conductor trips
                console.log(`✅ Adding to Conductor trips: ${ticketId} (Route: ${tripDirection}, Type: ${ticketTypeField || 'conductor'})`);
                conductorTrips.push({
                  ...processedTicket,
                  source: 'Conductor Trips'
                });
              }
            } else {
              console.log(`❌ Skipping invalid ticket ${ticketId}: missing totalFare or quantity`);
            }
          }
        }
      } catch (tripError) {
        // This is normal - not all trip numbers will exist
        if (tripError.code !== 'permission-denied' && !tripError.message.includes('No document to update')) {
          console.log(`ℹ️ No tickets found for ${tripName} (this is normal)`);
        }
      }
    }
  } catch (error) {
    console.error(`Error processing trips for conductor ${conductorId} on date ${dateId}:`, error);
  }
};

// Fetch pre-ticketing data from the new ticket structure with route filtering
export const fetchPreTicketing = async (date, selectedRoute = null) => {
  try {
    console.log('🚀 Starting fetchPreTicketing for date:', date, 'route:', selectedRoute);
    console.log('📍 Using Firebase path: /conductors/{conductorId}/dailyTrips/{date}/{tripId}/tickets/tickets/');
    
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    let allPreTickets = [];

    console.log(`🎯 Found ${conductorsSnapshot.docs.length} conductors`);

    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;
      console.log(`\n📍 Processing conductor: ${conductorId}`);
      
      try {
        // If no date is provided, get all trips from all dates
        if (!date) {
          // Get all daily trips dates for this conductor
          const dailyTripsRef = collection(db, `conductors/${conductorId}/dailyTrips`);
          const dailyTripsSnapshot = await getDocs(dailyTripsRef);
          
          for (const dateDoc of dailyTripsSnapshot.docs) {
            const dateId = dateDoc.id;
            await processPreTicketsForDate(conductorId, dateId, allPreTickets, date, selectedRoute);
          }
        } else {
          // Process specific date
          await processPreTicketsForDate(conductorId, date, allPreTickets, date, selectedRoute);
        }
        
      } catch (conductorError) {
        console.error(`❌ Error fetching pre-tickets for conductor ${conductorId}:`, conductorError);
        continue;
      }
    }

    console.log(`\n🎯 FINAL PRE-TICKETING RESULTS:`);
    console.log(`📊 Total pre-tickets found: ${allPreTickets.length}`);
    console.log(`📋 Sample pre-tickets:`, allPreTickets.slice(0, 3));
    
    return allPreTickets;
  } catch (error) {
    console.error('❌ CRITICAL ERROR in fetchPreTicketing:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    return [];
  }
};

// Helper function to process pre-tickets for a specific date with route filtering
const processPreTicketsForDate = async (conductorId, dateId, allPreTickets, filterDate = null, selectedRoute = null) => {
  try {
    // Get all trip names dynamically instead of hardcoding
    const tripNames = await getAllTripNames(conductorId, dateId);
    
    console.log(`📦 Processing pre-tickets for conductor ${conductorId} on ${dateId} - Found trips: ${tripNames.join(', ')}`);
    
    for (const tripName of tripNames) {
      try {
        // Get trip direction first if route filtering is enabled
        let tripDirection = null;
        if (selectedRoute) {
          tripDirection = await getTripDirection(conductorId, dateId, tripName);
          
          // Skip this trip if it doesn't match the selected route
          if (tripDirection !== selectedRoute) {
            console.log(`⏭️ Skipping pre-ticket trip ${tripName}: route mismatch (${tripDirection} !== ${selectedRoute})`);
            continue;
          }
        }

        // Get individual tickets: /conductors/{conductorId}/dailyTrips/{date}/{tripId}/tickets/tickets/
        const individualTicketsRef = collection(db, `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/tickets/tickets`);
        const individualTicketsSnapshot = await getDocs(individualTicketsRef);
        
        if (individualTicketsSnapshot.docs.length > 0) {
          console.log(`🎟️ Found ${individualTicketsSnapshot.docs.length} tickets in ${tripName}/tickets/tickets`);
          
          // If we haven't fetched the trip direction yet, fetch it now for ticket processing
          if (!tripDirection) {
            tripDirection = await getTripDirection(conductorId, dateId, tripName);
          }
          
          for (const ticketDoc of individualTicketsSnapshot.docs) {
            const ticketData = ticketDoc.data();
            const ticketId = ticketDoc.id;
            
            // Process tickets with ticketType or documentType === 'preTicket' (for consistency)
            const ticketTypeField = ticketData.ticketType || ticketData.documentType || '';
            if (ticketTypeField === 'preTicket') {
              console.log(`📝 Processing pre-ticket: ${ticketId}`, {
                from: ticketData.from,
                to: ticketData.to,
                totalFare: ticketData.totalFare,
                quantity: ticketData.quantity,
                ticketType: ticketData.ticketType,
                documentType: ticketData.documentType,
                effectiveType: ticketTypeField,
                timestamp: ticketData.timestamp,
                tripDirection: tripDirection
              });
              
              // Check if we should include this ticket based on date filter
              if (filterDate) {
                const ticketTimestamp = ticketData.timestamp?.toDate ? ticketData.timestamp.toDate() : new Date(ticketData.timestamp);
                const ticketDateString = ticketTimestamp.toISOString().split('T')[0];
                
                if (ticketDateString !== filterDate) {
                  console.log(`❌ Excluding pre-ticket ${ticketId} (date mismatch: ${ticketDateString} !== ${filterDate})`);
                  continue;
                }
              }
              
              // Process valid pre-tickets
              if (ticketData.totalFare && ticketData.quantity) {
                console.log(`✅ Including pre-ticket ${ticketId} (Route: ${tripDirection}, Type: ${ticketTypeField})`);
                allPreTickets.push({
                  id: ticketId,
                  conductorId: conductorId,
                  tripId: tripName,
                  tripDirection: tripDirection, // Add trip direction to ticket data
                  totalFare: parseFloat(ticketData.totalFare),
                  quantity: ticketData.quantity,
                  from: ticketData.from,
                  to: ticketData.to,
                  timestamp: ticketData.timestamp,
                  discountAmount: parseFloat(ticketData.discountAmount || 0),
                  date: dateId,
                  startKm: ticketData.startKm,
                  endKm: ticketData.endKm,
                  totalKm: ticketData.totalKm,
                  farePerPassenger: ticketData.farePerPassenger || [],
                  discountBreakdown: ticketData.discountBreakdown || [],
                  discountList: ticketData.discountList || [],
                  active: ticketData.active,
                  source: 'Pre-ticketing',
                  ticketType: ticketData.ticketType || ticketData.documentType,
                  documentType: ticketData.documentType || ticketData.ticketType // Add for consistency
                });
              } else {
                console.log(`❌ Filtering out pre-ticket ${ticketId}: missing totalFare or quantity`);
              }
            }
          }
        }
      } catch (tripError) {
        // This is normal - not all trip numbers will exist
        if (tripError.code !== 'permission-denied' && !tripError.message.includes('No document to update')) {
          console.log(`ℹ️ No pre-tickets found for ${tripName} (this is normal)`);
        }
      }
    }
  } catch (error) {
    console.error(`Error processing pre-tickets for conductor ${conductorId} on date ${dateId}:`, error);
  }
};

// Calculate revenue metrics with three categories
export const calculateRevenueMetrics = (conductorTrips, preBookingTrips, preTicketing) => {
  // Ensure all parameters are arrays to prevent errors
  const safeCtirps = Array.isArray(conductorTrips) ? conductorTrips : [];
  const safePBooking = Array.isArray(preBookingTrips) ? preBookingTrips : [];
  const safePTicketing = Array.isArray(preTicketing) ? preTicketing : [];

  console.log('🔍 Debugging revenue calculation inputs:');
  console.log('  - Conductor trips count:', safeCtirps.length);
  console.log('  - Pre-booking trips count:', safePBooking.length);
  console.log('  - Pre-ticketing count:', safePTicketing.length);
  
  // Debug conductor trips
  if (safeCtirps.length > 0) {
    console.log('  - Sample conductor trip:', safeCtirps[0]);
    console.log('  - Conductor trips totalFare values:', safeCtirps.map(trip => ({ id: trip.id, totalFare: trip.totalFare, type: typeof trip.totalFare })));
  }

  const totalConductorRevenue = safeCtirps.reduce((sum, trip) => {
    const fare = Number(trip.totalFare) || 0;
    return sum + fare;
  }, 0);
  
  const totalPreBookingRevenue = safePBooking.reduce((sum, trip) => {
    const fare = Number(trip.totalFare) || 0;
    return sum + fare;
  }, 0);
  
  const totalPreTicketingRevenue = safePTicketing.reduce((sum, trip) => {
    const fare = Number(trip.totalFare) || 0;
    return sum + fare;
  }, 0);
  
  const totalRevenue = totalConductorRevenue + totalPreBookingRevenue + totalPreTicketingRevenue;
  
  const totalPassengers = safeCtirps.reduce((sum, trip) => sum + (Number(trip.quantity) || 0), 0) + 
                          safePBooking.reduce((sum, trip) => sum + (Number(trip.quantity) || 0), 0) +
                          safePTicketing.reduce((sum, trip) => sum + (Number(trip.quantity) || 0), 0);

  console.log('💰 Revenue calculation results:');
  console.log('  - Conductor revenue:', totalConductorRevenue);
  console.log('  - Pre-booking revenue:', totalPreBookingRevenue);
  console.log('  - Pre-ticketing revenue:', totalPreTicketingRevenue);
  console.log('  - Total revenue:', totalRevenue);
  console.log('  - Total passengers:', totalPassengers);
  console.log('  - Average fare:', totalPassengers > 0 ? totalRevenue / totalPassengers : 0);

  return {
    totalRevenue,
    totalPassengers,
    averageFare: totalPassengers > 0 ? totalRevenue / totalPassengers : 0,
    conductorRevenue: totalConductorRevenue,
    preBookingRevenue: totalPreBookingRevenue,
    preTicketingRevenue: totalPreTicketingRevenue
  };
};

// Prepare chart data with three categories
export const preparePieChartData = (conductorRevenue, preBookingRevenue, preTicketingRevenue) => [
  { name: 'Conductor Trips', value: Number(conductorRevenue) || 0, color: '#8884d8' },
  { name: 'Pre-booking', value: Number(preBookingRevenue) || 0, color: '#ffc658' },
  { name: 'Pre-ticketing', value: Number(preTicketingRevenue) || 0, color: '#82ca9d' }
];

// Prepare route revenue data with three categories
export const prepareRouteRevenueData = (conductorTrips, preBookingTrips, preTicketing) => {
  // Ensure all parameters are arrays to prevent iteration errors
  const safeCtirps = Array.isArray(conductorTrips) ? conductorTrips : [];
  const safePBooking = Array.isArray(preBookingTrips) ? preBookingTrips : [];
  const safePTicketing = Array.isArray(preTicketing) ? preTicketing : [];
  
  console.log('📊 Starting route revenue calculation...');
  console.log('📊 Input data counts:', {
    conductorTrips: safeCtirps.length,
    preBookingTrips: safePBooking.length,
    preTicketing: safePTicketing.length
  });
  
  const routeRevenueData = [...safeCtirps, ...safePBooking, ...safePTicketing]
    .reduce((acc, trip) => {
      // Use ticket route (from → to) for chart grouping, not trip direction
      const route = `${trip.from} → ${trip.to}`;
      
      // Debug each trip
      console.log('📊 Processing trip:', {
        route,
        totalFare: trip.totalFare,
        quantity: trip.quantity,
        source: trip.source
      });
      
      if (!acc[route]) {
        acc[route] = { 
          route, 
          revenue: 0, 
          passengers: 0,
          tripDirection: trip.tripDirection || 'N/A', // Keep trip direction for reference
          sources: {
            conductorTrips: 0,
            preBooking: 0,
            preTicketing: 0
          }
        };
      }
      
      // Make sure we have valid numeric values
      const fareValue = Number(trip.totalFare) || 0;
      const quantityValue = Number(trip.quantity) || 0;
      
      acc[route].revenue += fareValue;
      acc[route].passengers += quantityValue;
      
      // Track revenue by source
      if (trip.source === 'Conductor Trips') {
        acc[route].sources.conductorTrips += fareValue;
      } else if (trip.source === 'Pre-booking') {
        acc[route].sources.preBooking += fareValue;
      } else if (trip.source === 'Pre-ticketing') {
        acc[route].sources.preTicketing += fareValue;
      }
      
      return acc;
    }, {});

  // Filter out routes with zero revenue and sort
  const sortedRoutes = Object.values(routeRevenueData)
    .filter(route => route.revenue > 0) // Only include routes with actual revenue
    .sort((a, b) => b.revenue - a.revenue);
  
  console.log('📊 Route revenue data prepared:', sortedRoutes.length, 'routes found');
  console.log('📊 All routes with revenue:', sortedRoutes.map(r => ({ route: r.route, revenue: r.revenue, passengers: r.passengers })));
  console.log('📊 Top 5 routes by ticket route (from → to):', sortedRoutes.slice(0, 5));
  
  return sortedRoutes;
};

// Load all revenue data with route filtering
export const loadRevenueData = async (selectedDate, selectedRoute = null) => {
  try {
    console.log('🚀 Loading daily revenue data for date:', selectedDate, 'route:', selectedRoute);
    
    // Pass null or empty string when date is cleared to fetch all data
    const dateParam = selectedDate && selectedDate.trim() !== '' ? selectedDate : null;
    
    const [{ conductorTrips, preBookingTrips }, preTicketing] = await Promise.all([
      fetchConductorTripsAndPreBooking(dateParam, selectedRoute),
      fetchPreTicketing(dateParam, selectedRoute)
    ]);

    const metrics = calculateRevenueMetrics(conductorTrips, preBookingTrips, preTicketing);

    const result = {
      conductorTrips,
      preBookingTrips,
      preTicketing,
      ...metrics
    };

    console.log('🎯 Final daily revenue data:', result);
    return result;
  } catch (error) {
    console.error('Error loading revenue data:', error);
    throw error;
  }
};