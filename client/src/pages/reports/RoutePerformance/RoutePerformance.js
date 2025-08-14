// RoutePerformance.js - Real-time Route Performance Analytics with onSnapshot
import { collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase/firebase';

// Fetch conductor trips and pre-booking data (same as DailyRevenue)
export const fetchConductorTripsAndPreBooking = async (date) => {
  try {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    let conductorTrips = [];
    let preBookingTrips = [];

    console.log('🎫 Fetching conductor trips and pre-booking for date:', date);

    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;
      console.log(`\n📍 Processing conductor: ${conductorId}`);

      // If no date is provided, get all trips by fetching from all date collections
      if (!date) {
        // Get all trip dates for this conductor
        const conductorTripsRef = collection(db, `conductors/${conductorId}/trips`);
        const tripDatesSnapshot = await getDocs(conductorTripsRef);
        
        for (const dateDoc of tripDatesSnapshot.docs) {
          const tripsRef = collection(db, `conductors/${conductorId}/trips/${dateDoc.id}/tickets`);
          const tripsSnapshot = await getDocs(tripsRef);
          console.log(`📦 Found ${tripsSnapshot.docs.length} tickets for conductor ${conductorId} on ${dateDoc.id}`);
          
          tripsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.active && data.totalFare) {
              const ticketData = {
                id: doc.id,
                conductorId: conductorId,
                totalFare: parseFloat(data.totalFare),
                quantity: data.quantity || 1,
                from: data.from,
                to: data.to,
                timestamp: data.timestamp,
                discountAmount: parseFloat(data.discountAmount || 0),
                documentType: data.documentType || null,
                date: dateDoc.id
              };

              // Categorize based on documentType
              if (data.documentType === 'preBooking') {
                preBookingTrips.push({
                  ...ticketData,
                  source: 'Pre-booking'
                });
              } else {
                // Manual ticket or no documentType = Conductor trips
                conductorTrips.push({
                  ...ticketData,
                  source: 'Conductor Trips'
                });
              }
            }
          });
        }
      } else {
        // Specific date
        const tripsRef = collection(db, `conductors/${conductorId}/trips/${date}/tickets`);
        const tripsSnapshot = await getDocs(tripsRef);
        console.log(`📦 Found ${tripsSnapshot.docs.length} tickets for conductor ${conductorId} on ${date}`);
        
        tripsSnapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.active && data.totalFare) {
            const ticketData = {
              id: doc.id,
              conductorId: conductorId,
              totalFare: parseFloat(data.totalFare),
              quantity: data.quantity || 1,
              from: data.from,
              to: data.to,
              timestamp: data.timestamp,
              discountAmount: parseFloat(data.discountAmount || 0),
              documentType: data.documentType || null,
              date: date
            };

            // Categorize based on documentType
            if (data.documentType === 'preBooking') {
              preBookingTrips.push({
                ...ticketData,
                source: 'Pre-booking'
              });
            } else {
              // Manual ticket or no documentType = Conductor trips
              conductorTrips.push({
                ...ticketData,
                source: 'Conductor Trips'
              });
            }
          }
        });
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

