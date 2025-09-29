import { collection, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '/src/firebase/firebase.js';

// REMITTANCE DATA CACHE SERVICE
class RemittanceDataCacheService {
  constructor() {
    this.listeners = new Map();
    this.maxListeners = 10;
    this.cleanupOnError = true;

    // IN-MEMORY CACHE SYSTEM
    this.remittanceCache = new Map(); // key: date, value: remittance data
    this.lastFetchTime = new Map(); // Track fetch times per date
    this.isCacheListenerActive = false;
    this.cacheVersion = 1;
    this.currentCallbacks = new Map(); // Store callbacks for cache updates

    // Available dates cache
    this.availableDatesCache = null;
    this.datesCacheTime = null;

    // Conductor details cache
    this.conductorDetailsCache = new Map();
    this.conductorDetailsCacheTime = new Map();

    // Force cleanup on page load/refresh
    this.forceCleanup();
  }

  // Force cleanup method
  forceCleanup() {
    try {
      this.removeAllListeners();

      // Clear global listeners if they exist
      if (window.remittanceListeners) {
        window.remittanceListeners.forEach(unsubscribe => {
          try { unsubscribe(); } catch (e) {}
        });
        window.remittanceListeners = [];
      }
    } catch (error) {
      console.warn('Error during remittance cache cleanup:', error);
    }
  }

  // CACHED: Get remittance data with cache-first approach
  async getRemittanceData(selectedDate) {
    try {
      const cacheKey = selectedDate;


      // FAST PATH: Return cached data immediately if available and fresh
      if (this.remittanceCache.has(cacheKey) && this.isCacheFresh(cacheKey)) {
        return this.remittanceCache.get(cacheKey);
      }

      // SLOW PATH: Fetch fresh data
      const freshData = await this.fetchRemittanceDataFromFirestore(selectedDate);

      // Save to cache
      this.remittanceCache.set(cacheKey, freshData);
      this.lastFetchTime.set(cacheKey, Date.now());

      // Start listening for real-time changes if not already active
      if (!this.isCacheListenerActive) {
        this.startRemittanceDataListener();
      }

      return freshData;
    } catch (error) {
      console.error('Error fetching remittance data:', error);
      throw error;
    }
  }

  // Check if cache is fresh (5 minutes for remittance data)
  isCacheFresh(cacheKey) {
    const lastFetch = this.lastFetchTime.get(cacheKey);
    if (!lastFetch) return false;
    const ageMinutes = (Date.now() - lastFetch) / (1000 * 60);
    return ageMinutes < 5; // Cache valid for 5 minutes
  }

  // Fetch remittance data from Firestore (original logic)
  async fetchRemittanceDataFromFirestore(selectedDate) {

    if (!selectedDate) {
      return [];
    }

    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    const allRemittanceData = [];

    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;

      try {
        // Check if remittance date exists (for verification)
        const remittanceCheck = await getDoc(doc(db, `conductors/${conductorId}/remittance/${selectedDate}`));
        const hasRemittance = remittanceCheck.exists();

        // Get trip info from dailyTrips (since that's where trip maps are)
        const tripData = await this.getTripDataFromDailyTrips(conductorId, selectedDate);

        for (const trip of tripData) {
          // Get remittance summary data if available
          const remittanceSummary = hasRemittance ? await this.getRemittanceSummaryData(conductorId, selectedDate) : null;

          // Create remittance entry
          const remittanceEntry = {
            conductorId,
            tripNumber: trip.tripNumber,
            date: selectedDate,
            createdAt: trip.createdAt || trip.startTime || new Date(),
            dateTime: trip.startTime || new Date(), // Use trip startTime from dailyTrips
            tripDirection: trip.tripDirection, // Direction from dailyTrips
            totalRevenue: trip.totalRevenue, // Revenue from dailyTrips tickets
            totalPassengers: trip.totalPassengers, // Passengers from dailyTrips tickets
            ticketCount: trip.ticketCount, // Ticket count from dailyTrips
            tickets: trip.tickets, // Tickets array from dailyTrips
            documentType: trip.documentType, // Trip-level documentType
            isComplete: trip.isComplete, // Status from dailyTrips
            startTime: trip.startTime, // Time from dailyTrips
            endTime: trip.endTime, // Time from dailyTrips
            placeCollection: trip.placeCollection, // Place info from dailyTrips
            tripData: trip.data, // Original dailyTrips trip data
            remittanceSummary: remittanceSummary
          };

          allRemittanceData.push(remittanceEntry);
        }
      } catch (error) {
        console.error(`Error processing remittance for conductor ${conductorId}:`, error);
      }
    }

    // Sort by conductor and trip number
    allRemittanceData.sort((a, b) => {
      if (a.conductorId !== b.conductorId) {
        return a.conductorId.localeCompare(b.conductorId);
      }
      const aNum = parseInt(a.tripNumber.replace(/\D/g, '')) || 0;
      const bNum = parseInt(b.tripNumber.replace(/\D/g, '')) || 0;
      return aNum - bNum;
    });


    return allRemittanceData;
  }

  // CACHED: Get trip data from dailyTrips (moved to cache service)
  async getTripDataFromDailyTrips(conductorId, date) {
    try {
      // Get trip info from dailyTrips document (since it has the trip maps)
      const dailyTripsDocRef = doc(db, `conductors/${conductorId}/dailyTrips/${date}`);
      const dailyTripsDoc = await getDoc(dailyTripsDocRef);

      if (!dailyTripsDoc.exists()) {
        return [];
      }

      const dailyTripsData = dailyTripsDoc.data();
      const trips = [];

      // Extract trip maps from dailyTrips document
      for (const [key, value] of Object.entries(dailyTripsData)) {
        if (key.startsWith('trip') && typeof value === 'object' && value !== null) {

          // Get both tickets and pre-bookings from their respective paths
          const [ticketDetails, preBookingDetails] = await Promise.all([
            this.getTicketDetailsFromDailyTrips(conductorId, date, key),
            this.getPreBookingDetailsFromNewPath(conductorId, date, key)
          ]);

          // Combine tickets and pre-bookings for unified processing
          const allTickets = [...ticketDetails.tickets, ...preBookingDetails.preBookings];
          const combinedRevenue = ticketDetails.totalRevenue + preBookingDetails.totalRevenue;
          const combinedPassengers = ticketDetails.totalPassengers + preBookingDetails.totalPassengers;

          // Determine trip documentType based on all tickets (check both documentType and ticketType)
          const tripDocumentType = (() => {
            if (allTickets.length === 0) return 'Regular';

            // Check both documentType and ticketType fields from all tickets
            const allTicketTypes = [];
            allTickets.forEach(ticket => {
              if (ticket.documentType) allTicketTypes.push(ticket.documentType);
              if (ticket.ticketType) allTicketTypes.push(ticket.ticketType);
            });

            const uniqueTypes = [...new Set(allTicketTypes)];

            if (uniqueTypes.length === 1) {
              // All tickets have the same type
              return uniqueTypes[0];
            } else if (uniqueTypes.includes('preTicket')) {
              // Mixed types, prioritize preTicket
              return 'preTicket';
            } else if (uniqueTypes.includes('preBooking')) {
              // Mixed types, prioritize preBooking
              return 'preBooking';
            } else {
              // Default to Regular
              return 'Regular';
            }
          })();

          trips.push({
            tripNumber: key,
            tripDirection: value.direction || 'Unknown Direction',
            startTime: value.startTime,
            endTime: value.endTime,
            isComplete: value.isComplete,
            placeCollection: value.placeCollection,
            totalRevenue: combinedRevenue,
            totalPassengers: combinedPassengers,
            ticketCount: allTickets.length,
            tickets: allTickets, // Combined tickets and pre-bookings
            conductorTickets: ticketDetails.tickets,
            preBookings: preBookingDetails.preBookings,
            documentType: tripDocumentType,
            data: value // Original trip data from dailyTrips
          });
        }
      }

      return trips;
    } catch (error) {
      console.error(`Error getting trip data from dailyTrips for ${conductorId}/${date}:`, error);
      return [];
    }
  }

  // CACHED: Get ticket details from dailyTrips (moved to cache service)
  async getTicketDetailsFromDailyTrips(conductorId, date, tripNumber) {
    try {
      const ticketsPath = `conductors/${conductorId}/dailyTrips/${date}/${tripNumber}/tickets/tickets`;
      const ticketsRef = collection(db, ticketsPath);
      const ticketsSnapshot = await getDocs(ticketsRef);

      let totalRevenue = 0;
      let totalPassengers = 0;
      const tickets = [];

      for (const ticketDoc of ticketsSnapshot.docs) {
        const ticketData = ticketDoc.data();
        const ticketId = ticketDoc.id;

        if (ticketData.totalFare && ticketData.quantity) {
          const fare = parseFloat(ticketData.totalFare);
          const passengers = parseInt(ticketData.quantity);

          // Skip pre-booking tickets here - they're handled by getPreBookingDetailsFromNewPath
          if (ticketData.documentType === 'preBooking' || ticketData.ticketType === 'preBooking') {
            continue;
          }

          totalRevenue += fare;
          totalPassengers += passengers;

          tickets.push({
            id: ticketId,
            from: ticketData.from || 'N/A',
            to: ticketData.to || 'N/A',
            fare: fare,
            passengers: passengers,
            timestamp: ticketData.timestamp,
            documentType: ticketData.documentType || ticketData.ticketType || 'Regular',
            ticketType: ticketData.ticketType || ticketData.documentType || 'Regular',
            discountAmount: ticketData.discountAmount || 0,
            startKm: ticketData.startKm,
            endKm: ticketData.endKm,
            totalKm: ticketData.totalKm,
            farePerPassenger: ticketData.farePerPassenger || [],
            source: 'dailyTrips'
          });
        }
      }

      return {
        tickets,
        totalRevenue,
        totalPassengers
      };
    } catch (error) {
      console.error(`Error getting ticket details from dailyTrips for ${conductorId}/${date}/${tripNumber}:`, error);
      return {
        tickets: [],
        totalRevenue: 0,
        totalPassengers: 0
      };
    }
  }

  // CACHED: Get pre-booking details from new path (moved to cache service)
  async getPreBookingDetailsFromNewPath(conductorId, date, tripNumber) {
    try {
      const preBookingsPath = `conductors/${conductorId}/dailyTrips/${date}/${tripNumber}/preBookings/preBookings`;
      const preBookingsRef = collection(db, preBookingsPath);
      const preBookingsSnapshot = await getDocs(preBookingsRef);

      let totalRevenue = 0;
      let totalPassengers = 0;
      const preBookings = [];

      for (const preBookingDoc of preBookingsSnapshot.docs) {
        const preBookingData = preBookingDoc.data();
        const preBookingId = preBookingDoc.id;

        if (preBookingData.totalFare && preBookingData.quantity) {
          const fare = parseFloat(preBookingData.totalFare);
          const passengers = parseInt(preBookingData.quantity);

          totalRevenue += fare;
          totalPassengers += passengers;

          preBookings.push({
            id: preBookingId,
            from: preBookingData.from || 'N/A',
            to: preBookingData.to || 'N/A',
            fare: fare,
            passengers: passengers,
            timestamp: preBookingData.timestamp,
            documentType: 'preBooking',
            ticketType: preBookingData.ticketType || 'preBooking',
            discountAmount: preBookingData.discountAmount || 0,
            startKm: preBookingData.fromKm,
            endKm: preBookingData.toKm,
            totalKm: preBookingData.totalKm,
            farePerPassenger: preBookingData.farePerPassenger || [],
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
            paidAt: preBookingData.paidAt,
            source: 'preBookings'
          });
        }
      }

      return {
        preBookings,
        totalRevenue,
        totalPassengers
      };
    } catch (error) {
      console.error(`Error getting pre-booking details from new path for ${conductorId}/${date}/${tripNumber}:`, error);
      return {
        preBookings: [],
        totalRevenue: 0,
        totalPassengers: 0
      };
    }
  }

  // CACHED: Get remittance summary data (moved to cache service)
  async getRemittanceSummaryData(conductorId, date) {
    try {
      // Check if there's summary data in the remittance date document
      const remittanceDateDocRef = doc(db, `conductors/${conductorId}/remittance/${date}`);
      const remittanceDateDoc = await getDoc(remittanceDateDocRef);

      if (remittanceDateDoc.exists()) {
        const summaryData = remittanceDateDoc.data();
        return summaryData;
      }

      return null;
    } catch (error) {
      console.error(`Error getting remittance summary data:`, error);
      return null;
    }
  }

  // Start real-time cache updates listener
  startRemittanceDataListener() {
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
      console.error('Error in remittance cache listener:', error);
      this.isCacheListenerActive = false;
      this.listeners.delete('remittance_cache_listener');
    });

    this.listeners.set('remittance_cache_listener', unsubscribe);
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
            // Parse the key to get date
            const date = key.split('_callback_')[1];

            // Fetch fresh data and call the callback
            const freshData = await this.getRemittanceData(date);
            callback(freshData);
          } catch (error) {
            console.error('Error in remittance cache update callback:', error);
          }
          this.updateTimeouts.delete(key);
        }, 150); // Debounce for 150ms

        this.updateTimeouts.set(key, timeout);
      }
    });
  }

  // CACHED: Get available remittance dates with caching
  async getAvailableRemittanceDates() {
    try {
      // Check if cache is fresh (10 minutes for dates)
      if (this.availableDatesCache && this.datesCacheTime) {
        const ageMinutes = (Date.now() - this.datesCacheTime) / (1000 * 60);
        if (ageMinutes < 10) {
          return this.availableDatesCache;
        }
      }

      const conductorsRef = collection(db, 'conductors');
      const conductorsSnapshot = await getDocs(conductorsRef);
      const dates = new Set();

      for (const conductorDoc of conductorsSnapshot.docs) {
        const conductorId = conductorDoc.id;

        try {
          const remittanceRef = collection(db, `conductors/${conductorId}/remittance`);
          const remittanceSnapshot = await getDocs(remittanceRef);

          for (const dateDoc of remittanceSnapshot.docs) {
            const dateId = dateDoc.id;
            if (dateId.match(/^\d{4}-\d{2}-\d{2}$/)) {
              dates.add(dateId);
            }
          }
        } catch (error) {
          console.error(`Error fetching remittance dates for conductor ${conductorId}:`, error);
        }
      }

      const sortedDates = Array.from(dates).sort((a, b) => new Date(b) - new Date(a));

      // Cache the results
      this.availableDatesCache = sortedDates;
      this.datesCacheTime = Date.now();

      return sortedDates;
    } catch (error) {
      console.error('Error fetching available remittance dates:', error);
      return this.availableDatesCache || [];
    }
  }

  // CACHED: Get conductor details with caching
  async getConductorDetails(conductorId) {
    try {
      // Check if cache is fresh (15 minutes for conductor details)
      if (this.conductorDetailsCache.has(conductorId) && this.conductorDetailsCacheTime.has(conductorId)) {
        const ageMinutes = (Date.now() - this.conductorDetailsCacheTime.get(conductorId)) / (1000 * 60);
        if (ageMinutes < 15) {
          return this.conductorDetailsCache.get(conductorId);
        }
      }

      // Get conductor basic info
      const conductorRef = doc(db, 'conductors', conductorId);
      const conductorDoc = await getDoc(conductorRef);

      let conductorData = {
        id: conductorId,
        name: conductorId,
        busNumber: 'N/A'
      };

      if (conductorDoc.exists()) {
        const data = conductorDoc.data();

        conductorData = {
          id: conductorId,
          name: data.name || conductorId,
          busNumber: 'N/A',
          ...data
        };

        // Check if bus number is in the main document
        if (data.busNumber) {
          conductorData.busNumber = data.busNumber.toString(); // Convert to string to be safe
          this.conductorDetailsCache.set(conductorId, conductorData);
          this.conductorDetailsCacheTime.set(conductorId, Date.now());
          return conductorData; // Return early since we found it
        }

        // Also check alternative field names just in case
        if (data.bus) {
          conductorData.busNumber = data.bus.toString();
          this.conductorDetailsCache.set(conductorId, conductorData);
          this.conductorDetailsCacheTime.set(conductorId, Date.now());
          return conductorData;
        }

        if (data.number) {
          conductorData.busNumber = data.number.toString();
          this.conductorDetailsCache.set(conductorId, conductorData);
          this.conductorDetailsCacheTime.set(conductorId, Date.now());
          return conductorData;
        }
      }

      try {
        const busNumberRef = collection(db, `conductors/${conductorId}/busNumber`);
        const busNumberSnapshot = await getDocs(busNumberRef);

        if (!busNumberSnapshot.empty) {
          const busDoc = busNumberSnapshot.docs[0];
          const busData = busDoc.data();

          // Try different possible field names for bus number
          const busNumber = busData.busNumber || busData.number || busData.bus || busDoc.id || 'N/A';
          conductorData.busNumber = busNumber.toString();
        }
      } catch (busError) {
        if (busError.code !== 'permission-denied') {
          console.error(`Error fetching bus number from subcollection for conductor ${conductorId}:`, busError);
        }
      }

      // Cache the result
      this.conductorDetailsCache.set(conductorId, conductorData);
      this.conductorDetailsCacheTime.set(conductorId, Date.now());

      return conductorData;
    } catch (error) {
      console.error(`Error fetching conductor details for ${conductorId}:`, error);
      return {
        id: conductorId,
        busNumber: 'N/A',
        name: conductorId
      };
    }
  }

  // CACHED: Get all conductor details with caching
  async getAllConductorDetails() {
    try {
      const conductorsRef = collection(db, 'conductors');
      const conductorsSnapshot = await getDocs(conductorsRef);
      const conductorData = {};

      for (const doc of conductorsSnapshot.docs) {
        const details = await this.getConductorDetails(doc.id);
        conductorData[doc.id] = details;
      }

      return conductorData;
    } catch (error) {
      console.error('Error fetching all conductor details:', error);
      return {};
    }
  }

  // Cache management methods
  invalidateAllCache() {
    this.remittanceCache.clear();
    this.lastFetchTime.clear();
    this.availableDatesCache = null;
    this.datesCacheTime = null;
    this.conductorDetailsCache.clear();
    this.conductorDetailsCacheTime.clear();
  }

  invalidateCache(date) {
    this.remittanceCache.delete(date);
    this.lastFetchTime.delete(date);
  }

  // Force refresh cache
  async forceRefreshCache(date) {
    this.invalidateCache(date);
    return await this.getRemittanceData(date);
  }

  // CACHED: Setup real-time listener for remittance data
  setupRemittanceDataListener(date, callback) {
    const listenerKey = `remittance_callback_${date}`;

    // Remove existing listener
    this.removeListener(listenerKey);

    // Store the callback
    this.currentCallbacks.set(listenerKey, callback);

    // If we have cached data, return it immediately
    if (this.remittanceCache.has(date)) {
      setTimeout(() => {
        const cachedData = this.remittanceCache.get(date);
        if (cachedData && typeof callback === 'function') {
          callback(cachedData);
        }
      }, 0);
    } else {
      // If no cache, fetch data
      this.getRemittanceData(date)
        .then(data => {
          if (typeof callback === 'function') {
            callback(data);
          }
        })
        .catch(error => {
          console.error('Error in remittance data listener:', error);
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
      cacheSize: this.remittanceCache.size,
      isListenerActive: this.isCacheListenerActive,
      cachedKeys: Array.from(this.remittanceCache.keys()),
      availableDatesCache: !!this.availableDatesCache,
      conductorDetailsCache: this.conductorDetailsCache.size
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
        console.warn('Error cleaning up remittance listener:', error);
      }
    });
    this.listeners.clear();
    this.currentCallbacks.clear();
    this.isCacheListenerActive = false;
  }
}

