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
    
    return tripNames;
  } catch (error) {
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



    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;
      
      try {
        // Get all daily trips for this conductor
        const dailyTripsRef = collection(db, `conductors/${conductorId}/dailyTrips`);
        const dailyTripsSnapshot = await getDocs(dailyTripsRef);
        
        
        for (const dateDoc of dailyTripsSnapshot.docs) {
          const dateId = dateDoc.id;
          const dateData = dateDoc.data();
          
          // Look for trip maps directly in the date document
          for (const [key, value] of Object.entries(dateData)) {
            if (key.startsWith('trip') && typeof value === 'object' && value !== null) {
              
              // Check if this trip map has a direction field
              if (value.direction && typeof value.direction === 'string') {
                const direction = value.direction.trim();
                if (direction.length > 0) {
                  availableRoutes.add(direction);
                }
              }
            }
          }
        }
      } catch (conductorError) {
        continue;
      }
    }

    return Array.from(availableRoutes).sort();
  } catch (error) {
    console.error('Error fetching available routes:', error);
    return [];
  }
};

// Get available dates from the database based on createdAt field
export const getAvailableDates = async () => {
  try {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    const availableDates = new Set();


    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;

      try {
        // Get all daily trips for this conductor
        const dailyTripsRef = collection(db, `conductors/${conductorId}/dailyTrips`);
        const dailyTripsSnapshot = await getDocs(dailyTripsRef);


        for (const dateDoc of dailyTripsSnapshot.docs) {
          const dateData = dateDoc.data();
          const dateId = dateDoc.id;


          // Check if the date document has a createdAt field
          if (dateData.createdAt) {
            const createdAt = dateData.createdAt.toDate ? dateData.createdAt.toDate() : new Date(dateData.createdAt);
            const dateString = createdAt.toISOString().split('T')[0];
            availableDates.add(dateString);
          }

          // Also check if the document ID itself is a valid date (format: YYYY-MM-DD)
          if (dateId.match(/^\d{4}-\d{2}-\d{2}$/)) {
            availableDates.add(dateId);
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
                  }
                }
              } catch (tripError) {
                // This is normal - not all trip numbers will exist
              }
            }
          } catch (tripsError) {
            // No trips found for date (normal)
          }
        }

      } catch (conductorError) {
        console.error(`Error fetching dates for conductor ${conductorId}:`, conductorError);
        continue;
      }
    }

    return Array.from(availableDates).sort((a, b) => new Date(b) - new Date(a));
  } catch (error) {
    console.error('Error fetching available dates:', error);
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

// Fetch conductor trips only (pre-booking now handled separately)
export const fetchConductorTripsAndPreBooking = async (date, selectedRoute = null) => {
  try {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    let conductorTrips = [];


    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;

      try {
        // If no date is provided, get all trips from all dates
        if (!date) {
          // Get all daily trips dates for this conductor
          const dailyTripsRef = collection(db, `conductors/${conductorId}/dailyTrips`);
          const dailyTripsSnapshot = await getDocs(dailyTripsRef);

          for (const dateDoc of dailyTripsSnapshot.docs) {
            const dateId = dateDoc.id;
            await processTripsForDate(conductorId, dateId, conductorTrips, [], date, selectedRoute);
          }
        } else {
          // Process specific date
          await processTripsForDate(conductorId, date, conductorTrips, [], date, selectedRoute);
        }
      } catch (conductorError) {
        continue;
      }
    }


    return { conductorTrips };
  } catch (error) {
    return { conductorTrips: [] };
  }
};

