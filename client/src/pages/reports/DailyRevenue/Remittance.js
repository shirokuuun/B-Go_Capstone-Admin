import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '/src/firebase/firebase.js';

// Function to get available dates from remittance collection
export const getAvailableRemittanceDates = async () => {
  try {
    console.log('📅 Fetching available remittance dates...');
    
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
            console.log(`✅ Found remittance date: ${dateId} for conductor: ${conductorId}`);
          }
        }
      } catch (error) {
        console.error(`Error fetching remittance dates for conductor ${conductorId}:`, error);
      }
    }

    const sortedDates = Array.from(dates).sort((a, b) => new Date(b) - new Date(a));
    console.log('📅 Available remittance dates:', sortedDates);
    return sortedDates;
  } catch (error) {
    console.error('Error fetching available remittance dates:', error);
    return [];
  }
};

// UPDATED: Function to get trip data from dailyTrips (since remittance doesn't have trip maps)
export const getTripDataFromDailyTrips = async (conductorId, date) => {
  try {
    console.log(`📋 Getting trip data from dailyTrips: ${conductorId}/${date}`);
    
    // Get trip info from dailyTrips document (since it has the trip maps)
    const dailyTripsDocRef = doc(db, `conductors/${conductorId}/dailyTrips/${date}`);
    const dailyTripsDoc = await getDoc(dailyTripsDocRef);
    
    if (!dailyTripsDoc.exists()) {
      console.log(`❌ DailyTrips document does not exist for ${conductorId}/${date}`);
      return [];
    }
    
    const dailyTripsData = dailyTripsDoc.data();
    console.log(`📄 DailyTrips document keys:`, Object.keys(dailyTripsData));
    
    const trips = [];
    
    // Extract trip maps from dailyTrips document
    for (const [key, value] of Object.entries(dailyTripsData)) {
      if (key.startsWith('trip') && typeof value === 'object' && value !== null) {
        console.log(`\n🚀 Processing trip from dailyTrips: ${key}`);
        console.log(`  📍 Direction: ${value.direction || 'N/A'}`);
        console.log(`  ⏰ Start Time: ${value.startTime ? (value.startTime.toDate ? value.startTime.toDate().toLocaleString() : value.startTime) : 'N/A'}`);
        console.log(`  ⏰ End Time: ${value.endTime ? (value.endTime.toDate ? value.endTime.toDate().toLocaleString() : value.endTime) : 'N/A'}`);

        // Get tickets from dailyTrips tickets collection
        const ticketDetails = await getTicketDetailsFromDailyTrips(conductorId, date, key);
        
        console.log(`  💰 Trip Revenue: ₱${ticketDetails.totalRevenue}`);
        console.log(`  👥 Trip Passengers: ${ticketDetails.totalPassengers}`);
        console.log(`  🎫 Trip Tickets: ${ticketDetails.tickets.length}`);

        trips.push({
          tripNumber: key,
          tripDirection: value.direction || 'Unknown Direction',
          startTime: value.startTime,
          endTime: value.endTime,
          isComplete: value.isComplete,
          placeCollection: value.placeCollection,
          totalRevenue: ticketDetails.totalRevenue,
          totalPassengers: ticketDetails.totalPassengers,
          ticketCount: ticketDetails.tickets.length,
          tickets: ticketDetails.tickets,
          data: value // Original trip data from dailyTrips
        });

        console.log(`✅ Added trip ${key} to results`);
      }
    }
    
    console.log(`📋 Found ${trips.length} trips in dailyTrips for ${conductorId}/${date}`);
    return trips;
  } catch (error) {
    console.error(`Error getting trip data from dailyTrips for ${conductorId}/${date}:`, error);
    return [];
  }
};

