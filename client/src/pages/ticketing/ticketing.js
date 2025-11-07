import { getFirestore, collection, getDocs, doc, getDoc, query, orderBy, limit as limitQuery, updateDoc, deleteDoc, serverTimestamp, onSnapshot, writeBatch } from 'firebase/firestore';
import { auth } from '/src/firebase/firebase.js';
import { logActivity, ACTIVITY_TYPES } from '/src/pages/settings/auditService.js';

const db = getFirestore();

// TICKETING DATA CACHE SERVICE
class TicketingDataCacheService {
  constructor() {
    this.listeners = new Map();
    this.maxListeners = 10;
    this.cleanupOnError = true;

    // IN-MEMORY CACHE SYSTEM
    this.ticketCache = new Map(); // key: conductor_date_filter, value: ticket data
    this.lastFetchTime = new Map(); // Track fetch times per key
    this.isCacheListenerActive = false;
    this.cacheVersion = 1;
    this.currentCallbacks = new Map(); // Store callbacks for cache updates

    // Available conductors cache
    this.conductorsCache = null;
    this.conductorsCacheTime = null;

    // Statistics cache
    this.statsCache = null;
    this.statsCacheTime = null;

    // PERSISTENT CACHE using sessionStorage for faster page reloads
    this.enablePersistentCache = true;
    this.sessionStoragePrefix = 'ticketing_cache_';

    // Initialize cache from sessionStorage
    this.loadCacheFromStorage();

    // Only cleanup stale listeners, not the entire cache
    this.cleanupStaleListeners();
  }

  // Load cache from sessionStorage
  loadCacheFromStorage() {
    if (!this.enablePersistentCache) return;

    try {
      // Load ticket cache
      const cachedData = sessionStorage.getItem(`${this.sessionStoragePrefix}ticketCache`);
      const cachedTimes = sessionStorage.getItem(`${this.sessionStoragePrefix}lastFetchTime`);

      if (cachedData && cachedTimes) {
        const dataMap = new Map(JSON.parse(cachedData));
        const timesMap = new Map(JSON.parse(cachedTimes));

        // Only restore cache entries that are still fresh (within 10 minutes)
        const now = Date.now();
        dataMap.forEach((data, key) => {
          const fetchTime = timesMap.get(key);
          if (fetchTime && (now - fetchTime) < 10 * 60 * 1000) { // 10 minutes
            this.ticketCache.set(key, data);
            this.lastFetchTime.set(key, fetchTime);
          }
        });
      }

      // Load conductors cache
      const conductorsCache = sessionStorage.getItem(`${this.sessionStoragePrefix}conductorsCache`);
      const conductorsCacheTime = sessionStorage.getItem(`${this.sessionStoragePrefix}conductorsCacheTime`);

      if (conductorsCache && conductorsCacheTime) {
        const cacheTime = parseInt(conductorsCacheTime);
        const now = Date.now();
        if ((now - cacheTime) < 10 * 60 * 1000) { // 10 minutes
          this.conductorsCache = JSON.parse(conductorsCache);
          this.conductorsCacheTime = cacheTime;
        }
      }
    } catch (error) {
      console.warn('Error loading cache from storage:', error);
    }
  }

  // Save cache to sessionStorage
  saveCacheToStorage() {
    if (!this.enablePersistentCache) return;

    try {
      // Save ticket cache
      sessionStorage.setItem(
        `${this.sessionStoragePrefix}ticketCache`,
        JSON.stringify(Array.from(this.ticketCache.entries()))
      );
      sessionStorage.setItem(
        `${this.sessionStoragePrefix}lastFetchTime`,
        JSON.stringify(Array.from(this.lastFetchTime.entries()))
      );

      // Save conductors cache
      if (this.conductorsCache) {
        sessionStorage.setItem(`${this.sessionStoragePrefix}conductorsCache`, JSON.stringify(this.conductorsCache));
        sessionStorage.setItem(`${this.sessionStoragePrefix}conductorsCacheTime`, this.conductorsCacheTime.toString());
      }
    } catch (error) {
      console.warn('Error saving cache to storage:', error);
    }
  }

  // Cleanup only stale listeners, preserve cache
  cleanupStaleListeners() {
    try {
      // Only remove active listeners, not the cache data
      this.listeners.clear();
      this.currentCallbacks.clear();
      this.isCacheListenerActive = false;

      // Clear global listeners if they exist
      if (window.ticketingListeners) {
        window.ticketingListeners.forEach(unsubscribe => {
          try { unsubscribe(); } catch (e) {}
        });
        window.ticketingListeners = [];
      }
    } catch (error) {
      console.warn('Error during listener cleanup:', error);
    }
  }

  // Force cleanup method (only use when really needed)
  forceCleanup() {
    try {
      this.removeAllListeners();
      this.invalidateAllCache();

      // Clear sessionStorage cache
      if (this.enablePersistentCache) {
        Object.keys(sessionStorage).forEach(key => {
          if (key.startsWith(this.sessionStoragePrefix)) {
            sessionStorage.removeItem(key);
          }
        });
      }
    } catch (error) {
      console.warn('Error during ticketing cache cleanup:', error);
    }
  }

  // Get ticket data with cache-first approach
  async getTicketData(conductorId = null, limit = 50) {
    try {
      const cacheKey = this.getCacheKey(conductorId, limit);

      // Return cached data immediately if available and fresh
      if (this.ticketCache.has(cacheKey) && this.isCacheFresh(cacheKey)) {
        return { ...this.ticketCache.get(cacheKey), fromCache: true };
      }

      // Fetch fresh data
      const freshData = await this.fetchTicketDataFromFirestore(conductorId, limit);

      // Save to cache
      this.ticketCache.set(cacheKey, freshData);
      this.lastFetchTime.set(cacheKey, Date.now());

      // Save to sessionStorage for persistence
      this.saveCacheToStorage();

      // Start listening for real-time changes if not already active
      if (!this.isCacheListenerActive) {
        this.startTicketDataListener();
      }

      return { ...freshData, fromCache: false };
    } catch (error) {
      console.error('Error fetching ticket data:', error);
      throw error;
    }
  }

  // Generate cache key from parameters
  getCacheKey(conductorId, limit) {
    const conductorKey = conductorId || 'all_conductors';
    return `${conductorKey}_${limit}`;
  }

  // Check if cache is fresh (5 minutes for ticketing data, 10 minutes for persistent cache)
  isCacheFresh(cacheKey) {
    const lastFetch = this.lastFetchTime.get(cacheKey);
    if (!lastFetch) return false;
    const ageMinutes = (Date.now() - lastFetch) / (1000 * 60);

    // Longer cache time for page reloads to improve initial load
    const maxCacheMinutes = this.enablePersistentCache ? 10 : 5;
    return ageMinutes < maxCacheMinutes;
  }

  // Fetch ticket data from Firestore (optimized logic)
  async fetchTicketDataFromFirestore(conductorId = null, limit = 50) {
    try {
      if (conductorId) {
        // Fetch tickets for specific conductor with optimizations
        return await this.fetchConductorTicketsOptimized(conductorId, limit);
      } else {
        // Fetch all tickets with parallel processing
        return await this.fetchAllTicketsOptimized(limit);
      }
    } catch (error) {
      console.error('Error in fetchTicketDataFromFirestore:', error);
      throw error;
    }
  }

