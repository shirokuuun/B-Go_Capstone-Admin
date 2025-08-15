// ConductorPerformance.js
import { collection, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
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

// Fetch conductor details
export const fetchConductorDetails = async (conductorId) => {
  try {
    const conductorRef = doc(db, 'conductors', conductorId);
    const conductorSnapshot = await getDoc(conductorRef);
    if (conductorSnapshot.exists()) {
      return {
        id: conductorId,
        ...conductorSnapshot.data()
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching conductor details:', error);
    return null;
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

// Fetch all conductors with their performance data using new data sources
export const fetchConductorPerformance = async (date) => {
  try {
    console.log('🚀 Starting fetchConductorPerformance for date:', date);
    
    // Fetch all data using the new functions
    const [{ conductorTrips, preBookingTrips }, preTicketingData] = await Promise.all([
      fetchConductorTripsAndPreBooking(date),
      fetchPreTicketingData(date)
    ]);

    console.log('📊 Data fetched:', {
      conductorTrips: conductorTrips.length,
      preBookingTrips: preBookingTrips.length,
      preTicketingData: preTicketingData.length
    });

    // Get all conductors to include those with no trips
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    const allConductors = new Map();

    // Initialize all conductors with basic data
    conductorsSnapshot.docs.forEach(doc => {
      const conductorData = doc.data();
      allConductors.set(doc.id, {
        conductorId: doc.id,
        conductorName: conductorData.name || `Conductor ${doc.id}`,
        busNumber: conductorData.busNumber || 'N/A',
        capacity: conductorData.capacity || 27,
        originalCurrentPassengers: conductorData.currentPassengers || conductorData.passengerCount || 0,
        lastSeen: conductorData.lastSeen || null,
        isOnline: conductorData.isOnline !== false,
        // Initialize metrics
        conductorTripsRevenue: 0,
        conductorTripsPassengers: 0,
        conductorTripsCount: 0,
        preBookingRevenue: 0,
        preBookingPassengers: 0,
        preBookingCount: 0,
        preTicketingRevenue: 0,
        preTicketingPassengers: 0,
        preTicketingCount: 0,
        allTickets: []
      });
    });

    // Process conductor trips
    conductorTrips.forEach(trip => {
      if (allConductors.has(trip.conductorId)) {
        const conductor = allConductors.get(trip.conductorId);
        conductor.conductorTripsRevenue += trip.totalFare;
        conductor.conductorTripsPassengers += trip.quantity;
        conductor.conductorTripsCount++;
        conductor.allTickets.push(trip);
      }
    });

    // Process pre-booking trips
    preBookingTrips.forEach(trip => {
      if (allConductors.has(trip.conductorId)) {
        const conductor = allConductors.get(trip.conductorId);
        conductor.preBookingRevenue += trip.totalFare;
        conductor.preBookingPassengers += trip.quantity;
        conductor.preBookingCount++;
        conductor.allTickets.push(trip);
      }
    });

    // Process pre-ticketing data
    preTicketingData.forEach(ticket => {
      if (allConductors.has(ticket.conductorId)) {
        const conductor = allConductors.get(ticket.conductorId);
        conductor.preTicketingRevenue += ticket.totalFare;
        conductor.preTicketingPassengers += ticket.quantity;
        conductor.preTicketingCount++;
        conductor.allTickets.push(ticket);
      }
    });

    // Calculate final metrics for each conductor
    const conductorPerformanceData = Array.from(allConductors.values()).map(conductor => {
      const totalRevenue = conductor.conductorTripsRevenue + conductor.preBookingRevenue + conductor.preTicketingRevenue;
      const totalPassengers = conductor.conductorTripsPassengers + conductor.preBookingPassengers + conductor.preTicketingPassengers;
      const totalTrips = conductor.conductorTripsCount + conductor.preBookingCount + conductor.preTicketingCount;
      
      const averageFare = totalPassengers > 0 ? totalRevenue / totalPassengers : 0;
      const averagePassengersPerTrip = totalTrips > 0 ? totalPassengers / totalTrips : 0;

      // Get current passengers from passengerCount field in conductor document
      const finalCurrentPassengers = conductor.originalCurrentPassengers;

      return {
        ...conductor,
        totalRevenue,
        totalPassengers,
        totalTrips,
        currentPassengers: finalCurrentPassengers,
        averageFare,
        averagePassengersPerTrip,
        utilizationRate: conductor.capacity ? (finalCurrentPassengers / conductor.capacity) * 100 : 0,
        trips: conductor.allTickets
      };
    });

    console.log('📋 Final conductor performance data:', conductorPerformanceData.length);
    return conductorPerformanceData.sort((a, b) => b.totalRevenue - a.totalRevenue);
  } catch (error) {
    console.error('Error fetching conductor performance:', error);
    return [];
  }
};

// Calculate overall performance metrics
export const calculateOverallMetrics = (conductorData) => {
  const totalCurrentPassengers = conductorData.reduce((sum, conductor) => sum + (conductor.currentPassengers || 0), 0);
  const activeConductors = conductorData.filter(conductor => conductor.isOnline).length;
  const totalCapacity = conductorData.reduce((sum, conductor) => sum + (conductor.capacity || 0), 0);
  
  // Calculate totals for revenue and trips
  const totalRevenue = conductorData.reduce((sum, conductor) => sum + (conductor.totalRevenue || 0), 0);
  const totalTrips = conductorData.reduce((sum, conductor) => sum + (conductor.totalTrips || 0), 0);
  const totalPassengersFromTrips = conductorData.reduce((sum, conductor) => sum + (conductor.totalPassengers || 0), 0);
  
  // Calculate averages
  const averageRevenue = conductorData.length > 0 ? totalRevenue / conductorData.length : 0;
  const averagePassengers = conductorData.length > 0 ? totalCurrentPassengers / conductorData.length : 0;

  return {
    totalCurrentPassengers,
    totalCapacity,
    activeConductors,
    totalConductors: conductorData.length,
    overallUtilization: totalCapacity > 0 ? (totalCurrentPassengers / totalCapacity) * 100 : 0,
    averageRevenue,
    averagePassengers,
    totalTrips,
    totalRevenue,
    totalPassengersFromTrips
  };
};

// Prepare chart data for conductor comparison
export const prepareConductorChartData = (conductorData) => {
  return conductorData
    .filter(conductor => conductor.isOnline)
    .slice(0, 10) // Top 10 performers
    .map(conductor => ({
      name: conductor.conductorName,
      passengers: conductor.currentPassengers,
      utilization: conductor.utilizationRate
    }));
};

// Prepare route popularity data across all conductors (simplified version)
export const prepareRoutePopularityData = (conductorData) => {
  // Since we removed trip details, this function now returns empty array
  // You can remove this function call from the component if not needed
  return [];
};

// Set up real-time listener for conductor performance data using new data sources
export const setupConductorPerformanceListener = (callback, selectedDate) => {
  const conductorsRef = collection(db, 'conductors');
  
  const unsubscribe = onSnapshot(conductorsRef, async (snapshot) => {
    try {
      console.log('🔄 Real-time update triggered, refetching conductor performance data...');
      
      // Use the updated fetchConductorPerformance function
      const conductorPerformanceData = await fetchConductorPerformance(selectedDate);
      const overallMetrics = calculateOverallMetrics(conductorPerformanceData);

      callback({
        conductorData: conductorPerformanceData,
        overallMetrics
      });
    } catch (error) {
      console.error('Error in conductor performance listener:', error);
      callback({
        conductorData: [],
        overallMetrics: {
          totalCurrentPassengers: 0,
          totalCapacity: 0,
          activeConductors: 0,
          totalConductors: 0,
          overallUtilization: 0,
          averageRevenue: 0,
          averagePassengers: 0,
          totalTrips: 0
        }
      });
    }
  }, (error) => {
    console.error('Error setting up conductor performance listener:', error);
  });

  return unsubscribe;
};