// Fetch pre-ticketing data from conductors/preTickets (same as DailyRevenue)
export const fetchPreTicketingData = async (date) => {
  try {
    console.log('🚀 Starting fetchPreTicketingData for date:', date);
    console.log('📍 Using Firebase path: /conductors/{conductorId}/preTickets/');
    
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    let allPreTickets = [];

    console.log(`🎯 Found ${conductorsSnapshot.docs.length} conductors`);

    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;
      console.log(`\n📍 Processing conductor: ${conductorId}`);
      
      try {
        const preTicketsRef = collection(db, 'conductors', conductorId, 'preTickets');
        const preTicketsSnapshot = await getDocs(preTicketsRef);
        console.log(`📦 Found ${preTicketsSnapshot.docs.length} pre-tickets for conductor ${conductorId}`);

        preTicketsSnapshot.docs.forEach((doc) => {
          const docData = doc.data();
          const data = docData.data || {}; // Access the nested 'data' map
          
          // Check if ticket has required fields
          if (data.amount && data.quantity) {
            console.log(`📝 Processing pre-ticket ${doc.id}:`, {
              from: data.from,
              to: data.to,
              amount: data.amount,
              quantity: data.quantity,
              date: data.date,
              status: docData.status
            });
            
            // If no date is provided, include all records
            if (!date) {
              allPreTickets.push({
                id: doc.id,
                conductorId: conductorId,
                totalFare: data.amount,
                quantity: data.quantity,
                from: data.from,
                to: data.to,
                route: data.route,
                date: data.date,
                time: data.time,
                timestamp: docData.scannedAt || docData.createdAt,
                discountAmount: 0, // Calculate from discountBreakdown if needed
                fareTypes: data.fareTypes || [],
                discountBreakdown: data.discountBreakdown || [],
                source: 'Pre-ticketing',
                status: docData.status
              });
            } else {
              // Filter by specific date
              const ticketDate = data.date;
              console.log(`📅 Ticket date: ${ticketDate}, Selected date: ${date}`);
              
              if (ticketDate === date) {
                console.log(`✅ Including pre-ticket ${doc.id} (date match)`);
                allPreTickets.push({
                  id: doc.id,
                  conductorId: conductorId,
                  totalFare: data.amount,
                  quantity: data.quantity,
                  from: data.from,
                  to: data.to,
                  route: data.route,
                  date: data.date,
                  time: data.time,
                  timestamp: docData.scannedAt || docData.createdAt,
                  discountAmount: 0, // Calculate from discountBreakdown if needed
                  fareTypes: data.fareTypes || [],
                  discountBreakdown: data.discountBreakdown || [],
                  source: 'Pre-ticketing',
                  status: docData.status
                });
              } else {
                console.log(`❌ Excluding pre-ticket ${doc.id} (date mismatch: ${ticketDate} !== ${date})`);
              }
            }
          } else {
            console.log(`❌ Filtering out pre-ticket ${doc.id}: missing amount or quantity`);
          }
        });
        
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
    console.error('❌ CRITICAL ERROR in fetchPreTicketingData:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    return [];
  }
};

// Real-time listeners
let ticketsUnsubscribe = null;
let sosUnsubscribe = null;
let conductorTicketsUnsubscribe = null;

// Debug function to test Firebase connectivity
export const testFirebaseConnection = async () => {
  try {
    console.log('🧪 Testing Firebase connection...');
    console.log('📊 DB object:', db);
    
    // Test basic collection access
    const testRef = collection(db, 'trips');
    console.log('📁 Trips collection reference:', testRef);
    
    const snapshot = await getDocs(testRef);
    console.log('📋 Snapshot received:', snapshot);
    console.log('📊 Docs count:', snapshot.docs.length);
    console.log('📝 Doc IDs:', snapshot.docs.map(doc => doc.id));
    
    return {
      success: true,
      docsCount: snapshot.docs.length,
      docIds: snapshot.docs.map(doc => doc.id)
    };
  } catch (error) {
    console.error('❌ Firebase connection test failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Fetch ticket data from pre-tickets - REMOVED: This was using wrong path
// Using fetchConductorTripsAndPreBooking and fetchPreTicketingData instead for consistency with Daily Revenue

// Fetch conductor pre-tickets - Same as ConductorPerformance
export const fetchConductorPreTickets = async (conductorId, date) => {
  try {
    const preTicketsRef = collection(db, `conductors/${conductorId}/preTickets`);
    const preTicketsSnapshot = await getDocs(preTicketsRef);
    
    let preTickets = [];
    let preTicketRevenue = 0;
    let preTicketPassengers = 0;
    let preTicketCount = 0;

    preTicketsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      
      // Filter by date if specified
      if (date) {
        const ticketDate = data.timestamp?.toDate ? 
          data.timestamp.toDate().toISOString().split('T')[0] : 
          new Date(data.timestamp).toISOString().split('T')[0];
        
        if (ticketDate !== date) {
          return; // Skip this ticket if it doesn't match the date
        }
      }
      
      // Process pre-ticket data (DocumentId = doc.id)
      preTickets.push({
        id: doc.id, // This is the DocumentId
        ticketNumber: data.ticketNumber || doc.id,
        passengerCount: data.passengerCount || 1,
        totalFare: parseFloat(data.totalFare || 0),
        from: data.from || 'N/A',
        to: data.to || 'N/A',
        timestamp: data.timestamp,
        discountAmount: parseFloat(data.discountAmount || 0),
        type: 'pre-ticket',
        source: 'Pre-Ticketing',
        conductorId,
        docId: doc.id,
        firebasePath: `conductors/${conductorId}/preTickets/${doc.id}`,
        ...data
      });
      
      preTicketRevenue += parseFloat(data.totalFare || 0);
      preTicketPassengers += data.passengerCount || 1;
      preTicketCount++;
    });

    return {
      preTickets,
      preTicketRevenue,
      preTicketPassengers,
      preTicketCount
    };
  } catch (error) {
    console.error(`Error fetching pre-tickets for conductor ${conductorId}:`, error);
    return {
      preTickets: [],
      preTicketRevenue: 0,
      preTicketPassengers: 0,
      preTicketCount: 0
    };
  }
};

// Fetch conductor manual tickets - Using SAME path as ConductorPerformance
export const fetchConductorTickets = async (date) => {
  try {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    const tickets = [];

    console.log('🎫 Fetching conductor tickets for date:', date);
    console.log('📍 Using SAME path as ConductorPerformance: /conductors/{conductorId}/trips/{date}/tickets');

    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;
      console.log(`👤 Processing conductor: "${conductorId}"`);
      
      try {
        let totalRevenue = 0;
        let totalPassengers = 0;
        let totalTrips = 0;

        // Use SAME LOGIC as ConductorPerformance.js
        if (!date) {
          // Get all trips across all dates (same as ConductorPerformance)
          const conductorTripsRef = collection(db, `conductors/${conductorId}/trips`);
          const tripDatesSnapshot = await getDocs(conductorTripsRef);
          
          console.log(`📅 Found ${tripDatesSnapshot.docs.length} trip dates for conductor "${conductorId}"`);
          
          for (const dateDoc of tripDatesSnapshot.docs) {
            const tripDate = dateDoc.id;
            console.log(`📅 Processing all-dates trip: "${tripDate}" for conductor "${conductorId}"`);
            
            const tripsRef = collection(db, `conductors/${conductorId}/trips/${tripDate}/tickets`);
            const tripsSnapshot = await getDocs(tripsRef);
            
            console.log(`🎟️ Found ${tripsSnapshot.docs.length} tickets for conductor "${conductorId}" on date "${tripDate}"`);
            
            tripsSnapshot.docs.forEach(doc => {
              const data = doc.data();
              if (data.active && data.totalFare) {
                console.log(`📝 Adding conductor ticket: ${doc.id} from ${tripDate}`);
                tickets.push({
                  id: doc.id,
                  ticketNumber: doc.id,
                  totalFare: parseFloat(data.totalFare),
                  quantity: data.quantity || 1,
                  from: data.from,
                  to: data.to,
                  timestamp: data.timestamp,
                  discountAmount: parseFloat(data.discountAmount || 0),
                  date: tripDate,
                  type: 'conductor-ticket',
                  source: 'Conductor App',
                  conductorId,
                  tripDate,
                  docId: doc.id,
                  firebasePath: `conductors/${conductorId}/trips/${tripDate}/tickets/${doc.id}`,
                  ...data
                });
                totalRevenue += parseFloat(data.totalFare);
                totalPassengers += data.quantity || 1;
                totalTrips++;
              }
            });
          }
        } else {
          // Specific date (same as ConductorPerformance)
          console.log(`📅 Processing specific date: "${date}" for conductor "${conductorId}"`);
          
          const tripsRef = collection(db, `conductors/${conductorId}/trips/${date}/tickets`);
          const tripsSnapshot = await getDocs(tripsRef);
          
          console.log(`🎟️ Found ${tripsSnapshot.docs.length} tickets for conductor "${conductorId}" on date "${date}"`);
          
          tripsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.active && data.totalFare) {
              console.log(`📝 Adding conductor ticket: ${doc.id} from ${date}`);
              tickets.push({
                id: doc.id,
                ticketNumber: doc.id,
                totalFare: parseFloat(data.totalFare),
                quantity: data.quantity || 1,
                from: data.from,
                to: data.to,
                timestamp: data.timestamp,
                discountAmount: parseFloat(data.discountAmount || 0),
                date: date,
                type: 'conductor-ticket',
                source: 'Conductor App',
                conductorId,
                tripDate: date,
                docId: doc.id,
                firebasePath: `conductors/${conductorId}/trips/${date}/tickets/${doc.id}`,
                ...data
              });
              totalRevenue += parseFloat(data.totalFare);
              totalPassengers += data.quantity || 1;
              totalTrips++;
            }
          });
        }
        
        console.log(`📊 Conductor "${conductorId}" totals: ${totalTrips} trips, ${totalPassengers} passengers, ₱${totalRevenue} revenue`);
        
      } catch (conductorError) {
        console.error(`❌ Error fetching tickets for conductor "${conductorId}":`, conductorError);
        console.error('Error details:', {
          code: conductorError.code,
          message: conductorError.message,
          path: `conductors/${conductorId}/trips/`
        });
        // Continue with other conductors even if one fails
        continue;
      }
    }

    console.log(`\n🎯 CONDUCTOR TICKETS RESULTS (Using ConductorPerformance paths):`);
    console.log(`📊 Total conductor tickets found: ${tickets.length}`);
    console.log(`👤 Tickets by conductor:`, tickets.reduce((acc, ticket) => {
      acc[ticket.conductorId] = (acc[ticket.conductorId] || 0) + 1;
      return acc;
    }, {}));
    
    // Log sample conductor ticket structure
    if (tickets.length > 0) {
      console.log(`📋 Sample conductor ticket structure:`, tickets[0]);
      console.log(`📋 All conductor ticket field names:`, 
        [...new Set(tickets.flatMap(ticket => Object.keys(ticket)))]
      );
    }
    
    if (tickets.length === 0) {
      console.warn('⚠️ NO CONDUCTOR TICKETS FOUND! Possible issues:');
      console.warn('   1. Check if conductors exist in Firebase');
      console.warn('   2. Check if conductors have trips for the selected date');
      console.warn('   3. Check if trips have tickets subcollection');
      console.warn('   4. Verify path matches ConductorPerformance: /conductors/{conductorId}/trips/{date}/tickets');
    }
    
    return tickets;
  } catch (error) {
    console.error('❌ CRITICAL ERROR in fetchConductorTickets:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    return [];
  }
};

