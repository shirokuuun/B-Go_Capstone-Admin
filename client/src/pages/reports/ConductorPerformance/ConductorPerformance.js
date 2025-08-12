// ConductorPerformance.js
import { collection, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase/firebase';

// Fetch conductor details
export const fetchConductorDetails = async (conductorId) => {
  try {
    const conductorRef = doc(db, 'conductors', conductorId);
    const conductorSnapshot = await getDoc(conductorRef);
    if (conductorSnapshot.exists()) {
      return {
        id: conductorId,
        ...conductorSnapshot.data()
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching conductor details:', error);
    return null;
  }
};

// Fetch all conductors with their performance data
export const fetchConductorPerformance = async (date) => {
  try {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    let conductorPerformanceData = [];

    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;
      const conductorData = conductorDoc.data();
      
      let trips = [];
      let totalRevenue = 0;
      let totalPassengers = 0;
      let totalTrips = 0;

      // If no date is provided, get all trips by fetching from all date collections
      if (!date) {
        const conductorTripsRef = collection(db, `conductors/${conductorId}/trips`);
        const tripDatesSnapshot = await getDocs(conductorTripsRef);
        
        for (const dateDoc of tripDatesSnapshot.docs) {
          const tripsRef = collection(db, `conductors/${conductorId}/trips/${dateDoc.id}/tickets`);
          const tripsSnapshot = await getDocs(tripsRef);
          
          tripsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.active && data.totalFare) {
              trips.push({
                id: doc.id,
                totalFare: parseFloat(data.totalFare),
                quantity: data.quantity || 1,
                from: data.from,
                to: data.to,
                timestamp: data.timestamp,
                discountAmount: parseFloat(data.discountAmount || 0),
                date: dateDoc.id
              });
              totalRevenue += parseFloat(data.totalFare);
              totalPassengers += data.quantity || 1;
              totalTrips++;
            }
          });
        }
      } else {
        // Specific date
        const tripsRef = collection(db, `conductors/${conductorId}/trips/${date}/tickets`);
        const tripsSnapshot = await getDocs(tripsRef);
        
        tripsSnapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.active && data.totalFare) {
            trips.push({
              id: doc.id,
              totalFare: parseFloat(data.totalFare),
              quantity: data.quantity || 1,
              from: data.from,
              to: data.to,
              timestamp: data.timestamp,
              discountAmount: parseFloat(data.discountAmount || 0),
              date: date
            });
            totalRevenue += parseFloat(data.totalFare);
            totalPassengers += data.quantity || 1;
            totalTrips++;
          }
        });
      }

      // Calculate performance metrics
      const averageFare = totalPassengers > 0 ? totalRevenue / totalPassengers : 0;
      const averagePassengersPerTrip = totalTrips > 0 ? totalPassengers / totalTrips : 0;

      conductorPerformanceData.push({
        conductorId,
        conductorName: conductorData.name || `Conductor ${conductorId}`,
        busNumber: conductorData.busNumber || 'N/A',
        capacity: conductorData.capacity || 27, // Default capacity
        currentPassengers: conductorData.currentPassengers || conductorData.passengerCount || 0,
        lastSeen: conductorData.lastSeen || null,
        totalRevenue,
        totalPassengers,
        totalTrips,
        averageFare,
        averagePassengersPerTrip,
        utilizationRate: conductorData.capacity ? ((conductorData.currentPassengers || conductorData.passengerCount || 0) / conductorData.capacity) * 100 : 0,
        trips,
        isOnline: conductorData.isOnline !== false
      });
    }

    return conductorPerformanceData.sort((a, b) => b.totalRevenue - a.totalRevenue);
  } catch (error) {
    console.error('Error fetching conductor performance:', error);
    return [];
  }
};

// Calculate overall performance metrics
export const calculateOverallMetrics = (conductorData) => {
  const totalCurrentPassengers = conductorData.reduce((sum, conductor) => sum + (conductor.currentPassengers || 0), 0);
  const activeConductors = conductorData.filter(conductor => conductor.isOnline).length;
  const totalCapacity = conductorData.reduce((sum, conductor) => sum + (conductor.capacity || 0), 0);
  
  // Calculate totals for revenue and trips
  const totalRevenue = conductorData.reduce((sum, conductor) => sum + (conductor.totalRevenue || 0), 0);
  const totalTrips = conductorData.reduce((sum, conductor) => sum + (conductor.totalTrips || 0), 0);
  const totalPassengersFromTrips = conductorData.reduce((sum, conductor) => sum + (conductor.totalPassengers || 0), 0);
  
  // Calculate averages
  const averageRevenue = conductorData.length > 0 ? totalRevenue / conductorData.length : 0;
  const averagePassengers = conductorData.length > 0 ? totalCurrentPassengers / conductorData.length : 0;

  return {
    totalCurrentPassengers,
    totalCapacity,
    activeConductors,
    totalConductors: conductorData.length,
    overallUtilization: totalCapacity > 0 ? (totalCurrentPassengers / totalCapacity) * 100 : 0,
    averageRevenue,
    averagePassengers,
    totalTrips,
    totalRevenue,
    totalPassengersFromTrips
  };
};