// Helper function to process trips for a specific date with route filtering
const processTripsForDate = async (conductorId, dateId, conductorTrips, preBookingTrips, filterDate = null, selectedRoute = null) => {
  try {
    // Get all trip names dynamically instead of hardcoding
    const tripNames = await getAllTripNames(conductorId, dateId);
    
    
    for (const tripName of tripNames) {
      try {
        // Get trip direction first if route filtering is enabled
        let tripDirection = null;
        if (selectedRoute) {
          tripDirection = await getTripDirection(conductorId, dateId, tripName);
          
          // Skip this trip if it doesn't match the selected route
          if (tripDirection !== selectedRoute) {
            continue;
          }
        }

        // Check if this trip exists by trying to get its tickets
        const ticketsCollectionRef = collection(db, `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/tickets/tickets`);
        const ticketsSnapshot = await getDocs(ticketsCollectionRef);
        
        if (ticketsSnapshot.docs.length > 0) {
          
          // If we haven't fetched the trip direction yet, fetch it now for ticket processing
          if (!tripDirection) {
            tripDirection = await getTripDirection(conductorId, dateId, tripName);
          }
          
          for (const ticketDoc of ticketsSnapshot.docs) {
            const ticketData = ticketDoc.data();
            const ticketId = ticketDoc.id;
            
            
            // Check if we should include this ticket based on date filter
            if (filterDate) {
              const ticketTimestamp = ticketData.timestamp?.toDate ? ticketData.timestamp.toDate() : new Date(ticketData.timestamp);
              const ticketDateString = ticketTimestamp.toISOString().split('T')[0];
              
              if (ticketDateString !== filterDate) {
                continue;
              }
            }
            
            // Process valid tickets - only conductor trips now (pre-booking handled separately)
            if (ticketData.totalFare && ticketData.quantity) {
              const processedTicket = {
                id: ticketId,
                conductorId: conductorId,
                tripId: tripName,
                tripDirection: tripDirection,
                totalFare: parseFloat(ticketData.totalFare),
                quantity: ticketData.quantity || 1,
                from: ticketData.from,
                to: ticketData.to,
                timestamp: ticketData.timestamp,
                discountAmount: parseFloat(ticketData.discountAmount || 0),
                ticketType: ticketData.ticketType || ticketData.documentType || null,
                documentType: ticketData.documentType || ticketData.ticketType || null,
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

              // Only process conductor tickets and pre-tickets (pre-booking is handled by separate function)
              if (ticketData.documentType === 'preTicket' || ticketData.ticketType === 'preTicket') {
                // Pre-ticketing will be handled separately in fetchPreTicketing function
                // Skip pre-tickets here to avoid duplication
              } else if (ticketData.documentType === 'preBooking' || ticketData.ticketType === 'preBooking') {
                // Skip pre-bookings here - they're handled by fetchPreBookingFromNewPath
              } else {
                // conductorTicket or no documentType = Conductor trips
                conductorTrips.push({
                  ...processedTicket,
                  source: 'Conductor Trips'
                });
              }
            }
          }
        }
      } catch (tripError) {
        // This is normal - not all trip numbers will exist
      }
    }
  } catch (error) {
  }
};

// Fetch pre-booking data from the new path structure
export const fetchPreBookingFromNewPath = async (date, selectedRoute = null) => {
  try {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    let allPreBookings = [];

    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;

      try {
        // If no date is provided, get all trips from all dates
        if (!date) {
          // Get all daily trips dates for this conductor
          const dailyTripsRef = collection(db, `conductors/${conductorId}/dailyTrips`);
          const dailyTripsSnapshot = await getDocs(dailyTripsRef);

          for (const dateDoc of dailyTripsSnapshot.docs) {
            const dateId = dateDoc.id;
            await processPreBookingsForDate(conductorId, dateId, allPreBookings, date, selectedRoute);
          }
        } else {
          // Process specific date
          await processPreBookingsForDate(conductorId, date, allPreBookings, date, selectedRoute);
        }

      } catch (conductorError) {
        console.error(`Error fetching pre-bookings for conductor ${conductorId}:`, conductorError);
        continue;
      }
    }

    return allPreBookings;
  } catch (error) {
    console.error('Error fetching pre-booking data:', error);
    return [];
  }
};

// Helper function to process pre-bookings for a specific date from new path
const processPreBookingsForDate = async (conductorId, dateId, allPreBookings, filterDate = null, selectedRoute = null) => {
  try {
    // Get all trip names dynamically
    const tripNames = await getAllTripNames(conductorId, dateId);

    for (const tripName of tripNames) {
      try {
        // Get trip direction first if route filtering is enabled
        let tripDirection = null;
        if (selectedRoute) {
          tripDirection = await getTripDirection(conductorId, dateId, tripName);

          // Skip this trip if it doesn't match the selected route
          if (tripDirection !== selectedRoute) {
            continue;
          }
        }

        // Get pre-bookings from new path: /conductors/{conductorId}/dailyTrips/{date}/{tripId}/preBookings/preBookings/
        const preBookingsRef = collection(db, `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/preBookings/preBookings`);
        const preBookingsSnapshot = await getDocs(preBookingsRef);

        if (preBookingsSnapshot.docs.length > 0) {
          // If we haven't fetched the trip direction yet, fetch it now
          if (!tripDirection) {
            tripDirection = await getTripDirection(conductorId, dateId, tripName);
          }

          for (const preBookingDoc of preBookingsSnapshot.docs) {
            const preBookingData = preBookingDoc.data();
            const preBookingId = preBookingDoc.id;

            // Check if we should include this pre-booking based on date filter
            if (filterDate) {
              const preBookingTimestamp = preBookingData.timestamp?.toDate ? preBookingData.timestamp.toDate() : new Date(preBookingData.timestamp);
              const preBookingDateString = preBookingTimestamp.toISOString().split('T')[0];

              if (preBookingDateString !== filterDate) {
                continue;
              }
            }

            // Process valid pre-bookings (check for totalFare and quantity)
            if (preBookingData.totalFare && preBookingData.quantity) {
              allPreBookings.push({
                id: preBookingId,
                conductorId: conductorId,
                tripId: tripName,
                tripDirection: tripDirection,
                totalFare: parseFloat(preBookingData.totalFare),
                quantity: preBookingData.quantity,
                from: preBookingData.from,
                to: preBookingData.to,
                timestamp: preBookingData.timestamp,
                discountAmount: parseFloat(preBookingData.discountAmount || 0),
                date: dateId,
                startKm: preBookingData.fromKm,
                endKm: preBookingData.toKm,
                totalKm: preBookingData.totalKm,
                farePerPassenger: preBookingData.farePerPassenger || [],
                discountBreakdown: preBookingData.discountBreakdown || [],
                active: preBookingData.active,
                source: 'Pre-booking',
                ticketType: preBookingData.ticketType || 'preBooking',
                documentType: 'preBooking',
                // Additional pre-booking specific fields
                busNumber: preBookingData.busNumber,
                conductorName: preBookingData.conductorName,
                route: preBookingData.route,
                direction: preBookingData.direction,
                status: preBookingData.status,
                paymentMethod: preBookingData.paymentMethod,
                userId: preBookingData.userId,
                preBookingId: preBookingData.preBookingId,
                createdAt: preBookingData.createdAt,
                paidAt: preBookingData.paidAt
              });
            }
          }
        }
      } catch (tripError) {
        // This is normal - not all trip numbers will exist
      }
    }
  } catch (error) {
    console.error(`Error processing pre-bookings for conductor ${conductorId} on date ${dateId}:`, error);
  }
};