// Create singleton instance
const remittanceDataCache = new RemittanceDataCacheService();

// CACHED: Function to get available dates from remittance collection
export const getAvailableRemittanceDates = async () => {
  return await remittanceDataCache.getAvailableRemittanceDates();
};

// CACHED: Function to get trip data from dailyTrips (using cache service)
export const getTripDataFromDailyTrips = async (conductorId, date) => {
  return await remittanceDataCache.getTripDataFromDailyTrips(conductorId, date);
};

// CACHED: Function to get ticket details from dailyTrips (using cache service)
export const getTicketDetailsFromDailyTrips = async (conductorId, date, tripNumber) => {
  return await remittanceDataCache.getTicketDetailsFromDailyTrips(conductorId, date, tripNumber);
};

// CACHED: Function to get pre-booking details from new path (using cache service)
export const getPreBookingDetailsFromNewPath = async (conductorId, date, tripNumber) => {
  return await remittanceDataCache.getPreBookingDetailsFromNewPath(conductorId, date, tripNumber);
};

// CACHED: Function to get remittance summary data (using cache service)
export const getRemittanceSummaryData = async (conductorId, date) => {
  return await remittanceDataCache.getRemittanceSummaryData(conductorId, date);
};

// CACHED: Function to get conductor details (using cache service)
export const getConductorDetails = async (conductorId) => {
  return await remittanceDataCache.getConductorDetails(conductorId);
};

