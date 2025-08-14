
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase/firebase';

// Fetch conductor trips and pre-booking data
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

// Fetch pre-ticketing data from conductors/preTickets
export const fetchPreTicketing = async (date) => {
  try {
    console.log('🚀 Starting fetchPreTicketing for date:', date);
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
    console.error('❌ CRITICAL ERROR in fetchPreTicketing:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    return [];
  }
};

// Calculate revenue metrics with three categories
export const calculateRevenueMetrics = (conductorTrips, preBookingTrips, preTicketing) => {
  // Ensure all parameters are arrays to prevent errors
  const safeCtirps = Array.isArray(conductorTrips) ? conductorTrips : [];
  const safePBooking = Array.isArray(preBookingTrips) ? preBookingTrips : [];
  const safePTicketing = Array.isArray(preTicketing) ? preTicketing : [];

  const totalConductorRevenue = safeCtirps.reduce((sum, trip) => sum + (trip.totalFare || 0), 0);
  const totalPreBookingRevenue = safePBooking.reduce((sum, trip) => sum + (trip.totalFare || 0), 0);
  const totalPreTicketingRevenue = safePTicketing.reduce((sum, trip) => sum + (trip.totalFare || 0), 0);
  const totalRevenue = totalConductorRevenue + totalPreBookingRevenue + totalPreTicketingRevenue;
  
  const totalPassengers = safeCtirps.reduce((sum, trip) => sum + (trip.quantity || 0), 0) + 
                          safePBooking.reduce((sum, trip) => sum + (trip.quantity || 0), 0) +
                          safePTicketing.reduce((sum, trip) => sum + (trip.quantity || 0), 0);

  console.log('💰 Revenue calculation:');
  console.log('  - Conductor revenue:', totalConductorRevenue);
  console.log('  - Pre-booking revenue:', totalPreBookingRevenue);
  console.log('  - Pre-ticketing revenue:', totalPreTicketingRevenue);
  console.log('  - Total revenue:', totalRevenue);
  console.log('  - Total passengers:', totalPassengers);

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
  
  const routeRevenueData = [...safeCtirps, ...safePBooking, ...safePTicketing]
    .reduce((acc, trip) => {
      const route = `${trip.from} → ${trip.to}`;
      if (!acc[route]) {
        acc[route] = { 
          route, 
          revenue: 0, 
          passengers: 0,
          sources: {
            conductorTrips: 0,
            preBooking: 0,
            preTicketing: 0
          }
        };
      }
      acc[route].revenue += trip.totalFare;
      acc[route].passengers += trip.quantity;
      
      // Track revenue by source
      if (trip.source === 'Conductor Trips') {
        acc[route].sources.conductorTrips += trip.totalFare;
      } else if (trip.source === 'Pre-booking') {
        acc[route].sources.preBooking += trip.totalFare;
      } else if (trip.source === 'Pre-ticketing') {
        acc[route].sources.preTicketing += trip.totalFare;
      }
      
      return acc;
    }, {});

  return Object.values(routeRevenueData)
    .sort((a, b) => b.revenue - a.revenue);
};

// Load all revenue data
export const loadRevenueData = async (selectedDate) => {
  try {
    console.log('🚀 Loading daily revenue data for date:', selectedDate);
    
    // Pass null or empty string when date is cleared to fetch all data
    const dateParam = selectedDate && selectedDate.trim() !== '' ? selectedDate : null;
    
    const [{ conductorTrips, preBookingTrips }, preTicketing] = await Promise.all([
      fetchConductorTripsAndPreBooking(dateParam),
      fetchPreTicketing(dateParam)
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