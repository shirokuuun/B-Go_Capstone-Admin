import { getDocs, collectionGroup, collection  } from 'firebase/firestore';
import { db } from '/src/firebase/firebase.js';

class DashboardService {
  async getTripSummary(filter = 'today', customDate = null) {
    try {
      console.log('Fetching trip summary with filter:', filter, 'customDate:', customDate);
      
      const snapshot = await getDocs(collectionGroup(db, 'tickets'));
      console.log('Total documents found:', snapshot.size);

      if (snapshot.empty) {
        console.log('No documents found in tickets collection');
        return {
          totalTrips: 0,
          totalFare: 0,
          avgPassengers: 0,
          mostCommonRoute: 'No trips found'
        };
      }

      let totalTrips = 0;
      let totalFare = 0;
      let totalPassengers = 0;
      const routeFrequency = {};

      const today = new Date().toLocaleDateString('en-CA');
      const selectedDate = customDate || today;
      
      console.log('Today:', today, 'Selected date:', selectedDate);

      snapshot.forEach(doc => {
        const data = doc.data();
        console.log('Processing document:', doc.id, data);

        // Check for either 'timestamp' or 'createdAt' field
        const dateField = data.timestamp || data.createdAt;
        if (!dateField) {
          console.log('Document missing timestamp/createdAt field:', doc.id);
          return;
        }

        // Handle both Firestore Timestamp and regular Date objects
        let tripDate;
        if (dateField.toDate) {
          tripDate = dateField.toDate().toLocaleDateString('en-CA');
        } else if (dateField instanceof Date) {
          tripDate = dateField.toLocaleDateString('en-CA');
        } else {
          console.log('Invalid date format for document:', doc.id);
          return;
        }

        console.log('Trip date:', tripDate);

        // Apply filters
        if (filter === 'today' && tripDate !== today) {
          console.log('Skipping document - not today:', doc.id);
          return;
        }
        if (filter === 'custom' && tripDate !== selectedDate) {
          console.log('Skipping document - not selected date:', doc.id);
          return;
        }

        console.log('Including document in summary:', doc.id);

        totalTrips++;
        // Convert totalFare to number in case it's stored as string
        const fareValue = typeof data.totalFare === 'string' ? 
          parseFloat(data.totalFare) : (data.totalFare || 0);
        totalFare += fareValue;
        totalPassengers += data.quantity || 0;

        const routeKey = `${data.from || 'Unknown'} → ${data.to || 'Unknown'}`;
        routeFrequency[routeKey] = (routeFrequency[routeKey] || 0) + 1;
      });

      const mostCommonRoute = Object.entries(routeFrequency)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

      const avgPassengers = totalTrips === 0 ? 0 : (totalPassengers / totalTrips).toFixed(2);

      const result = {
        totalTrips,
        totalFare,
        avgPassengers,
        mostCommonRoute
      };

      console.log('Final summary:', result);
      return result;

    } catch (error) {
      console.error('Error fetching trip summary:', error);
      throw error;
    }
  }

   async getSOSRequestSummary(filter = 'today', customDate = null) {
    try {
      console.log('Fetching SOS request summary with filter:', filter, 'customDate:', customDate);
      
      const snapshot = await getDocs(collection(db, 'sosRequests'));
      console.log('Total SOS documents found:', snapshot.size);

      if (snapshot.empty) {
        console.log('No SOS requests found');
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
        console.log('Processing SOS document:', doc.id, data);

        const dateField = data.timestamp || data.createdAt || data.requestedAt;
        if (!dateField) {
          console.log('SOS Document missing timestamp field:', doc.id);
          return;
        }

        let requestDate;
        if (dateField.toDate) {
          requestDate = dateField.toDate().toLocaleDateString('en-CA');
        } else if (dateField instanceof Date) {
          requestDate = dateField.toLocaleDateString('en-CA');
        } else {
          console.log('Invalid date format for SOS document:', doc.id);
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
          case 'acknowledged':
          case 'in_progress':
            receivedRequests++;
            break;
          case 'cancelled':
          case 'canceled':
            cancelledRequests++;
            break;
          case 'completed':
          case 'resolved':
          case 'closed':
            completedRequests++;
            break;
        }

        // Add to recent requests for today
        if (requestDate === today) {
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

      console.log('SOS Summary:', result);
      return result;

    } catch (error) {
      console.error('Error fetching SOS request summary:', error);
      throw error;
    }
  }

  async getDashboardData(filter = 'today', customDate = null) {
    try {
      const [tripSummary, sosSummary] = await Promise.all([
        this.getTripSummary(filter, customDate),
        this.getSOSRequestSummary(filter, customDate)
      ]);

      return {
        trips: tripSummary,
        sos: sosSummary
      };
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw error;
    }
  }
}

export default DashboardService;