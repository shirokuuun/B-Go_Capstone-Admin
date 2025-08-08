import { db } from '../../firebase/firebase.js';
import {
  collection,
  onSnapshot,
  getDocs,
  addDoc,
  query,
  where,
  setDoc,
  doc
} from 'firebase/firestore';

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