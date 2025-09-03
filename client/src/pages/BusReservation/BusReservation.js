import { db } from '/src/firebase/firebase.js';
import {
  collection,
  onSnapshot,
  getDocs,
  addDoc,
  query,
  where,
  setDoc,
  doc,
  updateDoc,
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { logActivity, ACTIVITY_TYPES } from '/src/pages/settings/auditService.js';

// Real-time bus listener
export const subscribeToBuses = (callback) => {
  const busesCollection = collection(db, 'AvailableBuses');
  const unsubscribe = onSnapshot(busesCollection, (snapshot) => {
    const buses = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(buses);
  });

  return unsubscribe; // Return unsubscribe function to stop listening
};


// Add a new bus to Firestore
export const addNewBus = async (busData) => {
  try {
    // Check if plate number already exists
    const busesCollection = collection(db, 'AvailableBuses');
    const plateQuery = query(busesCollection, where('plateNumber', '==', busData.plateNumber));
    const existingBuses = await getDocs(plateQuery);
    
    if (!existingBuses.empty) {
      throw new Error('A bus with this plate number already exists');
    }

    // Prepare the bus document data
    const newBusData = {
      name: busData.name,
      plateNumber: busData.plateNumber,
      codingDays: busData.codingDays,
      Price: 2000, 
      busID: busData.plateNumber, 
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const busDocRef = doc(db, 'AvailableBuses', busData.name);
      await setDoc(busDocRef, newBusData);

      // Log the activity
      await logActivity(
        ACTIVITY_TYPES.BUS_CREATE,
        `Created new bus: ${newBusData.name} (${newBusData.plateNumber})`,
        { 
          busName: newBusData.name,
          plateNumber: newBusData.plateNumber,
          codingDays: newBusData.codingDays,
          busId: busDocRef.id
        }
      );

      return {
        id: busDocRef.id,
        ...newBusData
      };
    
  } catch (error) {
    console.error("Error adding new bus:", error);
    throw error;
  }
};

export const validateBusData = (busData) => {
  const errors = {};

  if (!busData.name || busData.name.trim() === '') {
    errors.name = 'Bus name is required';
  }

  if (!busData.plateNumber || busData.plateNumber.trim() === '') {
    errors.plateNumber = 'Plate number is required';
  }

  if (!busData.codingDays || busData.codingDays.length === 0) {
    errors.codingDays = 'At least one coding day must be selected';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// Helper function to get day of week from date
const getDayOfWeek = (date) => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
};

// Helper function to format date as YYYY-MM-DD
const formatDate = (date) => {
  return date.toISOString().split('T')[0];
};

// Create a new reservation
export const createBusReservation = async (busId, reservationDate, customerInfo) => {
  try {
    // Check if bus exists and is available
    const busRef = doc(db, 'AvailableBuses', busId);
    const busDoc = await getDocs(query(collection(db, 'AvailableBuses'), where('__name__', '==', busId)));
    
    if (busDoc.empty) {
      throw new Error('Bus not found');
    }
    
    const bus = busDoc.docs[0].data();
    
    // Check if bus is available (not coding day)
    const reservationDay = getDayOfWeek(reservationDate);
    if (bus.codingDays && bus.codingDays.includes(reservationDay)) {
      throw new Error(`Bus is not available on ${reservationDay} (coding day)`);
    }

    // Create reservation document
    const reservationData = {
      busId: busId,
      busName: bus.name,
      plateNumber: bus.plateNumber,
      reservationDate: Timestamp.fromDate(reservationDate),
      customerInfo: customerInfo,
      status: 'scheduled', // scheduled -> inTransit -> completed
      createdAt: Timestamp.fromDate(new Date()),
      price: bus.Price
    };

    // Add to reservations collection
    const reservationRef = await addDoc(collection(db, 'BusReservations'), reservationData);

    // Update bus status to reserved
    await updateDoc(busRef, {
      status: 'reserved',
      currentReservation: reservationRef.id,
      reservationDate: Timestamp.fromDate(reservationDate),
      updatedAt: Timestamp.fromDate(new Date())
    });

    return {
      id: reservationRef.id,
      ...reservationData
    };
  } catch (error) {
    console.error("Error creating reservation:", error);
    throw error;
  }
};

// Update bus statuses based on current date and reservations
export const updateBusStatuses = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    console.log('Updating bus statuses for date:', formatDate(today));

    // Get all buses
    const busesSnapshot = await getDocs(collection(db, 'AvailableBuses'));
    const buses = busesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Get all active reservations
    const reservationsSnapshot = await getDocs(collection(db, 'BusReservations'));
    const reservations = reservationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    for (const bus of buses) {
      const busRef = doc(db, 'AvailableBuses', bus.id);
      
      // Find reservation for this bus
      const busReservation = reservations.find(res => 
        res.busId === bus.id && res.status !== 'completed'
      );

      if (busReservation) {
        const reservationDate = busReservation.reservationDate.toDate();
        reservationDate.setHours(0, 0, 0, 0);
        
        // Check if reservation date is today
        if (reservationDate.getTime() === today.getTime()) {
          // Bus should be "In Transit" today
          if (bus.status !== 'inTransit') {
            await updateDoc(busRef, {
              status: 'inTransit',
              updatedAt: Timestamp.fromDate(new Date())
            });
            
            // Update reservation status
            const reservationRef = doc(db, 'BusReservations', busReservation.id);
            await updateDoc(reservationRef, {
              status: 'inTransit',
              updatedAt: Timestamp.fromDate(new Date())
            });
            
            console.log(`Bus ${bus.name} set to In Transit for today's reservation`);
          }
        }
        // Check if reservation was yesterday (bus should return to available)
        else if (reservationDate.getTime() === today.getTime() - (24 * 60 * 60 * 1000)) {
          // Bus should be available again
          await updateDoc(busRef, {
            status: 'active',
            currentReservation: null,
            reservationDate: null,
            updatedAt: Timestamp.fromDate(new Date())
          });
          
          // Mark reservation as completed
          const reservationRef = doc(db, 'BusReservations', busReservation.id);
          await updateDoc(reservationRef, {
            status: 'completed',
            completedAt: Timestamp.fromDate(new Date()),
            updatedAt: Timestamp.fromDate(new Date())
          });
          
          console.log(`Bus ${bus.name} returned to Available after completing reservation`);
        }
        // Check if reservation date is in the future
        else if (reservationDate.getTime() > today.getTime()) {
          // Bus should be reserved
          if (bus.status !== 'reserved') {
            await updateDoc(busRef, {
              status: 'reserved',
              updatedAt: Timestamp.fromDate(new Date())
            });
            console.log(`Bus ${bus.name} set to Reserved for future reservation`);
          }
        }
      } else {
        // No active reservation, bus should be available (if not coding day)
        const todayDayName = getDayOfWeek(today);
        const isCodingDay = bus.codingDays && bus.codingDays.includes(todayDayName);
        
        if (!isCodingDay && bus.status !== 'active') {
          await updateDoc(busRef, {
            status: 'active',
            currentReservation: null,
            reservationDate: null,
            updatedAt: Timestamp.fromDate(new Date())
          });
          console.log(`Bus ${bus.name} set to Available (no reservations)`);
        }
      }
    }
    
    console.log('Bus status update completed');
  } catch (error) {
    console.error("Error updating bus statuses:", error);
    throw error;
  }
};

// Initialize status checker (call this when app loads)
export const initializeBusStatusChecker = () => {
  // Run immediately
  updateBusStatuses();
  
  // Set up interval to run every hour
  const interval = setInterval(updateBusStatuses, 60 * 60 * 1000); // Every hour
  
  return () => clearInterval(interval); // Return cleanup function
};

// Get reservations for a specific date range
export const getReservations = async (startDate, endDate) => {
  try {
    const reservationsRef = collection(db, 'BusReservations');
    let q = reservationsRef;
    
    if (startDate) {
      q = query(q, where('reservationDate', '>=', Timestamp.fromDate(startDate)));
    }
    if (endDate) {
      q = query(q, where('reservationDate', '<=', Timestamp.fromDate(endDate)));
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error("Error getting reservations:", error);
    throw error;
  }
};

// Check if a bus is available for a specific date
export const checkBusAvailability = async (busId, date) => {
  try {
    const busDoc = await getDocs(query(collection(db, 'AvailableBuses'), where('__name__', '==', busId)));
    
    if (busDoc.empty) {
      return { available: false, reason: 'Bus not found' };
    }
    
    const bus = busDoc.docs[0].data();
    const dayOfWeek = getDayOfWeek(date);
    
    // Check coding day
    if (bus.codingDays && bus.codingDays.includes(dayOfWeek)) {
      return { available: false, reason: 'Coding day' };
    }
    
    // Check existing reservations
    const reservationsQuery = query(
      collection(db, 'BusReservations'),
      where('busId', '==', busId),
      where('reservationDate', '==', Timestamp.fromDate(date)),
      where('status', 'in', ['scheduled', 'inTransit'])
    );
    
    const existingReservations = await getDocs(reservationsQuery);
    
    if (!existingReservations.empty) {
      return { available: false, reason: 'Already reserved for this date' };
    }
    
    return { available: true, reason: 'Available' };
  } catch (error) {
    console.error("Error checking bus availability:", error);
    return { available: false, reason: 'Error checking availability' };
  }
};

// Update an existing bus
export const updateBus = async (busId, busData) => {
  try {
    // Check if plate number already exists for a different bus
    const busesCollection = collection(db, 'AvailableBuses');
    const plateQuery = query(busesCollection, where('plateNumber', '==', busData.plateNumber));
    const existingBuses = await getDocs(plateQuery);
    
    // If plate number exists and it's not the current bus being updated
    if (!existingBuses.empty && existingBuses.docs[0].id !== busId) {
      throw new Error('A bus with this plate number already exists');
    }

    // Prepare the updated bus document data
    const updatedBusData = {
      name: busData.name,
      plateNumber: busData.plateNumber,
      codingDays: busData.codingDays || [],
      Price: busData.Price || 2000,
      busID: busData.plateNumber,
      updatedAt: Timestamp.fromDate(new Date())
    };

    // Update the bus document
    const busRef = doc(db, 'AvailableBuses', busId);
    await updateDoc(busRef, updatedBusData);

    // Log the activity
    await logActivity(
      ACTIVITY_TYPES.DATA_UPDATE,
      'Bus information updated',
      {
        busId,
        busName: busData.name,
        plateNumber: busData.plateNumber,
        updatedFields: Object.keys(updatedBusData)
      }
    );

    console.log('Bus updated successfully:', busId);
    return { success: true, message: 'Bus updated successfully' };
  } catch (error) {
    console.error('Error updating bus:', error);
    throw error;
  }
};

// Delete a bus and its related reservations
export const deleteBus = async (busId) => {
  try {
    // First, get the bus data to check if it has active reservations
    const busRef = doc(db, 'AvailableBuses', busId);
    const busSnapshot = await getDocs(query(collection(db, 'AvailableBuses'), where('__name__', '==', busId)));
    
    if (busSnapshot.empty) {
      throw new Error('Bus not found');
    }

    const bus = busSnapshot.docs[0].data();

    // Check for active reservations
    const activeReservationsQuery = query(
      collection(db, 'BusReservations'),
      where('busId', '==', busId),
      where('status', 'in', ['scheduled', 'inTransit'])
    );
    
    const activeReservations = await getDocs(activeReservationsQuery);
    
    if (!activeReservations.empty) {
      throw new Error('Cannot delete bus with active reservations. Please complete or cancel reservations first.');
    }

    // Delete all completed reservations for this bus
    const allReservationsQuery = query(
      collection(db, 'BusReservations'),
      where('busId', '==', busId)
    );
    
    const allReservations = await getDocs(allReservationsQuery);
    
    // Delete reservations in batch
    const deletePromises = allReservations.docs.map(reservation => 
      deleteDoc(doc(db, 'BusReservations', reservation.id))
    );
    
    await Promise.all(deletePromises);

    // Finally, delete the bus
    await deleteDoc(busRef);

    // Log the activity
    await logActivity(
      ACTIVITY_TYPES.BUS_DELETE,
      `Deleted bus: ${bus.name} (${bus.plateNumber})`,
      { 
        busName: bus.name,
        plateNumber: bus.plateNumber,
        busId: busId,
        deletedReservations: allReservations.size
      }
    );

    console.log(`Successfully deleted bus ${bus.name} and ${allReservations.size} reservations`);
    
    return {
      success: true,
      message: `Bus ${bus.name} deleted successfully`,
      deletedReservations: allReservations.size
    };

  } catch (error) {
    console.error("Error deleting bus:", error);
    throw error;
  }
};