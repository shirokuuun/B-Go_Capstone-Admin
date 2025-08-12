// BusUtilization.js - Fixed for selectedBusIds array and bus name field
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase/firebase';

// Fetch available buses data
export const fetchAvailableBuses = async () => {
  try {
    const busesRef = collection(db, 'AvailableBuses');
    const busesSnapshot = await getDocs(busesRef);
    const buses = [];

    busesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      buses.push({
        id: doc.id,
        ...data,
        docId: doc.id,
        // Use name field as the primary identifier since that's what matches reservations
        busIdentifier: data.name || doc.id
      });
    });

    console.log('🚌 Fetched Available Buses:', buses);
    return buses;
  } catch (error) {
    console.error('Error fetching available buses:', error);
    return [];
  }
};

// Fetch reservations data for a specific date
export const fetchReservations = async (date) => {
  try {
    const reservationsRef = collection(db, 'reservations');
    const reservationsSnapshot = await getDocs(reservationsRef);
    const reservations = [];

    console.log('📅 Filtering reservations for date:', date);
    console.log('📊 Total reservation documents found:', reservationsSnapshot.docs.length);

    reservationsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log('📝 Raw reservation data:', {
        docId: doc.id,
        selectedBusIds: data.selectedBusIds,
        data: data
      });
      
      // Filter by date if the reservation has a date field
      if (data.reservationDate || data.date || data.timestamp) {
        let reservationDate;
        
        if (data.reservationDate && data.reservationDate.toDate) {
          reservationDate = data.reservationDate.toDate().toISOString().split('T')[0];
          console.log('📅 Parsed reservationDate (Firestore Timestamp):', reservationDate);
        } else if (data.date && data.date.toDate) {
          reservationDate = data.date.toDate().toISOString().split('T')[0];
          console.log('📅 Parsed date (Firestore Timestamp):', reservationDate);
        } else if (data.timestamp && data.timestamp.toDate) {
          reservationDate = data.timestamp.toDate().toISOString().split('T')[0];
          console.log('📅 Parsed timestamp (Firestore Timestamp):', reservationDate);
        } else if (typeof data.reservationDate === 'string') {
          reservationDate = data.reservationDate.split('T')[0];
          console.log('📅 Parsed reservationDate (String):', reservationDate);
        } else if (typeof data.date === 'string') {
          reservationDate = data.date.split('T')[0];
          console.log('📅 Parsed date (String):', reservationDate);
        }

        console.log('🔍 Date comparison - Selected:', date, 'Reservation:', reservationDate);
        
        // Include reservation if it matches the selected date or if no date filtering is needed
        if (!date || reservationDate === date) {
          console.log('✅ Including reservation:', doc.id);
          reservations.push({
            id: doc.id,
            ...data,
            docId: doc.id
          });
        } else {
          console.log('❌ Excluding reservation (date mismatch):', doc.id);
        }
      } else {
        console.log('⚠️ Reservation has no date field, including anyway:', doc.id);
        // Include all reservations if no date field exists
        reservations.push({
          id: doc.id,
          ...data,
          docId: doc.id
        });
      }
    });

    console.log('📋 Final filtered reservations:', reservations);
    return reservations;
  } catch (error) {
    console.error('Error fetching reservations:', error);
    return [];
  }
};