// CACHED: Function to get all conductor details (using cache service)
export const getAllConductorDetails = async () => {
  return await remittanceDataCache.getAllConductorDetails();
};

// CACHED: Main function to load remittance data using cache-first approach
export const loadRemittanceData = async (selectedDate) => {
  return await remittanceDataCache.getRemittanceData(selectedDate);
};

// Function to calculate remittance summary
export const calculateRemittanceSummary = (remittanceData) => {
  // Count unique trips by combining conductorId, date, and tripNumber
  // Only count trips that have tickets (ticketCount > 0)
  const uniqueTrips = new Set();
  
  const summary = remittanceData.reduce((acc, trip) => {
    // Only process trips that have tickets
    if (trip.ticketCount > 0) {
      // Add to unique trips set with date to distinguish trips with same name on different days
      if (trip.conductorId && trip.tripNumber) {
        const tripDate = trip.date || trip.createdAt || 'unknown-date';
        uniqueTrips.add(`${trip.conductorId}_${tripDate}_${trip.tripNumber}`);
      }
      
      return {
        totalRevenue: acc.totalRevenue + trip.totalRevenue,
        totalPassengers: acc.totalPassengers + trip.totalPassengers,
        totalTickets: acc.totalTickets + trip.ticketCount
      };
    }
    
    // Return unchanged accumulator for trips with 0 tickets
    return acc;
  }, { 
    totalRevenue: 0, 
    totalPassengers: 0, 
    totalTickets: 0
  });

  // Set totalTrips to the count of unique trips with tickets
  summary.totalTrips = uniqueTrips.size;
  summary.averageFare = summary.totalPassengers > 0 ? summary.totalRevenue / summary.totalPassengers : 0;
  
  return summary;
};