// Debug function to test ticket fetching with new data sources
export const debugTicketFetching = async (selectedDate) => {
  console.log('\n🔍 === DEBUGGING TICKET FETCHING ===');
  console.log('Selected date:', selectedDate);
  console.log('Selected date type:', typeof selectedDate);
  console.log('Selected date length:', selectedDate?.length);
  console.log('Is date empty?', !selectedDate || selectedDate === '');
  
  try {
    // Test conductor trips and pre-booking
    console.log('\n1️⃣ Testing Conductor trips and Pre-booking...');
    const { conductorTrips, preBookingTrips } = await fetchConductorTripsAndPreBooking(selectedDate);
    console.log('Conductor trips and pre-booking result:', {
      conductorTripsCount: conductorTrips.length,
      preBookingCount: preBookingTrips.length,
      sampleConductorTrip: conductorTrips[0],
      samplePreBooking: preBookingTrips[0],
      conductorSources: conductorTrips.map(t => t.source),
      preBookingSources: preBookingTrips.map(t => t.source)
    });
    
    // Test pre-ticketing data
    console.log('\n2️⃣ Testing Pre-ticketing data...');
    const preTicketingData = await fetchPreTicketingData(selectedDate);
    console.log('Pre-ticketing result:', {
      count: preTicketingData.length,
      sample: preTicketingData[0],
      sources: preTicketingData.map(t => t.source)
    });
    
    // Test combined tickets
    console.log('\n3️⃣ Testing Combined tickets...');
    const allTickets = [...conductorTrips, ...preBookingTrips, ...preTicketingData];
    console.log('Combined tickets:', {
      total: allTickets.length,
      conductorCount: conductorTrips.length,
      preBookingCount: preBookingTrips.length,
      preTicketingCount: preTicketingData.length,
      sourceBreakdown: allTickets.reduce((acc, ticket) => {
        const source = ticket.source || 'unknown';
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {})
    });
    
    // Test formatting
    console.log('\n4️⃣ Testing Ticket Formatting...');
    if (conductorTrips.length > 0) {
      const sampleConductorTrip = conductorTrips[0];
      const formatted = formatRouteData(sampleConductorTrip);
      console.log('Sample conductor trip formatting:', {
        original: sampleConductorTrip,
        formatted: formatted
      });
    }
    
    if (preBookingTrips.length > 0) {
      const samplePreBooking = preBookingTrips[0];
      const formatted = formatRouteData(samplePreBooking);
      console.log('Sample pre-booking formatting:', {
        original: samplePreBooking,
        formatted: formatted
      });
    }
    
    // Test with empty date specifically
    if (selectedDate && selectedDate !== '') {
      console.log('\n5️⃣ Testing with EMPTY date for comparison...');
      const [
        { conductorTrips: emptyConductorTrips, preBookingTrips: emptyPreBookingTrips }, 
        emptyPreTicketingData
      ] = await Promise.all([
        fetchConductorTripsAndPreBooking(''),
        fetchPreTicketingData('')
      ]);
      console.log('Empty date results:', {
        conductorTrips: emptyConductorTrips.length,
        preBookingTrips: emptyPreBookingTrips.length,
        preTicketingData: emptyPreTicketingData.length,
        total: emptyConductorTrips.length + emptyPreBookingTrips.length + emptyPreTicketingData.length
      });
    }
    
    console.log('\n✅ Debug complete!');
    return {
      conductorTrips,
      preBookingTrips,
      preTicketingData,
      allTickets
    };
    
  } catch (error) {
    console.error('❌ Debug error:', error);
    return null;
  }
};

// Fetch SOS requests
export const fetchSOSRequests = async (date) => {
  try {
    const sosRef = collection(db, 'sosRequests');
    const sosSnapshot = await getDocs(sosRef);
    const sosRequests = [];

    console.log('🆘 Fetching SOS requests for date:', date);

    sosSnapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log('📝 Raw SOS data:', { docId: doc.id, data });
      
      // Enhanced date filtering for SOS requests
      if (data.timestamp && data.timestamp.toDate) {
        const sosDate = data.timestamp.toDate().toISOString().split('T')[0];
        const shouldInclude = !date || date === '' || sosDate === date;
        console.log(`📅 SOS date filter: selectedDate="${date}", sosDate="${sosDate}", shouldInclude=${shouldInclude}`);
        
        if (shouldInclude) {
          sosRequests.push({
            id: doc.id,
            ...data,
            docId: doc.id
          });
        }
      } else {
        console.log(`⚠️ SOS request ${doc.id} has no timestamp, including anyway`);
        // Include all SOS requests if no date field
        sosRequests.push({
          id: doc.id,
          ...data,
          docId: doc.id
        });
      }
    });

    console.log('🆘 SOS requests found:', sosRequests.length);
    return sosRequests;
  } catch (error) {
    console.error('Error fetching SOS requests:', error);
    return [];
  }
};

