import { collection, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '/src/firebase/firebase.js';

// REVENUE DATA CACHE SERVICE
class RevenueDataCacheService {
  constructor() {
    this.listeners = new Map();
    this.maxListeners = 10;
    this.cleanupOnError = true;

    // IN-MEMORY CACHE SYSTEM
    this.revenueCache = new Map(); // key: `${date}_${route}`, value: revenue data
    this.lastFetchTime = new Map(); // Track fetch times per key
    this.isCacheListenerActive = false;
    this.cacheVersion = 1;
    this.currentCallbacks = new Map(); // Store callbacks for cache updates

    // Available dates and routes cache
    this.availableDatesCache = null;
    this.availableRoutesCache = null;
    this.datesCacheTime = null;
    this.routesCacheTime = null;

    // Force cleanup on page load/refresh
    this.forceCleanup();
  }

  // Force cleanup method
  forceCleanup() {
    try {
      this.removeAllListeners();

      // Clear global listeners if they exist
      if (window.revenueListeners) {
        window.revenueListeners.forEach(unsubscribe => {
          try { unsubscribe(); } catch (e) {}
        });
        window.revenueListeners = [];
      }
    } catch (error) {
      console.warn('Error during revenue cache cleanup:', error);
    }
  }

  // CACHED: Get revenue data with cache-first approach
  async getRevenueData(selectedDate, selectedRoute = null) {
    try {
      const cacheKey = this.getCacheKey(selectedDate, selectedRoute);

      // FAST PATH: Return cached data immediately if available and fresh
      if (this.revenueCache.has(cacheKey) && this.isCacheFresh(cacheKey)) {
        return { ...this.revenueCache.get(cacheKey), fromCache: true };
      }

      // SLOW PATH: Fetch fresh data
      const freshData = await this.fetchRevenueDataFromFirestore(selectedDate, selectedRoute);

      // Save to cache
      this.revenueCache.set(cacheKey, freshData);
      this.lastFetchTime.set(cacheKey, Date.now());

      // Start listening for real-time changes if not already active
      if (!this.isCacheListenerActive) {
        this.startRevenueDataListener();
      }

      return { ...freshData, fromCache: false };
    } catch (error) {
      console.error('Error fetching revenue data:', error);
      throw error;
    }
  }

  // Generate cache key from date and route
  getCacheKey(date, route) {
    const dateKey = date && date.trim() !== '' ? date : 'all_dates';
    const routeKey = route && route.trim() !== '' ? route : 'all_routes';
    return `${dateKey}_${routeKey}`;
  }

  // Check if cache is fresh (5 minutes)
  isCacheFresh(cacheKey) {
    const lastFetch = this.lastFetchTime.get(cacheKey);
    if (!lastFetch) return false;
    const ageMinutes = (Date.now() - lastFetch) / (1000 * 60);
    return ageMinutes < 5; // Cache valid for 5 minutes
  }

  // Fetch revenue data from Firestore (original logic)
  async fetchRevenueDataFromFirestore(selectedDate, selectedRoute) {

    // Pass null or empty string when date is cleared to fetch all data
    const dateParam = selectedDate && selectedDate.trim() !== '' ? selectedDate : null;

    // All three data fetching functions already run in parallel via Promise.all
    const [{ conductorTrips }, preBookingTrips, preTicketing] = await Promise.all([
      this.fetchConductorTripsAndPreBooking(dateParam, selectedRoute),
      this.fetchPreBookingFromNewPath(dateParam, selectedRoute),
      this.fetchPreTicketing(dateParam, selectedRoute)
    ]);

    const metrics = this.calculateRevenueMetrics(conductorTrips, preBookingTrips, preTicketing);

    const result = {
      conductorTrips,
      preBookingTrips,
      preTicketing,
      ...metrics
    };


    return result;
  }

  // Start real-time cache updates listener
  startRevenueDataListener() {
    if (this.isCacheListenerActive) {
      return; // Don't create duplicate listeners
    }

    // Listen to conductor collection for changes
    const conductorsRef = collection(db, 'conductors');

    const unsubscribe = onSnapshot(conductorsRef, async (snapshot) => {
      const changes = snapshot.docChanges();

      if (changes.length === 0) {
        return;
      }


      // For simplicity, invalidate all cache when any conductor data changes
      // In a more sophisticated implementation, you could selectively invalidate
      this.invalidateAllCache();

      // Notify active listeners about cache update
      this.notifyListenersOfCacheUpdate();
    }, (error) => {
      console.error('Error in revenue cache listener:', error);
      this.isCacheListenerActive = false;
      this.listeners.delete('revenue_cache_listener');
    });

    this.listeners.set('revenue_cache_listener', unsubscribe);
    this.isCacheListenerActive = true;
  }

  // Notify active listeners about cache updates
  notifyListenersOfCacheUpdate() {
    this.currentCallbacks.forEach((callback, key) => {
      if (typeof callback === 'function') {
        // Debounce multiple rapid updates
        if (this.updateTimeouts && this.updateTimeouts.has(key)) {
          clearTimeout(this.updateTimeouts.get(key));
        }

        if (!this.updateTimeouts) {
          this.updateTimeouts = new Map();
        }

        const timeout = setTimeout(async () => {
          try {
            // Parse the key to get date and route
            const [date, route] = key.split('_callback_')[1].split('_');
            const actualDate = date === 'all-dates' ? null : date;
            const actualRoute = route === 'all-routes' ? null : route;

            // Fetch fresh data and call the callback
            const freshData = await this.getRevenueData(actualDate, actualRoute);
            callback(freshData);
          } catch (error) {
            console.error('Error in cache update callback:', error);
          }
          this.updateTimeouts.delete(key);
        }, 100); // Small debounce delay

        this.updateTimeouts.set(key, timeout);
      }
    });
  }

  // Cache management methods
  invalidateAllCache() {
    this.revenueCache.clear();
    this.lastFetchTime.clear();
    this.availableDatesCache = null;
    this.availableRoutesCache = null;
    this.datesCacheTime = null;
    this.routesCacheTime = null;
  }

  invalidateCache(date, route) {
    const cacheKey = this.getCacheKey(date, route);
    this.revenueCache.delete(cacheKey);
    this.lastFetchTime.delete(cacheKey);
  }

  // Force refresh cache
  async forceRefreshCache(date, route) {
    this.invalidateCache(date, route);
    return await this.getRevenueData(date, route);
  }

  // CACHED: Setup real-time listener for revenue data
  setupRevenueDataListener(date, route, callback) {
    const listenerKey = `revenue_callback_${this.getCacheKey(date, route)}`;

    // Remove existing listener
    this.removeListener(listenerKey);

    // Store the callback
    this.currentCallbacks.set(listenerKey, callback);

    // If we have cached data, return it immediately
    const cacheKey = this.getCacheKey(date, route);
    if (this.revenueCache.has(cacheKey)) {
      setTimeout(() => {
        const cachedData = this.revenueCache.get(cacheKey);
        if (cachedData && typeof callback === 'function') {
          callback({ ...cachedData, fromCache: true });
        }
      }, 0);
    } else {
      // If no cache, fetch data
      this.getRevenueData(date, route)
        .then(data => {
          if (typeof callback === 'function') {
            callback(data);
          }
        })
        .catch(error => {
          console.error('Error in revenue data listener:', error);
          if (typeof callback === 'function') {
            callback({ error: error.message });
          }
        });
    }

    // Create cleanup function
    const unsubscribe = () => {
      this.currentCallbacks.delete(listenerKey);
    };

    this.listeners.set(listenerKey, unsubscribe);
    return unsubscribe;
  }

  // CACHED: Get available dates with caching
  async getAvailableDates() {
    try {
      // Check if cache is fresh (10 minutes for dates)
      if (this.availableDatesCache && this.datesCacheTime) {
        const ageMinutes = (Date.now() - this.datesCacheTime) / (1000 * 60);
        if (ageMinutes < 10) {
          return this.availableDatesCache;
        }
      }

      const dates = await this.fetchAvailableDatesFromFirestore();

      // Cache the results
      this.availableDatesCache = dates;
      this.datesCacheTime = Date.now();

      return dates;
    } catch (error) {
      console.error('Error fetching available dates:', error);
      return this.availableDatesCache || [];
    }
  }

  // CACHED: Get available routes with caching
  async getAvailableRoutes() {
    try {
      // Check if cache is fresh (10 minutes for routes)
      if (this.availableRoutesCache && this.routesCacheTime) {
        const ageMinutes = (Date.now() - this.routesCacheTime) / (1000 * 60);
        if (ageMinutes < 10) {
          return this.availableRoutesCache;
        }
      }

      const routes = await this.fetchAvailableRoutesFromFirestore();

      // Cache the results
      this.availableRoutesCache = routes;
      this.routesCacheTime = Date.now();

      return routes;
    } catch (error) {
      console.error('Error fetching available routes:', error);
      return this.availableRoutesCache || [];
    }
  }

  getCacheInfo() {
    return {
      cacheSize: this.revenueCache.size,
      isListenerActive: this.isCacheListenerActive,
      cachedKeys: Array.from(this.revenueCache.keys()),
      availableDatesCache: !!this.availableDatesCache,
      availableRoutesCache: !!this.availableRoutesCache
    };
  }

  // Clean up listeners
  removeListener(key) {
    const unsubscribe = this.listeners.get(key);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(key);
    }
  }

  removeAllListeners() {
    this.listeners.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (error) {
        console.warn('Error cleaning up listener:', error);
      }
    });
    this.listeners.clear();
    this.currentCallbacks.clear();
    this.isCacheListenerActive = false;
  }

  // Move original methods to cache service
  async fetchAvailableRoutesFromFirestore() {
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
  }

  async fetchAvailableDatesFromFirestore() {
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
  }

  // Move all revenue fetching methods to cache service
  async fetchConductorTripsAndPreBooking(date, selectedRoute = null) {
    try {

      const conductorsRef = collection(db, 'conductors');
      const conductorsSnapshot = await getDocs(conductorsRef);

      // Process all conductors in parallel instead of sequential
      const conductorPromises = conductorsSnapshot.docs.map(async (conductorDoc) => {
        const conductorId = conductorDoc.id;
        let conductorTrips = [];

        try {
          // If no date is provided, get all trips from all dates
          if (!date) {
            // Get all daily trips dates for this conductor
            const dailyTripsRef = collection(db, `conductors/${conductorId}/dailyTrips`);
            const dailyTripsSnapshot = await getDocs(dailyTripsRef);

            // Process all date docs in parallel for this conductor
            const datePromises = dailyTripsSnapshot.docs.map(async (dateDoc) => {
              const dateId = dateDoc.id;
              const dateConductorTrips = [];
              await this.processTripsForDate(conductorId, dateId, dateConductorTrips, [], date, selectedRoute);
              return dateConductorTrips;
            });

            const dateResults = await Promise.all(datePromises);
            conductorTrips = dateResults.flat();
          } else {
            // Process specific date
            await this.processTripsForDate(conductorId, date, conductorTrips, [], date, selectedRoute);
          }

          return conductorTrips;
        } catch (conductorError) {
          console.warn(`Error processing conductor ${conductorId}:`, conductorError.message);
          return [];
        }
      });

      // Wait for all conductors to complete in parallel
      const allConductorResults = await Promise.all(conductorPromises);
      const conductorTrips = allConductorResults.flat();


      return { conductorTrips };
    } catch (error) {
      console.error('Error in fetchConductorTripsAndPreBooking:', error);
      return { conductorTrips: [] };
    }
  }

  async fetchPreBookingFromNewPath(date, selectedRoute = null) {
    try {

      const conductorsRef = collection(db, 'conductors');
      const conductorsSnapshot = await getDocs(conductorsRef);

      // Process all conductors in parallel instead of sequential
      const conductorPromises = conductorsSnapshot.docs.map(async (conductorDoc) => {
        const conductorId = conductorDoc.id;
        let conductorPreBookings = [];

        try {
          // If no date is provided, get all trips from all dates
          if (!date) {
            // Get all daily trips dates for this conductor
            const dailyTripsRef = collection(db, `conductors/${conductorId}/dailyTrips`);
            const dailyTripsSnapshot = await getDocs(dailyTripsRef);

            // Process all date docs in parallel for this conductor
            const datePromises = dailyTripsSnapshot.docs.map(async (dateDoc) => {
              const dateId = dateDoc.id;
              const datePreBookings = [];
              await this.processPreBookingsForDate(conductorId, dateId, datePreBookings, date, selectedRoute);
              return datePreBookings;
            });

            const dateResults = await Promise.all(datePromises);
            conductorPreBookings = dateResults.flat();
          } else {
            // Process specific date
            await this.processPreBookingsForDate(conductorId, date, conductorPreBookings, date, selectedRoute);
          }

          return conductorPreBookings;
        } catch (conductorError) {
          console.warn(`Error fetching pre-bookings for conductor ${conductorId}:`, conductorError.message);
          return [];
        }
      });

      // Wait for all conductors to complete in parallel
      const allConductorResults = await Promise.all(conductorPromises);
      const allPreBookings = allConductorResults.flat();


      return allPreBookings;
    } catch (error) {
      console.error('Error fetching pre-booking data:', error);
      return [];
    }
  }

  async fetchPreTicketing(date, selectedRoute = null) {
    try {

      const conductorsRef = collection(db, 'conductors');
      const conductorsSnapshot = await getDocs(conductorsRef);

      // Process all conductors in parallel instead of sequential
      const conductorPromises = conductorsSnapshot.docs.map(async (conductorDoc) => {
        const conductorId = conductorDoc.id;
        let conductorPreTickets = [];

        try {
          // If no date is provided, get all trips from all dates
          if (!date) {
            // Get all daily trips dates for this conductor
            const dailyTripsRef = collection(db, `conductors/${conductorId}/dailyTrips`);
            const dailyTripsSnapshot = await getDocs(dailyTripsRef);

            // Process all date docs in parallel for this conductor
            const datePromises = dailyTripsSnapshot.docs.map(async (dateDoc) => {
              const dateId = dateDoc.id;
              const datePreTickets = [];
              await this.processPreTicketsForDate(conductorId, dateId, datePreTickets, date, selectedRoute);
              return datePreTickets;
            });

            const dateResults = await Promise.all(datePromises);
            conductorPreTickets = dateResults.flat();
          } else {
            // Process specific date
            await this.processPreTicketsForDate(conductorId, date, conductorPreTickets, date, selectedRoute);
          }

          return conductorPreTickets;
        } catch (conductorError) {
          console.warn(`Error fetching pre-tickets for conductor ${conductorId}:`, conductorError.message);
          return [];
        }
      });

      // Wait for all conductors to complete in parallel
      const allConductorResults = await Promise.all(conductorPromises);
      const allPreTickets = allConductorResults.flat();


      return allPreTickets;
    } catch (error) {
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      return [];
    }
  }

  // Helper method to process trips for a specific date with route filtering
  async processTripsForDate(conductorId, dateId, conductorTrips, preBookingTrips, filterDate = null, selectedRoute = null) {
    try {
      // Get all trip names dynamically instead of hardcoding
      const tripNames = await getAllTripNames(conductorId, dateId);

      // Process all trips in parallel instead of sequential
      const tripPromises = tripNames.map(async (tripName) => {
        try {
          // Get trip direction first if route filtering is enabled
          let tripDirection = null;
          if (selectedRoute) {
            tripDirection = await getTripDirection(conductorId, dateId, tripName);

            // Skip this trip if it doesn't match the selected route
            if (tripDirection !== selectedRoute) {
              return [];
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

            const tripTickets = [];

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
                  tripTickets.push({
                    ...processedTicket,
                    source: 'Conductor Trips'
                  });
                }
              }
            }

            return tripTickets;
          }

          return [];
        } catch (tripError) {
          console.warn(`Error processing trip ${tripName} for conductor ${conductorId}:`, tripError.message);
          return [];
        }
      });

      // Wait for all trips to complete and flatten results
      const tripResults = await Promise.all(tripPromises);
      const allTripTickets = tripResults.flat();

      // Add results to conductorTrips array
      conductorTrips.push(...allTripTickets);
    } catch (error) {
      console.warn(`Error processing trips for conductor ${conductorId} on date ${dateId}:`, error.message);
    }
  }

  // Helper method to process pre-bookings for a specific date from new path
  async processPreBookingsForDate(conductorId, dateId, allPreBookings, filterDate = null, selectedRoute = null) {
    try {
      // Get all trip names dynamically
      const tripNames = await getAllTripNames(conductorId, dateId);

      // Process all trips in parallel instead of sequential
      const tripPromises = tripNames.map(async (tripName) => {
        try {
          // Get trip direction first if route filtering is enabled
          let tripDirection = null;
          if (selectedRoute) {
            tripDirection = await getTripDirection(conductorId, dateId, tripName);

            // Skip this trip if it doesn't match the selected route
            if (tripDirection !== selectedRoute) {
              return [];
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

            const tripPreBookings = [];

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
                tripPreBookings.push({
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

            return tripPreBookings;
          }

          return [];
        } catch (tripError) {
          console.warn(`Error processing pre-booking trip ${tripName} for conductor ${conductorId}:`, tripError.message);
          return [];
        }
      });

      // Wait for all trips to complete and flatten results
      const tripResults = await Promise.all(tripPromises);
      const allTripPreBookings = tripResults.flat();

      // Add results to allPreBookings array
      allPreBookings.push(...allTripPreBookings);
    } catch (error) {
      console.warn(`Error processing pre-bookings for conductor ${conductorId} on date ${dateId}:`, error.message);
    }
  }

  // Helper method to process pre-tickets for a specific date with route filtering
  async processPreTicketsForDate(conductorId, dateId, allPreTickets, filterDate = null, selectedRoute = null) {
    try {
      // Get all trip names dynamically instead of hardcoding
      const tripNames = await getAllTripNames(conductorId, dateId);

      // Process all trips in parallel instead of sequential
      const tripPromises = tripNames.map(async (tripName) => {
        try {
          // Get trip direction first if route filtering is enabled
          let tripDirection = null;
          if (selectedRoute) {
            tripDirection = await getTripDirection(conductorId, dateId, tripName);

            // Skip this trip if it doesn't match the selected route
            if (tripDirection !== selectedRoute) {
              return [];
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

            const tripPreTickets = [];

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
                  tripPreTickets.push({
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

            return tripPreTickets;
          }

          return [];
        } catch (tripError) {
          console.warn(`Error processing pre-ticket trip ${tripName} for conductor ${conductorId}:`, tripError.message);
          return [];
        }
      });

      // Wait for all trips to complete and flatten results
      const tripResults = await Promise.all(tripPromises);
      const allTripPreTickets = tripResults.flat();

      // Add results to allPreTickets array
      allPreTickets.push(...allTripPreTickets);
    } catch (error) {
      console.warn(`Error processing pre-tickets for conductor ${conductorId} on date ${dateId}:`, error.message);
    }
  }

  // Calculate revenue metrics with three categories
  calculateRevenueMetrics(conductorTrips, preBookingTrips, preTicketing) {
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
  }
}

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

// Create singleton instance
const revenueDataCache = new RevenueDataCacheService();

// CACHED EXPORTS: Use cache-first approach
export const fetchConductorTripsAndPreBooking = async (date, selectedRoute = null) => {
  const result = await revenueDataCache.fetchConductorTripsAndPreBooking(date, selectedRoute);
  return result;
};

// Helper function moved to cache service

export const fetchPreBookingFromNewPath = async (date, selectedRoute = null) => {
  return await revenueDataCache.fetchPreBookingFromNewPath(date, selectedRoute);
};

// Helper function moved to cache service

export const fetchPreTicketing = async (date, selectedRoute = null) => {
  return await revenueDataCache.fetchPreTicketing(date, selectedRoute);
};

export const calculateRevenueMetrics = (conductorTrips, preBookingTrips, preTicketing) => {
  return revenueDataCache.calculateRevenueMetrics(conductorTrips, preBookingTrips, preTicketing);
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

// CACHED: Load all revenue data with caching
export const loadRevenueData = async (selectedDate, selectedRoute = null) => {
  try {
    // Pass null or empty string when date is cleared to fetch all data
    const dateParam = selectedDate && selectedDate.trim() !== '' ? selectedDate : null;

    // Use cached data service
    return await revenueDataCache.getRevenueData(dateParam, selectedRoute);
  } catch (error) {
    console.error('Error loading revenue data:', error);
    throw error;
  }
};

// CACHED: Get available routes with caching
export const getAvailableRoutes = async () => {
  return await revenueDataCache.getAvailableRoutes();
};

// CACHED: Get available dates with caching
export const getAvailableDates = async () => {
  return await revenueDataCache.getAvailableDates();
};

// NEW: Setup real-time listener for revenue data
export const setupRevenueDataListener = (date, route, callback) => {
  return revenueDataCache.setupRevenueDataListener(date, route, callback);
};

// NEW: Force refresh cache
export const forceRefreshRevenueCache = async (date, route) => {
  return await revenueDataCache.forceRefreshCache(date, route);
};

// NEW: Get cache info for debugging
export const getRevenueCacheInfo = () => {
  return revenueDataCache.getCacheInfo();
};

// NEW: Cleanup listeners (call on component unmount)
export const cleanupRevenueListeners = () => {
  revenueDataCache.removeAllListeners();
};