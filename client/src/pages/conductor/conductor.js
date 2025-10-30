import {
  collection,
  getDocs,
  setDoc,
  serverTimestamp,
  updateDoc,
  doc,
  getDoc,
  query,
  onSnapshot,
  where,
  deleteDoc
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, updateProfile, signInWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { logActivity, ACTIVITY_TYPES } from '/src/pages/settings/auditService.js';

import { db, auth } from '/src/firebase/firebase';

class ConductorService {
  constructor() {
    this.listeners = new Map();
    this.maxListeners = 10; // Allow multiple listeners for list + details + reservations
    this.cleanupOnError = true;

    // IN-MEMORY CACHE SYSTEM
    this.conductorsCache = null;        // Stores conductor list
    this.lastFetchTime = null;         // When we last fetched
    this.tripCountsCache = new Map();  // Stores trip counts by conductor ID
    this.isCacheListenerActive = false; // Tracks if cache snapshot is running
    this.cacheVersion = 1;             // Cache versioning for invalidation

    // Force cleanup on page load/refresh
    this.forceCleanup();
  }

  // Force cleanup method
  forceCleanup() {
    try {
      // Clear any existing listeners
      this.removeAllListeners();
      
      // Also try to clear any global Firestore listeners if they exist
      if (window.firestoreListeners) {
        window.firestoreListeners.forEach(unsubscribe => {
          try { unsubscribe(); } catch (e) {}
        });
        window.firestoreListeners = [];
      }
    } catch (error) {
      console.warn('Error during force cleanup:', error);
    }
  }

  //  CACHED: Get all conductors with basic info (cache-first approach)
  async getAllConductors() {
    try {
      //  FAST PATH: Return cached data immediately if available
      if (this.conductorsCache && this.isCacheListenerActive) {
        // Return a copy to prevent external modifications
        return [...this.conductorsCache];
      }

      //  SLOW PATH: First time or cache invalidated - fetch everything
      const conductors = await this.fetchAllConductorsFromFirestore();

      //  Save to cache (in-memory)
      this.conductorsCache = conductors;
      this.lastFetchTime = Date.now();

      //  Start listening for real-time changes
      this.startConductorsCacheListener();

      return conductors;
    } catch (error) {
      console.error('Error fetching conductors:', error);
      throw error;
    }
  }

  //  Fetch all conductors from Firestore (original logic)
  async fetchAllConductorsFromFirestore() {
    const conductorsRef = collection(db, 'conductors');
    const snapshot = await getDocs(conductorsRef);

    const conductors = [];
    for (const doc of snapshot.docs) {
      const conductorData = doc.data();

      // Skip deleted conductors (handles missing status field)
      if (conductorData.status === 'deleted') {
        continue;
      }

      // Use remittance-based counting logic for accurate trip counts
      let tripsCount;

      // Always calculate using the new remittance logic for accuracy
      tripsCount = await this.getConductorTripsCount(doc.id);

      // Update the cache in the background for consistency
      if (conductorData.totalTrips !== tripsCount) {
        try {
          await this.updateConductorTripsCount(doc.id);
        } catch (updateError) {
          console.warn(` Failed to update cache for ${doc.id}:`, updateError);
        }
      }

      // Extract activeTrip direction if available
      let activeTripDirection = 'N/A';
      if (conductorData.activeTrip && typeof conductorData.activeTrip === 'object') {
        activeTripDirection = conductorData.activeTrip.direction || 'N/A';
      }

      conductors.push({
        id: doc.id,
        ...conductorData,
        tripsCount: tripsCount,
        activeTripDirection: activeTripDirection
      });
    }

    return conductors;
  }

  //  Start real-time cache updates listener
  startConductorsCacheListener() {
    if (this.isCacheListenerActive) {
      return; // Don't create duplicate listeners
    }

    // Clean up any existing cache listener first
    if (this.listeners.has('cache_listener')) {
      const existingListener = this.listeners.get('cache_listener');
      if (typeof existingListener === 'function') {
        existingListener();
      }
      this.listeners.delete('cache_listener');
    }

    const conductorsRef = collection(db, 'conductors');

    const unsubscribe = onSnapshot(conductorsRef, async (snapshot) => {
      if (!this.conductorsCache) {
        return; // No cache to update
      }

      let hasChanges = false;

      // Only process actual changes, not entire dataset
      const changes = snapshot.docChanges();

      if (changes.length === 0) {
        return;
      }

      for (const change of changes) {
        const docData = change.doc.data();

        // Handle deleted conductors - remove them from cache regardless of change type
        if (docData.status === 'deleted') {
          await this.removeFromConductorsCache(change.doc.id);
          hasChanges = true;
          continue;
        }

        if (change.type === 'added') {
          await this.addToConductorsCache(change.doc);
          hasChanges = true;
        }
        else if (change.type === 'modified') {
          await this.updateConductorsCache(change.doc);
          hasChanges = true;
        }
        else if (change.type === 'removed') {
          await this.removeFromConductorsCache(change.doc.id);
          hasChanges = true;
        }
      }

      if (hasChanges) {
        // Trigger UI update by calling the active listener if it exists
        this.notifyListenersOfCacheUpdate();
      }
    }, (error) => {
      console.error(' Error in cache listener:', error);
      this.isCacheListenerActive = false;
      this.listeners.delete('cache_listener');
    });

    // Store the unsubscribe function
    this.listeners.set('cache_listener', unsubscribe);
    this.isCacheListenerActive = true;
  }

  //  Cache Helper Methods
  async addToConductorsCache(doc) {
    if (!this.conductorsCache) return;

    const conductorData = doc.data();

    // Skip deleted conductors
    if (conductorData.status === 'deleted') {
      return;
    }

    // Check if conductor already exists in cache to prevent duplicates
    const existingIndex = this.conductorsCache.findIndex(c => c.id === doc.id);
    if (existingIndex !== -1) {
      // Update existing instead of adding duplicate
      await this.updateConductorsCache(doc);
      return;
    }

    const tripsCount = await this.getConductorTripsCount(doc.id);

    // Extract activeTrip direction if available
    let activeTripDirection = 'N/A';
    if (conductorData.activeTrip && typeof conductorData.activeTrip === 'object') {
      activeTripDirection = conductorData.activeTrip.direction || 'N/A';
    }

    const newConductor = {
      id: doc.id,
      ...conductorData,
      tripsCount: tripsCount,
      activeTripDirection: activeTripDirection
    };

    this.conductorsCache.push(newConductor);
  }

  async updateConductorsCache(doc) {
    if (!this.conductorsCache) return;

    const conductorData = doc.data();

    // If conductor is deleted, remove it from cache
    if (conductorData.status === 'deleted') {
      await this.removeFromConductorsCache(doc.id);
      return;
    }

    const index = this.conductorsCache.findIndex(c => c.id === doc.id);

    if (index !== -1) {
      // Update trip count if needed
      let tripsCount = this.conductorsCache[index].tripsCount;

      // Only recalculate trip count if it might have changed
      if (conductorData.totalTrips !== tripsCount) {
        tripsCount = await this.getConductorTripsCount(doc.id);
      }

      // Extract activeTrip direction if available
      let activeTripDirection = 'N/A';
      if (conductorData.activeTrip && typeof conductorData.activeTrip === 'object') {
        activeTripDirection = conductorData.activeTrip.direction || 'N/A';
      }

      this.conductorsCache[index] = {
        id: doc.id,
        ...conductorData,
        tripsCount: tripsCount,
        activeTripDirection: activeTripDirection
      };
    } else {
      // Conductor not in cache, add it
      await this.addToConductorsCache(doc);
    }
  }

  async removeFromConductorsCache(docId) {
    if (!this.conductorsCache) return;

    const initialLength = this.conductorsCache.length;
    this.conductorsCache = this.conductorsCache.filter(c => c.id !== docId);
  }

  // Notify active listeners about cache updates
  notifyListenersOfCacheUpdate() {
    // If there's an active conductors listener, trigger it with cached data
    if (this.currentConductorsCallback && this.conductorsCache) {
      // Debounce multiple rapid updates
      if (this.updateTimeout) {
        clearTimeout(this.updateTimeout);
      }

      this.updateTimeout = setTimeout(() => {
        if (this.currentConductorsCallback && this.conductorsCache) {
          // Return a copy to prevent external modifications
          this.currentConductorsCallback([...this.conductorsCache]);
        }
        this.updateTimeout = null;
      }, 50); // Small debounce delay
    }
  }

  //  Cache management methods
  invalidateCache() {
    this.conductorsCache = null;
    this.lastFetchTime = null;
    this.tripCountsCache.clear();

    // Stop the cache listener to force fresh setup
    if (this.listeners.has('cache_listener')) {
      this.listeners.get('cache_listener')();
      this.listeners.delete('cache_listener');
    }
    this.isCacheListenerActive = false;
  }

  // Force refresh cache with updated trip counts
  async forceRefreshCache() {
    this.invalidateCache();

    // This will fetch fresh data and rebuild cache
    const freshData = await this.getAllConductors();

    return freshData;
  }

  getCacheInfo() {
    return {
      hasConductorsCache: !!this.conductorsCache,
      cacheSize: this.conductorsCache?.length || 0,
      lastFetchTime: this.lastFetchTime,
      isListenerActive: this.isCacheListenerActive,
      cacheAge: this.lastFetchTime ? Date.now() - this.lastFetchTime : null
    };
  }

  // Get detailed conductor information 
  async getConductorDetails(conductorId) {
    try {
      const conductorRef = doc(db, 'conductors', conductorId);
      const conductorDoc = await getDoc(conductorRef);

      if (!conductorDoc.exists()) {
        throw new Error('Conductor not found');
      }

      const conductorData = conductorDoc.data();
      const { allTrips } = await this.getConductorTrips(conductorId);
      const tripsArray = Array.isArray(allTrips) ? allTrips : Object.values(allTrips || {});

      // Use remittance counting logic for trip counts
      const totalTrips = await this.getConductorTripsCount(conductorId);

      // Calculate today trips using existing method
      const today = new Date().toISOString().split('T')[0];
      const todayTrips = await this.getConductorTripsCountForDate(conductorId, today);

      return {
        id: conductorDoc.id,
        ...conductorData,
        trips: tripsArray,
        totalTrips: totalTrips,
        todayTrips: todayTrips
      };
    } catch (error) {
      console.error('Error fetching conductor details:', error);
      throw error;
    }
  }

  // Get conductor trips using new dailyTrips path structure
  async getConductorTrips(conductorId, limit = null) {
    try {
      const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
      const datesSnapshot = await getDocs(dailyTripsRef);
      
      const allTrips = [];
      const availableDates = [];

      for (const dateDoc of datesSnapshot.docs) {
        const dateId = dateDoc.id;
        availableDates.push(dateId);

        // Process trip subcollections (trip1, trip2, etc.)
        const tripNames = ['trip1', 'trip2', 'trip3', 'trip4', 'trip5', 'trip6', 'trip7', 'trip8', 'trip9', 'trip10'];
        
        for (const tripName of tripNames) {
          try {
            // Check for tickets in: /conductors/{conductorId}/dailyTrips/{dateId}/{tripName}/tickets/tickets/
            const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets');
            const ticketsSnapshot = await getDocs(ticketsRef);
            
            if (ticketsSnapshot.docs.length > 0) {
              ticketsSnapshot.docs.forEach(ticketDoc => {
                const ticketData = ticketDoc.data();
                allTrips.push({
                  id: ticketDoc.id,
                  date: dateId,
                  tripId: tripName,
                  ticketNumber: ticketDoc.id,
                  ...ticketData,
                  timestamp: ticketData.timestamp || ticketData.createdAt || null
                });
              });
            }
          } catch (tripError) {
            // Normal - not all trip numbers will exist
            continue;
          }
        }
      }

      // Sort by timestamp (most recent first)
      allTrips.sort((a, b) => {
        if (!a.timestamp || !b.timestamp) return 0;
        try {
          const timestampA = a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
          const timestampB = b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
          return timestampB - timestampA;
        } catch (error) {
          console.error('Error sorting timestamps:', error);
          return 0;
        }
      });

      return {
        allTrips: limit ? allTrips.slice(0, limit) : allTrips,
        availableDates,
      };
    } catch (error) {
      console.error('Error fetching conductor trips:', error);
      return {
        allTrips: [],
        availableDates: [],
      };
    }
  }

  // Helper function to get all trip names using the same logic as daily revenue
  async getAllTripNames(conductorId, dateId) {
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
  }

  // Helper function to fetch pre-ticket tickets (same as dashboard.js)
  async fetchPreTickets(conductorId, dateId, tripName) {
    try {
      const preTicketsPath = `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/preTickets/preTickets`;
      const preTicketsRef = collection(db, preTicketsPath);
      const preTicketsSnapshot = await getDocs(preTicketsRef);

      const preTickets = [];

      for (const preTicketDoc of preTicketsSnapshot.docs) {
        const preTicketData = preTicketDoc.data();

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
            // Ignore parse errors
          }
        }

        // Use parsedQrData as the primary data source, with fallbacks
        const sourceData = parsedQrData || preTicketData;

        // Get fare and quantity from qrData or direct fields
        const totalFare = sourceData.amount || sourceData.totalFare || preTicketData.totalFare || 0;
        const quantity = sourceData.quantity || preTicketData.quantity || 0;

        preTickets.push({
          id: preTicketDoc.id,
          totalFare: totalFare,
          quantity: quantity,
          from: sourceData.from || preTicketData.from || '',
          to: sourceData.to || preTicketData.to || '',
          documentType: 'preTicket',
          ticketType: 'preTicket'
        });
      }

      return preTickets;
    } catch (error) {
      return [];
    }
  }

  //  Get trips count for a conductor 
  async getConductorTripsCount(conductorId) {
    try {
      const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
      const datesSnapshot = await getDocs(dailyTripsRef);

      if (datesSnapshot.empty) {
        return 0;
      }

      // Simulate daily revenue logic: create trip objects then count unique trips
      const allTrips = [];

      // Process dates in parallel for better performance
      const datePromises = datesSnapshot.docs.map(async (dateDoc) => {
        const dateId = dateDoc.id;

        try {
          // Use the same trip detection method as daily revenue
          const tripNames = await this.getAllTripNames(conductorId, dateId);

          // Process trips in parallel for this date
          const tripPromises = tripNames.map(async (tripName) => {
            try {
              // Check for tickets, prebookings, and pre-tickets 
              const [ticketsSnapshot, preBookingsSnapshot, preTickets] = await Promise.all([
                getDocs(collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets')),
                getDocs(collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'preBookings', 'preBookings')),
                this.fetchPreTickets(conductorId, dateId, tripName)
              ]);

              const trips = [];

              // Add each ticket as a trip object (like daily revenue)
              ticketsSnapshot.docs.forEach(ticketDoc => {
                trips.push({
                  conductorId: conductorId,
                  tripId: tripName,
                  date: dateId,
                  type: 'ticket'
                });
              });

              // Add each prebooking as a trip object
              preBookingsSnapshot.docs.forEach(preBookingDoc => {
                const preBookingData = preBookingDoc.data();
                // Only include pre-bookings that have been scanned/boarded
                if (!preBookingData.scannedAt) {
                  return;
                }
                trips.push({
                  conductorId: conductorId,
                  tripId: tripName,
                  date: dateId,
                  type: 'prebooking'
                });
              });

              // Add each pre-ticket as a trip object 
              preTickets.forEach(preTicket => {
                trips.push({
                  conductorId: conductorId,
                  tripId: tripName,
                  date: dateId,
                  type: 'preticket'
                });
              });

              return trips;
            } catch (tripError) {
              return [];
            }
          });

          const tripResults = await Promise.all(tripPromises);
          return tripResults.flat();
        } catch (dateError) {
          console.warn(`Error processing date ${dateId}:`, dateError);
          return [];
        }
      });

      // Wait for all dates to be processed
      const dateResults = await Promise.all(datePromises);
      allTrips.push(...dateResults.flat());

      // Now count unique trips exactly like daily revenue does
      const uniqueTrips = new Set();
      allTrips.forEach(trip => {
        if (trip.conductorId && trip.tripId) {
          const tripDate = trip.date || 'unknown-date';
          const uniqueKey = `${trip.conductorId}_${tripDate}_${trip.tripId}`;
          uniqueTrips.add(uniqueKey);
        }
      });

      return uniqueTrips.size;
    } catch (error) {
      console.error('Error getting trips count:', error);
      return 0;
    }
  }

  // Get trips for a specific date using new dailyTrips path structure
  async getConductorTripsByDate(conductorId, date) {
    try {
      const trips = [];
      
      // Process trip subcollections (trip1, trip2, etc.)
      const tripNames = ['trip1', 'trip2', 'trip3', 'trip4', 'trip5', 'trip6', 'trip7', 'trip8', 'trip9', 'trip10'];
      
      for (const tripName of tripNames) {
        try {
          // Check for tickets in: /conductors/{conductorId}/dailyTrips/{date}/{tripName}/tickets/tickets/
          const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', date, tripName, 'tickets', 'tickets');
          const ticketsSnapshot = await getDocs(ticketsRef);
          
          if (ticketsSnapshot.docs.length > 0) {
            ticketsSnapshot.docs.forEach(ticketDoc => {
              const ticketData = ticketDoc.data();
              trips.push({
                id: ticketDoc.id,
                ticketNumber: ticketDoc.id,
                tripId: tripName,
                date: date,
                ...ticketData
              });
            });
          }
        } catch (tripError) {
          // Normal - not all trip numbers will exist
          continue;
        }
      }
      
      return trips;
    } catch (error) {
      console.error('Error fetching trips by date:', error);
      return [];
    }
  }

  // Delete a specific trip using new dailyTrips path structure
  async deleteTrip(conductorId, date, ticketNumber, tripId = null) {
    try {
      // Validate parameters
      if (!conductorId || !date || !ticketNumber) {
        throw new Error('Missing required parameters: conductorId, date, or ticketNumber');
      }

      let foundTripId = tripId;
      let tripDocRef = null;

      // If tripId is provided, try that specific location first
      if (tripId) {
        tripDocRef = doc(db, 'conductors', conductorId, 'dailyTrips', date, tripId, 'tickets', 'tickets', ticketNumber);
        const tripDoc = await getDoc(tripDocRef);
        if (!tripDoc.exists()) {
          foundTripId = null;
          tripDocRef = null;
        }
      }

      // If no tripId provided or not found, search through all trip collections
      if (!foundTripId) {
        const tripNames = ['trip1', 'trip2', 'trip3', 'trip4', 'trip5', 'trip6', 'trip7', 'trip8', 'trip9', 'trip10'];
        
        for (const tripName of tripNames) {
          try {
            const testTripDocRef = doc(db, 'conductors', conductorId, 'dailyTrips', date, tripName, 'tickets', 'tickets', ticketNumber);
            const testTripDoc = await getDoc(testTripDocRef);
            
            if (testTripDoc.exists()) {
              foundTripId = tripName;
              tripDocRef = testTripDocRef;
              break;
            }
          } catch (searchError) {
            // Continue searching
            continue;
          }
        }
      }

      if (!tripDocRef || !foundTripId) {
        throw new Error('Trip not found in any trip collection');
      }

      // Delete the trip document
      await deleteDoc(tripDocRef);

      // Check if this was the last ticket in this trip collection
      const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', date, foundTripId, 'tickets', 'tickets');
      const remainingTickets = await getDocs(ticketsRef);

      // Check if any tickets remain across all trip collections for this date
      let totalRemainingTickets = 0;
      const tripNames = ['trip1', 'trip2', 'trip3', 'trip4', 'trip5', 'trip6', 'trip7', 'trip8', 'trip9', 'trip10'];
      
      for (const tripName of tripNames) {
        try {
          const tripTicketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', date, tripName, 'tickets', 'tickets');
          const tripTicketsSnapshot = await getDocs(tripTicketsRef);
          totalRemainingTickets += tripTicketsSnapshot.docs.length;
        } catch (checkError) {
          // Continue checking other trips
          continue;
        }
      }

      // If no more tickets for this date, delete the date document
      if (totalRemainingTickets === 0) {
        try {
          const dateDocRef = doc(db, 'conductors', conductorId, 'dailyTrips', date);
          await deleteDoc(dateDocRef);
        } catch (deleteError) {
        }
      }

      // Update conductor's total trips count
      await this.updateConductorTripsCount(conductorId);

      
      return {
        success: true,
        message: 'Trip deleted successfully',
        deletedFrom: foundTripId
      };

    } catch (error) {
      console.error('Error deleting trip:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update conductor's total trips count 
  async updateConductorTripsCount(conductorId) {
    try {
      // Use the same logic as getConductorTripsCount
      const totalTrips = await this.getConductorTripsCount(conductorId);

      // Calculate today's trips using same logic
      const today = new Date().toISOString().split('T')[0];
      const todayTrips = await this.getConductorTripsCountForDate(conductorId, today);

      const conductorRef = doc(db, 'conductors', conductorId);
      const updateData = {
        totalTrips: totalTrips,
        todayTrips: todayTrips,
        updatedAt: serverTimestamp()
      };

      await updateDoc(conductorRef, updateData);

      return {
        success: true,
        totalTrips: totalTrips
      };
    } catch (error) {
      console.error('Error updating trips count:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper method to get trip count for a specific date
  async getConductorTripsCountForDate(conductorId, targetDate) {
    try {
      const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
      const dateDoc = doc(dailyTripsRef, targetDate);
      const dateSnapshot = await getDoc(dateDoc);

      if (!dateSnapshot.exists()) {
        return 0;
      }

      const allTrips = [];
      const tripNames = await this.getAllTripNames(conductorId, targetDate);

      for (const tripName of tripNames) {
        try {
          const [ticketsSnapshot, preBookingsSnapshot, preTickets] = await Promise.all([
            getDocs(collection(db, 'conductors', conductorId, 'dailyTrips', targetDate, tripName, 'tickets', 'tickets')),
            getDocs(collection(db, 'conductors', conductorId, 'dailyTrips', targetDate, tripName, 'preBookings', 'preBookings')),
            this.fetchPreTickets(conductorId, targetDate, tripName)
          ]);

          // Add each ticket, prebooking, and pre-ticket as trip objects
          ticketsSnapshot.docs.forEach(() => {
            allTrips.push({
              conductorId: conductorId,
              tripId: tripName,
              date: targetDate
            });
          });

          preBookingsSnapshot.docs.forEach((preBookingDoc) => {
            const preBookingData = preBookingDoc.data();
            // Only include pre-bookings that have been scanned/boarded
            if (!preBookingData.scannedAt) {
              return;
            }
            allTrips.push({
              conductorId: conductorId,
              tripId: tripName,
              date: targetDate
            });
          });

          preTickets.forEach(() => {
            allTrips.push({
              conductorId: conductorId,
              tripId: tripName,
              date: targetDate
            });
          });
        } catch (tripError) {
          continue;
        }
      }

      // Count unique trips like daily revenue
      const uniqueTrips = new Set();
      allTrips.forEach(trip => {
        if (trip.conductorId && trip.tripId) {
          const uniqueKey = `${trip.conductorId}_${trip.date}_${trip.tripId}`;
          uniqueTrips.add(uniqueKey);
        }
      });

      return uniqueTrips.size;
    } catch (error) {
      console.error('Error getting trips count for date:', error);
      return 0;
    }
  }

  // Real-time listener for conductors list (uses cache when available)
  setupConductorsListener(callback) {
    // Remove existing conductors listener to prevent duplicates
    this.removeListener('conductors');

    // Clear any existing callback to prevent old ones from firing
    this.currentConductorsCallback = null;

    // If we have cached data, return it immediately
    if (this.conductorsCache && this.isCacheListenerActive) {
      // Store the callback for cache updates AFTER returning cached data
      this.currentConductorsCallback = callback;

      // Return a copy to prevent external modifications
      setTimeout(() => {
        if (this.currentConductorsCallback === callback) {
          callback([...this.conductorsCache]);
        }
      }, 0);

      // Create a proper unsubscribe function
      const unsubscribe = () => {
        if (this.currentConductorsCallback === callback) {
          this.currentConductorsCallback = null;
        }
      };

      // Store the unsubscribe function
      this.listeners.set('conductors', unsubscribe);

      return unsubscribe;
    }

    // If no cache, fetch data using getAllConductors (which will set up caching)
    // Store the callback for future cache updates
    this.currentConductorsCallback = callback;

    this.getAllConductors()
      .then(conductors => {
        if (this.currentConductorsCallback === callback) {
          callback(conductors);
        }
      })
      .catch(error => {
        console.error('Error in cached conductors listener:', error);
        if (this.currentConductorsCallback === callback) {
          callback([]);
        }
      });

    // Create and store cleanup function
    const unsubscribe = () => {
      if (this.currentConductorsCallback === callback) {
        this.currentConductorsCallback = null;
      }
    };

    this.listeners.set('conductors', unsubscribe);
    return unsubscribe;
  }

  //Real-time listener for specific conductor with trips 
  setupConductorDetailsListener(conductorId, callback) {
    // Remove existing listener for this conductor if it exists
    this.removeConductorDetailsListener(conductorId);

    // Check listener limit
    if (this.listeners.size >= this.maxListeners) {
      this.removeAllListeners();
    }

    const conductorRef = doc(db, 'conductors', conductorId);

    const unsubscribe = onSnapshot(conductorRef, async (snapshot) => {
      try {
        if (snapshot.exists()) {
          const conductorData = snapshot.data();


          // Get trips data when conductor data changes
          const { allTrips } = await this.getConductorTrips(conductorId, 10); // Latest 10 trips

          // Use remittance counting logic for trip counts
          const totalTrips = await this.getConductorTripsCount(conductorId);

          // Calculate today trips using existing method
          const today = new Date().toISOString().split('T')[0];
          const todayTrips = await this.getConductorTripsCountForDate(conductorId, today);

          // Fetch complete reservation data if reservationId exists or find by busId
          let enrichedReservationDetails = conductorData.reservationDetails;

          // Try to fetch reservation data
          try {
            let reservationDoc = null;

            // First try: Use reservationId if available
            if (conductorData.reservationId) {
              const reservationRef = doc(db, 'reservations', conductorData.reservationId);
              reservationDoc = await getDoc(reservationRef);
            }

            // Second try: Find reservation by selectedBusIds containing this conductor's ID
            if (!reservationDoc || !reservationDoc.exists()) {
              const reservationsRef = collection(db, 'reservations');
              const reservationQuery = query(
                reservationsRef,
                where('selectedBusIds', 'array-contains', conductorId),
                where('status', 'in', ['confirmed', 'pending', 'receipt_uploaded'])
              );
              const reservationSnap = await getDocs(reservationQuery);

              if (!reservationSnap.empty) {
                // Get the most recent reservation
                reservationDoc = reservationSnap.docs[0];
              }
            }

            // Merge reservation data if found
            if (reservationDoc && reservationDoc.exists()) {
              const reservationData = reservationDoc.data();
              enrichedReservationDetails = {
                ...conductorData.reservationDetails,
                ...reservationData,
                // Ensure we keep the most complete data
                approvedAt: reservationData.approvedAt || conductorData.reservationDetails?.approvedAt,
                approvedBy: reservationData.approvedBy || conductorData.reservationDetails?.approvedBy,
                departureDate: reservationData.departureDate || conductorData.reservationDetails?.departureDate,
                departureTime: reservationData.departureTime || conductorData.reservationDetails?.departureTime,
              };
            }
          } catch (reservationError) {
            console.warn('Could not fetch reservation details:', reservationError);
          }

          // Extract activeTrip direction if available
          let activeTripDirection = 'N/A';
          if (conductorData.activeTrip && typeof conductorData.activeTrip === 'object') {
            activeTripDirection = conductorData.activeTrip.direction || 'N/A';
          }

          callback({
            id: snapshot.id,
            ...conductorData,
            activeTripDirection: activeTripDirection,
            reservationDetails: enrichedReservationDetails,
            trips: allTrips,
            totalTrips: totalTrips,
            todayTrips: todayTrips
          });
        } else {
          callback(null);
        }
      } catch (error) {
        console.error('Error in conductor details listener:', error);
        // Still call callback with basic data if trips fetch fails
        if (snapshot.exists()) {
          const conductorData = snapshot.data();
          callback({
            id: snapshot.id,
            ...conductorData,
            trips: [],
            totalTrips: 0,
            todayTrips: 0
          });
        } else {
          callback(null);
        }
      }
    }, (error) => {
      console.error('Error in conductor details listener:', error);
      callback(null);
    });

    this.listeners.set(`conductor_details_${conductorId}`, unsubscribe);
    return unsubscribe;
  }

  // Get online conductors (excluding deleted ones)
  async getOnlineConductors() {
    try {
      const conductorsRef = collection(db, 'conductors');
      const onlineQuery = query(conductorsRef, where('isOnline', '==', true));
      const snapshot = await getDocs(onlineQuery);
      
      const onlineConductors = [];
      snapshot.docs.forEach(doc => {
        const conductorData = doc.data();
        // Skip deleted conductors
        if (conductorData.status === 'deleted') {
          return;
        }
        onlineConductors.push({
          id: doc.id,
          ...conductorData
        });
      });
      
      return onlineConductors;
    } catch (error) {
      console.error('Error fetching online conductors:', error);
      return [];
    }
  }

  // Search conductors
  async searchConductors(searchTerm) {
    try {
      const conductors = await this.getAllConductors();
      
      return conductors.filter(conductor => 
        conductor.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conductor.route?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conductor.busNumber?.toString().includes(searchTerm) ||
        conductor.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    } catch (error) {
      console.error('Error searching conductors:', error);
      return [];
    }
  }

  //  Method to update conductor location (call this from conductor app)
  async updateConductorLocation(conductorId, locationData) {
    try {
      const conductorRef = doc(db, 'conductors', conductorId);
      
      const updateData = {
        currentLocation: {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          timestamp: serverTimestamp(),
          accuracy: locationData.accuracy || null,
          speed: locationData.speed || null,
          heading: locationData.heading || null
        },
        isOnline: true, // Set online when location is updated
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await updateDoc(conductorRef, updateData);
      
      return {
        success: true,
        message: 'Location updated successfully'
      };
      
    } catch (error) {
      console.error('Error updating conductor location:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Utility functions
  isToday(dateString) {
    const today = new Date().toISOString().split('T')[0];
    const compareDate = new Date(dateString).toISOString().split('T')[0];
    return today === compareDate;
  }

  formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error formatting timestamp:', error);
      return 'Invalid Date';
    }
  }

  getStatusColor(isOnline, lastSeen) {
    if (isOnline) return '#4CAF50'; // Green
    
    if (!lastSeen) return '#757575'; // Gray
    
    const now = new Date();
    const lastSeenDate = lastSeen.toDate ? lastSeen.toDate() : new Date(lastSeen);
    const diffMinutes = (now - lastSeenDate) / (1000 * 60);
    
    if (diffMinutes < 30) return '#FF9800'; // Orange
    return '#F44336'; // Red
  }

  getStatusText(isOnline, lastSeen) {
    if (isOnline) return 'Online';
    
    if (!lastSeen) return 'Never seen';
    
    const now = new Date();
    const lastSeenDate = lastSeen.toDate ? lastSeen.toDate() : new Date(lastSeen);
    const diffMinutes = (now - lastSeenDate) / (1000 * 60);
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${Math.floor(diffMinutes)}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    return `${Math.floor(diffMinutes / 1440)}d ago`;
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
      unsubscribe();
    });
    this.listeners.clear();
  }

  // Specific cleanup methods
  removeConductorDetailsListener(conductorId) {
    this.removeListener(`conductor_details_${conductorId}`);
  }

  removeConductorStatusListener(conductorId) {
    this.removeListener(`conductor_status_${conductorId}`);
  }

  // Mark reservation as completed
  async markReservationAsCompleted(conductorId) {
    try {
      const conductorRef = doc(db, 'conductors', conductorId);
      const conductorDoc = await getDoc(conductorRef);

      if (!conductorDoc.exists()) {
        throw new Error('Conductor not found');
      }

      const conductorData = conductorDoc.data();

      // Get current busAvailabilityStatus (check activeTrip or root level)
      let currentBusStatus;
      if (conductorData.activeTrip && typeof conductorData.activeTrip === 'object' && 'busAvailabilityStatus' in conductorData.activeTrip) {
        currentBusStatus = conductorData.activeTrip.busAvailabilityStatus;
      } else {
        currentBusStatus = conductorData.busAvailabilityStatus;
      }

      // Check if bus is reserved
      if (currentBusStatus !== 'confirmed' && currentBusStatus !== 'reserved') {
        throw new Error('Bus is not currently reserved');
      }

      // Check if reservation date has passed
      const reservationDetails = conductorData.activeTrip?.reservationDetails || conductorData.reservationDetails;
      if (reservationDetails?.travelDate) {
        const travelDate = reservationDetails.travelDate;
        let reservationDate;

        // Handle Firestore Timestamp or string date
        if (travelDate.toDate) {
          reservationDate = travelDate.toDate();
        } else if (typeof travelDate === 'string') {
          reservationDate = new Date(travelDate);
        } else {
          reservationDate = new Date(travelDate);
        }

        // Get current date at midnight for accurate comparison
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        reservationDate.setHours(0, 0, 0, 0);

        // Check if reservation date has passed
        if (reservationDate > today) {
          throw new Error(`Cannot mark as completed. Travel date is ${reservationDate.toLocaleDateString()}. Please wait until after the travel date.`);
        }
      }

      // Build update data - check where busAvailabilityStatus and reservationDetails are located
      const updateData = {
        updatedAt: serverTimestamp()
      };

      // Update busAvailabilityStatus based on its location
      if (conductorData.activeTrip && typeof conductorData.activeTrip === 'object' && 'busAvailabilityStatus' in conductorData.activeTrip) {
        updateData['activeTrip.busAvailabilityStatus'] = 'no-reservation';
      } else {
        updateData.busAvailabilityStatus = 'no-reservation';
      }

      // Update reservationDetails.status based on its location
      if (conductorData.activeTrip && typeof conductorData.activeTrip === 'object' && 'reservationDetails' in conductorData.activeTrip) {
        updateData['activeTrip.reservationDetails.status'] = 'completed';
      } else {
        updateData['reservationDetails.status'] = 'completed';
      }

      await updateDoc(conductorRef, updateData);

      // Update reservation document status to completed
      if (conductorData.reservationId) {
        try {
          const reservationRef = doc(db, 'reservations', conductorData.reservationId);
          const reservationDoc = await getDoc(reservationRef);

          if (reservationDoc.exists()) {
            await updateDoc(reservationRef, {
              status: 'completed',
              completedAt: serverTimestamp(),
              completedBy: 'admin',
              updatedAt: serverTimestamp()
            });
          }
        } catch (reservationError) {
          console.warn('Error updating reservation status:', reservationError);
        }
      }

      // Log the activity
      await logActivity(
        ACTIVITY_TYPES.CONDUCTOR_UPDATE,
        `Reservation marked as completed for conductor: ${conductorData.name || conductorId}`,
        {
          conductorId: conductorId,
          conductorName: conductorData.name,
          plateNumber: conductorData.plateNumber,
          previousStatus: conductorData.busAvailabilityStatus,
          newStatus: 'no-reservation',
          reservationStatus: 'completed',
          reservationId: conductorData.reservationId || null,
          action: 'mark_reservation_completed',
          timestamp: new Date().toISOString()
        }
      );

      return {
        success: true,
        message: 'Reservation marked as completed successfully'
      };

    } catch (error) {
      console.error('Error marking reservation as completed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Extract document ID from email (matches your current logic)
  extractDocumentId(email) {
    return email.split('@')[0].replace(/\./g, '_');
  }

  // Helper function to get coding day from plate number
  getCodingDayFromPlate(plateNumber) {
    if (!plateNumber) return 'Unknown';
    const lastDigit = plateNumber.slice(-1);
    switch (lastDigit) {
      case '1':
      case '2':
        return 'Monday';
      case '3':
      case '4':
        return 'Tuesday';
      case '5':
      case '6':
        return 'Wednesday';
      case '7':
      case '8':
        return 'Thursday';
      case '9':
      case '0':
        return 'Friday';
      default:
        return 'Unknown';
    }
  }

  // Helper function to extract bus number from conductor name
  extractBusNumber(name) {
    if (!name) return 'N/A';
    // Extract number from patterns like "Batangas 2 Conductor" or "Route_123"
    const numberMatch = name.match(/\b(\d+)\b/);
    return numberMatch ? numberMatch[1] : 'N/A';
  }

  // Helper function to get bus availability status
  getBusAvailabilityStatus(conductor) {
    // Return the busAvailabilityStatus from the conductor data
    // The app will handle the filtering logic
    return conductor.busAvailabilityStatus || 'no_reservation';
  }

  // Helper function to get status display info for reservation status
  getStatusDisplayInfo(status) {
    switch (status) {
      case 'pending':
        return { text: 'Pending', class: 'conductor-list-status-pending', color: '#FF9800' };
      case 'confirmed':
        return { text: 'Reserved', class: 'conductor-list-status-confirmed', color: '#F44336' };
      default:
        return { text: 'No reservation yet', class: 'conductor-list-status-no-reservation', color: '#4CAF50' };
    }
  }



  // Delete all trips for a conductor (for fresh start on reactivation)
  async deleteAllConductorTrips(conductorId) {
    try {
      console.log(`Deleting all trips for conductor: ${conductorId}`);
      
      // Get all daily trips dates
      const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
      const datesSnapshot = await getDocs(dailyTripsRef);
      
      if (datesSnapshot.empty) {
        console.log('No trips found to delete');
        return { success: true, deletedDates: 0, deletedTrips: 0 };
      }
      
      let deletedDates = 0;
      let deletedTrips = 0;
      
      // Process each date document
      for (const dateDoc of datesSnapshot.docs) {
        const dateId = dateDoc.id;
        console.log(`Processing date: ${dateId}`);
        
        // Delete all trip subcollections for this date
        const tripNames = ['trip1', 'trip2', 'trip3', 'trip4', 'trip5', 'trip6', 'trip7', 'trip8', 'trip9', 'trip10'];
        
        for (const tripName of tripNames) {
          try {
            // Check if trip exists and delete all tickets
            const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets');
            const ticketsSnapshot = await getDocs(ticketsRef);
            
            if (!ticketsSnapshot.empty) {
              // Delete all ticket documents in this trip
              const deletePromises = ticketsSnapshot.docs.map(ticketDoc => deleteDoc(ticketDoc.ref));
              await Promise.all(deletePromises);
              
              deletedTrips += ticketsSnapshot.docs.length;
              console.log(`Deleted ${ticketsSnapshot.docs.length} tickets from ${dateId}/${tripName}`);
            }
          } catch (tripError) {
            // Trip doesn't exist, continue
            continue;
          }
        }
        
        // Delete the date document itself
        try {
          await deleteDoc(dateDoc.ref);
          deletedDates++;
          console.log(`Deleted date document: ${dateId}`);
        } catch (dateDeleteError) {
          console.warn(`Error deleting date document ${dateId}:`, dateDeleteError);
        }
      }
      
      console.log(`Trip deletion complete. Deleted ${deletedDates} dates with ${deletedTrips} total trips`);
      
      return {
        success: true,
        deletedDates: deletedDates,
        deletedTrips: deletedTrips
      };
      
    } catch (error) {
      console.error('Error deleting all conductor trips:', error);
      return {
        success: false,
        error: error.message,
        deletedDates: 0,
        deletedTrips: 0
      };
    }
  }

  //  Reactivate deleted conductor for re-registration
  async reactivateDeletedConductor(email, conductorData) {
    try {
      // Search for deleted conductor with this original email
      const conductorsRef = collection(db, 'conductors');
      const deletedQuery = query(
        conductorsRef, 
        where('originalEmail', '==', email), 
        where('status', '==', 'deleted')
      );
      const deletedSnapshot = await getDocs(deletedQuery);
      
      if (deletedSnapshot.empty) {
        console.log(`No deleted conductor found with originalEmail: ${email}`);
        return null;
      }
      
      // Get the first deleted conductor document
      const deletedDoc = deletedSnapshot.docs[0];
      const deletedData = deletedDoc.data();
      const conductorDocId = deletedDoc.id;
      
      console.log(`Found deleted conductor: ${conductorDocId}, reactivating...`);
      
      // Reactivate the conductor account by updating the document
      const reactivatedData = {
        uid: deletedData.uid, // Keep the original UID
        busNumber: parseInt(conductorData.busNumber),
        email: email, // Restore original email
        name: conductorData.name, // Use new name from form
        route: conductorData.route, // Use new route from form
        plateNumber: conductorData.plateNumber, // Use new plate number from form
        // password removed for security - only stored in Firebase Auth
        isOnline: false,
        status: "active", // Change from "deleted" to "active"
        createdAt: deletedData.createdAt || serverTimestamp(), // Preserve original creation date
        reactivatedAt: serverTimestamp(), // Mark when it was reactivated
        reactivatedBy: auth.currentUser?.uid || "system", // Track who reactivated
        lastSeen: null,
        currentLocation: null,
        totalTrips: 0, // Reset trip counters
        todayTrips: 0,
        updatedAt: serverTimestamp(),
        // Remove deleted fields
        deletedAt: null,
        deletedBy: null,
        deletedByEmail: null,
        originalEmail: null,
        originalName: null,
        // User role
        userRole: 'conductor'
      };
      
      // Update the existing document
      await updateDoc(doc(db, 'conductors', conductorDocId), reactivatedData);
      
      // Log the reactivation
      await logActivity(
        ACTIVITY_TYPES.CONDUCTOR_CREATE,
        `Reactivated deleted conductor during creation: ${email}`,
        { 
          reactivatedEmail: email,
          reactivatedName: conductorData.name,
          originalUID: deletedData.uid,
          conductorDocId: conductorDocId,
          action: 'conductor_reactivation'
        }
      );
      
      console.log(`Successfully reactivated conductor: ${email}`);
      
      return {
        success: true,
        data: {
          id: conductorDocId,
          uid: deletedData.uid,
          ...reactivatedData
        },
        message: 'Conductor reactivated successfully',
        reactivated: true
      };
      
    } catch (error) {
      console.error('Error reactivating deleted conductor:', error);
      return null;
    }
  }

  // Create new conductor
  async createConductor(formData) {
    try {
      const { busNumber, email, name, route, password, plateNumber } = formData;
      
      // Validate required fields
      if (!busNumber || !email || !name || !route || !password || !plateNumber) {
        throw new Error('All fields are required');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Please enter a valid email address');
      }

      // Validate password length
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      // Check if active conductor already exists (allow deleted conductors to be recreated)
      const documentId = this.extractDocumentId(email);
      const existingConductor = await this.checkActiveConductorExists(documentId);
      if (existingConductor) {
        throw new Error('An active conductor with this email already exists');
      }

      // Create separate Firebase app instance to avoid affecting admin session
      const firebaseConfig = {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDjqLNklma1gr3IOwPxiMO5S38hu8UQ2Fc",
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "it-capstone-6fe19.firebaseapp.com",
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "it-capstone-6fe19",
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "it-capstone-6fe19.firebasestorage.app",
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "183068104612",
        appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:183068104612:web:26109c8ebb28585e265331",
        measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-0MW2KZMGR2"
      };

      // Initialize separate Firebase app for conductor creation
      const conductorApp = initializeApp(firebaseConfig, 'conductor-creation-' + Date.now());
      const conductorAuth = getAuth(conductorApp);
      // Don't use conductorDb - we'll use the main admin's db instance for Firestore writes

      // Create user in Firebase Authentication using separate app
      let userCredential, user;
      
      try {
        userCredential = await createUserWithEmailAndPassword(conductorAuth, email, password);
        user = userCredential.user;
      } catch (authError) {
        if (authError.code === 'auth/email-already-in-use') {
          console.log('Email already in use, attempting to reactivate deleted conductor...');
          
          // Try to reactivate a deleted conductor account
          const reactivatedConductor = await this.reactivateDeletedConductor(email, {
            busNumber,
            name,
            route,
            plateNumber
          });
          
          if (reactivatedConductor) {
            // Successfully reactivated! Clean up and return
            try {
              await conductorApp.delete();
            } catch (cleanupError) {
              // Silent cleanup
            }
            return reactivatedConductor;
          }
          
          // No deleted conductor found, throw helpful error
          throw new Error(
            'This email is already registered in Firebase Authentication. ' +
            'No deleted conductor account was found to reactivate. ' +
            'Please use a different email address or contact an administrator to resolve this manually.'
          );
        }
        throw authError;
      }

      // Update user profile
      await updateProfile(user, {
        displayName: name
      });

      // Create conductor document in Firestore using separate app
      const conductorData = {
        busNumber: parseInt(busNumber),
        email: email,
        name: name,
        route: route,
        plateNumber: plateNumber,
        // password removed for security - only stored in Firebase Auth
        isOnline: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastSeen: null,
        currentLocation: null,
        uid: user.uid, // Link to Firebase Auth user

        // Initialize trip counters
        totalTrips: 0,
        todayTrips: 0,

        // Status tracking
        status: 'offline',

        // Bus availability status for mobile app (initially no reservation)
        busAvailabilityStatus: 'no-reservation', // Initially available for reservation
        codingDay: this.getCodingDayFromPlate(plateNumber), // Calculate from plate number

        // User role
        userRole: 'conductor'
      };

      // Use the main admin's db instance to write with admin permissions
      await setDoc(doc(db, 'conductors', documentId), conductorData);

      // Log the activity
      await logActivity(
        ACTIVITY_TYPES.CONDUCTOR_CREATE,
        `Created new conductor: ${name} (${email})`,
        {
          conductorId: documentId,
          conductorName: name,
          email: email,
          route: route,
          busNumber: busNumber,
          uid: user.uid
        }
      );


      // Clean up the temporary app instance
      try {
        await conductorApp.delete();
      } catch (cleanupError) {
        // Silent cleanup
      }

      return {
        success: true,
        data: {
          id: documentId,
          uid: user.uid,
          ...conductorData
        },
        message: 'Conductor created successfully'
      };

    } catch (error) {
      console.error('Error creating conductor:', error);
      
      // Handle specific Firebase Auth errors
      let errorMessage = 'Failed to create conductor';
      
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'Email address is already registered';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address format';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password should be at least 6 characters';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Please check your internet connection';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many failed attempts. Please try again later';
          break;
        default:
          errorMessage = error.message || 'An unexpected error occurred';
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  // Check if conductor exists
  async checkConductorExists(documentId) {
    try {
      const conductorRef = doc(db, 'conductors', documentId);
      const conductorDoc = await getDoc(conductorRef);
      return conductorDoc.exists();
    } catch (error) {
      console.error('Error checking conductor existence:', error);
      return false;
    }
  }

  // Check if active (non-deleted) conductor exists
  async checkActiveConductorExists(documentId) {
    try {
      const conductorRef = doc(db, 'conductors', documentId);
      const conductorDoc = await getDoc(conductorRef);
      
      if (!conductorDoc.exists()) {
        return false;
      }
      
      const conductorData = conductorDoc.data();
      // Return true only if conductor exists AND is not deleted
      return conductorData.status !== 'deleted';
    } catch (error) {
      console.error('Error checking active conductor existence:', error);
      return false;
    }
  }

  // Update conductor information
  async updateConductor(documentId, updateData) {
    try {
      const conductorRef = doc(db, 'conductors', documentId);

      // Check if conductor exists and get current data for logging
      const conductorDoc = await getDoc(conductorRef);
      if (!conductorDoc.exists()) {
        throw new Error('Conductor not found');
      }

      const currentData = conductorDoc.data();

      const updatedData = {
        ...updateData,
        updatedAt: serverTimestamp()
      };

      // If plateNumber is being updated, recalculate coding day
      if (updateData.plateNumber) {
        updatedData.codingDay = this.getCodingDayFromPlate(updateData.plateNumber);
        // App will handle updating availability status
      }

      await updateDoc(conductorRef, updatedData);

      // Log the activity with details of what was changed
      const changedFields = [];
      Object.keys(updateData).forEach(key => {
        if (currentData[key] !== updateData[key]) {
          changedFields.push(`${key}: "${currentData[key]}" → "${updateData[key]}"`);
        }
      });

      await logActivity(
        ACTIVITY_TYPES.CONDUCTOR_UPDATE,
        `Admin updated conductor: ${currentData.name || documentId}`,
        {
          conductorId: documentId,
          conductorName: currentData.name,
          plateNumber: currentData.plateNumber,
          changes: changedFields,
          updatedFields: Object.keys(updateData),
          timestamp: new Date().toISOString()
        }
      );

      return {
        success: true,
        message: 'Conductor updated successfully'
      };

    } catch (error) {
      console.error('Error updating conductor:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update conductor online status
  async updateConductorStatus(documentId, isOnline) {
    try {
      const conductorRef = doc(db, 'conductors', documentId);

      // Get current conductor data for logging
      const conductorDoc = await getDoc(conductorRef);
      const conductorData = conductorDoc.exists() ? conductorDoc.data() : {};

      const statusUpdate = {
        isOnline: isOnline,
        lastSeen: serverTimestamp(),
        status: isOnline ? 'online' : 'offline',
        updatedAt: serverTimestamp()
      };

      await updateDoc(conductorRef, statusUpdate);

      // Log the activity
      await logActivity(
        ACTIVITY_TYPES.CONDUCTOR_UPDATE,
        `Admin updated conductor status: ${conductorData.name || documentId} is now ${isOnline ? 'online' : 'offline'}`,
        {
          conductorId: documentId,
          conductorName: conductorData.name,
          plateNumber: conductorData.plateNumber,
          previousStatus: conductorData.isOnline ? 'online' : 'offline',
          newStatus: isOnline ? 'online' : 'offline',
          action: 'status_change',
          timestamp: new Date().toISOString()
        }
      );

      return {
        success: true,
        message: 'Status updated successfully'
      };

    } catch (error) {
      console.error('Error updating conductor status:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get conductor by document ID
  async getConductorById(documentId) {
    try {
      const conductorRef = doc(db, 'conductors', documentId);
      const conductorDoc = await getDoc(conductorRef);
      
      if (!conductorDoc.exists()) {
        return {
          success: false,
          error: 'Conductor not found'
        };
      }

      return {
        success: true,
        data: {
          id: conductorDoc.id,
          ...conductorDoc.data()
        }
      };

    } catch (error) {
      console.error('Error fetching conductor:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Validate form data
  validateConductorData(formData) {
    const errors = [];
    
    if (!formData.name || formData.name.trim().length < 2) {
      errors.push('Name must be at least 2 characters long');
    }
    
    if (!formData.email) {
      errors.push('Email is required');
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        errors.push('Please enter a valid email address');
      }
    }
    
    if (!formData.busNumber) {
      errors.push('Bus number is required');
    } else if (isNaN(formData.busNumber) || parseInt(formData.busNumber) <= 0) {
      errors.push('Please enter a valid bus number');
    }
    
    if (!formData.route || formData.route.trim().length < 3) {
      errors.push('Route must be at least 3 characters long');
    }
    
    if (!formData.password) {
      errors.push('Password is required');
    } else if (formData.password.length < 6) {
      errors.push('Password must be at least 6 characters long');
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

 // Handle permission who can delete conductor
  async handleDeleteConductor(conductorId, conductor, userRole, isSuperAdmin) {
    try {
      // Check if user is superadmin with proper privileges
      if (userRole !== 'superadmin' || isSuperAdmin !== true) {
        alert(' Only superadmin users can delete conductors.');
        return { success: false, error: 'Permission denied' };
      }

      // Check if conductor exists
      if (!conductor) {
        alert(' Conductor not found!');
        return { success: false, error: 'Conductor not found' };
      }

      // Show confirmation dialog
      const confirmMessage = `Are you sure you want to delete conductor ${conductor.name}?\n\nThis will permanently delete:\n• Conductor profile\n• Login account (${conductor.email})\n• All conductor data\n\nThis action cannot be undone.`;

      if (!window.confirm(confirmMessage)) {
        return { success: false, cancelled: true };
      }

      // Call the actual delete method
      console.log(`Deleting conductor: ${conductor.name} (${conductor.email})`);
      const result = await this.deleteConductor(conductorId);

      // Show success message
      if (result.success) {
        if (result.authDeleted) {
          alert(`Conductor deleted completely!\n\n• Profile: Deleted\n• Login account: Deleted\n• Email: ${conductor.email}`);
        } else {
          alert(`Conductor profile deleted.\n\nLogin account status: ${result.message || 'See activity logs for details'}`);
        }
      }

      return result;
    } catch (error) {
      console.error('Error in handleDeleteConductor:', error);
      alert(`Error deleting conductor: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Delete conductor (pseudo-delete)
  async deleteConductor(conductorId) {
    try {
      // Get conductor data before deletion for logging
      const conductorRef = doc(db, 'conductors', conductorId);
      const conductorDoc = await getDoc(conductorRef);
      
      let conductorData = null;
      if (conductorDoc.exists()) {
        conductorData = conductorDoc.data();
      }

      if (!conductorData) {
        throw new Error('Conductor not found');
      }

      // Generate a unique deleted email (similar to admin deletion)
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      const deletedEmail = `deleted_${timestamp}_${randomId}@deleted.invalid`;

      // Implement pseudo-delete by modifying the conductor document
      const deletedConductorData = {
        ...conductorData,
        // Change email to deleted format
        email: deletedEmail,
        name: `[DELETED] ${conductorData.name}`,
        status: "deleted",
        
        // Store original data
        originalEmail: conductorData.email,
        originalName: conductorData.name,
        
        // Add deletion metadata
        deletedAt: serverTimestamp(),
        deletedBy: auth.currentUser?.uid || 'unknown',
        deletedByEmail: auth.currentUser?.email || 'unknown',
        
        // Keep all other data intact
        isOnline: false
      };

      // Update the document instead of deleting it
      await updateDoc(conductorRef, deletedConductorData);

      // Delete all trip data for fresh start on reactivation
      let tripDeletionResult = { success: false, deletedDates: 0, deletedTrips: 0 };
      try {
        tripDeletionResult = await this.deleteAllConductorTrips(conductorId);
        console.log(`Deleted all trips for conductor: ${conductorId}`, tripDeletionResult);
      } catch (tripDeletionError) {
        console.warn('Error deleting conductor trips:', tripDeletionError);
        // Continue with deletion even if trip cleanup fails
      }

      // Log the activity
      await logActivity(
        ACTIVITY_TYPES.CONDUCTOR_DELETE,
        `Deleted conductor (pseudo-delete): ${conductorData.name} (${conductorData.email}) - Removed ${tripDeletionResult.deletedTrips} trips from ${tripDeletionResult.deletedDates} dates`,
        {
          conductorId: conductorId,
          conductorName: conductorData.name,
          email: conductorData.email,
          route: conductorData.route,
          busNumber: conductorData.busNumber,
          uid: conductorData.uid,
          deletionType: 'pseudo_delete_with_trips',
          originalEmail: conductorData.email,
          deletedEmail: deletedEmail,
          tripsDeleted: tripDeletionResult.success,
          deletedDates: tripDeletionResult.deletedDates,
          deletedTrips: tripDeletionResult.deletedTrips
        }
      );

      return {
        success: true,
        message: 'Conductor deleted successfully (pseudo-delete)',
        originalEmail: conductorData.email,
        deletedEmail: deletedEmail,
        deletionType: 'pseudo_delete',
        tripsDeleted: tripDeletionResult.success,
        deletedTripsCount: tripDeletionResult.deletedTrips,
        shouldRefreshList: true // Signal UI to refresh
      };

    } catch (error) {
      console.error('Error deleting conductor:', error);
      throw error;
    }
  }

  // Force refresh conductor list (call after deletion if real-time doesn't work)
  async refreshConductorsList() {
    try {
      // Remove and recreate all listeners to force refresh
      this.removeAllListeners();
      
      // Small delay to ensure cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get fresh data
      const conductors = await this.getAllConductors();
      
      return {
        success: true,
        conductors: conductors,
        message: 'Conductor list refreshed successfully'
      };
      
    } catch (error) {
      console.error('Error refreshing conductors list:', error);
      return {
        success: false,
        error: error.message,
        conductors: []
      };
    }
  }

  // NEW: Sync all conductor coding days
  async syncAllConductorStatus() {
    try {
      const conductorsRef = collection(db, 'conductors');
      const snapshot = await getDocs(conductorsRef);

      let updatedCount = 0;
      const updatePromises = [];

      for (const doc of snapshot.docs) {
        const conductorData = doc.data();

        // Skip deleted conductors
        if (conductorData.status === 'deleted') {
          continue;
        }

        if (conductorData.plateNumber) {
          const newCodingDay = this.getCodingDayFromPlate(conductorData.plateNumber);

          // Only update coding day if it has changed
          if (conductorData.codingDay !== newCodingDay) {
            updatePromises.push(
              updateDoc(doc.ref, {
                codingDay: newCodingDay,
                updatedAt: serverTimestamp()
              })
            );
            updatedCount++;
          }
        }
      }

      // Execute all updates in parallel
      await Promise.all(updatePromises);

      // Log the activity
      await logActivity(
        ACTIVITY_TYPES.CONDUCTOR_UPDATE,
        `Admin synchronized coding days for ${updatedCount} conductors`,
        {
          action: 'bulk_coding_day_sync',
          updatedCount: updatedCount,
          totalProcessed: snapshot.docs.length,
          timestamp: new Date().toISOString()
        }
      );

      return {
        success: true,
        message: `Successfully synced coding days for ${updatedCount} conductors`,
        updatedCount
      };

    } catch (error) {
      console.error('Error syncing conductor coding days:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Sync all conductor trip counts (run this to fix existing data)
  async syncAllConductorTripCounts() {
    try {
      console.log('Starting trip count synchronization...');

      const conductorsRef = collection(db, 'conductors');
      const snapshot = await getDocs(conductorsRef);

      let updatedCount = 0;
      const results = [];

      for (const doc of snapshot.docs) {
        const conductorData = doc.data();

        // Skip deleted conductors
        if (conductorData.status === 'deleted') {
          continue;
        }

        const cachedCount = conductorData.totalTrips || 0;
        const actualTripsCount = await this.getConductorTripsCount(doc.id);

        console.log(`${doc.id}: cached=${cachedCount}, actual=${actualTripsCount}`);

        // Update if counts don't match
        if (cachedCount !== actualTripsCount) {
          await this.updateConductorTripsCount(doc.id);
          updatedCount++;
          results.push({
            conductorId: doc.id,
            name: conductorData.name,
            oldCount: cachedCount,
            newCount: actualTripsCount
          });
        }
      }

      console.log('Trip count sync results:', results);

      // Log the activity
      await logActivity(
        ACTIVITY_TYPES.CONDUCTOR_UPDATE,
        `Admin synchronized trip counts for ${updatedCount} conductors`,
        {
          action: 'bulk_trip_count_sync',
          updatedCount: updatedCount,
          totalProcessed: snapshot.docs.length,
          results: results,
          timestamp: new Date().toISOString()
        }
      );

      return {
        success: true,
        message: `Successfully synced trip counts for ${updatedCount} conductors`,
        updatedCount,
        results
      };

    } catch (error) {
      console.error('Error syncing conductor trip counts:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
export const conductorService = new ConductorService();
export default conductorService;