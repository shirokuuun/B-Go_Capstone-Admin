// DailyRevenue.js
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase/firebase';

// Fetch conductor trips data
export const fetchConductorTrips = async (date) => {
  try {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    let allTrips = [];

    for (const conductorDoc of conductorsSnapshot.docs) {
      const tripsRef = collection(db, `conductors/${conductorDoc.id}/trips/${date}/tickets`);
      const tripsSnapshot = await getDocs(tripsRef);
      
      tripsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.active && data.totalFare) {
          allTrips.push({
            id: doc.id,
            conductorId: conductorDoc.id,
            totalFare: parseFloat(data.totalFare),
            quantity: data.quantity || 1,
            from: data.from,
            to: data.to,
            timestamp: data.timestamp,
            discountAmount: parseFloat(data.discountAmount || 0),
            source: 'Conductor Trips'
          });
        }
      });
    }
    return allTrips;
  } catch (error) {
    console.error('Error fetching conductor trips:', error);
    return [];
  }
};

// Fetch pre-ticketing data
export const fetchPreTicketing = async (date) => {
  try {
    const tripsRef = collection(db, 'trips/Batangas/trips');
    const tripsSnapshot = await getDocs(tripsRef);
    let allPreTickets = [];

    tripsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.active && data.totalFare && data.timestamp) {
        const tripDate = data.timestamp.toDate().toISOString().split('T')[0];
        if (tripDate === date) {
          allPreTickets.push({
            id: doc.id,
            totalFare: data.totalFare,
            quantity: data.quantity || 1,
            from: data.from,
            to: data.to,
            timestamp: data.timestamp,
            discountAmount: parseFloat(data.discountAmount || 0),
            fareTypes: data.fareTypes || [],
            source: 'Pre-ticketing'
          });
        }
      }
    });
    return allPreTickets;
  } catch (error) {
    console.error('Error fetching pre-ticketing:', error);
    return [];
  }
};

// Calculate revenue metrics
export const calculateRevenueMetrics = (conductorTrips, preTicketing) => {
  const totalConductorRevenue = conductorTrips.reduce((sum, trip) => sum + trip.totalFare, 0);
  const totalPreTicketingRevenue = preTicketing.reduce((sum, trip) => sum + trip.totalFare, 0);
  const totalRevenue = totalConductorRevenue + totalPreTicketingRevenue;
  const totalPassengers = conductorTrips.reduce((sum, trip) => sum + trip.quantity, 0) + 
                          preTicketing.reduce((sum, trip) => sum + trip.quantity, 0);

  return {
    totalRevenue,
    totalPassengers,
    averageFare: totalPassengers > 0 ? totalRevenue / totalPassengers : 0,
    conductorRevenue: totalConductorRevenue,
    preTicketingRevenue: totalPreTicketingRevenue
  };
};

// Prepare chart data
export const preparePieChartData = (conductorRevenue, preTicketingRevenue) => [
  { name: 'Conductor Trips', value: conductorRevenue || 0, color: '#8884d8' },
  { name: 'Pre-ticketing', value: preTicketingRevenue || 0, color: '#82ca9d' }
];

// Prepare route revenue data
export const prepareRouteRevenueData = (conductorTrips, preTicketing) => {
  const routeRevenueData = [...conductorTrips, ...preTicketing]
    .reduce((acc, trip) => {
      const route = `${trip.from} → ${trip.to}`;
      if (!acc[route]) {
        acc[route] = { route, revenue: 0, passengers: 0 };
      }
      acc[route].revenue += trip.totalFare;
      acc[route].passengers += trip.quantity;
      return acc;
    }, {});

  return Object.values(routeRevenueData).sort((a, b) => b.revenue - a.revenue);
};

// Load all revenue data
export const loadRevenueData = async (selectedDate) => {
  try {
    const [conductorTrips, preTicketing] = await Promise.all([
      fetchConductorTrips(selectedDate),
      fetchPreTicketing(selectedDate)
    ]);

    const metrics = calculateRevenueMetrics(conductorTrips, preTicketing);

    return {
      conductorTrips,
      preTicketing,
      ...metrics
    };
  } catch (error) {
    console.error('Error loading revenue data:', error);
    throw error;
  }
};