// Function to get ticket details from dailyTrips
export const getTicketDetailsFromDailyTrips = async (conductorId, date, tripNumber) => {
  try {
    console.log(`🎫 Getting ticket details from dailyTrips: ${conductorId}/${date}/${tripNumber}`);
    
    const ticketsPath = `conductors/${conductorId}/dailyTrips/${date}/${tripNumber}/tickets/tickets`;
    console.log(`📍 Tickets path: ${ticketsPath}`);
    
    const ticketsRef = collection(db, ticketsPath);
    const ticketsSnapshot = await getDocs(ticketsRef);
    
    let totalRevenue = 0;
    let totalPassengers = 0;
    const tickets = [];

    console.log(`📊 Found ${ticketsSnapshot.docs.length} tickets in dailyTrips`);

    for (const ticketDoc of ticketsSnapshot.docs) {
      const ticketData = ticketDoc.data();
      const ticketId = ticketDoc.id;
      
      console.log(`🎟️ Processing ticket: ${ticketId}`, {
        totalFare: ticketData.totalFare,
        quantity: ticketData.quantity,
        from: ticketData.from,
        to: ticketData.to,
        ticketType: ticketData.ticketType
      });
      
      if (ticketData.totalFare && ticketData.quantity) {
        const fare = parseFloat(ticketData.totalFare);
        const passengers = parseInt(ticketData.quantity);
        
        totalRevenue += fare;
        totalPassengers += passengers;
        
        tickets.push({
          id: ticketId,
          from: ticketData.from || 'N/A',
          to: ticketData.to || 'N/A',
          fare: fare,
          passengers: passengers,
          timestamp: ticketData.timestamp,
          ticketType: ticketData.ticketType || 'Regular',
          discountAmount: ticketData.discountAmount || 0,
          startKm: ticketData.startKm,
          endKm: ticketData.endKm,
          totalKm: ticketData.totalKm,
          farePerPassenger: ticketData.farePerPassenger || [],
          source: 'dailyTrips'
        });
      } else {
        console.log(`⚠️ Skipping invalid ticket ${ticketId}: missing totalFare or quantity`);
      }
    }

    console.log(`💰 Trip summary - Revenue: ${totalRevenue}, Passengers: ${totalPassengers}, Tickets: ${tickets.length}`);

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
};

// OPTIONAL: Function to get remittance summary data (if needed)
export const getRemittanceSummaryData = async (conductorId, date) => {
  try {
    console.log(`📊 Getting remittance summary data: ${conductorId}/${date}`);
    
    // Check if there's summary data in the remittance date document
    const remittanceDateDocRef = doc(db, `conductors/${conductorId}/remittance/${date}`);
    const remittanceDateDoc = await getDoc(remittanceDateDocRef);
    
    if (remittanceDateDoc.exists()) {
      const summaryData = remittanceDateDoc.data();
      console.log(`📊 Found remittance summary:`, summaryData);
      return summaryData;
    }
    
    console.log(`📊 No remittance summary found, will calculate from trip data`);
    return null;
  } catch (error) {
    console.error(`Error getting remittance summary data:`, error);
    return null;
  }
};

// Function to get conductor details including bus number from subcollection
export const getConductorDetails = async (conductorId) => {
  try {
    console.log(`📋 Fetching conductor details for: ${conductorId}`);
    
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
    }
    
    // Get bus number from subcollection
    try {
      const busNumberRef = collection(db, `conductors/${conductorId}/busNumber`);
      const busNumberSnapshot = await getDocs(busNumberRef);
      
      console.log(`🚌 Found ${busNumberSnapshot.docs.length} bus number documents for conductor ${conductorId}`);
      
      if (!busNumberSnapshot.empty) {
        // Get the most recent bus number document (or first one if multiple exist)
        const busDoc = busNumberSnapshot.docs[0];
        const busData = busDoc.data();
        
        // Try different possible field names for bus number
        const busNumber = busData.busNumber || busData.number || busData.bus || busDoc.id || 'N/A';
        conductorData.busNumber = busNumber;
        
        console.log(`✅ Found bus number for conductor ${conductorId}: ${busNumber}`);
      } else {
        console.log(`⚠️ No bus number found for conductor ${conductorId}`);
      }
    } catch (busError) {
      console.error(`Error fetching bus number for conductor ${conductorId}:`, busError);
    }
    
    return conductorData;
  } catch (error) {
    console.error(`Error fetching conductor details for ${conductorId}:`, error);
    return {
      id: conductorId,
      busNumber: 'N/A',
      name: conductorId
    };
  }
};

// Function to get all conductor details
export const getAllConductorDetails = async () => {
  try {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    const conductorData = {};

    for (const doc of conductorsSnapshot.docs) {
      const details = await getConductorDetails(doc.id);
      conductorData[doc.id] = details;
    }

    return conductorData;
  } catch (error) {
    console.error('Error fetching all conductor details:', error);
    return {};
  }
};