// Set up real-time listeners using correct path: /trips/{route}/trips/{tripId}
export const setupRealTimeListeners = (selectedDate, updateCallback) => {
  console.log('🔄 Setting up real-time listeners for date:', selectedDate);
  console.log('📍 Using Firebase path: /trips/{route}/trips/{tripId}');

  // Cleanup existing listeners
  cleanupListeners();

  // Hardcoded routes to listen to
  const routes = ['Batangas', 'Rosario', 'Tiaong', 'San Juan', 'Mataas na Kahoy'];
  console.log('🔄 Setting up listeners for routes:', routes);

  const routeListeners = [];

  // Set up individual listeners for each route's trips subcollection
  routes.forEach(route => {
    try {
      const routeTripsRef = collection(db, 'trips', route, 'trips');
      
      const unsubscribe = onSnapshot(routeTripsRef, (snapshot) => {
        console.log(`🔄 Trips updated for route "${route}", triggering refresh...`);
        console.log(`📊 Changes detected: ${snapshot.docChanges().length} changes`);
        
        // Log the types of changes for debugging
        snapshot.docChanges().forEach(change => {
          console.log(`   - ${change.type}: ${change.doc.id} in route ${route}`);
        });
        
        updateCallback();
      }, (error) => {
        console.warn(`⚠️ Error in listener for route "${route}":`, error);
        
        if (error.code === 'permission-denied') {
          console.warn(`🚫 Permission denied for listening to route "${route}"`);
        } else if (error.code === 'unauthenticated') {
          console.warn(`🔐 Authentication required for listening to route "${route}"`);
        }
      });
      
      routeListeners.push(unsubscribe);
      console.log(`✅ Listener set up for trips/${route}/trips/`);
      
    } catch (error) {
      console.error(`❌ Error setting up listener for route "${route}":`, error);
    }
  });

  // Store the route listeners for cleanup
  ticketsUnsubscribe = () => {
    routeListeners.forEach(unsubscribe => {
      if (unsubscribe) unsubscribe();
    });
    console.log('🧹 Route listeners cleaned up');
  };

  // Listen to SOS requests
  const sosRef = collection(db, 'sosRequests');
  sosUnsubscribe = onSnapshot(sosRef, (snapshot) => {
    console.log('🔄 SOS requests updated, triggering data refresh');
    console.log(`📊 SOS changes: ${snapshot.docChanges().length} changes`);
    updateCallback();
  }, (error) => {
    console.warn('⚠️ Error in SOS listener:', error);
  });

  // Listen to conductor tickets
  const conductorsRef = collection(db, 'conductors');
  conductorTicketsUnsubscribe = onSnapshot(conductorsRef, (snapshot) => {
    console.log('🔄 Conductor data updated, triggering data refresh');
    console.log(`📊 Conductor changes: ${snapshot.docChanges().length} changes`);
    updateCallback();
  }, (error) => {
    console.warn('⚠️ Error in conductor listener:', error);
  });

  console.log('✅ Real-time listeners set up successfully for all routes and collections');
};

