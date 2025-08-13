// DailyRevenue.js - Updated to fetch from all routes
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase/firebase';

// Fetch conductor trips data
export const fetchConductorTrips = async (date) => {
  try {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    let allTrips = [];

    console.log('🎫 Fetching conductor trips for date:', date);

    for (const conductorDoc of conductorsSnapshot.docs) {
      // If no date is provided, get all trips by fetching from all date collections
      if (!date) {
        // Get all trip dates for this conductor
        const conductorTripsRef = collection(db, `conductors/${conductorDoc.id}/trips`);
        const tripDatesSnapshot = await getDocs(conductorTripsRef);
        
        for (const dateDoc of tripDatesSnapshot.docs) {
          const tripsRef = collection(db, `conductors/${conductorDoc.id}/trips/${dateDoc.id}/tickets`);
          const tripsSnapshot = await getDocs(tripsRef);
          
          tripsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.active && data.totalFare) {
              allTrips.push({
                id: doc.id,
                conductorId: conductorDoc.id,
                totalFare: parseFloat(data.totalFare),
                quantity: data.quantity || 1,
                from: data.from,
                to: data.to,
                timestamp: data.timestamp,
                discountAmount: parseFloat(data.discountAmount || 0),
                source: 'Conductor Trips'
              });
            }
          });
        }
      } else {
        // Original code for specific date
        const tripsRef = collection(db, `conductors/${conductorDoc.id}/trips/${date}/tickets`);
        const tripsSnapshot = await getDocs(tripsRef);
        
        tripsSnapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.active && data.totalFare) {
            allTrips.push({
              id: doc.id,
              conductorId: conductorDoc.id,
              totalFare: parseFloat(data.totalFare),
              quantity: data.quantity || 1,
              from: data.from,
              to: data.to,
              timestamp: data.timestamp,
              discountAmount: parseFloat(data.discountAmount || 0),
              source: 'Conductor Trips'
            });
          }
        });
      }
    }

    console.log('🎫 Total conductor trips found:', allTrips.length);
    return allTrips;
  } catch (error) {
    console.error('Error fetching conductor trips:', error);
    return [];
  }
};

// Fetch pre-ticketing data from ALL routes (updated to match RoutePerformance.js)
export const fetchPreTicketing = async (date) => {
  try {
    console.log('🚀 Starting fetchPreTicketing for date:', date);
    console.log('📍 Using Firebase path: /trips/{route}/trips/{tripId}');
    
    let allPreTickets = [];
    
    // Hardcoded routes to fetch from (same as RoutePerformance.js)
    const routes = ['Batangas', 'Rosario', 'Tiaong', 'San Juan', 'Mataas na Kahoy'];
    console.log('🎯 Processing routes for pre-ticketing:', routes);

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
          
          // Apply same filtering as original DailyRevenue: active, totalFare, and timestamp required
          if (data.active && data.totalFare && data.timestamp) {
            console.log(`📝 Processing trip ${index + 1}/${routeTripsSnapshot.docs.length} for route "${route}":`, {
              tripId: doc.id,
              from: data.from,
              to: data.to,
              totalFare: data.totalFare,
              quantity: data.quantity,
              active: data.active
            });
            
            // If no date is provided, include all records
            if (!date) {
              allPreTickets.push({
                id: doc.id,
                totalFare: data.totalFare,
                quantity: data.quantity || 1,
                from: data.from,
                to: data.to,
                timestamp: data.timestamp,
                discountAmount: parseFloat(data.discountAmount || 0),
                fareTypes: data.fareTypes || [],
                source: 'Pre-ticketing',
                sourceRoute: route // Add route identifier
              });
            } else {
              // Filter by specific date
              const tripDate = data.timestamp.toDate().toISOString().split('T')[0];
              console.log(`📅 Trip date: ${tripDate}, Selected date: ${date}`);
              
              if (tripDate === date) {
                console.log(`✅ Including trip ${doc.id} (date match)`);
                allPreTickets.push({
                  id: doc.id,
                  totalFare: data.totalFare,
                  quantity: data.quantity || 1,
                  from: data.from,
                  to: data.to,
                  timestamp: data.timestamp,
                  discountAmount: parseFloat(data.discountAmount || 0),
                  fareTypes: data.fareTypes || [],
                  source: 'Pre-ticketing',
                  sourceRoute: route // Add route identifier
                });
              } else {
                console.log(`❌ Excluding trip ${doc.id} (date mismatch: ${tripDate} !== ${date})`);
              }
            }
          } else {
            // Log why ticket was filtered out
            const reasons = [];
            if (!data.active) reasons.push('not active');
            if (!data.totalFare) reasons.push('no totalFare');
            if (!data.timestamp) reasons.push('no timestamp');
            console.log(`❌ Filtering out trip ${doc.id}: ${reasons.join(', ')}`);
          }
        });
        
        const routeTicketCount = allPreTickets.filter(t => t.sourceRoute === route).length;
        console.log(`📊 Total pre-tickets found for route "${route}": ${routeTicketCount}`);
        
      } catch (routeError) {
        console.error(`❌ Error fetching pre-tickets for route "${route}":`, routeError);
        console.error('Error details:', {
          code: routeError.code,
          message: routeError.message,
          path: `trips/${route}/trips/`
        });
        // Continue with other routes even if one fails
        continue;
      }
    }

    console.log(`\n🎯 FINAL PRE-TICKETING RESULTS:`);
    console.log(`📊 Total pre-tickets found: ${allPreTickets.length}`);
    console.log(`📍 Pre-tickets by route:`, allPreTickets.reduce((acc, ticket) => {
      acc[ticket.sourceRoute] = (acc[ticket.sourceRoute] || 0) + 1;
      return acc;
    }, {}));
    console.log(`📋 Sample pre-tickets:`, allPreTickets.slice(0, 3));
    
    if (allPreTickets.length === 0) {
      console.warn('⚠️ NO PRE-TICKETS FOUND! Possible issues:');
      console.warn('   1. Check if these routes exist in Firebase:', routes);
      console.warn('   2. Check if each route has a "trips" subcollection');
      console.warn('   3. Check if trips have active=true, totalFare, and timestamp');
      console.warn('   4. Check if the selected date has any trips');
    }
    
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

