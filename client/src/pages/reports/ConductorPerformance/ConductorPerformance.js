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
        capacity: conductorData.capacity || 40, // Default capacity
        currentPassengers: conductorData.currentPassengers || 0,
        lastSeen: conductorData.lastSeen || null,
        totalRevenue,
        totalPassengers,
        totalTrips,
        averageFare,
        averagePassengersPerTrip,
        utilizationRate: conductorData.capacity ? (totalPassengers / conductorData.capacity) * 100 : 0,
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
  const totalRevenue = conductorData.reduce((sum, conductor) => sum + conductor.totalRevenue, 0);
  const totalTripPassengers = conductorData.reduce((sum, conductor) => sum + conductor.totalTripPassengers, 0);
  const totalRealTimePassengers = conductorData.reduce((sum, conductor) => sum + (conductor.totalPassengersCount || 0), 0);
  const totalTrips = conductorData.reduce((sum, conductor) => sum + conductor.totalTrips, 0);
  const activeConductors = conductorData.filter(conductor => conductor.isOnline).length;
  const totalCapacity = conductorData.reduce((sum, conductor) => sum + (conductor.capacity || 0), 0);

  return {
    totalRevenue,
    totalTripPassengers,
    totalRealTimePassengers,
    totalTrips,
    activeConductors,
    totalConductors: conductorData.length,
    averageRevenue: activeConductors > 0 ? totalRevenue / activeConductors : 0,
    averagePassengers: activeConductors > 0 ? totalTripPassengers / activeConductors : 0,
    overallUtilization: totalCapacity > 0 ? (totalRealTimePassengers / totalCapacity) * 100 : 0
  };
};

// Prepare chart data for conductor comparison
export const prepareConductorChartData = (conductorData) => {
  return conductorData
    .filter(conductor => conductor.isOnline)
    .slice(0, 10) // Top 10 performers
    .map(conductor => ({
      name: conductor.conductorName,
      revenue: conductor.totalRevenue,
      passengers: conductor.totalTripPassengers,
      trips: conductor.totalTrips,
      utilization: conductor.utilizationRate
    }));
};

// Prepare route popularity data across all conductors
export const prepareRoutePopularityData = (conductorData) => {
  const routeData = {};
  
  conductorData.forEach(conductor => {
    conductor.trips.forEach(trip => {
      const route = `${trip.from} → ${trip.to}`;
      if (!routeData[route]) {
        routeData[route] = {
          route,
          revenue: 0,
          passengers: 0,
          trips: 0
        };
      }
      routeData[route].revenue += trip.totalFare;
      routeData[route].passengers += trip.quantity;
      routeData[route].trips += 1;
    });
  });

  return Object.values(routeData).sort((a, b) => b.revenue - a.revenue);
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

        // If no date is provided, get all trips by fetching from all date collections
        if (!selectedDate) {
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
          try {
            const tripsRef = collection(db, `conductors/${conductorId}/trips/${selectedDate}/tickets`);
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
                  date: selectedDate
                });
                totalRevenue += parseFloat(data.totalFare);
                totalPassengers += data.quantity || 1;
                totalTrips++;
              }
            });
          } catch (error) {
            // If the date collection doesn't exist, skip this conductor for this date
            console.log(`No trips found for conductor ${conductorId} on ${selectedDate}`);
          }
        }

        // Calculate performance metrics
        const averageFare = totalPassengers > 0 ? totalRevenue / totalPassengers : 0;
        const averagePassengersPerTrip = totalTrips > 0 ? totalPassengers / totalTrips : 0;

        conductorPerformanceData.push({
          conductorId,
          conductorName: conductorData.name || `Conductor ${conductorId}`,
          busNumber: conductorData.busNumber || 'N/A',
          capacity: conductorData.capacity || 40, // Default capacity
          totalPassengersCount: conductorData.passengerCount || 0, // Real-time passenger count
          lastSeen: conductorData.lastSeen || null,
          totalRevenue,
          totalTripPassengers: totalPassengers, // Passengers from trips
          totalTrips,
          averageFare,
          averagePassengersPerTrip,
          utilizationRate: conductorData.capacity ? ((conductorData.passengerCount || 0) / conductorData.capacity) * 100 : 0,
          trips,
          isOnline: conductorData.isOnline !== false
        });
      }

      const sortedData = conductorPerformanceData.sort((a, b) => b.totalRevenue - a.totalRevenue);
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
          totalRevenue: 0,
          totalTripPassengers: 0,
          totalRealTimePassengers: 0,
          totalTrips: 0,
          activeConductors: 0,
          totalConductors: 0,
          averageRevenue: 0,
          averagePassengers: 0,
          overallUtilization: 0
        }
      });
    }
  }, (error) => {
    console.error('Error setting up conductor performance listener:', error);
  });

  return unsubscribe;
};