// Cleanup listeners
export const cleanupListeners = () => {
  if (ticketsUnsubscribe) {
    ticketsUnsubscribe();
    ticketsUnsubscribe = null;
  }
  if (sosUnsubscribe) {
    sosUnsubscribe();
    sosUnsubscribe = null;
  }
  if (conductorTicketsUnsubscribe) {
    conductorTicketsUnsubscribe();
    conductorTicketsUnsubscribe = null;
  }
  console.log('🧹 Real-time listeners cleaned up');
};

// Calculate route performance metrics
export const calculateRouteMetrics = (tickets, sosRequests) => {
  console.log('🧮 Calculating route metrics with:');
  console.log('  - Tickets:', tickets.length);
  console.log('  - SOS Requests:', sosRequests.length);
  
  // Calculate total revenue
  const totalRevenue = tickets.reduce((sum, ticket) => {
    const fare = parseFloat(ticket.totalFare) || 0;
    return sum + fare;
  }, 0);

  // Calculate total passengers
  const totalPassengers = tickets.reduce((sum, ticket) => {
    const passengers = parseInt(ticket.quantity) || 0;
    return sum + passengers;
  }, 0);

  // Calculate total trips
  const totalTrips = tickets.length;

  // Calculate total distance
  const totalDistance = tickets.reduce((sum, ticket) => {
    const distance = parseFloat(ticket.totalKm) || 0;
    return sum + distance;
  }, 0);

  // Calculate average fare per KM
  const avgFarePerKm = totalDistance > 0 ? totalRevenue / totalDistance : 0;

  // Calculate safety metrics
  const totalIncidents = sosRequests.length;

  // Group by route for profitability analysis
  const routeStats = {};
  
  tickets.forEach(ticket => {
    const route = `${ticket.from} - ${ticket.to}` || 'Unknown Route';
    
    if (!routeStats[route]) {
      routeStats[route] = {
        revenue: 0,
        passengers: 0,
        trips: 0,
        distance: 0,
        incidents: 0
      };
    }
    
    routeStats[route].revenue += parseFloat(ticket.totalFare) || 0;
    routeStats[route].passengers += parseInt(ticket.quantity) || 0;
    routeStats[route].trips += 1;
    routeStats[route].distance += parseFloat(ticket.totalKm) || 0;
  });

  // Add incident data to route stats
  sosRequests.forEach(sos => {
    const route = sos.route || 'Unknown Route';
    if (routeStats[route]) {
      routeStats[route].incidents += 1;
    } else {
      routeStats[route] = {
        revenue: 0,
        passengers: 0,
        trips: 0,
        distance: 0,
        incidents: 1
      };
    }
  });

  // Convert to arrays for chart data
  const routeProfitability = Object.entries(routeStats).map(([route, stats]) => ({
    route,
    revenue: stats.revenue,
    passengers: stats.passengers,
    trips: stats.trips,
    efficiency: stats.distance > 0 ? stats.revenue / stats.distance : 0
  }));

  const safetyMetrics = Object.entries(routeStats).map(([route, stats]) => ({
    route,
    incidents: stats.incidents,
    safetyScore: stats.trips > 0 ? ((stats.trips - stats.incidents) / stats.trips) * 100 : 100
  }));

  const routeEfficiency = Object.entries(routeStats).map(([route, stats]) => ({
    route,
    efficiency: stats.distance > 0 ? stats.revenue / stats.distance : 0,
    revenuePerTrip: stats.trips > 0 ? stats.revenue / stats.trips : 0
  }));

  const metrics = {
    totalRevenue,
    totalPassengers,
    totalTrips,
    avgFarePerKm,
    totalIncidents,
    routeProfitability,
    safetyMetrics,
    routeEfficiency
  };

  console.log('📊 Calculated route metrics:', metrics);
  return metrics;
};