  // Optimized conductor-specific ticket fetching (no limit - admin dashboard shows all)
  async fetchConductorTicketsOptimized(conductorId) {
    const allTickets = [];

    // Get all daily trips for this conductor
    const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
    const dailyTripsSnapshot = await getDocs(dailyTripsRef);

    // Process dates in parallel
    const datePromises = dailyTripsSnapshot.docs.map(async (dateDoc) => {
      const dateId = dateDoc.id;
      const dateTickets = [];

      // Get all trip names for this date
      const tripNames = await getAllTripNames(conductorId, dateId);

      // Process trips in parallel
      const tripPromises = tripNames.map(async (tripName) => {
        const tripTickets = [];
        try {
          // Fetch regular tickets, prebookings, and pre-tickets in parallel
          const [ticketsSnapshot, preBookingTickets, preTickets] = await Promise.all([
            getDocs(collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets')),
            this.fetchPreBookingTicketsOptimized(conductorId, dateId, tripName),
            this.fetchPreTicketsOptimized(conductorId, dateId, tripName)
          ]);

          // Get trip direction once
          const tripDirection = await getTripDirection(conductorId, dateId, tripName);

          // Process regular tickets
          if (ticketsSnapshot.docs.length > 0) {
            ticketsSnapshot.forEach(ticketDoc => {
              const ticketData = ticketDoc.data();
              const ticketId = ticketDoc.id;

              // Skip prebooking and preTicket tickets from regular path to avoid duplication
              if (ticketData.documentType === 'preBooking' || ticketData.ticketType === 'preBooking' ||
                  ticketData.documentType === 'preTicket' || ticketData.ticketType === 'preTicket') {
                return;
              }

              tripTickets.push({
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
                direction: tripDirection || `${ticketData.from} → ${ticketData.to}`,
                timestamp: ticketData.timestamp,
                discountBreakdown: ticketData.discountBreakdown || [],
                status: ticketData.active ? 'active' : 'inactive',
                ticketType: ticketData.ticketType || ticketData.documentType,
                documentType: ticketData.documentType || ticketData.ticketType,
                scannedAt: ticketData.timestamp,
                time: ticketData.timestamp ? new Date(ticketData.timestamp.seconds * 1000).toLocaleTimeString() : '',
                dateFormatted: ticketData.timestamp ? new Date(ticketData.timestamp.seconds * 1000).toLocaleDateString() : dateId,
                source: 'regular'
              });
            });
          }

          // Add prebooking tickets
          if (preBookingTickets.length > 0) {
            tripTickets.push(...preBookingTickets);
          }

          // Add pre-tickets
          if (preTickets.length > 0) {
            tripTickets.push(...preTickets);
          }
        } catch (error) {
          // Continue processing other trips
        }
        return tripTickets;
      });

      const tripResults = await Promise.all(tripPromises);
      dateTickets.push(...tripResults.flat());

      return dateTickets;
    });

    const dateResults = await Promise.all(datePromises);
    allTickets.push(...dateResults.flat());

    // Sort by timestamp (no limit for admin dashboard)
    return allTickets
      .sort((a, b) => {
        const aTime = a.timestamp?.seconds || 0;
        const bTime = b.timestamp?.seconds || 0;
        return bTime - aTime;
      });
  }

  // Optimized all tickets fetching with parallel processing (no limit - admin dashboard shows all)
  async fetchAllTicketsOptimized() {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);

    const allTickets = [];

    // Process conductors in parallel
    const conductorPromises = conductorsSnapshot.docs.map(async (conductorDoc) => {
      const conductorData = conductorDoc.data();
      const conductorId = conductorDoc.id;

      const conductorTickets = await this.fetchConductorTicketsOptimized(conductorId);

      // Add conductor info to tickets
      return conductorTickets.map(ticket => ({
        ...ticket,
        conductor: conductorData
      }));
    });

    const conductorResults = await Promise.all(conductorPromises);
    allTickets.push(...conductorResults.flat());

    // Sort by timestamp (no limit for admin dashboard)
    return allTickets
      .sort((a, b) => {
        const aTime = a.timestamp?.seconds || 0;
        const bTime = b.timestamp?.seconds || 0;
        return bTime - aTime;
      });
  }

  // Optimized prebooking tickets fetching
  async fetchPreBookingTicketsOptimized(conductorId, dateId, tripName) {
    try {
      const preBookingsPath = `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/preBookings/preBookings`;
      const preBookingsRef = collection(db, preBookingsPath);
      const preBookingsSnapshot = await getDocs(preBookingsRef);

      if (preBookingsSnapshot.docs.length === 0) {
        return [];
      }

      // Get trip direction once
      const tripDirection = await getTripDirection(conductorId, dateId, tripName);

      const preBookingTickets = [];

      preBookingsSnapshot.forEach(preBookingDoc => {
        const preBookingData = preBookingDoc.data();
        const preBookingId = preBookingDoc.id;

        // Only include pre-bookings that have been scanned/boarded
        if (!preBookingData.scannedAt) {
          return;
        }

        preBookingTickets.push({
          id: preBookingId,
          conductorId: conductorId,
          tripId: tripName,
          date: dateId,
          amount: preBookingData.totalFare || 0,
          quantity: preBookingData.quantity || 0,
          from: preBookingData.from || '',
          to: preBookingData.to || '',
          fromKm: preBookingData.fromKm || 0,
          toKm: preBookingData.toKm || 0,
          route: `${preBookingData.from} → ${preBookingData.to}`,
          direction: tripDirection || `${preBookingData.from} → ${preBookingData.to}`,
          timestamp: preBookingData.scannedAt,
          discountBreakdown: preBookingData.discountBreakdown || [],
          status: preBookingData.active ? 'active' : 'inactive',
          ticketType: 'preBooking',
          documentType: 'preBooking',
          scannedAt: preBookingData.scannedAt,
          time: preBookingData.scannedAt ? new Date(preBookingData.scannedAt.seconds * 1000).toLocaleTimeString() : '',
          dateFormatted: preBookingData.scannedAt ? new Date(preBookingData.scannedAt.seconds * 1000).toLocaleDateString() : dateId,
          busNumber: preBookingData.busNumber,
          conductorName: preBookingData.conductorName,
          paymentMethod: preBookingData.paymentMethod,
          userId: preBookingData.userId,
          preBookingId: preBookingData.preBookingId,
          createdAt: preBookingData.createdAt,
          paidAt: preBookingData.paidAt,
          source: 'preBookings'
        });
      });

      return preBookingTickets;
    } catch (error) {
      console.warn(`Error fetching prebooking tickets for ${conductorId}/${dateId}/${tripName}:`, error);
      return [];
    }
  }

  // Optimized pre-ticketing fetching
  async fetchPreTicketsOptimized(conductorId, dateId, tripName) {
    try {
      const preTicketsPath = `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/preTickets/preTickets`;
      const preTicketsRef = collection(db, preTicketsPath);
      const preTicketsSnapshot = await getDocs(preTicketsRef);

      if (preTicketsSnapshot.docs.length === 0) {
        return [];
      }

      // Get trip direction once
      const tripDirection = await getTripDirection(conductorId, dateId, tripName);

      const preTickets = [];

      preTicketsSnapshot.forEach(preTicketDoc => {
        const preTicketData = preTicketDoc.data();
        const preTicketId = preTicketDoc.id;

        // Only include pre-tickets that have been scanned/boarded
        if (!preTicketData.scannedAt) {
          return;
        }

        // Parse qrData if it's a string
        let parsedQrData = null;
        if (preTicketData.qrData) {
          try {
            if (typeof preTicketData.qrData === 'string') {
              parsedQrData = JSON.parse(preTicketData.qrData);
            } else if (typeof preTicketData.qrData === 'object') {
              parsedQrData = preTicketData.qrData;
            }
          } catch (parseError) {
            console.warn(`Failed to parse qrData for ticket ${preTicketId}:`, parseError);
          }
        }

        // Use parsedQrData as the primary data source, with fallbacks
        const sourceData = parsedQrData || preTicketData;

        preTickets.push({
          id: preTicketId,
          conductorId: conductorId,
          tripId: tripName,
          date: dateId,
          amount: sourceData.amount || sourceData.totalFare || 0,
          quantity: sourceData.quantity || preTicketData.quantity || 1,
          from: sourceData.from || preTicketData.from || '',
          to: sourceData.to || preTicketData.to || '',
          fromKm: sourceData.fromKm || preTicketData.startKm || preTicketData.fromKm || 0,
          toKm: sourceData.toKm || preTicketData.endKm || preTicketData.toKm || 0,
          route: `${sourceData.from || preTicketData.from || ''} → ${sourceData.to || preTicketData.to || ''}`,
          direction: tripDirection || sourceData.direction || preTicketData.direction || '',
          timestamp: preTicketData.scannedAt,
          discountBreakdown: sourceData.discountBreakdown || preTicketData.discountBreakdown || [],
          status: preTicketData.active !== undefined ? (preTicketData.active ? 'active' : 'inactive') : 'active',
          ticketType: 'preTicket',
          documentType: 'preTicket',
          scannedAt: preTicketData.scannedAt,
          scannedBy: preTicketData.scannedBy,
          time: preTicketData.scannedAt ? new Date(preTicketData.scannedAt.seconds * 1000).toLocaleTimeString() : '',
          dateFormatted: preTicketData.scannedAt ? new Date(preTicketData.scannedAt.seconds * 1000).toLocaleDateString() : dateId,
          qrData: preTicketData.qrData,
          qrDataParsed: parsedQrData,
          fareTypes: sourceData.fareTypes || preTicketData.fareTypes,
          passengerFares: sourceData.passengerFares || preTicketData.passengerFares || [],
          source: 'preTickets'
        });
      });

      return preTickets;
    } catch (error) {
      console.warn(`Error fetching pre-tickets for ${conductorId}/${dateId}/${tripName}:`, error);
      return [];
    }
  }

