import { 
  collection, 
  getDocs, 
  setDoc,
  serverTimestamp,
  updateDoc,    
  doc, 
  getDoc,
  query,
  orderBy,
  onSnapshot,
  where,
  deleteDoc
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';

import { db, auth } from '/src/firebase/firebase';

class ConductorService {
  constructor() {
    this.listeners = new Map();
    this.maxListeners = 1; // Only allow 1 listener at a time
    this.cleanupOnError = true;
    
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

  // Get all conductors with basic info
  async getAllConductors() {
    try {
      const conductorsRef = collection(db, 'conductors');
      const snapshot = await getDocs(conductorsRef);
      console.log(`👥 Found ${snapshot.docs.length} conductors in database`);
      
      const conductors = [];
      for (const doc of snapshot.docs) {
        const conductorData = doc.data();
        console.log(`👤 Processing conductor: ${doc.id} - Route: ${conductorData.route}`);
        conductors.push({
          id: doc.id,
          ...conductorData,
          tripsCount: await this.getConductorTripsCount(doc.id)
        });
      }
      
      console.log(`✅ Processed ${conductors.length} conductors`);
      return conductors;
    } catch (error) {
      console.error('Error fetching conductors:', error);
      throw error;
    }
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

      return {
        id: conductorDoc.id,
        ...conductorData,
        trips: tripsArray,
        totalTrips: tripsArray.length,
        todayTrips: tripsArray.filter(trip => this.isToday(trip.date)).length
      };
    } catch (error) {
      console.error('Error fetching conductor details:', error);
      throw error;
    }
  }

  // Get conductor trips using new dailyTrips path structure
  async getConductorTrips(conductorId, limit = null) {
    try {
      console.log(`🔍 Fetching trips for conductor: ${conductorId}`);
      const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
      const datesSnapshot = await getDocs(dailyTripsRef);
      console.log(`📅 Found ${datesSnapshot.docs.length} daily trip documents`);
      
      const allTrips = [];
      const availableDates = [];

      for (const dateDoc of datesSnapshot.docs) {
        const dateId = dateDoc.id;
        availableDates.push(dateId);
        console.log(`📅 Processing date: ${dateId}`);

        // Process trip subcollections (trip1, trip2, etc.)
        const tripNames = ['trip1', 'trip2', 'trip3', 'trip4', 'trip5', 'trip6', 'trip7', 'trip8', 'trip9', 'trip10'];
        
        for (const tripName of tripNames) {
          try {
            // Check for tickets in: /conductors/{conductorId}/dailyTrips/{dateId}/{tripName}/tickets/tickets/
            const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets');
            const ticketsSnapshot = await getDocs(ticketsRef);
            
            if (ticketsSnapshot.docs.length > 0) {
              console.log(`🎫 Found ${ticketsSnapshot.docs.length} tickets in ${tripName}/tickets/tickets for date ${dateId}`);
              
              ticketsSnapshot.docs.forEach(ticketDoc => {
                const ticketData = ticketDoc.data();
                console.log(`🎫 Processing ticket: ${ticketDoc.id}`, ticketData);
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
            console.log(`ℹ️ No tickets found for ${tripName} on ${dateId} (this is normal)`);
          }
        }
      }

      console.log(`✅ Total trips found: ${allTrips.length}`);

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

  // Get trips count for a conductor
  async getConductorTripsCount(conductorId) {
    try {
      const { allTrips } = await this.getConductorTrips(conductorId);
      return allTrips.length;
    } catch (error) {
      console.error('Error getting trips count:', error);
      return 0;
    }
  }

  // Get trips for a specific date using new dailyTrips path structure
  async getConductorTripsByDate(conductorId, date) {
    try {
      console.log(`🔍 Fetching trips for conductor: ${conductorId} on date: ${date}`);
      const trips = [];
      
      // Process trip subcollections (trip1, trip2, etc.)
      const tripNames = ['trip1', 'trip2', 'trip3', 'trip4', 'trip5', 'trip6', 'trip7', 'trip8', 'trip9', 'trip10'];
      
      for (const tripName of tripNames) {
        try {
          // Check for tickets in: /conductors/{conductorId}/dailyTrips/{date}/{tripName}/tickets/tickets/
          const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', date, tripName, 'tickets', 'tickets');
          const ticketsSnapshot = await getDocs(ticketsRef);
          
          if (ticketsSnapshot.docs.length > 0) {
            console.log(`🎫 Found ${ticketsSnapshot.docs.length} tickets in ${tripName}/tickets/tickets for date ${date}`);
            
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
          console.log(`ℹ️ No tickets found for ${tripName} on ${date} (this is normal)`);
        }
      }
      
      console.log(`✅ Total trips found for ${date}: ${trips.length}`);
      return trips;
    } catch (error) {
      console.error('Error fetching trips by date:', error);
      return [];
    }
  }

  // NEW: Delete a specific trip using new dailyTrips path structure
  async deleteTrip(conductorId, date, ticketNumber, tripId = null) {
    try {
      // Validate parameters
      if (!conductorId || !date || !ticketNumber) {
        throw new Error('Missing required parameters: conductorId, date, or ticketNumber');
      }

      console.log(`🗑️ Attempting to delete trip: ${conductorId}/${date}/${ticketNumber}`);
      
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
              console.log(`✅ Found ticket in ${tripName}/tickets/tickets`);
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
      console.log(`✅ Deleted ticket: ${ticketNumber} from ${foundTripId}`);

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
          console.log(`🗑️ Deleted empty date document: ${date}`);
        } catch (deleteError) {
          console.warn('Could not delete date document:', deleteError);
        }
      }

      // Update conductor's total trips count
      await this.updateConductorTripsCount(conductorId);

      console.log(`✅ Trip deleted successfully: ${conductorId}/${date}/${foundTripId}/${ticketNumber}`);
      
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

  // NEW: Update conductor's total trips count after deletion
  async updateConductorTripsCount(conductorId) {
    try {
      const { allTrips } = await this.getConductorTrips(conductorId);
      const conductorRef = doc(db, 'conductors', conductorId);
      
      const updateData = {
        totalTrips: allTrips.length,
        todayTrips: allTrips.filter(trip => this.isToday(trip.date)).length,
        updatedAt: serverTimestamp()
      };

      await updateDoc(conductorRef, updateData);
      
      return {
        success: true,
        totalTrips: allTrips.length
      };
    } catch (error) {
      console.error('Error updating trips count:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // FIXED: Real-time listener for conductors list with accurate trip counts
  setupConductorsListener(callback) {
    // Force cleanup before creating new listener
    this.removeAllListeners();
    
    // Initialize global listener tracking if not exists
    if (!window.firestoreListeners) {
      window.firestoreListeners = [];
    }

    const conductorsRef = collection(db, 'conductors');
    
    const unsubscribe = onSnapshot(conductorsRef, async (snapshot) => {
      try {
        const conductors = [];
        
        // Process conductors in parallel for better performance
        const conductorPromises = snapshot.docs.map(async (doc) => {
          try {
            const conductorData = doc.data();
            
            // Get actual trip count by fetching trips collection
            const actualTripsCount = await this.getConductorTripsCount(doc.id);
            
            // If cached count doesn't match actual count, update it
            if (conductorData.totalTrips !== actualTripsCount) {
              await this.updateConductorTripsCount(doc.id);
            }
            
            return {
              id: doc.id,
              ...conductorData,
              tripsCount: actualTripsCount // Use actual trips count
            };
          } catch (error) {
            console.error(`Error processing conductor ${doc.id}:`, error);
            return {
              id: doc.id,
              ...doc.data(),
              tripsCount: 0
            };
          }
        });
        
        const results = await Promise.allSettled(conductorPromises);
        
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            conductors.push(result.value);
          }
        });
        
        callback(conductors);
      } catch (error) {
        console.error('Error in conductors listener:', error);
        callback([]);
      }
    }, (error) => {
      console.error('Error setting up conductors listener:', error);
      
      // Clean up all listeners on error
      if (this.cleanupOnError) {
        console.warn('Cleaning up all listeners due to error...');
        this.removeAllListeners();
      }
      
      callback([]);
    });
    
    this.listeners.set('conductors', unsubscribe);
    
    // Also track globally
    window.firestoreListeners.push(unsubscribe);
    
    return unsubscribe;
  }

  // FIXED: Real-time listener for specific conductor with trips
  setupConductorDetailsListener(conductorId, callback) {
    // Remove existing listener for this conductor if it exists
    this.removeConductorDetailsListener(conductorId);
    
    // Check listener limit
    if (this.listeners.size >= this.maxListeners) {
      console.warn('Too many listeners. Cleaning up old ones...');
      this.removeAllListeners();
    }

    const conductorRef = doc(db, 'conductors', conductorId);
    
    const unsubscribe = onSnapshot(conductorRef, async (doc) => {
      try {
        if (doc.exists()) {
          const conductorData = doc.data();
          
          // Get trips data when conductor data changes
          const { allTrips } = await this.getConductorTrips(conductorId, 10); // Latest 10 trips
          
          callback({
            id: doc.id,
            ...conductorData,
            trips: allTrips, // ✅ FIXED: Use allTrips instead of undefined 'trips'
            totalTrips: allTrips.length,
            todayTrips: allTrips.filter(trip => this.isToday(trip.date)).length
          });
        } else {
          callback(null);
        }
      } catch (error) {
        console.error('Error in conductor details listener:', error);
        // Still call callback with basic data if trips fetch fails
        if (doc.exists()) {
          const conductorData = doc.data();
          callback({
            id: doc.id,
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

  // NEW: Lightweight listener for conductor status only (for location page)
  setupConductorStatusListener(conductorId, callback) {
    const conductorRef = doc(db, 'conductors', conductorId);
    
    const unsubscribe = onSnapshot(conductorRef, (doc) => {
      try {
        if (doc.exists()) {
          const data = doc.data();
          
          // Return essential data for status monitoring
          callback({
            id: doc.id,
            name: data.name,
            email: data.email,
            route: data.route,
            busNumber: data.busNumber,
            isOnline: data.isOnline,
            status: data.status,
            lastSeen: data.lastSeen,
            currentLocation: data.currentLocation,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
          });
        } else {
          console.warn(`Conductor ${conductorId} not found`);
          callback(null);
        }
      } catch (error) {
        console.error('Error in conductor status listener:', error);
        callback(null);
      }
    }, (error) => {
      console.error('Error setting up conductor status listener:', error);
      callback(null);
    });
    
    this.listeners.set(`conductor_status_${conductorId}`, unsubscribe);
    return unsubscribe;
  }

  // Get online conductors
  async getOnlineConductors() {
    try {
      const conductorsRef = collection(db, 'conductors');
      const onlineQuery = query(conductorsRef, where('isOnline', '==', true));
      const snapshot = await getDocs(onlineQuery);
      
      const onlineConductors = [];
      snapshot.docs.forEach(doc => {
        onlineConductors.push({
          id: doc.id,
          ...doc.data()
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

  // NEW: Method to update conductor location (call this from conductor app)
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

  // Get trips without setting up listeners (for modal view) using new dailyTrips path structure
  async getConductorTripsSimple(conductorId, limit = null) {
    try {
      console.log(`🔍 Fetching simple trips for conductor: ${conductorId}`);
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

      console.log(`✅ Simple fetch completed. Total trips: ${allTrips.length}`);

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
  
  // Extract document ID from email (matches your current logic)
  extractDocumentId(email) {
    return email.split('@')[0].replace(/\./g, '_');
  }

  // Create new conductor (matches your current implementation but with improvements)
  async createConductor(formData) {
    try {
      const { busNumber, email, name, route, password } = formData;
      
      // Validate required fields
      if (!busNumber || !email || !name || !route || !password) {
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

      // Check if conductor already exists
      const documentId = this.extractDocumentId(email);
      const existingConductor = await this.checkConductorExists(documentId);
      if (existingConductor) {
        throw new Error('A conductor with this email already exists');
      }

      // Step 1: Create user in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Step 2: Update user profile
      await updateProfile(user, {
        displayName: name
      });

      // Step 3: Create conductor document in Firestore
      const conductorData = {
        busNumber: parseInt(busNumber),
        email: email,
        name: name,
        route: route,
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
        status: 'offline'
      };

      await setDoc(doc(db, 'conductors', documentId), conductorData);

      console.log('Conductor created successfully:', {
        documentId: documentId,
        uid: user.uid,
        email: email
      });

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

  // Update conductor information
  async updateConductor(documentId, updateData) {
    try {
      const conductorRef = doc(db, 'conductors', documentId);
      
      // Check if conductor exists
      const exists = await this.checkConductorExists(documentId);
      if (!exists) {
        throw new Error('Conductor not found');
      }

      const updatedData = {
        ...updateData,
        updatedAt: serverTimestamp()
      };

      await updateDoc(conductorRef, updatedData);

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
      
      const statusUpdate = {
        isOnline: isOnline,
        lastSeen: serverTimestamp(),
        status: isOnline ? 'online' : 'offline',
        updatedAt: serverTimestamp()
      };

      await updateDoc(conductorRef, statusUpdate);

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

  async deleteConductor(conductorId) {
    try {
      await deleteDoc(doc(db, 'conductors', conductorId));
      console.log('Deleted conductor:', conductorId);
    } catch (error) {
      console.error('Error deleting conductor:', error);
      throw error;
    }
  }

  // NEW: Create conductor with Firebase Auth user
  async createConductorWithAuth(formData) {
    try {
      const { busNumber, email, name, route, password } = formData;
      
      // Store current admin user
      const currentAdmin = auth.currentUser;
      const adminEmail = currentAdmin?.email;
      
      // Create Firebase Authentication user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const conductorUser = userCredential.user;
      
      // Extract document ID from email
      const documentId = this.extractDocumentId(email);
      
      // Create conductor document in Firestore
      const conductorData = {
        busNumber: parseInt(busNumber),
        email: email,
        name: name,
        route: route,
        isOnline: false,
        createdAt: serverTimestamp(),
        lastSeen: null,
        currentLocation: null,
        uid: conductorUser.uid,
        totalTrips: 0,
        todayTrips: 0,
        status: 'offline'
      };
      
      await setDoc(doc(db, 'conductors', documentId), conductorData);
      
      // Sign out the conductor immediately
      await auth.signOut();
      
      // Re-authenticate as admin using stored credentials
      // Note: You'll need to store admin password securely or handle this differently
      console.log('Conductor created successfully. Please sign back in as admin.');
      
      return {
        success: true,
        message: 'Conductor created successfully',
        conductorId: documentId,
        uid: conductorUser.uid,
        requiresAdminReauth: true,
        adminEmail: adminEmail
      };
      
    } catch (error) {
      console.error('Error creating conductor with auth:', error);
      throw error;
    }
  }

  // NEW: Create conductor document only (no Firebase Auth)
  async createConductorDocument(documentId, conductorData) {
    try {
      const conductorRef = doc(db, 'conductors', documentId);
      await setDoc(conductorRef, conductorData);
      
      return {
        success: true,
        message: 'Conductor document created successfully'
      };
    } catch (error) {
      console.error('Error creating conductor document:', error);
      throw error;
    }
  }

  // NEW: Sync all conductor trip counts (run this to fix existing data)
  async syncAllConductorTripCounts() {
    try {
      console.log('Starting sync of all conductor trip counts...');
      
      const conductorsRef = collection(db, 'conductors');
      const snapshot = await getDocs(conductorsRef);
      
      let updatedCount = 0;
      const updatePromises = [];
      
      for (const doc of snapshot.docs) {
        const conductorData = doc.data();
        const actualTripsCount = await this.getConductorTripsCount(doc.id);
        
        // Only update if counts don't match
        if (conductorData.totalTrips !== actualTripsCount) {
          console.log(`Updating trips count for ${conductorData.name}: ${conductorData.totalTrips || 0} -> ${actualTripsCount}`);
          updatePromises.push(this.updateConductorTripsCount(doc.id));
          updatedCount++;
        }
      }
      
      // Execute all updates in parallel
      await Promise.all(updatePromises);
      
      console.log(`Sync completed. Updated ${updatedCount} conductors.`);
      
      return {
        success: true,
        message: `Successfully synced trip counts for ${updatedCount} conductors`,
        updatedCount
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