// Function to group remittance data by conductor
export const groupRemittanceByconductor = (remittanceData) => {
  const grouped = remittanceData.reduce((acc, trip) => {
    if (!acc[trip.conductorId]) {
      acc[trip.conductorId] = [];
    }
    acc[trip.conductorId].push(trip);
    return acc;
  }, {});
  
  // Calculate totals for each conductor
  Object.keys(grouped).forEach(conductorId => {
    const trips = grouped[conductorId];
    const conductorTotal = trips.reduce((sum, trip) => sum + trip.totalRevenue, 0);
    const conductorPassengers = trips.reduce((sum, trip) => sum + trip.totalPassengers, 0);
    const conductorTickets = trips.reduce((sum, trip) => sum + (trip.ticketCount || 0), 0);
    
    grouped[conductorId].conductorSummary = {
      totalTrips: trips.length,
      totalRevenue: conductorTotal,
      totalPassengers: conductorPassengers,
      totalTickets: conductorTickets,
      averageFare: conductorPassengers > 0 ? conductorTotal / conductorPassengers : 0
    };
  });
  
  return grouped;
};

// CACHED: Function to get remittance data by conductor for a specific date
export const getRemittanceByDate = async (date) => {
  try {
    const remittanceData = await remittanceDataCache.getRemittanceData(date);
    const summary = calculateRemittanceSummary(remittanceData);
    const groupedData = groupRemittanceByconductor(remittanceData);

    return {
      remittanceData,
      summary,
      groupedData
    };
  } catch (error) {
    console.error('Error getting remittance by date:', error);
    throw error;
  }
};