  // Start real-time cache updates listener
  startTicketDataListener() {
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
      this.invalidateAllCache();

      // Notify active listeners about cache update
      this.notifyListenersOfCacheUpdate();
    }, (error) => {
      console.error('Error in ticket cache listener:', error);
      this.isCacheListenerActive = false;
      this.listeners.delete('ticket_cache_listener');
    });

    this.listeners.set('ticket_cache_listener', unsubscribe);
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
            // Parse the key to get parameters
            const [conductorId, limit] = key.split('_callback_')[1].split('_');
            const actualConductorId = conductorId === 'all-conductors' ? null : conductorId;
            const actualLimit = parseInt(limit) || 50;

            // Fetch fresh data and call the callback
            const freshData = await this.getTicketData(actualConductorId, actualLimit);
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
    this.ticketCache.clear();
    this.lastFetchTime.clear();
    this.conductorsCache = null;
    this.conductorsCacheTime = null;
    this.statsCache = null;
    this.statsCacheTime = null;
  }

  invalidateCache(conductorId, limit) {
    const cacheKey = this.getCacheKey(conductorId, limit);
    this.ticketCache.delete(cacheKey);
    this.lastFetchTime.delete(cacheKey);
  }

  // Force refresh cache
  async forceRefreshCache(conductorId, limit) {
    this.invalidateCache(conductorId, limit);
    return await this.getTicketData(conductorId, limit);
  }

  // CACHED: Setup real-time listener for ticket data
  setupTicketDataListener(conductorId, limit, callback) {
    const listenerKey = `ticket_callback_${this.getCacheKey(conductorId, limit)}`;

    // Remove existing listener
    this.removeListener(listenerKey);

    // Store the callback
    this.currentCallbacks.set(listenerKey, callback);

    // If we have cached data, return it immediately
    const cacheKey = this.getCacheKey(conductorId, limit);
    if (this.ticketCache.has(cacheKey)) {
      setTimeout(() => {
        const cachedData = this.ticketCache.get(cacheKey);
        if (cachedData && typeof callback === 'function') {
          callback({ ...cachedData, fromCache: true });
        }
      }, 0);
    } else {
      // If no cache, fetch data
      this.getTicketData(conductorId, limit)
        .then(data => {
          if (typeof callback === 'function') {
            callback(data);
          }
        })
        .catch(error => {
          console.error('Error in ticket data listener:', error);
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

  getCacheInfo() {
    return {
      cacheSize: this.ticketCache.size,
      isListenerActive: this.isCacheListenerActive,
      cachedKeys: Array.from(this.ticketCache.keys()),
      conductorsCache: !!this.conductorsCache,
      statsCache: !!this.statsCache
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
}

// Create singleton instance
const ticketingDataCache = new TicketingDataCacheService();

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

/**
 * Helper function to get all trip names from date document maps
 */
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
    console.error(`Error getting trip names for ${conductorId}/${dateId}:`, error);
    return [];
  }
};

/**
 * Fetch prebooking tickets from the dedicated prebooking path
 * Similar to daily revenue implementation
 */
const fetchPreBookingTickets = async (conductorId, dateId, tripName) => {
  try {
    const preBookingsPath = `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/preBookings/preBookings`;
    const preBookingsRef = collection(db, preBookingsPath);
    const preBookingsSnapshot = await getDocs(preBookingsRef);

    const preBookingTickets = [];

    for (const preBookingDoc of preBookingsSnapshot.docs) {
      const preBookingData = preBookingDoc.data();
      const preBookingId = preBookingDoc.id;

      // Only include pre-bookings that have been scanned/boarded
      if (!preBookingData.scannedAt) {
        continue;
      }

      // Get trip direction for this trip
      const tripDirection = await getTripDirection(conductorId, dateId, tripName);

      preBookingTickets.push({
        id: preBookingId,
        conductorId: conductorId,
        tripId: tripName,
        date: dateId,
        amount: preBookingData.totalFare || 0,
        quantity: preBookingData.quantity || 0,
        from: preBookingData.from || '',
        to: preBookingData.to || '',
        fromKm: preBookingData.fromKm || 0,
        toKm: preBookingData.toKm || 0,
        route: `${preBookingData.from} → ${preBookingData.to}`,
        direction: tripDirection || `${preBookingData.from} → ${preBookingData.to}`,
        timestamp: preBookingData.scannedAt,
        discountBreakdown: preBookingData.discountBreakdown || [],
        status: preBookingData.active ? 'active' : 'inactive',
        ticketType: 'preBooking',
        documentType: 'preBooking',
        scannedAt: preBookingData.scannedAt,
        time: preBookingData.scannedAt ? new Date(preBookingData.scannedAt.seconds * 1000).toLocaleTimeString() : '',
        dateFormatted: preBookingData.scannedAt ? new Date(preBookingData.scannedAt.seconds * 1000).toLocaleDateString() : dateId,
        // Additional prebooking specific fields
        busNumber: preBookingData.busNumber,
        conductorName: preBookingData.conductorName,
        paymentMethod: preBookingData.paymentMethod,
        userId: preBookingData.userId,
        preBookingId: preBookingData.preBookingId,
        createdAt: preBookingData.createdAt,
        paidAt: preBookingData.paidAt,
        source: 'preBookings'
      });
    }

    return preBookingTickets;
  } catch (error) {
    console.error(`Error fetching prebooking tickets for ${conductorId}/${dateId}/${tripName}:`, error);
    return [];
  }
};

/**
 * Fetch pre-tickets from the dedicated pre-tickets path
 * Similar to daily revenue implementation
 */
const fetchPreTickets = async (conductorId, dateId, tripName) => {
  try {
    const preTicketsPath = `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/preTickets/preTickets`;
    const preTicketsRef = collection(db, preTicketsPath);
    const preTicketsSnapshot = await getDocs(preTicketsRef);

    const preTickets = [];

    for (const preTicketDoc of preTicketsSnapshot.docs) {
      const preTicketData = preTicketDoc.data();
      const preTicketId = preTicketDoc.id;

      // Only include pre-tickets that have been scanned/boarded
      if (!preTicketData.scannedAt) {
        continue;
      }

      // Parse qrData if it's a string
      let parsedQrData = null;
      if (preTicketData.qrData) {
        try {
          if (typeof preTicketData.qrData === 'string') {
            parsedQrData = JSON.parse(preTicketData.qrData);
          } else if (typeof preTicketData.qrData === 'object') {
            parsedQrData = preTicketData.qrData;
          }
        } catch (parseError) {
          console.warn(`Failed to parse qrData for ticket ${preTicketId}:`, parseError);
        }
      }

      // Use parsedQrData as the primary data source, with fallbacks
      const sourceData = parsedQrData || preTicketData;

      // Get trip direction for this trip
      const tripDirection = await getTripDirection(conductorId, dateId, tripName);

      preTickets.push({
        id: preTicketId,
        conductorId: conductorId,
        tripId: tripName,
        date: dateId,
        amount: sourceData.amount || sourceData.totalFare || 0,
        quantity: sourceData.quantity || preTicketData.quantity || 1,
        from: sourceData.from || preTicketData.from || '',
        to: sourceData.to || preTicketData.to || '',
        fromKm: sourceData.fromKm || preTicketData.startKm || preTicketData.fromKm || 0,
        toKm: sourceData.toKm || preTicketData.endKm || preTicketData.toKm || 0,
        route: `${sourceData.from || preTicketData.from || ''} → ${sourceData.to || preTicketData.to || ''}`,
        direction: tripDirection || sourceData.direction || preTicketData.direction || '',
        timestamp: preTicketData.scannedAt,
        discountBreakdown: sourceData.discountBreakdown || preTicketData.discountBreakdown || [],
        status: preTicketData.active !== undefined ? (preTicketData.active ? 'active' : 'inactive') : 'active',
        ticketType: 'preTicket',
        documentType: 'preTicket',
        scannedAt: preTicketData.scannedAt,
        scannedBy: preTicketData.scannedBy,
        time: preTicketData.scannedAt ? new Date(preTicketData.scannedAt.seconds * 1000).toLocaleTimeString() : '',
        dateFormatted: preTicketData.scannedAt ? new Date(preTicketData.scannedAt.seconds * 1000).toLocaleDateString() : dateId,
        qrData: preTicketData.qrData,
        qrDataParsed: parsedQrData,
        fareTypes: sourceData.fareTypes || preTicketData.fareTypes,
        passengerFares: sourceData.passengerFares || preTicketData.passengerFares || [],
        source: 'preTickets'
      });
    }

    return preTickets;
  } catch (error) {
    console.error(`Error fetching pre-tickets for ${conductorId}/${dateId}/${tripName}:`, error);
    return [];
  }
};

/**
 * Get all conductors who have tickets in dailyTrips (all ticket types)
 * CACHED: Uses optimized caching service for improved performance
 * @returns {Promise<Array>} Array of conductor objects with ticket counts
 */
export const getConductorsWithPreTickets = async () => {
  try {
    // Check if cached data is available
    if (ticketingDataCache.conductorsCache && ticketingDataCache.conductorsCacheTime) {
      const ageMinutes = (Date.now() - ticketingDataCache.conductorsCacheTime) / (1000 * 60);
      if (ageMinutes < 5) { // Cache valid for 5 minutes
        return ticketingDataCache.conductorsCache;
      }
    }

    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    const conductorsWithTickets = [];

    // Process conductors in parallel for better performance
    const conductorPromises = conductorsSnapshot.docs.map(async (conductorDoc) => {
      const conductorData = conductorDoc.data();
      const conductorId = conductorDoc.id;

      // Get all daily trips for this conductor
      const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
      const dailyTripsSnapshot = await getDocs(dailyTripsRef);

      let preTicketCount = 0;
      let preBookingCount = 0;
      let conductorTicketCount = 0;
      let allTicketCount = 0;

      // Process dates in parallel
      const datePromises = dailyTripsSnapshot.docs.map(async (dateDoc) => {
        const dateId = dateDoc.id;

        // Get all trip names for this date
        const tripNames = await getAllTripNames(conductorId, dateId);

        const counts = { preTickets: 0, preBookings: 0, conductorTickets: 0 };

        // Process trips in parallel
        const tripPromises = tripNames.map(async (tripName) => {
          try {
            // Fetch both regular tickets and prebookings in parallel
            const [ticketsSnapshot, preBookingTickets] = await Promise.all([
              getDocs(collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets')),
              ticketingDataCache.fetchPreBookingTicketsOptimized(conductorId, dateId, tripName)
            ]);

            // Count regular tickets and pre-tickets
            ticketsSnapshot.forEach(ticketDoc => {
              const ticketData = ticketDoc.data();

              if (ticketData.documentType === 'preTicket') {
                counts.preTickets++;
              } else if (ticketData.documentType === 'preBooking' || ticketData.ticketType === 'preBooking') {
                // Skip to avoid duplication
              } else {
                counts.conductorTickets++;
              }
            });

            // Count prebooking tickets
            counts.preBookings += preBookingTickets.length;
          } catch (error) {
            // Continue processing other trips
          }
        });

        await Promise.all(tripPromises);
        return counts;
      });

      const dateResults = await Promise.all(datePromises);

      // Aggregate counts
      dateResults.forEach(counts => {
        preTicketCount += counts.preTickets;
        preBookingCount += counts.preBookings;
        conductorTicketCount += counts.conductorTickets;
      });

      allTicketCount = preTicketCount + preBookingCount + conductorTicketCount;

      // Return conductor data if they have tickets
      if (allTicketCount > 0) {
        return {
          id: conductorId,
          ...conductorData,
          preTicketsCount: allTicketCount,
          totalTicketsCount: allTicketCount,
          preTicketsOnly: preTicketCount,
          stats: {
            preTickets: preTicketCount,
            preBookings: preBookingCount,
            conductorTickets: conductorTicketCount,
            totalTickets: allTicketCount
          }
        };
      }
      return null;
    });

    const conductorResults = await Promise.all(conductorPromises);
    conductorsWithTickets.push(...conductorResults.filter(result => result !== null));

    // Cache the results
    ticketingDataCache.conductorsCache = conductorsWithTickets;
    ticketingDataCache.conductorsCacheTime = Date.now();

    // Save to sessionStorage for persistence
    ticketingDataCache.saveCacheToStorage();

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
 * Get all tickets for a specific conductor from dailyTrips (all ticket types)
 * CACHED: Uses optimized caching service for improved performance
 * @param {string} conductorId - Conductor ID
 * @param {number} limit - Number of tickets to fetch
 * @returns {Promise<Array>} Array of ticket objects
 */
export const getPreTicketsByConductor = async (conductorId, limit = 50) => {
  try {
    // Use the cache service for optimized fetching
    const result = await ticketingDataCache.getTicketData(conductorId, limit);
    return result;
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
            // Fetch regular tickets, prebookings, and pre-tickets in parallel
            const [ticketsSnapshot, preBookingTickets, preTicketsList] = await Promise.all([
              getDocs(collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets')),
              fetchPreBookingTickets(conductorId, dateId, tripName),
              fetchPreTickets(conductorId, dateId, tripName)
            ]);

            // Count if this trip has any tickets (regular, prebooking, or pre-tickets)
            if (ticketsSnapshot.docs.length > 0 || preBookingTickets.length > 0 || preTicketsList.length > 0) {
              totalTrips++;
            }

            // Count regular tickets (skip prebookings and pre-tickets to avoid duplication)
            ticketsSnapshot.forEach(ticketDoc => {
              const ticketData = ticketDoc.data();

              // Count tickets by type - skip preTicket and preBooking as they're fetched separately
              if (ticketData.documentType === 'preTicket' || ticketData.ticketType === 'preTicket') {
                // Skip - pre-tickets from regular path (will be counted from dedicated path)
              } else if (ticketData.documentType === 'preBooking' || ticketData.ticketType === 'preBooking') {
                // Skip prebooking tickets from regular path to avoid duplication
                // They will be counted from the dedicated prebooking path
              } else {
                // All other tickets are conductor tickets
                conductorTickets++;
                totalTickets++;
                conductorHasTickets = true;
              }
            });

            // Count prebooking tickets from dedicated path
            preBookingTickets.forEach(preBookingTicket => {
              preBookings++;
              totalTickets++;
              conductorHasTickets = true;
            });

            // Count pre-tickets from dedicated path
            preTicketsList.forEach(preTicket => {
              preTickets++;
              totalTickets++;
              conductorHasTickets = true;
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
      totalTrips
    };
  } catch (error) {
    console.error('Error fetching ticketing stats:', error);
    throw error;
  }
};

/**
 * Get all recent tickets (across all conductors) from dailyTrips (all ticket types)
 * CACHED: Uses optimized caching service for improved performance
 * @param {number} limit - Number of tickets to fetch
 * @returns {Promise<Array>} Array of ticket objects with conductor info
 */
export const getAllRecentPreTickets = async (limitParam = 50) => {
  try {
    // Use the cache service for optimized fetching
    const result = await ticketingDataCache.getTicketData(null, limitParam);
    return result;
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
    
    // We need to search through all dates and trips to find the ticket
    const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
    const dailyTripsSnapshot = await getDocs(dailyTripsRef);
    
    for (const dateDoc of dailyTripsSnapshot.docs) {
      const dateId = dateDoc.id;
      
      // Get all trip names for this date
      const tripNames = await getAllTripNames(conductorId, dateId);
      
      for (const tripName of tripNames) {
        try {
          // Search in all three ticket paths: regular tickets, prebookings, and pre-tickets
          const [ticketSnapshot, preBookingSnapshot, preTicketSnapshot] = await Promise.all([
            getDoc(doc(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets', ticketId)),
            getDoc(doc(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'preBookings', 'preBookings', ticketId)),
            getDoc(doc(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'preTickets', 'preTickets', ticketId))
          ]);

          let ticketData = null;
          let ticketSource = null;

          if (ticketSnapshot.exists()) {
            ticketData = ticketSnapshot.data();
            ticketSource = 'regular';
          } else if (preBookingSnapshot.exists()) {
            ticketData = preBookingSnapshot.data();
            ticketSource = 'preBookings';
          } else if (preTicketSnapshot.exists()) {
            ticketData = preTicketSnapshot.data();
            ticketSource = 'preTickets';
          }

          if (ticketData) {
            const conductorRef = doc(db, 'conductors', conductorId);
            const conductorSnapshot = await getDoc(conductorRef);

            // Get trip direction
            const tripDirection = await getTripDirection(conductorId, dateId, tripName);

            // Parse qrData for pre-tickets if needed
            let parsedQrData = null;
            if (ticketSource === 'preTickets' && ticketData.qrData) {
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

            const sourceData = parsedQrData || ticketData;

            return {
              id: ticketId,
              conductorId: conductorId,
              conductor: conductorSnapshot.exists() ? conductorSnapshot.data() : { name: 'Unknown Conductor', email: 'N/A' },
              tripId: tripName,
              date: dateId,
              amount: ticketSource === 'preTickets' ? (sourceData.amount || sourceData.totalFare || 0) : (ticketData.totalFare || 0),
              quantity: ticketData.quantity || 0,
              from: ticketData.from || '',
              to: ticketData.to || '',
              fromKm: ticketSource === 'preBookings' ? (ticketData.fromKm || 0) :
                      ticketSource === 'preTickets' ? (sourceData.fromKm || ticketData.startKm || ticketData.fromKm || 0) :
                      (ticketData.startKm || 0),
              toKm: ticketSource === 'preBookings' ? (ticketData.toKm || 0) :
                    ticketSource === 'preTickets' ? (sourceData.toKm || ticketData.endKm || ticketData.toKm || 0) :
                    (ticketData.endKm || 0),
              route: `${ticketData.from} → ${ticketData.to}`,
              direction: tripDirection || `${ticketData.from} → ${ticketData.to}`,
              timestamp: ticketSource === 'preTickets' ? ticketData.scannedAt : ticketData.timestamp,
              discountBreakdown: ticketSource === 'preTickets' ? (sourceData.discountBreakdown || ticketData.discountBreakdown || []) : (ticketData.discountBreakdown || []),
              status: ticketData.active ? 'active' : 'inactive',
              ticketType: ticketSource === 'preBookings' ? 'preBooking' :
                          ticketSource === 'preTickets' ? 'preTicket' :
                          (ticketData.ticketType || ticketData.documentType),
              documentType: ticketSource === 'preBookings' ? 'preBooking' :
                            ticketSource === 'preTickets' ? 'preTicket' :
                            (ticketData.documentType || ticketData.ticketType),
              scannedAt: ticketSource === 'preTickets' ? ticketData.scannedAt : ticketData.timestamp,
              time: (ticketSource === 'preTickets' ? ticketData.scannedAt : ticketData.timestamp) ?
                    new Date(((ticketSource === 'preTickets' ? ticketData.scannedAt : ticketData.timestamp).seconds || 0) * 1000).toLocaleTimeString() : '',
              dateFormatted: (ticketSource === 'preTickets' ? ticketData.scannedAt : ticketData.timestamp) ?
                             new Date(((ticketSource === 'preTickets' ? ticketData.scannedAt : ticketData.timestamp).seconds || 0) * 1000).toLocaleDateString() : dateId,
              source: ticketSource,
              // Additional prebooking specific fields if it's a prebooking
              ...(ticketSource === 'preBookings' && {
                busNumber: ticketData.busNumber,
                conductorName: ticketData.conductorName,
                paymentMethod: ticketData.paymentMethod,
                userId: ticketData.userId,
                preBookingId: ticketData.preBookingId,
                createdAt: ticketData.createdAt,
                paidAt: ticketData.paidAt
              }),
              // Additional pre-ticket specific fields if it's a pre-ticket
              ...(ticketSource === 'preTickets' && {
                qrData: ticketData.qrData,
                qrDataParsed: parsedQrData,
                scannedBy: ticketData.scannedBy,
                fareTypes: sourceData.fareTypes || ticketData.fareTypes,
                passengerFares: sourceData.passengerFares || ticketData.passengerFares || []
              })
            };
          }
        } catch (error) {
          console.log(`⚠️ Error checking trip ${tripName}:`, error.message);
          // Continue searching in other trips
          continue;
        }
      }
    }
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

    // Log the ticket status update activity
    const activityType = newStatus === 'boarded' ? ACTIVITY_TYPES.TICKET_SCAN : ACTIVITY_TYPES.TICKET_UPDATE;
    const actionDescription = newStatus === 'boarded' ? 'scanned' : `updated status to ${newStatus}`;
    
    // Create clean metadata object (filter out undefined values)
    const metadata = {
      ticketId: ticketId,
      conductorId: conductorId,
      passengerName: ticket.passengerName || 'Unknown Passenger',
      route: ticket.route || 'Unknown Route',
      tripDate: ticket.date || 'Unknown Date',
      tripId: ticket.tripId || 'Unknown Trip',
      previousStatus: ticket.status || 'unknown',
      newStatus: newStatus,
      isScanned: newStatus === 'boarded',
      ticketNumber: ticket.ticketNumber || ticketId,
      updatedAt: new Date().toISOString()
    };

    // Only add optional fields if they have values (not null/undefined)
    if (ticket.passengerEmail) metadata.passengerEmail = ticket.passengerEmail;
    if (ticket.seatNumber) metadata.seatNumber = ticket.seatNumber;
    
    await logActivity(
      activityType,
      `Ticket ${actionDescription}: ${ticket.passengerName || 'Unknown Passenger'} (${ticket.route || 'Unknown Route'})`,
      metadata
    );

    return true;
  } catch (error) {
    console.error('Error updating ticket status:', error);
    throw error;
  }
};

/**
 * Delete a ticket from dailyTrips (handles both regular tickets and prebookings)
 * OPTIMIZED VERSION with automatic cleanup of empty collections and AUDIT LOGGING
 * @param {string} conductorId - Conductor ID
 * @param {string} ticketId - Ticket ID to delete
 * @returns {Promise<boolean>} Success status
 */
export const deleteTicket = async (conductorId, ticketId) => {
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
      throw new Error('Access denied: Only superadmin users can delete tickets.');
    }

    // OPTIMIZATION: Try to find ticket from cache first before querying Firestore
    let ticket = null;
    let foundInCache = false;

    // Check if we have cached ticket data for this conductor
    const cacheKey = ticketingDataCache.getCacheKey(conductorId, 50);
    if (ticketingDataCache.ticketCache.has(cacheKey)) {
      const cachedTickets = ticketingDataCache.ticketCache.get(cacheKey);
      if (Array.isArray(cachedTickets)) {
        ticket = cachedTickets.find(t => t.id === ticketId);
        foundInCache = !!ticket;
      }
    }

    // If not in cache, fetch from Firestore
    if (!foundInCache) {
      try {
        ticket = await getPreTicketById(conductorId, ticketId);
      } catch (error) {
        // If ticket not found, it may already be deleted
        if (error.message.includes('not found')) {
          console.warn(`Ticket ${ticketId} not found - may already be deleted`);
          // Invalidate cache to refresh the view
          ticketingDataCache.invalidateCache(conductorId, 50);
          ticketingDataCache.invalidateCache(null, 50);
          return true; // Consider it successful
        }
        throw error;
      }
    }

    if (!ticket) {
      // Ticket not found in cache or Firestore
      console.warn(`Ticket ${ticketId} not found`);
      ticketingDataCache.invalidateCache(conductorId, 50);
      ticketingDataCache.invalidateCache(null, 50);
      return true;
    }

    // Store date and trip info for cleanup
    const dateId = ticket.date;
    const tripId = ticket.tripId;
    
    // Store ticket data for audit log before deletion
    const ticketForAudit = {
      ticketId: ticketId,
      conductorId: conductorId,
      conductorName: ticket.conductor?.name || 'Unknown Conductor',
      ticketType: ticket.documentType || ticket.ticketType || 'conductor',
      route: ticket.route || `${ticket.from} → ${ticket.to}`,
      direction: ticket.direction || 'Unknown Direction',
      amount: ticket.amount || 0,
      quantity: ticket.quantity || 0,
      tripDate: ticket.date || 'Unknown Date',
      tripId: ticket.tripId || 'Unknown Trip',
      fromLocation: ticket.from || 'Unknown',
      toLocation: ticket.to || 'Unknown',
      fromKm: ticket.fromKm || 0,
      toKm: ticket.toKm || 0
    };

    // Delete from appropriate path based on ticket type
    if (ticket.documentType === 'preBooking' || ticket.ticketType === 'preBooking' || ticket.source === 'preBookings') {
      // Delete from prebooking path
      const preBookingRef = doc(db, 'conductors', conductorId, 'dailyTrips', dateId, tripId, 'preBookings', 'preBookings', ticketId);
      await deleteDoc(preBookingRef);
    } else if (ticket.documentType === 'preTicket' || ticket.ticketType === 'preTicket' || ticket.source === 'preTickets') {
      // Delete from pre-tickets path
      const preTicketRef = doc(db, 'conductors', conductorId, 'dailyTrips', dateId, tripId, 'preTickets', 'preTickets', ticketId);
      await deleteDoc(preTicketRef);
    } else {
      // Delete from regular tickets path
      const ticketRef = doc(db, 'conductors', conductorId, 'dailyTrips', dateId, tripId, 'tickets', 'tickets', ticketId);
      await deleteDoc(ticketRef);
    }

    // AUDIT LOGGING - Log the ticket deletion activity
    try {
      await logActivity(
        ACTIVITY_TYPES.TICKET_DELETE,
        `Ticket deleted: ${ticketForAudit.fromLocation} → ${ticketForAudit.toLocation} (₱${ticketForAudit.amount})`,
        {
          ticketId: ticketForAudit.ticketId,
          conductorId: ticketForAudit.conductorId,
          conductorName: ticketForAudit.conductorName,
          ticketType: ticketForAudit.ticketType,
          route: ticketForAudit.route,
          direction: ticketForAudit.direction,
          amount: ticketForAudit.amount,
          quantity: ticketForAudit.quantity,
          tripDate: ticketForAudit.tripDate,
          tripId: ticketForAudit.tripId,
          fromLocation: ticketForAudit.fromLocation,
          toLocation: ticketForAudit.toLocation,
          distance: `${ticketForAudit.fromKm} km → ${ticketForAudit.toKm} km`,
          deletedAt: new Date().toISOString(),
          deletedBy: adminData.name || adminData.email || 'Unknown Admin'
        },
        'info' // Severity level
      );
    } catch (logError) {
      console.error(' Failed to log ticket deletion:', logError);
      // Don't fail the deletion if logging fails
    }

    // OPTIMIZATION: Invalidate cache immediately after delete
    ticketingDataCache.invalidateCache(conductorId, 50);
    ticketingDataCache.invalidateCache(null, 50);
    
    // Also clear conductors cache to update counts
    ticketingDataCache.conductorsCache = null;
    ticketingDataCache.conductorsCacheTime = null;

    // AUTOMATIC CLEANUP: Check and delete empty collections
    try {
      await cleanupEmptyCollections(conductorId, dateId, tripId);
    } catch (cleanupError) {
      console.warn('Cleanup warning (non-critical):', cleanupError);
      // Don't fail the deletion if cleanup has issues
    }

    return true;
  } catch (error) {
    // Don't throw errors for "not found" - it means already deleted
    if (error.message.includes('not found') || error.message.includes('Ticket not found')) {
      console.warn(`Ticket ${ticketId} not found - may already be deleted`);
      // Still invalidate cache
      ticketingDataCache.invalidateCache(conductorId, 50);
      ticketingDataCache.invalidateCache(null, 50);
      return true;
    }
    console.error('Error deleting ticket:', error);
    throw error;
  }
};

/**
 * Check if a trip collection is empty (no tickets and no prebookings)
 * @param {string} conductorId - Conductor ID
 * @param {string} dateId - Date ID
 * @param {string} tripName - Trip name
 * @returns {Promise<boolean>} True if trip is empty
 */
const isTripEmpty = async (conductorId, dateId, tripName) => {
  try {
    // Check tickets subcollection
    const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets');
    const ticketsSnapshot = await getDocs(ticketsRef);

    if (ticketsSnapshot.docs.length > 0) {
      return false; // Has tickets
    }

    // Check prebookings subcollection
    const preBookingsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'preBookings', 'preBookings');
    const preBookingsSnapshot = await getDocs(preBookingsRef);

    if (preBookingsSnapshot.docs.length > 0) {
      return false; // Has prebookings
    }

    // Check pre-tickets subcollection
    const preTicketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'preTickets', 'preTickets');
    const preTicketsSnapshot = await getDocs(preTicketsRef);

    if (preTicketsSnapshot.docs.length > 0) {
      return false; // Has pre-tickets
    }

    return true; // Trip is empty
  } catch (error) {
    console.error(`Error checking if trip ${tripName} is empty:`, error);
    return false; // Don't delete if there's an error
  }
};

/**
 * Delete an empty trip collection and its subcollections
 * @param {string} conductorId - Conductor ID
 * @param {string} dateId - Date ID
 * @param {string} tripName - Trip name
 * @returns {Promise<boolean>} True if successfully deleted
 */
const deleteEmptyTrip = async (conductorId, dateId, tripName) => {
  try {
    // Delete tickets subcollection documents (if any remain)
    const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets');
    const ticketsSnapshot = await getDocs(ticketsRef);

    const deletePromises = [];

    ticketsSnapshot.docs.forEach(doc => {
      deletePromises.push(deleteDoc(doc.ref));
    });

    // Delete prebookings subcollection documents (if any remain)
    const preBookingsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'preBookings', 'preBookings');
    const preBookingsSnapshot = await getDocs(preBookingsRef);

    preBookingsSnapshot.docs.forEach(doc => {
      deletePromises.push(deleteDoc(doc.ref));
    });

    // Delete pre-tickets subcollection documents (if any remain)
    const preTicketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'preTickets', 'preTickets');
    const preTicketsSnapshot = await getDocs(preTicketsRef);

    preTicketsSnapshot.docs.forEach(doc => {
      deletePromises.push(deleteDoc(doc.ref));
    });

    // Wait for all subcollection documents to be deleted
    await Promise.all(deletePromises);

    // Delete tickets collection document
    try {
      const ticketsCollectionRef = doc(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets');
      await deleteDoc(ticketsCollectionRef);
    } catch (e) {
      // May not exist, that's ok
    }

    // Delete prebookings collection document
    try {
      const preBookingsCollectionRef = doc(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'preBookings');
      await deleteDoc(preBookingsCollectionRef);
    } catch (e) {
      // May not exist, that's ok
    }

    // Delete pre-tickets collection document
    try {
      const preTicketsCollectionRef = doc(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'preTickets');
      await deleteDoc(preTicketsCollectionRef);
    } catch (e) {
      // May not exist, that's ok
    }

    // Delete the trip collection document itself
    try {
      const tripRef = doc(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName);
      await deleteDoc(tripRef);
    } catch (e) {
      // May not exist, that's ok
    }

    // Remove trip from date document (the map field)
    const dateDocRef = doc(db, 'conductors', conductorId, 'dailyTrips', dateId);
    const dateDoc = await getDoc(dateDocRef);
    
    if (dateDoc.exists()) {
      const dateData = dateDoc.data();
      const updates = { ...dateData };
      delete updates[tripName]; // Remove the trip map field
      
      // Update the date document to remove trip field
      try {
        await updateDoc(dateDocRef, updates);
      } catch (e) {
        console.warn('Could not update date document:', e);
      }
    }

    console.log(` Deleted empty trip: ${tripName} from ${dateId}`);
    return true;
  } catch (error) {
    console.error(`Error deleting empty trip ${tripName}:`, error);
    return false;
  }
};

/**
 * Check if a date document has any trips left
 * @param {string} conductorId - Conductor ID
 * @param {string} dateId - Date ID
 * @returns {Promise<boolean>} True if date has no trips
 */
const isDateEmpty = async (conductorId, dateId) => {
  try {
    const dateDocRef = doc(db, 'conductors', conductorId, 'dailyTrips', dateId);
    const dateDoc = await getDoc(dateDocRef);
    
    if (!dateDoc.exists()) {
      return true; // Date doesn't exist, consider empty
    }

    const dateData = dateDoc.data();
    
    // Check if there are any trip map fields (fields starting with "trip")
    const hasTripMaps = Object.keys(dateData).some(key => key.startsWith('trip'));
    
    return !hasTripMaps; // Empty if no trip maps
  } catch (error) {
    console.error(`Error checking if date ${dateId} is empty:`, error);
    return false;
  }
};

/**
 * Delete an empty date document
 * @param {string} conductorId - Conductor ID
 * @param {string} dateId - Date ID
 * @returns {Promise<boolean>} True if successfully deleted
 */
const deleteEmptyDate = async (conductorId, dateId) => {
  try {
    const dateDocRef = doc(db, 'conductors', conductorId, 'dailyTrips', dateId);
    await deleteDoc(dateDocRef);
    console.log(` Deleted empty date: ${dateId}`);
    return true;
  } catch (error) {
    console.error(`Error deleting empty date ${dateId}:`, error);
    return false;
  }
};

/**
 * MAIN CLEANUP FUNCTION: Clean up empty trips and dates after ticket deletion
 * Call this after deleting tickets
 * @param {string} conductorId - Conductor ID
 * @param {string} dateId - Date ID (optional, will check all dates if not provided)
 * @param {string} tripName - Trip name (optional, will check all trips if not provided)
 * @returns {Promise<Object>} Cleanup results
 */
export const cleanupEmptyCollections = async (conductorId, dateId = null, tripName = null) => {
  try {
    console.log(` Starting cleanup for conductor ${conductorId}...`);
    
    const results = {
      tripsDeleted: 0,
      datesDeleted: 0,
      errors: []
    };

    // If specific trip provided, check only that trip
    if (dateId && tripName) {
      const isEmpty = await isTripEmpty(conductorId, dateId, tripName);
      if (isEmpty) {
        const deleted = await deleteEmptyTrip(conductorId, dateId, tripName);
        if (deleted) {
          results.tripsDeleted++;
          
          // Check if date is now empty
          const dateEmpty = await isDateEmpty(conductorId, dateId);
          if (dateEmpty) {
            const dateDeleted = await deleteEmptyDate(conductorId, dateId);
            if (dateDeleted) {
              results.datesDeleted++;
            }
          }
        }
      }
      return results;
    }

    // If specific date provided, check all trips in that date
    if (dateId) {
      const tripNames = await getAllTripNames(conductorId, dateId);
      
      for (const trip of tripNames) {
        const isEmpty = await isTripEmpty(conductorId, dateId, trip);
        if (isEmpty) {
          const deleted = await deleteEmptyTrip(conductorId, dateId, trip);
          if (deleted) {
            results.tripsDeleted++;
          }
        }
      }

      // Check if date is now empty
      const dateEmpty = await isDateEmpty(conductorId, dateId);
      if (dateEmpty) {
        const dateDeleted = await deleteEmptyDate(conductorId, dateId);
        if (dateDeleted) {
          results.datesDeleted++;
        }
      }
      
      return results;
    }

    // Otherwise, check all dates and trips for this conductor
    const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
    const dailyTripsSnapshot = await getDocs(dailyTripsRef);
    
    for (const dateDoc of dailyTripsSnapshot.docs) {
      const date = dateDoc.id;
      const tripNames = await getAllTripNames(conductorId, date);
      
      for (const trip of tripNames) {
        const isEmpty = await isTripEmpty(conductorId, date, trip);
        if (isEmpty) {
          const deleted = await deleteEmptyTrip(conductorId, date, trip);
          if (deleted) {
            results.tripsDeleted++;
          }
        }
      }

      // Check if date is now empty
      const dateEmpty = await isDateEmpty(conductorId, date);
      if (dateEmpty) {
        const dateDeleted = await deleteEmptyDate(conductorId, date);
        if (dateDeleted) {
          results.datesDeleted++;
        }
      }
    }

    console.log(`Cleanup complete: ${results.tripsDeleted} trips deleted, ${results.datesDeleted} dates deleted`);
    return results;
    
  } catch (error) {
    console.error('Error in cleanup:', error);
    throw error;
  }
};

// ==================== REAL-TIME FUNCTIONS ====================

/**
 * Subscribe to real-time conductor updates with tickets
 * @param {Function} onUpdate - Callback function that receives updated conductors array
 * @returns {Function} Unsubscribe function to stop listening
 */
export const subscribeToConductorsWithTickets = (onUpdate) => {
  try {
    const conductorsRef = collection(db, 'conductors');
    
    const unsubscribe = onSnapshot(conductorsRef, async (snapshot) => {
      try {
        // Process the conductors data using existing logic
        const conductorsWithTickets = [];
        
        for (const conductorDoc of snapshot.docs) {
          const conductorData = conductorDoc.data();
          const conductorId = conductorDoc.id;
          
          // Get all daily trips for this conductor
          const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
          const dailyTripsSnapshot = await getDocs(dailyTripsRef);
          
          let preTicketCount = 0;
          let preBookingCount = 0;
          let conductorTicketCount = 0;
          let allTicketCount = 0;
          
          // Count tickets across all dates and trips
          for (const dateDoc of dailyTripsSnapshot.docs) {
            const dateId = dateDoc.id;
            
            // Get all trip names for this date
            const tripNames = await getAllTripNames(conductorId, dateId);
            
            for (const tripName of tripNames) {
              try {
                // Fetch regular tickets, prebookings, and pre-tickets in parallel
                const [ticketsSnapshot, preBookingTickets, preTickets] = await Promise.all([
                  getDocs(collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets')),
                  fetchPreBookingTickets(conductorId, dateId, tripName),
                  fetchPreTickets(conductorId, dateId, tripName)
                ]);

                // Count regular tickets (skip prebookings and pre-tickets to avoid duplication)
                ticketsSnapshot.forEach(ticketDoc => {
                  const ticketData = ticketDoc.data();

                  // Count tickets by type - skip preTicket and preBooking as they're fetched separately
                  if (ticketData.documentType === 'preTicket' || ticketData.ticketType === 'preTicket') {
                    // Skip - pre-tickets from regular path (will be counted from dedicated path)
                  } else if (ticketData.documentType === 'preBooking' || ticketData.ticketType === 'preBooking') {
                    // Skip prebooking tickets from regular tickets path to avoid duplication
                    // They will be counted from the dedicated prebooking path
                  } else {
                    // All other tickets are conductor tickets
                    conductorTicketCount++;
                  }
                });

                // Count prebooking tickets from dedicated path
                preBookingTickets.forEach(preBookingTicket => {
                  preBookingCount++;
                });

                // Count pre-tickets from dedicated path
                preTickets.forEach(preTicket => {
                  preTicketCount++;
                });
              } catch (error) {
                continue;
              }
            }
          }
          
          // Calculate total tickets
          allTicketCount = preTicketCount + preBookingCount + conductorTicketCount;
          
          // Include conductor if they have any tickets
          if (allTicketCount > 0) {
            conductorsWithTickets.push({
              id: conductorId,
              ...conductorData,
              preTicketsCount: allTicketCount,
              totalTicketsCount: allTicketCount,
              preTicketsOnly: preTicketCount,
              stats: {
                preTickets: preTicketCount,
                preBookings: preBookingCount,
                conductorTickets: conductorTicketCount,
                totalTickets: allTicketCount
              }
            });
          }
        }
        onUpdate(conductorsWithTickets);
        
      } catch (error) {
        console.error('Error processing real-time conductor updates:', error);
        onUpdate(null, error);
      }
    }, (error) => {
      console.error('Error in conductors real-time listener:', error);
      onUpdate(null, error);
    });

    return unsubscribe;
  } catch (error) {
    console.error('Error setting up conductors real-time listener:', error);
    throw new Error('Failed to set up real-time listener: ' + error.message);
  }
};

/**
 * Subscribe to real-time ticket updates for a specific conductor
 * @param {string} conductorId - Conductor ID
 * @param {Function} onUpdate - Callback function that receives updated tickets array
 * @returns {Function} Unsubscribe function to stop listening
 */
export const subscribeToTicketsByConductor = (conductorId, onUpdate) => {
  try {
    const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
    
    const unsubscribe = onSnapshot(dailyTripsRef, async (snapshot) => {
      try {
        const allTickets = [];
        
        for (const dateDoc of snapshot.docs) {
          const dateId = dateDoc.id;
          
          // Get all trip names for this date
          const tripNames = await getAllTripNames(conductorId, dateId);
          
          for (const tripName of tripNames) {
            try {
              // Fetch regular tickets, prebookings, and pre-tickets in parallel
              const [ticketsSnapshot, preBookingTickets, preTickets] = await Promise.all([
                getDocs(collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets')),
                fetchPreBookingTickets(conductorId, dateId, tripName),
                fetchPreTickets(conductorId, dateId, tripName)
              ]);

              // Get trip direction for this trip (used by both regular and prebooking tickets)
              const tripDirection = await getTripDirection(conductorId, dateId, tripName);

              // Process regular tickets and pre-tickets
              if (ticketsSnapshot.docs.length > 0) {
                ticketsSnapshot.forEach(ticketDoc => {
                  const ticketData = ticketDoc.data();
                  const ticketId = ticketDoc.id;

                  // Skip prebooking and preTicket tickets from regular path to avoid duplication
                  if (ticketData.documentType === 'preBooking' || ticketData.ticketType === 'preBooking' ||
                      ticketData.documentType === 'preTicket' || ticketData.ticketType === 'preTicket') {
                    return;
                  }

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
                    direction: tripDirection || `${ticketData.from} → ${ticketData.to}`,
                    timestamp: ticketData.timestamp,
                    discountBreakdown: ticketData.discountBreakdown || [],
                    status: ticketData.active ? 'active' : 'inactive',
                    ticketType: ticketData.ticketType || ticketData.documentType,
                    documentType: ticketData.documentType || ticketData.ticketType,
                    scannedAt: ticketData.timestamp,
                    time: ticketData.timestamp ? new Date(ticketData.timestamp.seconds * 1000).toLocaleTimeString() : '',
                    dateFormatted: ticketData.timestamp ? new Date(ticketData.timestamp.seconds * 1000).toLocaleDateString() : dateId
                  });
                });
              }

              // Add prebooking tickets from dedicated path
              if (preBookingTickets.length > 0) {
                allTickets.push(...preBookingTickets);
              }

              // Add pre-tickets from dedicated path
              if (preTickets.length > 0) {
                allTickets.push(...preTickets);
              }
            } catch (error) {
              continue;
            }
          }
        }
        
        // Sort by timestamp (most recent first)
        const sortedTickets = allTickets
          .sort((a, b) => {
            const aTime = a.timestamp?.seconds || 0;
            const bTime = b.timestamp?.seconds || 0;
            return bTime - aTime;
          });
        onUpdate(sortedTickets);
        
      } catch (error) {
        console.error(`Error processing real-time ticket updates for conductor ${conductorId}:`, error);
        onUpdate(null, error);
      }
    }, (error) => {
      console.error(`Error in tickets real-time listener for conductor ${conductorId}:`, error);
      onUpdate(null, error);
    });

    return unsubscribe;
  } catch (error) {
    console.error(`Error setting up tickets real-time listener for conductor ${conductorId}:`, error);
    throw new Error('Failed to set up real-time listener: ' + error.message);
  }
};

// ==================== NEW CACHED FUNCTIONS ====================

/**
 * CACHED: Load ticket data with progressive loading (cache first, then fresh data)
 * @param {string} conductorId - Conductor ID (null for all conductors)
 * @param {number} limit - Number of tickets to fetch
 * @param {Function} onCacheData - Callback for cached data (immediate)
 * @param {Function} onFreshData - Callback for fresh data (after fetch)
 * @returns {Promise<Array>} Final ticket data
 */
export const loadTicketDataProgressive = async (conductorId = null, limit = 50, onCacheData = null, onFreshData = null) => {
  try {
    const cacheKey = ticketingDataCache.getCacheKey(conductorId, limit);

    // Step 1: Return cached data immediately if available
    if (ticketingDataCache.ticketCache.has(cacheKey)) {
      const cachedData = { ...ticketingDataCache.ticketCache.get(cacheKey), fromCache: true };
      if (onCacheData && typeof onCacheData === 'function') {
        onCacheData(cachedData);
      }

      // If cache is still fresh, return it as final result
      if (ticketingDataCache.isCacheFresh(cacheKey)) {
        return cachedData;
      }
    }

    // Step 2: Fetch fresh data in background
    const freshData = await ticketingDataCache.getTicketData(conductorId, limit);
    if (onFreshData && typeof onFreshData === 'function') {
      onFreshData(freshData);
    }

    return freshData;
  } catch (error) {
    console.error('Error in progressive ticket loading:', error);
    throw error;
  }
};

/**
 * CACHED: Setup real-time listener for ticket data updates using cache service
 * @param {string} conductorId - Conductor ID (null for all conductors)
 * @param {number} limit - Number of tickets to fetch
 * @param {Function} callback - Callback function that receives updated tickets
 * @returns {Function} Unsubscribe function to stop listening
 */
export const setupCachedTicketDataListener = (conductorId, limit, callback) => {
  return ticketingDataCache.setupTicketDataListener(conductorId, limit, callback);
};

/**
 * CACHED: Force refresh cache for specific ticket data
 * @param {string} conductorId - Conductor ID (null for all conductors)
 * @param {number} limit - Number of tickets to fetch
 * @returns {Promise<Array>} Fresh ticket data
 */
export const forceRefreshTicketCache = async (conductorId, limit) => {
  return await ticketingDataCache.forceRefreshCache(conductorId, limit);
};

/**
 * CACHED: Get cache information for debugging
 * @returns {Object} Cache information
 */
export const getTicketCacheInfo = () => {
  return ticketingDataCache.getCacheInfo();
};

/**
 * CACHED: Remove all listeners on cleanup
 */
export const cleanupTicketListeners = () => {
  ticketingDataCache.removeAllListeners();
};

/**
 * CACHED: Load ticket data with caching (main function)
 * @param {string} conductorId - Conductor ID (null for all conductors)
 * @param {number} limit - Number of tickets to fetch
 * @returns {Promise<Array>} Ticket data with cache info
 */
export const loadTicketData = async (conductorId = null, limit = 50) => {
  try {
    return await ticketingDataCache.getTicketData(conductorId, limit);
  } catch (error) {
    console.error('Error loading ticket data:', error);
    throw error;
  }
};

/**
 * CACHED: Invalidate specific cache entry
 * @param {string} conductorId - Conductor ID
 * @param {number} limit - Limit parameter
 */
export const invalidateTicketCache = (conductorId, limit) => {
  ticketingDataCache.invalidateCache(conductorId, limit);
};

/**
 * CACHED: Invalidate all ticket cache
 */
export const invalidateAllTicketCache = () => {
  ticketingDataCache.invalidateAllCache();
};

/**
 * CACHED: Preload common ticket data to improve initial load times
 * Call this on app initialization or route transitions
 */
export const preloadTicketData = async () => {
  try {
    // Preload most common queries in background
    const preloadPromises = [
      ticketingDataCache.getTicketData(null, 20), // All recent tickets (small batch)
      getConductorsWithPreTickets() // Conductors list
    ];

    // Don't wait for completion, let them load in background
    Promise.all(preloadPromises).catch(error => {
      console.warn('Background preload failed:', error);
    });

    console.log('✅ Ticket data preloading started');
  } catch (error) {
    console.warn('Error starting ticket data preload:', error);
  }
};

/**
 * CACHED: Check if we have any cached data available
 * @returns {boolean} True if cache has data
 */
export const hasCachedTicketData = () => {
  return ticketingDataCache.ticketCache.size > 0 || !!ticketingDataCache.conductorsCache;
};