// Prepare chart data functions
export const prepareRouteProfitabilityData = (routeProfitability) => {
  return routeProfitability
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10); // Top 10 routes
};

export const prepareRouteRevenueData = (tickets) => {
  const routeRevenue = {};
  const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#8dd1e1', '#d084d0', '#ffb347'];
  
  tickets.forEach(ticket => {
    const route = `${ticket.from} - ${ticket.to}` || 'Unknown';
    routeRevenue[route] = (routeRevenue[route] || 0) + (parseInt(ticket.quantity) || 0);
  });

  return Object.entries(routeRevenue)
    .map(([route, passengers], index) => ({
      name: route,
      passengers,
      color: colors[index % colors.length]
    }))
    .sort((a, b) => b.passengers - a.passengers)
    .slice(0, 8); // Top 8 routes
};

export const prepareSafetyIncidentData = (sosRequests) => {
  const routeIncidents = {};
  
  sosRequests.forEach(sos => {
    const route = sos.route || 'Unknown Route';
    routeIncidents[route] = (routeIncidents[route] || 0) + 1;
  });

  return Object.entries(routeIncidents)
    .map(([route, incidents]) => ({
      route,
      incidents
    }))
    .sort((a, b) => b.incidents - a.incidents);
};

export const prepareRouteEfficiencyData = (routeEfficiency) => {
  return routeEfficiency
    .filter(route => route.efficiency > 0)
    .sort((a, b) => b.efficiency - a.efficiency)
    .slice(0, 10); // Top 10 most efficient routes
};

// Main function to load all route performance data (always real-time)
export const loadRoutePerformanceData = async (selectedDate, realTimeEnabled = true, updateCallback = null) => {
  try {
    console.log('🚀 Loading route performance data for date:', selectedDate);
    console.log('🔄 Real-time enabled:', realTimeEnabled);
    
    // Always set up real-time listeners since we removed the toggle
    if (updateCallback) {
      setupRealTimeListeners(selectedDate, async () => {
        // Reload data when changes detected
        const freshData = await loadRoutePerformanceData(selectedDate, false); // Avoid infinite loop
        updateCallback(freshData);
      });
    }

    console.log('\n📋 Fetching all data sources...');
    const [{ conductorTrips, preBookingTrips }, preTicketingData, sosRequests] = await Promise.all([
      fetchConductorTripsAndPreBooking(selectedDate),
      fetchPreTicketingData(selectedDate),
      fetchSOSRequests(selectedDate)
    ]);

    // Combine all tickets from different sources
    const allTickets = [...conductorTrips, ...preBookingTrips, ...preTicketingData];

    console.log('\n📊 Data loading results:');
    console.log('  - Conductor trips:', conductorTrips.length);
    console.log('  - Pre-booking trips:', preBookingTrips.length);
    console.log('  - Pre-ticketing data:', preTicketingData.length);
    console.log('  - Total tickets:', allTickets.length);
    console.log('  - SOS requests:', sosRequests.length);
    
    // Enhanced logging for debugging
    console.log('\n🔍 DETAILED TICKET ANALYSIS:');
    console.log('📋 Conductor trips sample IDs:', conductorTrips.slice(0, 3).map(t => t.id));
    console.log('📋 Pre-booking trips sample IDs:', preBookingTrips.slice(0, 3).map(t => t.id));
    console.log('📋 Pre-ticketing data sample IDs:', preTicketingData.slice(0, 3).map(t => t.id));
    console.log('📋 Combined tickets sample types:', allTickets.slice(0, 10).map(t => ({ id: t.id, type: t.type })));
    
    // Log ticket type breakdown
    const typeBreakdown = allTickets.reduce((acc, ticket) => {
      acc[ticket.type || 'unknown'] = (acc[ticket.type || 'unknown'] || 0) + 1;
      return acc;
    }, {});
    console.log('  - Ticket type breakdown:', typeBreakdown);
    
    // Log sample tickets for verification
    if (conductorTrips.length > 0) {
      console.log('  - Sample conductor trip:', {
        id: conductorTrips[0].id,
        from: conductorTrips[0].from,
        to: conductorTrips[0].to,
        source: conductorTrips[0].source,
        conductorId: conductorTrips[0].conductorId
      });
    }
    
    if (preBookingTrips.length > 0) {
      console.log('  - Sample pre-booking trip:', {
        id: preBookingTrips[0].id,
        from: preBookingTrips[0].from,
        to: preBookingTrips[0].to,
        source: preBookingTrips[0].source,
        conductorId: preBookingTrips[0].conductorId
      });
    }
    
    if (preTicketingData.length > 0) {
      console.log('  - Sample pre-ticketing data:', {
        id: preTicketingData[0].id,
        from: preTicketingData[0].from,
        to: preTicketingData[0].to,
        source: preTicketingData[0].source,
        conductorId: preTicketingData[0].conductorId
      });
    }

    const metrics = calculateRouteMetrics(allTickets, sosRequests);

    const result = {
      tickets: allTickets,
      sosRequests,
      ...metrics
    };

    console.log('🎯 Final route performance data summary:', {
      totalTickets: result.tickets.length,
      ticketTypes: result.tickets.reduce((acc, ticket) => {
        acc[ticket.type || 'unknown'] = (acc[ticket.type || 'unknown'] || 0) + 1;
        return acc;
      }, {}),
      totalRevenue: result.totalRevenue,
      totalPassengers: result.totalPassengers
    });
    
    return result;
  } catch (error) {
    console.error('❌ Error loading route performance data:', error);
    throw error;
  }
};

