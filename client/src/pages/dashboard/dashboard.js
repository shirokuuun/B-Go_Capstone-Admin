import { getDocs, collection, doc, getDoc, query, where } from 'firebase/firestore';
import { db } from '/src/firebase/firebase.js';

class DashboardService {
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

      // Process each conductor's tickets (same structure as ticketing.js)
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
              const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets');
              const ticketsSnapshot = await getDocs(ticketsRef);
              
              if (ticketsSnapshot.docs.length > 0) {
                totalTrips++; // Count each trip that has tickets
              }
              
              // Process each ticket (includes all types: conductor, preTicket, preBooking)
              ticketsSnapshot.forEach(ticketDoc => {
                const data = ticketDoc.data();
                
                // Only process tickets with valid fare and quantity (same as daily revenue)
                if (data.totalFare && data.quantity) {
                  totalTickets++;
                  
                  // Convert totalFare to number in case it's stored as string (same as daily revenue)
                  const fareValue = parseFloat(data.totalFare);
                  totalFare += fareValue;
                  totalPassengers += data.quantity || 0;

                  const routeKey = `${data.from || 'Unknown'} → ${data.to || 'Unknown'}`;
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

      let totalRequests = 0;
      let pendingRequests = 0;
      let receivedRequests = 0;
      let cancelledRequests = 0;
      let completedRequests = 0;
      const recentRequests = [];

      const today = new Date().toLocaleDateString('en-CA');
      const selectedDate = customDate || today;

      snapshot.forEach(doc => {
        const data = doc.data();

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
            id: doc.id,
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

      const result = {
        totalRequests,
        pendingRequests,
        receivedRequests,
        cancelledRequests,
        completedRequests,
        recentRequests: recentRequests.slice(0, 5) // Show only 5 most recent
      };

      return result;

    } catch (error) {
      throw error;
    }
  }

  async getConductorsSummary() {
    try {
      const conductorsRef = collection(db, 'conductors');
      const snapshot = await getDocs(conductorsRef);

      if (snapshot.empty) {
        return {
          totalConductors: 0,
          onlineConductors: 0,
          offlineConductors: 0,
          onlinePercentage: 0
        };
      }

      let totalConductors = 0;
      let onlineConductors = 0;

      snapshot.forEach(doc => {
        const data = doc.data();
        totalConductors++;
        if (data.isOnline) {
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
    } catch (error) {
      throw error;
    }
  }

  async getIDVerificationSummary() {
    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);

      if (snapshot.empty) {
        return {
          totalUsers: 0,
          pendingVerifications: 0,
          verifiedUsers: 0,
          verificationRate: 0
        };
      }

      let totalUsers = 0;
      let pendingVerifications = 0;
      let verifiedUsers = 0;

      for (const userDoc of snapshot.docs) {
        totalUsers++;
        
        try {
          const idDocRef = doc(db, 'users', userDoc.id, 'VerifyID', 'id');
          const idSnapshot = await getDoc(idDocRef);
          
          if (idSnapshot.exists()) {
            const idData = idSnapshot.data();
            const status = idData.status || 'pending';
            
            if (status === 'verified') {
              verifiedUsers++;
            } else if (status === 'pending') {
              pendingVerifications++;
            }
          } else {
            pendingVerifications++;
          }
        } catch (error) {
          // No ID verification data means pending
          pendingVerifications++;
        }
      }

      const verificationRate = totalUsers === 0 ? 0 : ((verifiedUsers / totalUsers) * 100).toFixed(1);

      return {
        totalUsers,
        pendingVerifications,
        verifiedUsers,
        verificationRate
      };
    } catch (error) {
      throw error;
    }
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
                  const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets');
                  const ticketsSnapshot = await getDocs(ticketsRef);
                  
                  if (ticketsSnapshot.docs.length > 0) {
                    dayTrips++; // Count each trip that has tickets
                  }
                  
                  ticketsSnapshot.forEach(ticketDoc => {
                    const data = ticketDoc.data();
                    if (data.totalFare && data.quantity) {
                      const fareValue = parseFloat(data.totalFare);
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

  async getDashboardData(filter = 'today', customDate = null) {
    try {
      const [tripSummary, sosSummary, conductorsSummary, idVerificationSummary, revenueTrend, busReservations] = await Promise.all([
        this.getTripSummary(filter, customDate),
        this.getSOSRequestSummary(filter, customDate),
        this.getConductorsSummary(),
        this.getIDVerificationSummary(),
        this.getRevenueTrend(),
        this.getBusReservationsSummary()
      ]);

      return {
        trips: tripSummary,
        sos: sosSummary,
        conductors: conductorsSummary,
        idVerification: idVerificationSummary,
        revenueTrend: revenueTrend,
        busReservations: busReservations
      };
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw error;
    }
  }
}

export default DashboardService;