import { getDocs, collection, doc, getDoc, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '/src/firebase/firebase.js';

class DashboardService {
  constructor() {
    this.listeners = new Map();
    this.maxListeners = 10;
    this.cleanupOnError = true;

    // IN-MEMORY CACHE SYSTEM
    this.dashboardCache = {
      conductors: null,
      users: null,
      sos: null,
      fullDashboardData: null // Cache the complete dashboard response
    };
    this.lastFetchTime = null;
    this.isCacheListenerActive = false;
    this.cacheVersion = 1;
    this.currentFilter = null;
    this.currentCustomDate = null;

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
  // Helper function to get all trip names from date document maps
  async getAllTripNames(conductorId, dateId) {
    try {
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
  }

  // Helper function to fetch prebooking tickets 
  async fetchPreBookingTickets(conductorId, dateId, tripName) {
    try {
      const preBookingsPath = `conductors/${conductorId}/dailyTrips/${dateId}/${tripName}/preBookings/preBookings`;
      const preBookingsRef = collection(db, preBookingsPath);
      const preBookingsSnapshot = await getDocs(preBookingsRef);

      const preBookingTickets = [];

      for (const preBookingDoc of preBookingsSnapshot.docs) {
        const preBookingData = preBookingDoc.data();

        // Only include pre-bookings that have been scanned/boarded
        if (!preBookingData.scannedAt) {
          continue;
        }

        preBookingTickets.push({
          id: preBookingDoc.id,
          totalFare: preBookingData.totalFare || 0,
          quantity: preBookingData.quantity || 0,
          from: preBookingData.from || '',
          to: preBookingData.to || '',
          documentType: 'preBooking',
          ticketType: 'preBooking'
        });
      }

      return preBookingTickets;
    } catch (error) {
      return [];
    }
  }

  // Helper function to fetch pre-ticket tickets
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

  async getTripSummary(filter = 'today', customDate = null) {
    try {
      // Get all conductors first (same pattern as ticketing.js)
      const conductorsRef = collection(db, 'conductors');
      const conductorsSnapshot = await getDocs(conductorsRef);

      if (conductorsSnapshot.empty) {
        return {
          totalTrips: 0,
          totalFare: 0,
          avgPassengers: 0,
          mostCommonRoute: 'No conductors found'
        };
      }

      let totalTickets = 0;
      let totalFare = 0;
      let totalPassengers = 0;
      let totalTrips = 0;
      const routeFrequency = {};

      const today = new Date().toLocaleDateString('en-CA');
      const selectedDate = customDate || today;

      // Process each conductor's tickets 
      for (const conductorDoc of conductorsSnapshot.docs) {
        const conductorId = conductorDoc.id;
        
        // Get all daily trips for this conductor
        const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
        const dailyTripsSnapshot = await getDocs(dailyTripsRef);
        
        for (const dateDoc of dailyTripsSnapshot.docs) {
          const dateId = dateDoc.id;
          
          // Apply date filter
          if (filter === 'today' && dateId !== today) {
            continue;
          }
          if (filter === 'custom' && dateId !== selectedDate) {
            continue;
          }
          
          // Get all trip names for this date
          const tripNames = await this.getAllTripNames(conductorId, dateId);
          
          for (const tripName of tripNames) {
            try {
              // Fetch regular tickets, prebookings, and pre-tickets in parallel (like daily revenue)
              const [ticketsSnapshot, preBookingTickets, preTickets] = await Promise.all([
                getDocs(collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets')),
                this.fetchPreBookingTickets(conductorId, dateId, tripName),
                this.fetchPreTickets(conductorId, dateId, tripName)
              ]);

              // Count trip if it has regular tickets, prebookings, OR pre-tickets
              if (ticketsSnapshot.docs.length > 0 || preBookingTickets.length > 0 || preTickets.length > 0) {
                totalTrips++;
              }

              // Process regular tickets (skip prebookings and pre-tickets from regular path to avoid duplication)
              ticketsSnapshot.forEach(ticketDoc => {
                const data = ticketDoc.data();

                // Skip prebooking and pre-ticket tickets from regular path to avoid duplication
                if (data.documentType === 'preBooking' || data.ticketType === 'preBooking') {
                  return;
                }
                if (data.documentType === 'preTicket' || data.ticketType === 'preTicket') {
                  return;
                }

                // Only process tickets with valid fare and quantity
                if (data.totalFare && data.quantity) {
                  totalTickets++;

                  // Convert totalFare to number in case it's stored as string
                  const fareValue = parseFloat(data.totalFare);
                  totalFare += fareValue;
                  totalPassengers += data.quantity || 0;

                  const routeKey = `${data.from || 'Unknown'} → ${data.to || 'Unknown'}`;
                  routeFrequency[routeKey] = (routeFrequency[routeKey] || 0) + 1;
                }
              });

              // Process prebooking tickets from dedicated path
              preBookingTickets.forEach(preBooking => {
                // Only process prebookings with valid fare and quantity
                if (preBooking.totalFare && preBooking.quantity) {
                  totalTickets++;

                  // Convert totalFare to number in case it's stored as string
                  const fareValue = parseFloat(preBooking.totalFare);
                  totalFare += fareValue;
                  totalPassengers += preBooking.quantity || 0;

                  const routeKey = `${preBooking.from || 'Unknown'} → ${preBooking.to || 'Unknown'}`;
                  routeFrequency[routeKey] = (routeFrequency[routeKey] || 0) + 1;
                }
              });

              // Process pre-ticket tickets from dedicated path
              preTickets.forEach(preTicket => {
                // Only process pre-tickets with valid fare and quantity
                if (preTicket.totalFare && preTicket.quantity) {
                  totalTickets++;

                  // Convert totalFare to number in case it's stored as string
                  const fareValue = parseFloat(preTicket.totalFare);
                  totalFare += fareValue;
                  totalPassengers += preTicket.quantity || 0;

                  const routeKey = `${preTicket.from || 'Unknown'} → ${preTicket.to || 'Unknown'}`;
                  routeFrequency[routeKey] = (routeFrequency[routeKey] || 0) + 1;
                }
              });
            } catch (error) {
              // Normal - not all trips will have tickets
              continue;
            }
          }
        }
      }

      const mostCommonRoute = Object.entries(routeFrequency)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

      const avgPassengers = totalTrips === 0 ? 0 : (totalPassengers / totalTrips).toFixed(2);

      const result = {
        totalTrips: totalTrips,
        totalFare,
        avgPassengers,
        mostCommonRoute,
        // Additional breakdown for debugging
        breakdown: {
          actualTrips: totalTrips,
          totalTickets: totalTickets,
          conductorsProcessed: conductorsSnapshot.docs.length
        }
      };

      return result;

    } catch (error) {
      throw error;
    }
  }

   async getSOSRequestSummary(filter = 'today', customDate = null) {
    try {
      // FAST PATH: Return cached data immediately if available
      if (this.dashboardCache.sos && this.isCacheListenerActive) {
        return this.processSOSRequestSummary(this.dashboardCache.sos, filter, customDate);
      }

      // SLOW PATH: First time or cache invalidated - fetch everything
      const snapshot = await getDocs(collection(db, 'sosRequests'));

      if (snapshot.empty) {
        return {
          totalRequests: 0,
          pendingRequests: 0,
          receivedRequests: 0,
          cancelledRequests: 0,
          completedRequests: 0,
          recentRequests: []
        };
      }

      const sosData = [];
      snapshot.forEach(doc => {
        sosData.push({ id: doc.id, ...doc.data() });
      });

      // Save to cache
      this.dashboardCache.sos = sosData;
      this.lastFetchTime = Date.now();

      // Start listening for real-time changes
      this.startSOSCacheListener();

      return this.processSOSRequestSummary(sosData, filter, customDate);
    } catch (error) {
      throw error;
    }
  }

  // Helper to process SOS data into summary
  processSOSRequestSummary(sosData, filter = 'today', customDate = null) {
    if (!sosData || sosData.length === 0) {
      return {
        totalRequests: 0,
        pendingRequests: 0,
        receivedRequests: 0,
        cancelledRequests: 0,
        completedRequests: 0,
        recentRequests: []
      };
    }

    let totalRequests = 0;
    let pendingRequests = 0;
    let receivedRequests = 0;
    let cancelledRequests = 0;
    let completedRequests = 0;
    const recentRequests = [];

    const today = new Date().toLocaleDateString('en-CA');
    const selectedDate = customDate || today;

    sosData.forEach(sosRequest => {
      const data = sosRequest;

        const dateField = data.timestamp || data.createdAt || data.requestedAt;
        if (!dateField) {
          return;
        }

        let requestDate;
        if (dateField.toDate) {
          requestDate = dateField.toDate().toLocaleDateString('en-CA');
        } else if (dateField instanceof Date) {
          requestDate = dateField.toLocaleDateString('en-CA');
        } else {
          return;
        }

        if (filter === 'today' && requestDate !== today) {
          return;
        }
        if (filter === 'custom' && requestDate !== selectedDate) {
          return;
        }

        totalRequests++;

        const status = data.status || data.requestStatus || 'unknown';
        switch (status.toLowerCase()) {
          case 'pending':
          case 'waiting':
            pendingRequests++;
            break;
          case 'received':
          case 'active':
            receivedRequests++;
            break;
          case 'cancelled':
          case 'canceled':
            cancelledRequests++;
            break;
          case 'completed':
          case 'resolved':
            completedRequests++;
            break;
        }

        // Add to recent requests based on filter (not just today)
        let addToRecent = false;
        if (filter === 'today' && requestDate === today) {
          addToRecent = true;
        } else if (filter === 'custom' && requestDate === selectedDate) {
          addToRecent = true;
        } else if (filter === 'all') {
          addToRecent = true;
        }

        if (addToRecent) {
          // Format location properly
          let locationText = 'Unknown location';
          if (data.location && typeof data.location === 'object') {
            if (data.location.lat !== undefined && data.location.lng !== undefined) {
              if (data.location.lat === 0 && data.location.lng === 0) {
                locationText = 'No location';
              } else {
                locationText = `${data.location.lat}, ${data.location.lng}`;
              }
            }
          } else if (data.location && typeof data.location === 'string') {
            locationText = data.location;
          } else if (data.address) {
            locationText = data.address;
          }

          recentRequests.push({
            id: data.id,
            status: status,
            timestamp: dateField,
            location: locationText,
            passengerName: data.passengerName || data.name || 'Unknown',
            message: data.message || data.description || ''
          });
        }
    });

    // Sort recent requests by timestamp (newest first)
    recentRequests.sort((a, b) => {
      const timeA = a.timestamp.toDate ? a.timestamp.toDate() : a.timestamp;
      const timeB = b.timestamp.toDate ? b.timestamp.toDate() : b.timestamp;
      return timeB - timeA;
    });

    return {
      totalRequests,
      pendingRequests,
      receivedRequests,
      cancelledRequests,
      completedRequests,
      recentRequests: recentRequests.slice(0, 5) // Show only 5 most recent
    };
  }

  // CACHED: Get conductors summary with caching
  async getConductorsSummary() {
    try {
      // FAST PATH: Return cached data immediately if available
      if (this.dashboardCache.conductors && this.isCacheListenerActive) {
        return this.processConductorsSummary(this.dashboardCache.conductors);
      }

      // SLOW PATH: First time or cache invalidated - fetch everything
      const conductorsRef = collection(db, 'conductors');
      const snapshot = await getDocs(conductorsRef);

      const conductorsData = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        // Skip deleted conductors
        if (data.status !== 'deleted') {
          conductorsData.push({ id: doc.id, ...data });
        }
      });

      // Save to cache
      this.dashboardCache.conductors = conductorsData;
      this.lastFetchTime = Date.now();

      // Start listening for real-time changes
      this.startConductorsCacheListener();

      return this.processConductorsSummary(conductorsData);
    } catch (error) {
      throw error;
    }
  }

  // Helper to process conductors data into summary
  processConductorsSummary(conductorsData) {
    if (!conductorsData || conductorsData.length === 0) {
      return {
        totalConductors: 0,
        onlineConductors: 0,
        offlineConductors: 0,
        onlinePercentage: 0
      };
    }

    let totalConductors = 0;
    let onlineConductors = 0;

    conductorsData.forEach(conductor => {
      totalConductors++;
      if (conductor.isOnline) {
        onlineConductors++;
      }
    });

    const offlineConductors = totalConductors - onlineConductors;
    const onlinePercentage = totalConductors === 0 ? 0 : ((onlineConductors / totalConductors) * 100).toFixed(1);

    return {
      totalConductors,
      onlineConductors,
      offlineConductors,
      onlinePercentage
    };
  }

  //  Get ID verification summary with caching
  async getIDVerificationSummary() {
    try {
      // Return cached data immediately if available
      if (this.dashboardCache.users && this.isCacheListenerActive) {
        return this.processIDVerificationSummary(this.dashboardCache.users);
      }

      //  First time or cache invalidated - fetch everything
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);

      const usersData = [];
      for (const userDoc of snapshot.docs) {
        const userData = { id: userDoc.id, ...userDoc.data() };

        try {
          const idDocRef = doc(db, 'users', userDoc.id, 'VerifyID', 'id');
          const idSnapshot = await getDoc(idDocRef);

          if (idSnapshot.exists()) {
            userData.idVerificationData = idSnapshot.data();
          }
        } catch (error) {
          // No ID verification data
        }

        usersData.push(userData);
      }

      // Save to cache
      this.dashboardCache.users = usersData;
      this.lastFetchTime = Date.now();

      // Start listening for real-time changes
      this.startUsersCacheListener();

      return this.processIDVerificationSummary(usersData);
    } catch (error) {
      throw error;
    }
  }

  // Helper to process users data into ID verification summary
  //  Only counts users who have uploaded IDs 
  processIDVerificationSummary(usersData) {
    if (!usersData || usersData.length === 0) {
      return {
        totalUsers: 0,
        pendingVerifications: 0,
        verifiedUsers: 0,
        verificationRate: 0
      };
    }

    let totalUsers = 0; // Only users with uploaded IDs
    let pendingVerifications = 0;
    let verifiedUsers = 0;

    usersData.forEach(user => {
      // Only count users who have uploaded an ID 
      if (user.idVerificationData) {
        totalUsers++;

        const status = user.idVerificationData.status || 'pending';
        if (status === 'verified') {
          verifiedUsers++;
        } else if (status === 'pending') {
          pendingVerifications++;
        }
      }
      // Users without idVerificationData are not counted at all
    });

    const verificationRate = totalUsers === 0 ? 0 : ((verifiedUsers / totalUsers) * 100).toFixed(1);

    return {
      totalUsers, // Only users with uploaded IDs
      pendingVerifications,
      verifiedUsers,
      verificationRate
    };
  }

  async getRevenueTrend() {
    try {
      const today = new Date();
      const revenueTrend = [];
      
      // Get revenue for the past 7 days
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateString = date.toLocaleDateString('en-CA');
        
        let dayRevenue = 0;
        let dayTrips = 0;
        
        // Get all conductors
        const conductorsRef = collection(db, 'conductors');
        const conductorsSnapshot = await getDocs(conductorsRef);
        
        for (const conductorDoc of conductorsSnapshot.docs) {
          const conductorId = conductorDoc.id;
          
          // Get daily trips for this conductor and date
          const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
          const dailyTripsSnapshot = await getDocs(dailyTripsRef);
          
          for (const dateDoc of dailyTripsSnapshot.docs) {
            const dateId = dateDoc.id;
            
            // Only process if it matches our target date
            if (dateId === dateString) {
              // Get all trip names for this date
              const tripNames = await this.getAllTripNames(conductorId, dateId);
              
              for (const tripName of tripNames) {
                try {
                  // Fetch regular tickets, prebookings, and pre-tickets in parallel
                  const [ticketsSnapshot, preBookingTickets, preTickets] = await Promise.all([
                    getDocs(collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets')),
                    this.fetchPreBookingTickets(conductorId, dateId, tripName),
                    this.fetchPreTickets(conductorId, dateId, tripName)
                  ]);

                  // Count trip if it has regular tickets, prebookings, OR pre-tickets
                  if (ticketsSnapshot.docs.length > 0 || preBookingTickets.length > 0 || preTickets.length > 0) {
                    dayTrips++;
                  }

                  // Process regular tickets (skip prebookings and pre-tickets from regular path to avoid duplication)
                  ticketsSnapshot.forEach(ticketDoc => {
                    const data = ticketDoc.data();

                    // Skip prebooking and pre-ticket tickets from regular path to avoid duplication
                    if (data.documentType === 'preBooking' || data.ticketType === 'preBooking') {
                      return;
                    }
                    if (data.documentType === 'preTicket' || data.ticketType === 'preTicket') {
                      return;
                    }

                    if (data.totalFare && data.quantity) {
                      const fareValue = parseFloat(data.totalFare);
                      dayRevenue += fareValue;
                    }
                  });

                  // Process prebooking tickets from dedicated path
                  preBookingTickets.forEach(preBooking => {
                    if (preBooking.totalFare && preBooking.quantity) {
                      const fareValue = parseFloat(preBooking.totalFare);
                      dayRevenue += fareValue;
                    }
                  });

                  // Process pre-ticket tickets from dedicated path
                  preTickets.forEach(preTicket => {
                    if (preTicket.totalFare && preTicket.quantity) {
                      const fareValue = parseFloat(preTicket.totalFare);
                      dayRevenue += fareValue;
                    }
                  });
                } catch (error) {
                  // Normal - not all trips will have tickets
                  continue;
                }
              }
            }
          }
        }
        
        revenueTrend.push({
          date: dateString,
          day: date.toLocaleDateString('en-US', { weekday: 'short' }),
          revenue: dayRevenue,
          trips: dayTrips
        });
      }
      
      return revenueTrend;
    } catch (error) {
      console.error('Error fetching revenue trend:', error);
      throw error;
    }
  }

  async getBusReservationsSummary() {
    try {
      const conductorsRef = collection(db, 'conductors');
      const conductorsSnapshot = await getDocs(conductorsRef);

      let totalReserved = 0;
      let completedCount = 0;
      let reservedCount = 0;
      let cancelledCount = 0;
      let pendingCount = 0;
      let noReservationCount = 0;

      conductorsSnapshot.forEach(doc => {
        const data = doc.data();
        const status = data.busAvailabilityStatus;

        // Count by status
        if (status === 'confirmed' || status === 'reserved') {
          totalReserved++;
          reservedCount++;
        } else if (status === 'completed') {
          completedCount++;
        } else if (status === 'cancelled') {
          cancelledCount++;
        } else if (status === 'pending') {
          pendingCount++;
        } else if (status === 'no-reservation' || !status) {
          noReservationCount++;
        }
      });

      return {
        totalReserved,
        completedCount,
        reservedCount,
        cancelledCount,
        pendingCount,
        noReservationCount,
        totalBuses: conductorsSnapshot.size
      };
    } catch (error) {
      console.error('Error fetching bus reservations summary:', error);
      return {
        totalReserved: 0,
        completedCount: 0,
        reservedCount: 0,
        cancelledCount: 0,
        pendingCount: 0,
        noReservationCount: 0,
        totalBuses: 0
      };
    }
  }

  // Start real-time cache updates listener for conductors
  startConductorsCacheListener() {
    if (this.listeners.has('conductors_cache_listener')) {
      return; // Don't create duplicate listeners
    }

    const conductorsRef = collection(db, 'conductors');

    const unsubscribe = onSnapshot(conductorsRef, (snapshot) => {
      if (!this.dashboardCache.conductors) {
        return; // No cache to update
      }

      let hasChanges = false;
      const changes = snapshot.docChanges();

      if (changes.length === 0) {
        return;
      }

      // Check if this is the initial snapshot (all changes are 'added' and match cache size)
      const isInitialSnapshot = changes.length === this.dashboardCache.conductors.length &&
                                changes.every(change => change.type === 'added');

      if (isInitialSnapshot) {
        return; // Skip initial snapshot to prevent duplicates
      }

      for (const change of changes) {
        const docData = change.doc.data();

        // Skip deleted conductors
        if (docData.status === 'deleted') {
          if (change.type !== 'removed') {
            this.removeFromConductorsCache(change.doc.id);
            hasChanges = true;
          }
          continue;
        }

        if (change.type === 'added') {
          this.addToConductorsCache(change.doc);
          hasChanges = true;
        }
        if (change.type === 'modified') {
          this.updateConductorsCache(change.doc);
          hasChanges = true;
        }
        if (change.type === 'removed') {
          this.removeFromConductorsCache(change.doc.id);
          hasChanges = true;
        }
      }

      if (hasChanges) {
        this.notifyListenersOfCacheUpdate('conductors');
      }
    }, (error) => {
      console.error('Error in conductors cache listener:', error);
      this.listeners.delete('conductors_cache_listener');
    });

    this.listeners.set('conductors_cache_listener', unsubscribe);
    this.isCacheListenerActive = true;
  }

  // Start real-time cache updates listener for SOS requests
  startSOSCacheListener() {
    if (this.listeners.has('sos_cache_listener')) {
      return; // Don't create duplicate listeners
    }

    const sosRef = collection(db, 'sosRequests');

    const unsubscribe = onSnapshot(sosRef, (snapshot) => {
      if (!this.dashboardCache.sos) {
        return; // No cache to update
      }

      let hasChanges = false;
      const changes = snapshot.docChanges();

      if (changes.length === 0) {
        return;
      }

      // Check if this is the initial snapshot (all changes are 'added' and match cache size)
      const isInitialSnapshot = changes.length === this.dashboardCache.sos.length &&
                                changes.every(change => change.type === 'added');

      if (isInitialSnapshot) {
        return; // Skip initial snapshot to prevent duplicates
      }

      for (const change of changes) {
        if (change.type === 'added') {
          this.addToSOSCache(change.doc);
          hasChanges = true;
        }
        if (change.type === 'modified') {
          this.updateSOSCache(change.doc);
          hasChanges = true;
        }
        if (change.type === 'removed') {
          this.removeFromSOSCache(change.doc.id);
          hasChanges = true;
        }
      }

      if (hasChanges) {
        this.notifyListenersOfCacheUpdate('sos');
      }
    }, (error) => {
      console.error('Error in SOS cache listener:', error);
      this.listeners.delete('sos_cache_listener');
    });

    this.listeners.set('sos_cache_listener', unsubscribe);
    this.isCacheListenerActive = true;
  }

  // Start real-time cache updates listener for users
  startUsersCacheListener() {
    if (this.listeners.has('users_cache_listener')) {
      return; // Don't create duplicate listeners
    }

    const usersRef = collection(db, 'users');

    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      if (!this.dashboardCache.users) {
        return; // No cache to update
      }

      let hasChanges = false;
      const changes = snapshot.docChanges();

      if (changes.length === 0) {
        return;
      }

      // Check if this is the initial snapshot (all changes are 'added' and match cache size)
      const isInitialSnapshot = changes.length === this.dashboardCache.users.length &&
                                changes.every(change => change.type === 'added');

      if (isInitialSnapshot) {
        return; // Skip initial snapshot to prevent duplicates
      }

      for (const change of changes) {
        if (change.type === 'added') {
          this.addToUsersCache(change.doc);
          hasChanges = true;
        }
        if (change.type === 'modified') {
          this.updateUsersCache(change.doc);
          hasChanges = true;
        }
        if (change.type === 'removed') {
          this.removeFromUsersCache(change.doc.id);
          hasChanges = true;
        }
      }

      if (hasChanges) {
        this.notifyListenersOfCacheUpdate('users');
      }
    }, (error) => {
      console.error('Error in users cache listener:', error);
      this.listeners.delete('users_cache_listener');
    });

    this.listeners.set('users_cache_listener', unsubscribe);
    this.isCacheListenerActive = true;
  }

  // Cache Helper Methods
  addToConductorsCache(doc) {
    if (!this.dashboardCache.conductors) return;

    const conductorData = doc.data();
    if (conductorData.status !== 'deleted') {
      // Check if conductor already exists to prevent duplicates
      const existingIndex = this.dashboardCache.conductors.findIndex(c => c.id === doc.id);
      if (existingIndex === -1) {
        const newConductor = { id: doc.id, ...conductorData };
        this.dashboardCache.conductors.push(newConductor);
      }
    }
  }

  updateConductorsCache(doc) {
    if (!this.dashboardCache.conductors) return;

    const conductorData = doc.data();
    const index = this.dashboardCache.conductors.findIndex(c => c.id === doc.id);

    if (index !== -1) {
      if (conductorData.status === 'deleted') {
        // Remove deleted conductor
        this.dashboardCache.conductors.splice(index, 1);
      } else {
        // Update conductor
        this.dashboardCache.conductors[index] = { id: doc.id, ...conductorData };
      }
    }
  }

  removeFromConductorsCache(docId) {
    if (!this.dashboardCache.conductors) return;
    this.dashboardCache.conductors = this.dashboardCache.conductors.filter(c => c.id !== docId);
  }

  addToUsersCache(doc) {
    if (!this.dashboardCache.users) return;
    // Check if user already exists to prevent duplicates
    const existingIndex = this.dashboardCache.users.findIndex(u => u.id === doc.id);
    if (existingIndex === -1) {
      const newUser = { id: doc.id, ...doc.data() };
      this.dashboardCache.users.push(newUser);
    }
  }

  updateUsersCache(doc) {
    if (!this.dashboardCache.users) return;
    const userData = doc.data();
    const index = this.dashboardCache.users.findIndex(u => u.id === doc.id);
    if (index !== -1) {
      this.dashboardCache.users[index] = { id: doc.id, ...userData };
    }
  }

  removeFromUsersCache(docId) {
    if (!this.dashboardCache.users) return;
    this.dashboardCache.users = this.dashboardCache.users.filter(u => u.id !== docId);
  }

  addToSOSCache(doc) {
    if (!this.dashboardCache.sos) return;
    // Check if SOS request already exists to prevent duplicates
    const existingIndex = this.dashboardCache.sos.findIndex(s => s.id === doc.id);
    if (existingIndex === -1) {
      const newSOS = { id: doc.id, ...doc.data() };
      this.dashboardCache.sos.push(newSOS);
    }
  }

  updateSOSCache(doc) {
    if (!this.dashboardCache.sos) return;
    const sosData = doc.data();
    const index = this.dashboardCache.sos.findIndex(s => s.id === doc.id);
    if (index !== -1) {
      this.dashboardCache.sos[index] = { id: doc.id, ...sosData };
    }
  }

  removeFromSOSCache(docId) {
    if (!this.dashboardCache.sos) return;
    this.dashboardCache.sos = this.dashboardCache.sos.filter(s => s.id !== docId);
  }

  // Notify active listeners about cache updates
  notifyListenersOfCacheUpdate(cacheType) {
    if (this.currentDashboardCallback) {
      // Cache updated, invalidating dashboard cache

      // Invalidate the full dashboard cache when base data changes
      this.dashboardCache.fullDashboardData = null;

      // Debounce multiple rapid updates
      if (this.updateTimeout) {
        clearTimeout(this.updateTimeout);
      }

      this.updateTimeout = setTimeout(() => {
        if (this.currentDashboardCallback) {
          // Triggering dashboard refresh due to cache update
          // Trigger refresh of dashboard data
          this.currentDashboardCallback();
        }
        this.updateTimeout = null;
      }, 200); // Slightly longer debounce for dashboard
    }
  }

  // Cache management methods
  invalidateCache() {
    // Invalidating all dashboard cache
    this.dashboardCache = {
      conductors: null,
      users: null,
      sos: null,
      fullDashboardData: null
    };
    this.lastFetchTime = null;
    this.currentFilter = null;
    this.currentCustomDate = null;

    // Stop cache listeners
    if (this.listeners.has('conductors_cache_listener')) {
      this.listeners.get('conductors_cache_listener')();
      this.listeners.delete('conductors_cache_listener');
    }
    if (this.listeners.has('users_cache_listener')) {
      this.listeners.get('users_cache_listener')();
      this.listeners.delete('users_cache_listener');
    }
    if (this.listeners.has('sos_cache_listener')) {
      this.listeners.get('sos_cache_listener')();
      this.listeners.delete('sos_cache_listener');
    }
    this.isCacheListenerActive = false;
  }

  getCacheInfo() {
    return {
      hasConductorsCache: !!this.dashboardCache.conductors,
      hasUsersCache: !!this.dashboardCache.users,
      hasSOSCache: !!this.dashboardCache.sos,
      hasFullDashboardCache: !!this.dashboardCache.fullDashboardData,
      conductorsSize: this.dashboardCache.conductors?.length || 0,
      usersSize: this.dashboardCache.users?.length || 0,
      sosSize: this.dashboardCache.sos?.length || 0,
      lastFetchTime: this.lastFetchTime,
      isListenerActive: this.isCacheListenerActive,
      cacheAge: this.lastFetchTime ? Date.now() - this.lastFetchTime : null,
      currentFilter: this.currentFilter,
      currentCustomDate: this.currentCustomDate
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
      unsubscribe();
    });
    this.listeners.clear();
    this.isCacheListenerActive = false;
  }

  //  Setup dashboard listener (uses cache when available)
  setupDashboardListener(callback, filter = 'today', customDate = null) {
    // Setting up dashboard listener with caching

    // Remove existing dashboard listener
    this.removeListener('dashboard');

    // Store the callback for cache updates
    this.currentDashboardCallback = () => {
      this.getDashboardData(filter, customDate)
        .then(data => {
          // Dashboard data ready, calling callback
          callback(data, true); // Pass true to indicate data is ready
        })
        .catch(error => {
          console.error('Error in dashboard listener:', error);
          callback(null, false);
        });
    };

    // Check if we have cached data for immediate return
    if (this.dashboardCache.fullDashboardData &&
        this.currentFilter === filter &&
        this.currentCustomDate === customDate) {
      // Returning cached dashboard data immediately
      // Return cached data immediately
      setTimeout(() => {
        callback(this.dashboardCache.fullDashboardData, true);
      }, 0);
    } else {
      // No cache available, fetch fresh data
      // Add a small delay to allow loading state to show
      setTimeout(() => {
        this.currentDashboardCallback();
      }, 100); // 100ms delay to ensure loading state is visible
    }

    // Create cleanup function
    const unsubscribe = () => {
      // Cleaning up dashboard listener
      this.currentDashboardCallback = null;
    };

    this.listeners.set('dashboard', unsubscribe);
    return unsubscribe;
  }

  //  Get complete dashboard data with smart caching
  async getDashboardData(filter = 'today', customDate = null) {
    try {
      const cacheKey = `${filter}_${customDate || 'null'}`;

      //  Return cached data immediately if available and same filter
      if (this.dashboardCache.fullDashboardData &&
          this.isCacheListenerActive &&
          this.currentFilter === filter &&
          this.currentCustomDate === customDate) {
        // Returning cached dashboard data instantly
        return this.dashboardCache.fullDashboardData;
      }

      // Fetching fresh dashboard data...

      //  Fetch fresh data
      const [tripSummary, sosSummary, conductorsSummary, idVerificationSummary, revenueTrend, busReservations] = await Promise.all([
        this.getTripSummary(filter, customDate),
        this.getSOSRequestSummary(filter, customDate),
        this.getConductorsSummary(),
        this.getIDVerificationSummary(),
        this.getRevenueTrend(),
        this.getBusReservationsSummary()
      ]);

      const dashboardData = {
        trips: tripSummary,
        sos: sosSummary,
        conductors: conductorsSummary,
        idVerification: idVerificationSummary,
        revenueTrend: revenueTrend,
        busReservations: busReservations
      };

      // Save to cache with filter info
      this.dashboardCache.fullDashboardData = dashboardData;
      this.currentFilter = filter;
      this.currentCustomDate = customDate;
      this.lastFetchTime = Date.now();

      // Dashboard data cached successfully
      return dashboardData;

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw error;
    }
  }

}

// Export singleton instance
export const dashboardService = new DashboardService();
export default dashboardService;