// UPDATED: Main function to load remittance data using dailyTrips as source
export const loadRemittanceData = async (selectedDate) => {
  if (!selectedDate) {
    console.log('❌ No date selected');
    return [];
  }
  
  try {
    console.log('\n🚀 Loading remittance data for date:', selectedDate);
    console.log('📋 Data flow: DailyTrips (trip info) → DailyTrips (ticket details) → Combined Result');
    
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    const allRemittanceData = [];

    console.log(`👥 Found ${conductorsSnapshot.docs.length} conductors total`);

    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;
      console.log(`\n📍 Processing conductor: ${conductorId}`);
      
      try {
        // Check if remittance date exists (for verification)
        const remittanceCheck = await getDoc(doc(db, `conductors/${conductorId}/remittance/${selectedDate}`));
        const hasRemittance = remittanceCheck.exists();
        console.log(`  📋 Remittance document exists: ${hasRemittance}`);
        
        // Get trip info from dailyTrips (since that's where trip maps are)
        const tripData = await getTripDataFromDailyTrips(conductorId, selectedDate);
        
        console.log(`📦 Got ${tripData.length} trips for conductor ${conductorId}`);
        
        for (const trip of tripData) {
          console.log(`📋 Creating final entry for trip ${trip.tripNumber} (conductor: ${conductorId})`);
          
          // Get remittance summary data if available
          const remittanceSummary = hasRemittance ? await getRemittanceSummaryData(conductorId, selectedDate) : null;
          
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
            isComplete: trip.isComplete, // Status from dailyTrips
            startTime: trip.startTime, // Time from dailyTrips
            endTime: trip.endTime, // Time from dailyTrips
            placeCollection: trip.placeCollection, // Place info from dailyTrips
            tripData: trip.data, // Original dailyTrips trip data
            remittanceSummary: remittanceSummary // Summary from remittance (if available)
          };
          
          allRemittanceData.push(remittanceEntry);
          console.log(`✅ Added remittance entry for ${conductorId}/${trip.tripNumber}`);
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

    console.log('\n📊 FINAL RESULTS:');
    console.log(`📊 Remittance data loaded: ${allRemittanceData.length} trips found`);
    
    if (allRemittanceData.length > 0) {
      console.log('📋 Sample remittance entry:', allRemittanceData[0]);
      console.log('📋 All trips summary:', 
        allRemittanceData.map(trip => ({
          conductor: trip.conductorId,
          trip: trip.tripNumber,
          direction: trip.tripDirection,
          revenue: trip.totalRevenue,
          passengers: trip.totalPassengers,
          tickets: trip.ticketCount
        }))
      );
    } else {
      console.log('❌ No remittance data found for date:', selectedDate);
      console.log('💡 This could mean:');
      console.log('  1. No dailyTrips document exists for this date');
      console.log('  2. No trip maps found in dailyTrips document');
      console.log('  3. No tickets found in dailyTrips ticket collections');
    }
    
    return allRemittanceData;
  } catch (error) {
    console.error('Error loading remittance data:', error);
    throw error;
  }
};

// Function to calculate remittance summary
export const calculateRemittanceSummary = (remittanceData) => {
  // Count unique trips by combining conductorId, date, and tripNumber
  const uniqueTrips = new Set();
  
  const summary = remittanceData.reduce((acc, trip) => {
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
  }, { 
    totalRevenue: 0, 
    totalPassengers: 0, 
    totalTickets: 0
  });

  // Set totalTrips to the count of unique trips
  summary.totalTrips = uniqueTrips.size;
  summary.averageFare = summary.totalPassengers > 0 ? summary.totalRevenue / summary.totalPassengers : 0;
  
  console.log('📊 Remittance summary calculated:', summary);
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
    
    grouped[conductorId].conductorSummary = {
      totalTrips: trips.length,
      totalRevenue: conductorTotal,
      totalPassengers: conductorPassengers,
      averageFare: conductorPassengers > 0 ? conductorTotal / conductorPassengers : 0
    };
  });
  
  return grouped;
};

// Function to get remittance data by conductor for a specific date
export const getRemittanceByDate = async (date) => {
  try {
    const remittanceData = await loadRemittanceData(date);
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
export const formatTicketType = (ticketType, source) => {
  const type = ticketType || source || '';
  
  if (type === 'preTicket' || type === 'pre-ticket' || type === 'pre-ticketing') {
    return 'Pre-Ticket';
  } else if (type === 'preBooking' || type === 'pre-booking' || type === 'pre-book') {
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