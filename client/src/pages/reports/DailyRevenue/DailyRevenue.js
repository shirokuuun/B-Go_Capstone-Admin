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

  //  Get revenue data with cache-first approach
  async getRevenueData(selectedDate, selectedRoute = null) {
    try {
      const cacheKey = this.getCacheKey(selectedDate, selectedRoute);

      //  Return cached data immediately if available and fresh
      if (this.revenueCache.has(cacheKey) && this.isCacheFresh(cacheKey)) {
        return { ...this.revenueCache.get(cacheKey), fromCache: true };
      }

      // Fetch fresh data
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

  // Check if cache is fresh (3 minutes)
  isCacheFresh(cacheKey) {
    const lastFetch = this.lastFetchTime.get(cacheKey);
    if (!lastFetch) return false;
    const ageMinutes = (Date.now() - lastFetch) / (1000 * 60);
    return ageMinutes < 3; // Cache valid for 3 minutes
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

  // Start listening for conductor-level changes (note: subcollection changes not detected)
  // Ticket changes are handled by cache expiration (3 min)
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

      // Track which cache keys need to be invalidated
      const affectedCacheKeys = new Set();

      // Process each change to determine which cached data is affected
      changes.forEach(change => {
        const conductorId = change.doc.id;

        // Check all cached data to see which contains this conductor
        this.revenueCache.forEach((data, cacheKey) => {
          // Check if this cached data contains the affected conductor
          const hasAffectedConductor =
            data.conductorTrips?.some(trip => trip.conductorId === conductorId) ||
            data.preBookingTrips?.some(trip => trip.conductorId === conductorId) ||
            data.preTicketing?.some(trip => trip.conductorId === conductorId);

          if (hasAffectedConductor) {
            affectedCacheKeys.add(cacheKey);
          }
        });
      });

      // Invalidate only affected cache keys
      if (affectedCacheKeys.size > 0) {
        affectedCacheKeys.forEach(cacheKey => {
          this.revenueCache.delete(cacheKey);
          this.lastFetchTime.delete(cacheKey);
        });

        // Notify active listeners about cache update
        this.notifyListenersOfCacheUpdate();
      }
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

  //  Setup real-time listener for revenue data
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

  // Get available dates with caching
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

  //  Get available routes with caching
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

            // Flag to check if this date has any trips with tickets
            let hasTripsWithTickets = false;

            // Check for trips within this date to verify it has actual data
            try {
              // Get all trip names dynamically
              const tripNames = await getAllTripNames(conductorId, dateId);

              for (const tripName of tripNames) {
                try {
                  // Check for tickets in: /conductors/{conductorId}/dailyTrips/{dateId}/{tripName}/tickets/tickets/
                  const ticketsRef = collection(db, `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/tickets/tickets`);
                  const ticketsSnapshot = await getDocs(ticketsRef);

                  // Also check for pre-bookings
                  const preBookingsRef = collection(db, `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/preBookings/preBookings`);
                  const preBookingsSnapshot = await getDocs(preBookingsRef);

                  // Also check for pre-tickets
                  const preTicketsRef = collection(db, `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/preTickets/preTickets`);
                  const preTicketsSnapshot = await getDocs(preTicketsRef);

                  // If any of these have documents, this date has trips
                  if (ticketsSnapshot.docs.length > 0 || preBookingsSnapshot.docs.length > 0 || preTicketsSnapshot.docs.length > 0) {
                    hasTripsWithTickets = true;
                    break; // No need to check other trips
                  }
                } catch (tripError) {
                  // This is normal - not all trip numbers will exist
                }
              }
            } catch (tripsError) {
              // No trips found for date
            }

            // Only add date if it has trips with tickets
            if (hasTripsWithTickets) {
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
          // Get trip direction and currentTrip number first if route filtering is enabled
          let tripDirection = null;
          let currentTripNumber = null;
          if (selectedRoute) {
            const tripInfo = await getTripInfo(conductorId, dateId, tripName);
            tripDirection = tripInfo.direction;
            currentTripNumber = tripInfo.currentTrip;

            // Skip this trip if it doesn't match the selected route
            if (tripDirection !== selectedRoute) {
              return [];
            }
          }

          // Check if this trip exists by trying to get its tickets
          const ticketsCollectionRef = collection(db, `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/tickets/tickets`);
          const ticketsSnapshot = await getDocs(ticketsCollectionRef);

          if (ticketsSnapshot.docs.length > 0) {

            // If we haven't fetched the trip info yet, fetch it now for ticket processing
            if (!tripDirection || !currentTripNumber) {
              const tripInfo = await getTripInfo(conductorId, dateId, tripName);
              tripDirection = tripInfo.direction;
              currentTripNumber = tripInfo.currentTrip;
            }

            const tripTickets = [];

            for (const ticketDoc of ticketsSnapshot.docs) {
              const ticketData = ticketDoc.data();
              const ticketId = ticketDoc.id;


              // Check if we should include this ticket based on date filter
              if (filterDate) {
                // Use dateId for comparison instead of ticket timestamp to avoid timezone issues
                // The document is already organized by date, so if the ticket is in this date's document, it belongs to this date
                if (dateId !== filterDate) {
                  continue;
                }
              }

              // Process valid tickets - only conductor trips now (pre-booking handled separately)
              if (ticketData.totalFare && ticketData.quantity) {
                const processedTicket = {
                  // Include all ticket data first
                  ...ticketData,
                  // Then override with our clean values
                  id: ticketId,
                  conductorId: conductorId,
                  tripId: tripName,
                  currentTrip: currentTripNumber,
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
                  active: ticketData.active
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


    async processPreBookingsForDate(conductorId, dateId, allPreBookings, filterDate = null, selectedRoute = null) {
  try {
    // Get all trip names dynamically
    const tripNames = await getAllTripNames(conductorId, dateId);

    // Process all trips in parallel
    const tripPromises = tripNames.map(async (tripName) => {
      try {
        // Get trip info first if route filtering is enabled
        let tripDirection = null;
        let currentTripNumber = null;
        if (selectedRoute) {
          const tripInfo = await getTripInfo(conductorId, dateId, tripName);
          tripDirection = tripInfo.direction;
          currentTripNumber = tripInfo.currentTrip;

          // Skip this trip if it doesn't match the selected route
          if (tripDirection !== selectedRoute) {
            return [];
          }
        }

        //  Get preBookings from /conductors/{conductorId}/dailyTrips/{date}/{tripId}/preBookings/preBookings/
        const preBookingsRef = collection(db, `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/preBookings/preBookings`);
        const preBookingsSnapshot = await getDocs(preBookingsRef);

        if (preBookingsSnapshot.docs.length > 0) {
          // If we haven't fetched the trip info yet, fetch it now
          if (!tripDirection || !currentTripNumber) {
            const tripInfo = await getTripInfo(conductorId, dateId, tripName);
            tripDirection = tripInfo.direction;
            currentTripNumber = tripInfo.currentTrip;
          }

          const tripPreBookings = [];

          for (const ticketDoc of preBookingsSnapshot.docs) {
            const ticketData = ticketDoc.data();
            const ticketId = ticketDoc.id;

            // Check if we should include this ticket based on date filter
            if (filterDate) {
              if (dateId !== filterDate) {
                continue;
              }
            }

            // Only include pre-bookings that have been scanned/boarded
            if (!ticketData.scannedAt) {
              continue;
            }

            // Process valid pre-bookings (all docs in preBookings collection should be preBookings)
            if (ticketData.totalFare && ticketData.quantity) {
              const preBooking = {
                id: ticketId,
                conductorId: conductorId,
                tripId: tripName,
                currentTrip: currentTripNumber,
                tripDirection: tripDirection || ticketData.direction,
                totalFare: parseFloat(ticketData.totalFare),
                quantity: ticketData.quantity,
                from: ticketData.from,
                to: ticketData.to,
                timestamp: ticketData.scannedAt,
                discountAmount: parseFloat(ticketData.discountAmount || 0),
                date: dateId,
                startKm: ticketData.startKm || 0,
                endKm: ticketData.endKm || 0,
                totalKm: ticketData.totalKm || 0,
                farePerPassenger: ticketData.farePerPassenger || [],
                discountBreakdown: ticketData.discountBreakdown || [],
                discountList: ticketData.discountList || [],
                active: ticketData.active !== undefined ? ticketData.active : true,
                source: 'Pre-booking',
                ticketType: ticketData.ticketType || 'preBooking',
                documentType: ticketData.documentType || ticketData.ticketType || 'preBooking',
                // Don't spread ticketData at the end to avoid overriding our clean tripId
              };

              tripPreBookings.push(preBooking);
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
    console.error(`Error processing pre-bookings for conductor ${conductorId} on date ${dateId}:`, error);
  }
}


async processPreTicketsForDate(conductorId, dateId, allPreTickets, filterDate = null, selectedRoute = null) {
  try {
    // Get all trip names dynamically instead of hardcoding
    const tripNames = await getAllTripNames(conductorId, dateId);

    // Process all trips in parallel instead of sequential
    const tripPromises = tripNames.map(async (tripName) => {
      try {
        // Get trip info first if route filtering is enabled
        let tripDirection = null;
        let currentTripNumber = null;
        if (selectedRoute) {
          const tripInfo = await getTripInfo(conductorId, dateId, tripName);
          tripDirection = tripInfo.direction;
          currentTripNumber = tripInfo.currentTrip;

          // Skip this trip if it doesn't match the selected route
          if (tripDirection !== selectedRoute) {
            return [];
          }
        }

        // Get preTickets from correct path: /conductors/{conductorId}/dailyTrips/{date}/{tripId}/preTickets/preTickets/
        const preTicketsRef = collection(db, `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/preTickets/preTickets`);
        const preTicketsSnapshot = await getDocs(preTicketsRef);

        if (preTicketsSnapshot.docs.length > 0) {
          // If we haven't fetched the trip info yet, fetch it now for ticket processing
          if (!tripDirection || !currentTripNumber) {
            const tripInfo = await getTripInfo(conductorId, dateId, tripName);
            tripDirection = tripInfo.direction;
            currentTripNumber = tripInfo.currentTrip;
          }

          const tripPreTickets = [];

          for (const ticketDoc of preTicketsSnapshot.docs) {
            const ticketData = ticketDoc.data();
            const ticketId = ticketDoc.id;

            //  PARSE qrData if it's a string
            let parsedQrData = null;
            if (ticketData.qrData) {
              try {
                if (typeof ticketData.qrData === 'string') {
                  parsedQrData = JSON.parse(ticketData.qrData);
                } else if (typeof ticketData.qrData === 'object') {
                  parsedQrData = ticketData.qrData;
                }
              } catch (parseError) {
                console.warn(`Failed to parse qrData for ticket ${ticketId}:`, parseError);
              }
            }

            // Check if we should include this ticket based on date filter
            if (filterDate) {
              // Use dateId for comparison instead of timestamp to avoid timezone issues
              if (dateId !== filterDate) {
                continue;
              }
            }

            // Only include pre-tickets that have been scanned/boarded
            if (!ticketData.scannedAt) {
              continue;
            }

            //  Use parsedQrData as the primary data source, with fallbacks
            const sourceData = parsedQrData || ticketData;

            // Process valid pre-tickets
            if (sourceData.amount || sourceData.totalFare) {
              // BUILD DISCOUNT BREAKDOWN from qrData
              let discountBreakdown = [];
              let discountList = [];
              let totalDiscountAmount = 0;

              // Method 1: Parse discountBreakdown from qrData
              if (sourceData.discountBreakdown && Array.isArray(sourceData.discountBreakdown)) {
                // discountBreakdown is an array of strings like:
                // "Passenger 1: Senior (20% off) — 12.00 PHP"
                discountBreakdown = sourceData.discountBreakdown.map((breakdownStr, index) => {
                  // Extract fare type and amount
                  const fareTypeMatch = breakdownStr.match(/(Senior|Student|PWD|Regular)/);
                  const amountMatch = breakdownStr.match(/(\d+\.?\d*)\s*PHP/);
                  const discountMatch = breakdownStr.match(/(\d+)%/);
                  
                  const fareType = fareTypeMatch ? fareTypeMatch[1] : 'Regular';
                  const fare = amountMatch ? parseFloat(amountMatch[1]) : 0;
                  const discountPercent = discountMatch ? parseInt(discountMatch[1]) : 0;
                  
                  // Calculate original fare before discount
                  const originalFare = discountPercent > 0 ? fare / (1 - discountPercent / 100) : fare;
                  const discountAmount = originalFare - fare;
                  
                  totalDiscountAmount += discountAmount;
                  
                  return {
                    type: fareType,
                    count: 1,
                    discount: discountAmount,
                    fare: fare,
                    originalFare: originalFare,
                    discountPercent: discountPercent
                  };
                });
              }

              // Method 2: Build from fareTypes array in qrData
              if (sourceData.fareTypes && Array.isArray(sourceData.fareTypes)) {
                discountList = sourceData.fareTypes.map((type, index) => {
                  const passengerFare = sourceData.passengerFares && sourceData.passengerFares[index] 
                    ? sourceData.passengerFares[index] 
                    : 0;
                  
                  return {
                    type: type,
                    fare: passengerFare,
                    count: 1
                  };
                });
                
                // If discountBreakdown is empty, build it from fareTypes
                if (discountBreakdown.length === 0 && sourceData.passengerFares) {
                  const regularFare = sourceData.fare || 15; // Fallback to fare per passenger
                  
                  sourceData.fareTypes.forEach((type, index) => {
                    const passengerFare = sourceData.passengerFares[index] || 0;
                    const isDiscounted = type !== 'Regular';
                    const discountAmount = isDiscounted ? regularFare - passengerFare : 0;
                    
                    totalDiscountAmount += discountAmount;
                    
                    discountBreakdown.push({
                      type: type,
                      count: 1,
                      discount: discountAmount,
                      fare: passengerFare,
                      originalFare: regularFare,
                      discountPercent: isDiscounted ? Math.round((discountAmount / regularFare) * 100) : 0
                    });
                  });
                }
              }

              const preTicket = {
                id: ticketId,
                conductorId: conductorId,
                tripId: tripName,
                currentTrip: currentTripNumber,
                tripDirection: tripDirection || sourceData.direction || ticketData.direction,
                totalFare: parseFloat(sourceData.amount || sourceData.totalFare || 0),
                quantity: sourceData.quantity || ticketData.quantity || 1,
                from: sourceData.from || ticketData.from,
                to: sourceData.to || ticketData.to,
                timestamp: ticketData.scannedAt,
                discountAmount: parseFloat(ticketData.discountAmount || totalDiscountAmount || 0),
                date: dateId,
                startKm: sourceData.fromKm || ticketData.startKm || ticketData.fromKm || 0,
                endKm: sourceData.toKm || ticketData.endKm || ticketData.toKm || 0,
                totalKm: sourceData.totalKm || ticketData.totalKm || ((sourceData.toKm || 0) - (sourceData.fromKm || 0)),
                farePerPassenger: sourceData.passengerFares || ticketData.farePerPassenger || ticketData.passengerFares || [],
                discountBreakdown: discountBreakdown,
                discountList: discountList,
                active: ticketData.active !== undefined ? ticketData.active : true,
                source: 'Pre-ticketing',
                ticketType: sourceData.ticketType || ticketData.ticketType || 'preTicket',
                documentType: sourceData.type || ticketData.documentType || ticketData.ticketType || 'preTicket',
                // Include additional preTicket-specific fields
                route: sourceData.route || ticketData.route,
                direction: sourceData.direction || ticketData.direction,
                scannedAt: ticketData.scannedAt,
                scannedBy: ticketData.scannedBy,
                status: ticketData.status,
                qrData: ticketData.qrData,
                qrDataParsed: parsedQrData, // Include parsed version for reference
                fareTypes: sourceData.fareTypes || ticketData.fareTypes,
                placeCollection: sourceData.placeCollection || ticketData.placeCollection,
                time: sourceData.time || ticketData.time,
                amount: sourceData.amount || ticketData.amount,
                passengerFares: sourceData.passengerFares || ticketData.passengerFares,
                fare: sourceData.fare // Individual fare per passenger from qrData
              };

              tripPreTickets.push(preTicket);
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
    console.error(`Error processing pre-tickets for conductor ${conductorId} on date ${dateId}:`, error);
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

// Create singleton instance
const revenueDataCache = new RevenueDataCacheService();

// Use cache-first approach
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

// Enhanced function to get trip info (direction and currentTrip) from date document trip map
const getTripInfo = async (conductorId, dateId, tripName) => {
  try {
    // Get the date document which contains the trip maps
    const dateDocRef = doc(db, `conductors/${conductorId}/dailyTrips/${dateId}`);
    const dateDocSnapshot = await getDoc(dateDocRef);

    if (dateDocSnapshot.exists()) {
      const dateData = dateDocSnapshot.data();

      // Look for the specific trip map in the date document
      if (dateData[tripName] && typeof dateData[tripName] === 'object') {
        const tripMap = dateData[tripName];

        return {
          direction: tripMap.direction && typeof tripMap.direction === 'string' ? tripMap.direction.trim() : null,
          currentTrip: tripMap.currentTrip || null
        };
      }
    }

    return { direction: null, currentTrip: null };
  } catch (error) {
    return { direction: null, currentTrip: null };
  }
};

// Keep old function for backward compatibility
const getTripDirection = async (conductorId, dateId, tripName) => {
  const tripInfo = await getTripInfo(conductorId, dateId, tripName);
  return tripInfo.direction;
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

// Load all revenue data with caching
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

// Get available routes with caching
export const getAvailableRoutes = async () => {
  return await revenueDataCache.getAvailableRoutes();
};

// Get available dates with caching
export const getAvailableDates = async () => {
  return await revenueDataCache.getAvailableDates();
};

// Setup real-time listener for revenue data
export const setupRevenueDataListener = (date, route, callback) => {
  return revenueDataCache.setupRevenueDataListener(date, route, callback);
};

// Force refresh cache
export const forceRefreshRevenueCache = async (date, route) => {
  return await revenueDataCache.forceRefreshCache(date, route);
};

// Get cache info for debugging
export const getRevenueCacheInfo = () => {
  return revenueDataCache.getCacheInfo();
};

// Cleanup listeners (call on component unmount)
export const cleanupRevenueListeners = () => {
  revenueDataCache.removeAllListeners();
};