// Calculate utilization metrics
export const calculateUtilizationMetrics = (availableBuses, reservations) => {
  console.log('🧮 Calculating metrics with:');
  console.log('  - Available buses:', availableBuses.length);
  console.log('  - Reservations:', reservations.length);
  
  const totalBuses = availableBuses.length;
  
  // Get unique bus IDs that are reserved
  const reservedBusIds = new Set();
  
  reservations.forEach(reservation => {
    // Handle selectedBusIds array
    if (reservation.selectedBusIds && Array.isArray(reservation.selectedBusIds)) {
      reservation.selectedBusIds.forEach(busId => {
        if (busId) {
          console.log('🚌 Found reserved bus ID from selectedBusIds:', busId);
          reservedBusIds.add(busId.toString()); // Ensure it's a string
        }
      });
    }
    // Fallback to other possible field names
    else if (reservation.busId || reservation.assignedBus) {
      const busId = reservation.busId || reservation.assignedBus;
      console.log('🚌 Found reserved bus ID from busId/assignedBus:', busId);
      reservedBusIds.add(busId.toString());
    } else {
      console.log('⚠️ Reservation without bus assignment:', reservation);
    }
  });
  
  console.log('🎯 Unique reserved bus IDs:', Array.from(reservedBusIds));
  
  const reservedBuses = reservedBusIds.size;
  const utilizationRate = totalBuses > 0 ? (reservedBuses / totalBuses) * 100 : 0;

  // Count reservations by status
  const statusCounts = reservations.reduce((acc, reservation) => {
    const status = (reservation.status || 'pending').toLowerCase();
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const metrics = {
    totalBuses,
    reservedBuses,
    utilizationRate,
    pendingReservations: statusCounts.pending || 0,
    confirmedReservations: statusCounts.confirmed || 0,
    completedReservations: statusCounts.completed || 0,
    cancelledReservations: statusCounts.cancelled || 0
  };

  console.log('📊 Calculated metrics:', metrics);
  return metrics;
};

// Get available (non-reserved) buses
export const getAvailableBuses = (allBuses, reservations) => {
  console.log('🔍 Finding available buses...');
  console.log('  - Total buses:', allBuses.length);
  console.log('  - All bus names:', allBuses.map(bus => bus.name || bus.id));
  
  const reservedBusIds = new Set();
  
  reservations.forEach(reservation => {
    // Handle selectedBusIds array
    if (reservation.selectedBusIds && Array.isArray(reservation.selectedBusIds)) {
      reservation.selectedBusIds.forEach(busId => {
        if (busId) {
          reservedBusIds.add(busId.toString());
        }
      });
    }
    // Fallback to other possible field names
    else if (reservation.busId || reservation.assignedBus) {
      const busId = reservation.busId || reservation.assignedBus;
      reservedBusIds.add(busId.toString());
    }
  });

  console.log('  - Reserved bus IDs:', Array.from(reservedBusIds));

  const availableBuses = allBuses.filter(bus => {
    // Check against bus name field since that's what matches selectedBusIds
    const busIdentifier = (bus.name || bus.id || bus.busNumber || bus.docId).toString();
    const isAvailable = !reservedBusIds.has(busIdentifier);
    console.log(`  - Bus ${busIdentifier}: ${isAvailable ? 'Available' : 'Reserved'}`);
    return isAvailable;
  });

  console.log('✅ Available buses:', availableBuses.length);
  return availableBuses;
};

// Prepare pie chart data for fleet utilization
export const preparePieChartData = (reservedBuses, availableBuses) => [
  { name: 'Reserved', value: reservedBuses || 0, color: '#dc3545' },
  { name: 'Available', value: availableBuses || 0, color: '#28a745' }
];

// Prepare hourly utilization data (for potential future use)
export const prepareHourlyUtilizationData = (reservations) => {
  const hourlyData = {};
  
  reservations.forEach(reservation => {
    let hour = 0;
    if (reservation.reservationDate && reservation.reservationDate.toDate) {
      hour = reservation.reservationDate.toDate().getHours();
    } else if (reservation.timestamp && reservation.timestamp.toDate) {
      hour = reservation.timestamp.toDate().getHours();
    }
    
    hourlyData[hour] = (hourlyData[hour] || 0) + 1;
  });

  // Convert to array format for charts
  const hours = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    reservations: hourlyData[i] || 0
  }));

  return hours;
};

// Prepare reservation status data for bar chart
export const prepareReservationStatusData = (pending, confirmed, completed, cancelled) => [
  { status: 'Pending', count: pending || 0, color: '#ffc107' },
  { status: 'Confirmed', count: confirmed || 0, color: '#007bff' },
  { status: 'Completed', count: completed || 0, color: '#28a745' },
  { status: 'Cancelled', count: cancelled || 0, color: '#dc3545' }
];