// Utility function to format currency
export const formatCurrency = (amount) => {
  return `₱${(Number(amount) || 0).toFixed(2)}`;
};

// Utility function to format date
export const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

// Utility function to format time
export const formatTime = (timestamp) => {
  if (!timestamp) return 'N/A';
  
  let date;
  if (timestamp.toDate) {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }
  
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

// Utility function to format ticket type
export const formatTicketType = (documentType) => {
  if (documentType === 'preTicket') {
    return 'Pre-Ticket';
  } else if (documentType === 'preBooking') {
    return 'Pre-Booking';
  } else {
    return 'Conductor Ticket';
  }
};

// Function to validate remittance data integrity
export const validateRemittanceData = (remittanceData) => {
  const validationResults = {
    isValid: true,
    errors: [],
    warnings: []
  };

  remittanceData.forEach((trip, index) => {
    // Check for missing required fields
    if (!trip.conductorId) {
      validationResults.errors.push(`Trip ${index + 1}: Missing conductor ID`);
      validationResults.isValid = false;
    }

    if (!trip.tripNumber) {
      validationResults.errors.push(`Trip ${index + 1}: Missing trip number`);
      validationResults.isValid = false;
    }

    if (trip.totalRevenue < 0) {
      validationResults.errors.push(`Trip ${trip.tripNumber}: Negative revenue`);
      validationResults.isValid = false;
    }

    if (trip.totalPassengers < 0) {
      validationResults.errors.push(`Trip ${trip.tripNumber}: Negative passenger count`);
      validationResults.isValid = false;
    }

    // Warnings for potential issues
    if (trip.totalRevenue === 0 && trip.totalPassengers > 0) {
      validationResults.warnings.push(`Trip ${trip.tripNumber}: Has passengers but no revenue`);
    }

    if (trip.totalRevenue > 0 && trip.totalPassengers === 0) {
      validationResults.warnings.push(`Trip ${trip.tripNumber}: Has revenue but no passengers`);
    }

    if (trip.ticketCount === 0) {
      validationResults.warnings.push(`Trip ${trip.tripNumber}: No tickets found in dailyTrips`);
    }

    // Check for incomplete trips
    if (!trip.isComplete) {
      validationResults.warnings.push(`Trip ${trip.tripNumber}: Trip marked as incomplete`);
    }
  });

  return validationResults;
};

// CACHED: Setup real-time listener for remittance data updates
export const setupRemittanceDataListener = (date, callback) => {
  return remittanceDataCache.setupRemittanceDataListener(date, callback);
};

// CACHED: Force refresh cache for specific remittance data
export const forceRefreshRemittanceCache = async (date) => {
  return await remittanceDataCache.forceRefreshCache(date);
};

// CACHED: Get cache information for debugging
export const getRemittanceDataCacheInfo = () => {
  return remittanceDataCache.getCacheInfo();
};

// CACHED: Remove all listeners on cleanup
export const removeAllRemittanceListeners = () => {
  remittanceDataCache.removeAllListeners();
};