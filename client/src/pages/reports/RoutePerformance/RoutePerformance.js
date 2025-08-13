// RoutePerformance.js - Real-time Route Performance Analytics with onSnapshot
import { collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase/firebase';

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

// Fetch ticket data from pre-tickets - using correct path: /trips/{route}/trips/{tripId}
export const fetchPreTickets = async (date) => {
  try {
    console.log('🚀 Starting fetchPreTickets for date:', date);
    console.log('📍 Using Firebase path: /trips/{route}/trips/{tripId}');
    
    const tickets = [];
    
    // Hardcoded routes to fetch from (these are the {route} values in your path)
    const routes = ['Batangas', 'Rosario', 'Tiaong', 'San Juan', 'Mataas na Kahoy'];
    console.log('🎯 Processing hardcoded routes:', routes);

    for (const route of routes) {
      console.log(`\n📍 Processing route: "${route}"`);
      
      try {
        // Correct path: trips/{route}/trips/{tripId}
        const routeTripsRef = collection(db, 'trips', route, 'trips');
        console.log(`🔍 Accessing route trips: trips/${route}/trips/`);
        
        const routeTripsSnapshot = await getDocs(routeTripsRef);
        console.log(`📦 Found ${routeTripsSnapshot.docs.length} trip documents for route "${route}"`);
        
        if (routeTripsSnapshot.docs.length === 0) {
          console.warn(`⚠️ No trips found in trips/${route}/trips/`);
          continue;
        }

        routeTripsSnapshot.docs.forEach((doc, index) => {
          const data = doc.data();
          const tripId = doc.id; // This is the {tripId} from your path
          
          console.log(`📝 Processing trip ${index + 1}/${routeTripsSnapshot.docs.length} for route "${route}":`, {
            tripId: tripId,
            docId: doc.id,
            hasTimestamp: !!data.timestamp,
            from: data.from,
            to: data.to,
            totalFare: data.totalFare,
            quantity: data.quantity,
            active: data.active,
            path: `trips/${route}/trips/${tripId}`
          });
          
          // Filter by date if needed - Enhanced logic
          if (data.timestamp && data.timestamp.toDate) {
            const tripDate = data.timestamp.toDate().toISOString().split('T')[0];
            const shouldInclude = !date || date === '' || tripDate === date;
            console.log(`📅 Pre-ticket date filter: selectedDate="${date}", tripDate="${tripDate}", shouldInclude=${shouldInclude}`);
            
            if (shouldInclude) {
              console.log(`✅ Including trip ${tripId} (date match)`);
              tickets.push({
                id: tripId,
                ...data,
                docId: doc.id,
                route: route, // The route from the path (Batangas, Rosario, etc.)
                tripId: tripId, // The specific trip ID
                type: 'pre-ticket',
                firebasePath: `trips/${route}/trips/${tripId}`
              });
            } else {
              console.log(`❌ Excluding trip ${tripId} (date mismatch: selectedDate="${date}", tripDate="${tripDate}")`);
            }
          } else {
            console.log(`⚠️ Trip ${tripId} has no timestamp, including anyway`);
            // Include all tickets if no date field
            tickets.push({
              id: tripId,
              ...data,
              docId: doc.id,
              route: route, // The route from the path
              tripId: tripId, // The specific trip ID
              type: 'pre-ticket',
              firebasePath: `trips/${route}/trips/${tripId}`
            });
          }
        });
        
        const routeTicketCount = tickets.filter(t => t.route === route).length;
        console.log(`📊 Total tickets found for route "${route}": ${routeTicketCount}`);
        
      } catch (routeError) {
        console.error(`❌ Error fetching trips for route "${route}":`, routeError);
        console.error('Error details:', {
          code: routeError.code,
          message: routeError.message,
          path: `trips/${route}/trips/`
        });
        
        // Specific error handling for Firebase auth/permission issues
        if (routeError.code === 'permission-denied') {
          console.warn(`🚫 Permission denied for route "${route}"`);
          console.warn('💡 Check if you are authenticated and Firestore rules allow read access');
        } else if (routeError.code === 'not-found') {
          console.warn(`📂 Route "${route}" may not exist in Firebase`);
        } else if (routeError.code === 'unauthenticated') {
          console.warn(`🔐 User not authenticated - required for Firestore rules`);
        }
        
        // Continue with other routes even if one fails
        continue;
      }
    }

    console.log(`\n🎯 FINAL RESULTS:`);
    console.log(`📊 Total pre-tickets found: ${tickets.length}`);
    console.log(`📍 Tickets by route:`, tickets.reduce((acc, ticket) => {
      acc[ticket.route] = (acc[ticket.route] || 0) + 1;
      return acc;
    }, {}));
    console.log(`📋 Sample tickets:`, tickets.slice(0, 3));
    
    if (tickets.length === 0) {
      console.warn('⚠️ NO TICKETS FOUND! Possible issues:');
      console.warn('   1. Check if these routes exist in Firebase:', routes);
      console.warn('   2. Check if each route has a "trips" subcollection');
      console.warn('   3. Check if the selected date has any trips');
      console.warn('   4. Check authentication status (rules require auth)');
      console.warn('   5. Verify Firestore security rules allow read access');
    }
    
    return tickets;
  } catch (error) {
    console.error('❌ CRITICAL ERROR in fetchPreTickets:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    
    // Specific guidance for common Firebase errors
    if (error.code === 'permission-denied') {
      console.error('🚫 PERMISSION DENIED - Check your Firestore rules and authentication');
    } else if (error.code === 'unauthenticated') {
      console.error('🔐 USER NOT AUTHENTICATED - Login required for this operation');
    }
    
    return [];
  }
};

// Fetch conductor manual tickets
export const fetchConductorTickets = async (date) => {
  try {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    const tickets = [];

    console.log('🎫 Fetching conductor tickets for date:', date);
    console.log('📍 Using conductor path: /conductors/{conductorId}/trips/{tripDate}/tickets/ticket #');

    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;
      console.log(`👤 Processing conductor: "${conductorId}"`);
      
      try {
        // Get trips for this conductor
        const tripsRef = collection(db, 'conductors', conductorId, 'trips');
        const tripsSnapshot = await getDocs(tripsRef);
        
        console.log(`📅 Found ${tripsSnapshot.docs.length} trip dates for conductor "${conductorId}"`);

        for (const tripDoc of tripsSnapshot.docs) {
          const tripDate = tripDoc.id; // Date is the document ID (e.g., "2025-08-11")
          console.log(`📅 Processing trip date: "${tripDate}" for conductor "${conductorId}"`);
          
          // Enhanced date filtering logic
          const shouldInclude = !date || date === '' || tripDate === date;
          console.log(`📅 Date filter check: selectedDate="${date}", tripDate="${tripDate}", shouldInclude=${shouldInclude}`);
          
          if (shouldInclude) {
            console.log(`✅ Date match for ${tripDate}, fetching tickets...`);
            
            // Get tickets for this trip date - path: /conductors/{conductorId}/trips/{tripDate}/tickets/ticket #
            const ticketsRef = collection(db, 'conductors', conductorId, 'trips', tripDate, 'tickets');
            const ticketsSnapshot = await getDocs(ticketsRef);
            
            console.log(`🎟️ Found ${ticketsSnapshot.docs.length} tickets for conductor "${conductorId}" on date "${tripDate}"`);

            ticketsSnapshot.docs.forEach((ticketDoc, index) => {
              const data = ticketDoc.data();
              const ticketId = ticketDoc.id; // This should be "ticket #" format
              
              // DETAILED FIELD LOGGING FOR DEBUGGING
              console.log(`📝 DETAILED CONDUCTOR TICKET ${index + 1}:`, {
                conductorId,
                tripDate,
                ticketId,
                // Log ALL fields to see what's available
                allFields: Object.keys(data),
                // Common route fields
                route: data.route,
                from: data.from,
                to: data.to,
                origin: data.origin,
                destination: data.destination,
                // Common passenger fields
                quantity: data.quantity,
                passengers: data.passengers,
                passengerCount: data.passengerCount,
                // Common fare fields
                totalFare: data.totalFare,
                fare: data.fare,
                amount: data.amount,
                // Common distance fields
                totalKm: data.totalKm,
                distance: data.distance,
                km: data.km,
                // Timestamp
                timestamp: data.timestamp,
                // Discount
                discountAmount: data.discountAmount,
                discount: data.discount,
                // Raw data for inspection
                rawData: data
              });
              
              tickets.push({
                id: ticketId, // "ticket 1", "ticket 2", etc.
                ...data,
                docId: ticketDoc.id,
                conductorId,
                tripDate,
                type: 'conductor-ticket',
                firebasePath: `conductors/${conductorId}/trips/${tripDate}/tickets/${ticketId}`
              });
            });
          } else {
            console.log(`❌ Excluding trip date ${tripDate} (date mismatch: selectedDate="${date}", tripDate="${tripDate}")`);
          }
        }
        
        const conductorTicketCount = tickets.filter(t => t.conductorId === conductorId).length;
        console.log(`📊 Total tickets found for conductor "${conductorId}": ${conductorTicketCount}`);
        
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

    console.log(`\n🎯 CONDUCTOR TICKETS RESULTS:`);
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
      console.warn('   4. Verify path: /conductors/{conductorId}/trips/{tripDate}/tickets/ticket #');
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

// Debug function to test conductor ticket fetching
export const debugTicketFetching = async (selectedDate) => {
  console.log('\n🔍 === DEBUGGING TICKET FETCHING ===');
  console.log('Selected date:', selectedDate);
  console.log('Selected date type:', typeof selectedDate);
  console.log('Selected date length:', selectedDate?.length);
  console.log('Is date empty?', !selectedDate || selectedDate === '');
  
  try {
    // Test pre-tickets
    console.log('\n1️⃣ Testing Pre-tickets...');
    const preTickets = await fetchPreTickets(selectedDate);
    console.log('Pre-tickets result:', {
      count: preTickets.length,
      sample: preTickets[0],
      types: preTickets.map(t => t.type)
    });
    
    // Test conductor tickets
    console.log('\n2️⃣ Testing Conductor tickets...');
    const conductorTickets = await fetchConductorTickets(selectedDate);
    console.log('Conductor tickets result:', {
      count: conductorTickets.length,
      sample: conductorTickets[0],
      types: conductorTickets.map(t => t.type),
      conductorIds: [...new Set(conductorTickets.map(t => t.conductorId))]
    });
    
    // Test combined tickets
    console.log('\n3️⃣ Testing Combined tickets...');
    const allTickets = [...preTickets, ...conductorTickets];
    console.log('Combined tickets:', {
      total: allTickets.length,
      preCount: preTickets.length,
      conductorCount: conductorTickets.length,
      typeBreakdown: allTickets.reduce((acc, ticket) => {
        acc[ticket.type] = (acc[ticket.type] || 0) + 1;
        return acc;
      }, {})
    });
    
    // Test formatting
    console.log('\n4️⃣ Testing Ticket Formatting...');
    if (conductorTickets.length > 0) {
      const sampleConductorTicket = conductorTickets[0];
      const formatted = formatRouteData(sampleConductorTicket);
      console.log('Sample conductor ticket formatting:', {
        original: sampleConductorTicket,
        formatted: formatted
      });
    }
    
    // Test with empty date specifically
    if (selectedDate && selectedDate !== '') {
      console.log('\n5️⃣ Testing with EMPTY date for comparison...');
      const [emptyPreTickets, emptyConductorTickets] = await Promise.all([
        fetchPreTickets(''),
        fetchConductorTickets('')
      ]);
      console.log('Empty date results:', {
        preTickets: emptyPreTickets.length,
        conductorTickets: emptyConductorTickets.length,
        total: emptyPreTickets.length + emptyConductorTickets.length
      });
    }
    
    console.log('\n✅ Debug complete!');
    return {
      preTickets,
      conductorTickets,
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
    const [preTickets, conductorTickets, sosRequests] = await Promise.all([
      fetchPreTickets(selectedDate),
      fetchConductorTickets(selectedDate),
      fetchSOSRequests(selectedDate)
    ]);

    // Combine all tickets
    const allTickets = [...preTickets, ...conductorTickets];

    console.log('\n📊 Data loading results:');
    console.log('  - Pre-tickets:', preTickets.length);
    console.log('  - Conductor tickets:', conductorTickets.length);
    console.log('  - Total tickets:', allTickets.length);
    console.log('  - SOS requests:', sosRequests.length);
    
    // Enhanced logging for debugging
    console.log('\n🔍 DETAILED TICKET ANALYSIS:');
    console.log('📋 Pre-tickets sample IDs:', preTickets.slice(0, 3).map(t => t.id));
    console.log('📋 Conductor tickets sample IDs:', conductorTickets.slice(0, 3).map(t => t.id));
    console.log('📋 Combined tickets sample types:', allTickets.slice(0, 10).map(t => ({ id: t.id, type: t.type })));
    
    // Log ticket type breakdown
    const typeBreakdown = allTickets.reduce((acc, ticket) => {
      acc[ticket.type || 'unknown'] = (acc[ticket.type || 'unknown'] || 0) + 1;
      return acc;
    }, {});
    console.log('  - Ticket type breakdown:', typeBreakdown);
    
    // Log sample tickets for verification
    if (preTickets.length > 0) {
      console.log('  - Sample pre-ticket:', {
        id: preTickets[0].id,
        from: preTickets[0].from,
        to: preTickets[0].to,
        type: preTickets[0].type
      });
    }
    
    if (conductorTickets.length > 0) {
      console.log('  - Sample conductor ticket:', {
        id: conductorTickets[0].id,
        from: conductorTickets[0].from,
        to: conductorTickets[0].to,
        type: conductorTickets[0].type,
        conductorId: conductorTickets[0].conductorId
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
  
  if (ticket.type === 'conductor-ticket') {
    // Conductor tickets might have different field names
    // Check for various possible field names for conductor tickets
    route = ticket.route || 
            `${ticket.from || ticket.origin || 'Unknown'} - ${ticket.to || ticket.destination || 'Unknown'}` ||
            `Conductor ${ticket.conductorId || 'Unknown'}`;
    
    passengers = ticket.quantity || ticket.passengers || ticket.passengerCount || 0;
    distance = ticket.totalKm || ticket.distance || ticket.km || 0;
    fare = ticket.totalFare || ticket.fare || ticket.amount || 0;
    discount = ticket.discountAmount || ticket.discount || 0;
  } else {
    // Pre-tickets (original structure)
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