// Main function to load all utilization data
export const loadUtilizationData = async (selectedDate) => {
  try {
    console.log('🚀 Loading utilization data for date:', selectedDate);
    
    const [allBuses, reservations] = await Promise.all([
      fetchAvailableBuses(),
      fetchReservations(selectedDate)
    ]);

    console.log('📋 Data loaded:');
    console.log('  - Buses:', allBuses.length);
    console.log('  - Reservations:', reservations.length);

    const metrics = calculateUtilizationMetrics(allBuses, reservations);
    const availableBuses = getAvailableBuses(allBuses, reservations);

    const result = {
      availableBuses,
      reservations,
      ...metrics
    };

    console.log('🎯 Final utilization data:', result);
    return result;
  } catch (error) {
    console.error('Error loading utilization data:', error);
    throw error;
  }
};

// Helper function to format bus data for display
export const formatBusData = (bus) => {
  return {
    id: bus.name || bus.id || bus.busNumber || bus.docId || 'N/A',
    type: bus.type || bus.busType || bus.vehicleType || 'Standard',
    capacity: bus.capacity || bus.seatCapacity || bus.maxCapacity || 'N/A',
    status: bus.status || 'Available',
    lastUpdated: bus.lastUpdated || bus.updatedAt || bus.timestamp || null
  };
};

// Helper function to format reservation data for display
export const formatReservationData = (reservation) => {
  // Handle selectedBusIds array for display
  let busIds = 'TBD';
  if (reservation.selectedBusIds && Array.isArray(reservation.selectedBusIds)) {
    busIds = reservation.selectedBusIds.join(', ');
  } else if (reservation.busId || reservation.assignedBus) {
    busIds = reservation.busId || reservation.assignedBus;
  }

  return {
    id: reservation.id || reservation.reservationId || reservation.docId || 'N/A',
    busId: busIds,
    customerName: reservation.customerName || reservation.clientName || reservation.customer || reservation.name || 'N/A',
    reservationDate: reservation.reservationDate || reservation.date || reservation.timestamp || null,
    destination: reservation.destination || reservation.route || reservation.location || reservation.to || 'N/A',
    status: reservation.status || 'Pending',
    amount: reservation.amount || reservation.totalAmount || reservation.fare || reservation.cost || 0
  };
};

// Function to get utilization statistics
export const getUtilizationStatistics = (utilizationData) => {
  const { totalBuses, reservedBuses, reservations } = utilizationData;
  
  const avgDailyUtilization = totalBuses > 0 ? (reservedBuses / totalBuses) * 100 : 0;
  const totalRevenue = reservations.reduce((sum, res) => sum + (res.amount || res.totalAmount || 0), 0);
  const avgRevenuePerBus = reservedBuses > 0 ? totalRevenue / reservedBuses : 0;
  
  return {
    avgDailyUtilization,
    totalRevenue,
    avgRevenuePerBus,
    totalReservations: reservations.length,
    peakUtilizationHour: getPeakUtilizationHour(reservations)
  };
};

// Helper function to get peak utilization hour
const getPeakUtilizationHour = (reservations) => {
  const hourCounts = {};
  
  reservations.forEach(reservation => {
    let hour = 0;
    if (reservation.reservationDate && reservation.reservationDate.toDate) {
      hour = reservation.reservationDate.toDate().getHours();
    } else if (reservation.timestamp && reservation.timestamp.toDate) {
      hour = reservation.timestamp.toDate().getHours();
    }
    
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });
  
  let peakHour = 0;
  let maxCount = 0;
  
  Object.entries(hourCounts).forEach(([hour, count]) => {
    if (count > maxCount) {
      maxCount = count;
      peakHour = parseInt(hour);
    }
  });
  
  return `${peakHour}:00`;
};