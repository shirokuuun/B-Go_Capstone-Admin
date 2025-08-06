import { db } from '../../firebase/firebase.js';
import { collection, getDocs, addDoc, query, where, setDoc, doc } from 'firebase/firestore';

// Fetch all buses from Firestore
export const fetchBuses = async () => {
  try {
    const busesCollection = collection(db, 'AvailableBuses');
    const snapshot = await getDocs(busesCollection);
    const buses = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return buses;
  } catch (error) {
    console.error("Error fetching buses:", error);
    throw error;
  }
};

// Fetch bus counts for statistics
export const fetchBusCounts = async () => {
  try {
    const buses = await fetchBuses();
    
    const available = buses.filter(bus => bus.status === 'active').length;
    const reserved = buses.filter(bus => bus.status === 'reserved').length;
    const inTransit = buses.filter(bus => bus.status === 'inTransit').length;
    
    return {
      available,
      reserved,
      inTransit
    };
  } catch (error) {
    console.error("Error fetching bus counts:", error);
    return {
      available: 0,
      reserved: 0,
      inTransit: 0
    };
  }
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