// Fetch pre-ticketing data from the new ticket structure with route filtering
export const fetchPreTicketing = async (date, selectedRoute = null) => {
  try {

    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    let allPreTickets = [];


    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;

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
        console.error(`Error fetching pre-tickets for conductor ${conductorId}:`, conductorError);
        continue;
      }
    }


    return allPreTickets;
  } catch (error) {
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
    
    
    for (const tripName of tripNames) {
      try {
        // Get trip direction first if route filtering is enabled
        let tripDirection = null;
        if (selectedRoute) {
          tripDirection = await getTripDirection(conductorId, dateId, tripName);
          
          // Skip this trip if it doesn't match the selected route
          if (tripDirection !== selectedRoute) {
            continue;
          }
        }

        // Get individual tickets: /conductors/{conductorId}/dailyTrips/{date}/{tripId}/tickets/tickets/
        const individualTicketsRef = collection(db, `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/tickets/tickets`);
        const individualTicketsSnapshot = await getDocs(individualTicketsRef);
        
        if (individualTicketsSnapshot.docs.length > 0) {
          
          // If we haven't fetched the trip direction yet, fetch it now for ticket processing
          if (!tripDirection) {
            tripDirection = await getTripDirection(conductorId, dateId, tripName);
          }
          
          for (const ticketDoc of individualTicketsSnapshot.docs) {
            const ticketData = ticketDoc.data();
            const ticketId = ticketDoc.id;
            
            // Process tickets with documentType === 'preTicket' (prioritize documentType for pre-tickets)
            if (ticketData.documentType === 'preTicket' || ticketData.ticketType === 'preTicket') {
              
              // Check if we should include this ticket based on date filter
              if (filterDate) {
                const ticketTimestamp = ticketData.timestamp?.toDate ? ticketData.timestamp.toDate() : new Date(ticketData.timestamp);
                const ticketDateString = ticketTimestamp.toISOString().split('T')[0];
                
                if (ticketDateString !== filterDate) {
                  continue;
                }
              }
              
              // Process valid pre-tickets
              if (ticketData.totalFare && ticketData.quantity) {
                allPreTickets.push({
                  id: ticketId,
                  conductorId: conductorId,
                  tripId: tripName,
                  tripDirection: tripDirection,
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
                  documentType: ticketData.documentType || ticketData.ticketType
                });
              }
            }
          }
        }
      } catch (tripError) {
        // This is normal - not all trip numbers will exist
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
      // Use ticket route (from → to) for chart grouping, not trip direction
      const route = `${trip.from} → ${trip.to}`;
      
      
      if (!acc[route]) {
        acc[route] = { 
          route, 
          revenue: 0, 
          passengers: 0,
          tripDirection: trip.tripDirection || 'N/A', 
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
  
  
  return sortedRoutes;
};

// Load all revenue data with route filtering
export const loadRevenueData = async (selectedDate, selectedRoute = null) => {
  try {

    // Pass null or empty string when date is cleared to fetch all data
    const dateParam = selectedDate && selectedDate.trim() !== '' ? selectedDate : null;

    const [{ conductorTrips }, preBookingTrips, preTicketing] = await Promise.all([
      fetchConductorTripsAndPreBooking(dateParam, selectedRoute),
      fetchPreBookingFromNewPath(dateParam, selectedRoute),
      fetchPreTicketing(dateParam, selectedRoute)
    ]);

    const metrics = calculateRevenueMetrics(conductorTrips, preBookingTrips, preTicketing);

    const result = {
      conductorTrips,
      preBookingTrips,
      preTicketing,
      ...metrics
    };

    return result;
  } catch (error) {
    console.error('Error loading revenue data:', error);
    throw error;
  }
};