// Prepare chart data for conductor comparison
export const prepareConductorChartData = (conductorData) => {
  return conductorData
    .filter(conductor => conductor.isOnline)
    .slice(0, 10) // Top 10 performers
    .map(conductor => ({
      name: conductor.conductorName,
      passengers: conductor.currentPassengers,
      utilization: conductor.utilizationRate
    }));
};

// Prepare route popularity data across all conductors (simplified version)
export const prepareRoutePopularityData = (conductorData) => {
  // Since we removed trip details, this function now returns empty array
  // You can remove this function call from the component if not needed
  return [];
};

// Set up real-time listener for conductor performance data
export const setupConductorPerformanceListener = (callback, selectedDate) => {
  const conductorsRef = collection(db, 'conductors');
  
  const unsubscribe = onSnapshot(conductorsRef, async (snapshot) => {
    try {
      let conductorPerformanceData = [];
      
      for (const conductorDoc of snapshot.docs) {
        const conductorId = conductorDoc.id;
        const conductorData = conductorDoc.data();
        
        let trips = [];
        let totalRevenue = 0;
        let totalPassengers = 0;
        let totalTrips = 0;
        let currentPassengers = 0;

        // Use consistent field name - check both possible field names
        currentPassengers = conductorData.currentPassengers || conductorData.passengerCount || 0;

        // Calculate average fare from trips (for context)
        if (!selectedDate) {
          // Get all trips across all dates
          try {
            const conductorTripsRef = collection(db, `conductors/${conductorId}/trips`);
            const tripDatesSnapshot = await getDocs(conductorTripsRef);
            
            for (const dateDoc of tripDatesSnapshot.docs) {
              const tripsRef = collection(db, `conductors/${conductorId}/trips/${dateDoc.id}/tickets`);
              const tripsSnapshot = await getDocs(tripsRef);
              
              tripsSnapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.active && data.totalFare) {
                  totalRevenue += parseFloat(data.totalFare);
                  totalPassengers += data.quantity || 1;
                  totalTrips++;
                }
              });
            }
          } catch (error) {
            console.log(`No trip data found for conductor ${conductorId}`);
          }
        } else {
          // For specific date, only get that date's trip data
          try {
            const tripsRef = collection(db, `conductors/${conductorId}/trips/${selectedDate}/tickets`);
            const tripsSnapshot = await getDocs(tripsRef);
            
            tripsSnapshot.docs.forEach(doc => {
              const data = doc.data();
              if (data.active && data.totalFare) {
                totalRevenue += parseFloat(data.totalFare);
                totalPassengers += data.quantity || 1;
                totalTrips++;
              }
            });
          } catch (error) {
            // If the date collection doesn't exist, no trips for this date
            console.log(`No trips found for conductor ${conductorId} on ${selectedDate}`);
          }
        }

        // Calculate average fare (from trip data for context)
        const averageFare = totalPassengers > 0 ? totalRevenue / totalPassengers : 0;

        conductorPerformanceData.push({
          conductorId,
          conductorName: conductorData.name || `Conductor ${conductorId}`,
          busNumber: conductorData.busNumber || 'N/A',
          capacity: conductorData.capacity || 27,
          currentPassengers, // This is the main metric we care about
          lastSeen: conductorData.lastSeen || null,
          averageFare: averageFare || 0, // Ensure it's never undefined
          totalRevenue: totalRevenue || 0, // Add this for overall metrics calculation
          totalPassengers: totalPassengers || 0, // Add this for overall metrics calculation
          totalTrips: totalTrips || 0, // Add this for overall metrics calculation
          utilizationRate: conductorData.capacity ? (currentPassengers / conductorData.capacity) * 100 : 0,
          isOnline: conductorData.isOnline !== false
        });
      }

      const sortedData = conductorPerformanceData.sort((a, b) => b.currentPassengers - a.currentPassengers);
      const overallMetrics = calculateOverallMetrics(sortedData);

      callback({
        conductorData: sortedData,
        overallMetrics
      });
    } catch (error) {
      console.error('Error in conductor performance listener:', error);
      callback({
        conductorData: [],
        overallMetrics: {
          totalCurrentPassengers: 0,
          totalCapacity: 0,
          activeConductors: 0,
          totalConductors: 0,
          overallUtilization: 0,
          averageRevenue: 0,
          averagePassengers: 0,
          totalTrips: 0
        }
      });
    }
  }, (error) => {
    console.error('Error setting up conductor performance listener:', error);
  });

  return unsubscribe;
};