// Helper function to format ticket data for display
export const formatRouteData = (ticket) => {
  // Handle different ticket types with different field structures
  let route, passengers, distance, fare, discount;
  
  if (ticket.type === 'conductor-ticket' || ticket.source === 'Conductor Trips') {
    // Conductor tickets might have different field names
    // Check for various possible field names for conductor tickets
    route = ticket.route || 
            `${ticket.from || ticket.origin || 'Unknown'} - ${ticket.to || ticket.destination || 'Unknown'}` ||
            `Conductor ${ticket.conductorId || 'Unknown'}`;
    
    passengers = ticket.quantity || ticket.passengers || ticket.passengerCount || 0;
    distance = ticket.totalKm || ticket.distance || ticket.km || 0;
    fare = ticket.totalFare || ticket.fare || ticket.amount || 0;
    discount = ticket.discountAmount || ticket.discount || 0;
  } else if (ticket.source === 'Pre-booking') {
    // Pre-booking trips (from conductor collections with documentType=preBooking)
    route = `${ticket.from || 'Unknown'} - ${ticket.to || 'Unknown'}`;
    passengers = ticket.quantity || 0;
    distance = ticket.totalKm || 0;
    fare = ticket.totalFare || 0;
    discount = ticket.discountAmount || 0;
  } else if (ticket.source === 'Pre-ticketing') {
    // Pre-ticketing data (from conductors/preTickets)
    route = ticket.route || `${ticket.from || 'Unknown'} - ${ticket.to || 'Unknown'}`;
    passengers = ticket.quantity || 0;
    distance = ticket.totalKm || 0;
    fare = ticket.totalFare || 0;
    discount = ticket.discountAmount || 0;
  } else {
    // Pre-tickets (original structure) and fallback
    route = `${ticket.from || 'Unknown'} - ${ticket.to || 'Unknown'}`;
    passengers = ticket.quantity || 0;
    distance = ticket.totalKm || (ticket.endKm - ticket.startKm) || 0;
    fare = ticket.totalFare || 0;
    discount = ticket.discountAmount || 0;
  }

  return {
    id: ticket.id || ticket.docId || 'N/A',
    route: route,
    passengers: passengers,
    distance: distance,
    fare: fare,
    timestamp: ticket.timestamp || null,
    discount: discount,
    type: ticket.type || 'unknown',
    source: ticket.source || 'Unknown', // Pre-booking, Pre-ticketing, Conductor Trips
    sourceRoute: ticket.route || ticket.sourceRoute || 'Unknown', // The route from Firebase path
    tripId: ticket.tripId || ticket.id || 'N/A',
    conductorId: ticket.conductorId || null, // For conductor tickets
    tripDate: ticket.tripDate || null // For conductor tickets
  };
};

// Helper function to format SOS data for display
export const formatSOSData = (sos) => {
  return {
    id: sos.id || sos.docId || 'N/A',
    route: sos.route || 'Unknown Route',
    emergencyType: sos.emergencyType || 'Unknown',
    status: sos.status || 'Unknown',
    location: sos.location ? `${sos.location.lat || 0}, ${sos.location.lng || 0}` : 'Unknown',
    timestamp: sos.timestamp || null,
    description: sos.description || '',
    isActive: sos.isActive || false
  };
};