// Calculate revenue metrics
export const calculateRevenueMetrics = (conductorTrips, preTicketing) => {
  const totalConductorRevenue = conductorTrips.reduce((sum, trip) => sum + trip.totalFare, 0);
  const totalPreTicketingRevenue = preTicketing.reduce((sum, trip) => sum + trip.totalFare, 0);
  const totalRevenue = totalConductorRevenue + totalPreTicketingRevenue;
  const totalPassengers = conductorTrips.reduce((sum, trip) => sum + trip.quantity, 0) + 
                          preTicketing.reduce((sum, trip) => sum + trip.quantity, 0);

  console.log('💰 Revenue calculation:');
  console.log('  - Conductor revenue:', totalConductorRevenue);
  console.log('  - Pre-ticketing revenue:', totalPreTicketingRevenue);
  console.log('  - Total revenue:', totalRevenue);
  console.log('  - Total passengers:', totalPassengers);

  return {
    totalRevenue,
    totalPassengers,
    averageFare: totalPassengers > 0 ? totalRevenue / totalPassengers : 0,
    conductorRevenue: totalConductorRevenue,
    preTicketingRevenue: totalPreTicketingRevenue
  };
};

// Prepare chart data
export const preparePieChartData = (conductorRevenue, preTicketingRevenue) => [
  { name: 'Conductor Trips', value: conductorRevenue || 0, color: '#8884d8' },
  { name: 'Pre-ticketing', value: preTicketingRevenue || 0, color: '#82ca9d' }
];

// Prepare route revenue data (enhanced to show route breakdown)
export const prepareRouteRevenueData = (conductorTrips, preTicketing) => {
  const routeRevenueData = [...conductorTrips, ...preTicketing]
    .reduce((acc, trip) => {
      const route = `${trip.from} → ${trip.to}`;
      if (!acc[route]) {
        acc[route] = { 
          route, 
          revenue: 0, 
          passengers: 0,
          sourceRoutes: new Set() // Track which source routes contribute
        };
      }
      acc[route].revenue += trip.totalFare;
      acc[route].passengers += trip.quantity;
      
      // Track source route for pre-tickets
      if (trip.sourceRoute) {
        acc[route].sourceRoutes.add(trip.sourceRoute);
      }
      
      return acc;
    }, {});

  // Convert Set to Array for final output
  return Object.values(routeRevenueData)
    .map(route => ({
      ...route,
      sourceRoutes: Array.from(route.sourceRoutes)
    }))
    .sort((a, b) => b.revenue - a.revenue);
};

// Load all revenue data
export const loadRevenueData = async (selectedDate) => {
  try {
    console.log('🚀 Loading daily revenue data for date:', selectedDate);
    
    // Pass null or empty string when date is cleared to fetch all data
    const dateParam = selectedDate && selectedDate.trim() !== '' ? selectedDate : null;
    
    const [conductorTrips, preTicketing] = await Promise.all([
      fetchConductorTrips(dateParam),
      fetchPreTicketing(dateParam)
    ]);

    const metrics = calculateRevenueMetrics(conductorTrips, preTicketing);

    const result = {
      conductorTrips,
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