// Function to get route performance statistics
export const getRouteStatistics = (routeData) => {
  const { tickets, sosRequests, totalRevenue, totalPassengers } = routeData;
  
  // Most profitable route
  const routeRevenues = {};
  tickets.forEach(ticket => {
    const route = `${ticket.from} - ${ticket.to}`;
    routeRevenues[route] = (routeRevenues[route] || 0) + (parseFloat(ticket.totalFare) || 0);
  });
  
  const mostProfitableRoute = Object.entries(routeRevenues)
    .sort(([,a], [,b]) => b - a)[0] || ['N/A', 0];

  // Most dangerous route (highest incidents)
  const routeIncidents = {};
  sosRequests.forEach(sos => {
    const route = sos.route || 'Unknown';
    routeIncidents[route] = (routeIncidents[route] || 0) + 1;
  });
  
  const mostDangerousRoute = Object.entries(routeIncidents)
    .sort(([,a], [,b]) => b - a)[0] || ['N/A', 0];

  // Peak travel time
  const hourCounts = {};
  tickets.forEach(ticket => {
    if (ticket.timestamp && ticket.timestamp.toDate) {
      const hour = ticket.timestamp.toDate().getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
  });
  
  const peakHour = Object.entries(hourCounts)
    .sort(([,a], [,b]) => b - a)[0] || ['0', 0];

  // Average response time for SOS (mock calculation)
  const avgResponseTime = sosRequests.length > 0 ? '5.2 minutes' : 'N/A';

  return {
    mostProfitableRoute: {
      route: mostProfitableRoute[0],
      revenue: mostProfitableRoute[1]
    },
    mostDangerousRoute: {
      route: mostDangerousRoute[0],
      incidents: mostDangerousRoute[1]
    },
    peakTravelHour: `${peakHour[0]}:00`,
    avgResponseTime,
    totalRevenue,
    totalPassengers,
    safetyScore: tickets.length > 0 ? ((tickets.length - sosRequests.length) / tickets.length) * 100 : 100
  };
};

// Function to get hourly performance data
export const getHourlyPerformanceData = (tickets) => {
  const hourlyData = {};
  
  tickets.forEach(ticket => {
    if (ticket.timestamp && ticket.timestamp.toDate) {
      const hour = ticket.timestamp.toDate().getHours();
      
      if (!hourlyData[hour]) {
        hourlyData[hour] = {
          hour: `${hour}:00`,
          trips: 0,
          passengers: 0,
          revenue: 0
        };
      }
      
      hourlyData[hour].trips += 1;
      hourlyData[hour].passengers += parseInt(ticket.quantity) || 0;
      hourlyData[hour].revenue += parseFloat(ticket.totalFare) || 0;
    }
  });

  // Convert to array and fill missing hours with zeros
  const hours = Array.from({ length: 24 }, (_, i) => 
    hourlyData[i] || {
      hour: `${i}:00`,
      trips: 0,
      passengers: 0,
      revenue: 0
    }
  );

  return hours;
};

// Function to analyze route efficiency
export const analyzeRouteEfficiency = (tickets) => {
  const routeAnalysis = {};
  
  tickets.forEach(ticket => {
    const route = `${ticket.from} - ${ticket.to}`;
    const distance = parseFloat(ticket.totalKm) || 0;
    const revenue = parseFloat(ticket.totalFare) || 0;
    const passengers = parseInt(ticket.quantity) || 0;
    
    if (!routeAnalysis[route]) {
      routeAnalysis[route] = {
        route,
        totalRevenue: 0,
        totalDistance: 0,
        totalPassengers: 0,
        totalTrips: 0,
        avgFarePerKm: 0,
        avgPassengersPerTrip: 0,
        revenuePerPassenger: 0
      };
    }
    
    routeAnalysis[route].totalRevenue += revenue;
    routeAnalysis[route].totalDistance += distance;
    routeAnalysis[route].totalPassengers += passengers;
    routeAnalysis[route].totalTrips += 1;
  });

  // Calculate averages
  Object.values(routeAnalysis).forEach(route => {
    route.avgFarePerKm = route.totalDistance > 0 ? route.totalRevenue / route.totalDistance : 0;
    route.avgPassengersPerTrip = route.totalTrips > 0 ? route.totalPassengers / route.totalTrips : 0;
    route.revenuePerPassenger = route.totalPassengers > 0 ? route.totalRevenue / route.totalPassengers : 0;
  });

  return Object.values(routeAnalysis)
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
};

// Function to get safety analysis by route
export const getSafetyAnalysisByRoute = (sosRequests) => {
  const emergencyTypes = {};
  const routeSafety = {};
  
  sosRequests.forEach(sos => {
    const route = sos.route || 'Unknown Route';
    const emergencyType = sos.emergencyType || 'Unknown';
    
    // Count by emergency type
    emergencyTypes[emergencyType] = (emergencyTypes[emergencyType] || 0) + 1;
    
    // Count by route
    if (!routeSafety[route]) {
      routeSafety[route] = {
        route,
        totalIncidents: 0,
        mechanical: 0,
        medical: 0,
        security: 0,
        other: 0,
        activeIncidents: 0
      };
    }
    
    routeSafety[route].totalIncidents += 1;
    
    // Categorize incident types
    if (emergencyType.toLowerCase().includes('mechanical')) {
      routeSafety[route].mechanical += 1;
    } else if (emergencyType.toLowerCase().includes('medical')) {
      routeSafety[route].medical += 1;
    } else if (emergencyType.toLowerCase().includes('security')) {
      routeSafety[route].security += 1;
    } else {
      routeSafety[route].other += 1;
    }
    
    if (sos.isActive) {
      routeSafety[route].activeIncidents += 1;
    }
  });

  return {
    emergencyTypes: Object.entries(emergencyTypes).map(([type, count]) => ({
      type,
      count
    })),
    routeSafety: Object.values(routeSafety)
      .sort((a, b) => b.totalIncidents - a.totalIncidents)
  };
};