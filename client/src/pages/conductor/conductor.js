import { 
  collection, 
  getDocs, 
  setDoc,
  serverTimestamp,
  updateDoc,    
  doc, 
  getDoc,
  query,
  orderBy,
  onSnapshot,
  where
} from 'firebase/firestore';
import { db, auth} from '/src/firebase/firebase';

class ConductorService {
  constructor() {
    this.listeners = new Map();
  }

  // Get all conductors with basic info
  async getAllConductors() {
    try {
      const conductorsRef = collection(db, 'conductors');
      const snapshot = await getDocs(conductorsRef);
      
      const conductors = [];
      for (const doc of snapshot.docs) {
        const conductorData = doc.data();
        conductors.push({
          id: doc.id,
          ...conductorData,
          tripsCount: await this.getConductorTripsCount(doc.id)
        });
      }
      
      return conductors;
    } catch (error) {
      console.error('Error fetching conductors:', error);
      throw error;
    }
  }

  // Get detailed conductor information
  async getConductorDetails(conductorId) {
  try {
    const conductorRef = doc(db, 'conductors', conductorId);
    const conductorDoc = await getDoc(conductorRef);

    if (!conductorDoc.exists()) {
      throw new Error('Conductor not found');
    }

    const conductorData = conductorDoc.data();
    const { allTrips } = await this.getConductorTrips(conductorId);
    const tripsArray = Array.isArray(allTrips) ? allTrips : Object.values(allTrips || {});

    return {
      id: conductorDoc.id,
      ...conductorData,
      trips: tripsArray,
      totalTrips: tripsArray.length,
      todayTrips: tripsArray.filter(trip => this.isToday(trip.date)).length
    };
  } catch (error) {
    console.error('Error fetching conductor details:', error);
    throw error;
  }
}

    // Get conductor trips
async getConductorTrips(conductorId, limit = null) {
  try {
    const tripsRef = collection(db, 'conductors', conductorId, 'trips');
    const datesSnapshot = await getDocs(tripsRef);
    const allTrips = [];
    const availableDates = [];

    for (const dateDoc of datesSnapshot.docs) {
      const date = dateDoc.id;
      availableDates.push(date);

      const ticketsRef = collection(db, 'conductors', conductorId, 'trips', date, 'tickets');
      const ticketsSnapshot = await getDocs(ticketsRef);

      ticketsSnapshot.docs.forEach(ticketDoc => {
        const ticketData = ticketDoc.data();
        allTrips.push({
          id: ticketDoc.id,
          date: date,
          ticketNumber: ticketDoc.id,
          ...ticketData,
          timestamp: ticketData.timestamp || null
        });
      });
    }

    // Sort by timestamp (most recent first)
    allTrips.sort((a, b) => {
      if (!a.timestamp || !b.timestamp) return 0;
      return b.timestamp.toDate() - a.timestamp.toDate();
    });

    return {
      allTrips: limit ? allTrips.slice(0, limit) : allTrips,
      availableDates,
    };
  } catch (error) {
    console.error('Error fetching conductor trips:', error);
    return {
      allTrips: [],
      availableDates: [],
    };
  }
}


  // Get trips count for a conductor
  async getConductorTripsCount(conductorId) {
    try {
      const { allTrips } = await this.getConductorTrips(conductorId);
      return allTrips.length;
    } catch (error) {
      console.error('Error getting trips count:', error);
      return 0;
    }
  }

  // Get trips for a specific date
  async getConductorTripsByDate(conductorId, date) {
  try {
    const ticketsRef = collection(db, 'conductors', conductorId, 'trips', date, 'tickets');
    const snapshot = await getDocs(ticketsRef);
    
    const trips = [];
    snapshot.docs.forEach(doc => {
      trips.push({
        id: doc.id,
        ticketNumber: doc.id,
        date: date,
        ...doc.data()
      });
    });
    
    return trips;
  } catch (error) {
    console.error('Error fetching trips by date:', error);
    return [];
  }
}


  // Real-time listener for conductors
  setupConductorsListener(callback) {
    const conductorsRef = collection(db, 'conductors');
    
    const unsubscribe = onSnapshot(conductorsRef, async (snapshot) => {
      const conductors = [];
      
      for (const doc of snapshot.docs) {
        const conductorData = doc.data();
        const tripsCount = await this.getConductorTripsCount(doc.id);
        
        conductors.push({
          id: doc.id,
          ...conductorData,
          tripsCount
        });
      }
      
      callback(conductors);
    }, (error) => {
      console.error('Error in conductors listener:', error);
      callback([]);
    });
    
    this.listeners.set('conductors', unsubscribe);
    return unsubscribe;
  }

  // Real-time listener for specific conductor
  setupConductorListener(conductorId, callback) {
    const conductorRef = doc(db, 'conductors', conductorId);
    
    const unsubscribe = onSnapshot(conductorRef, async (doc) => {
      if (doc.exists()) {
        const conductorData = doc.data();
        const { allTrips } = await this.getConductorTrips(conductorId, 10); // Latest 10 trips
        
        callback({
          id: doc.id,
          ...conductorData,
          trips,
          totalTrips: trips.length
        });
      } else {
        callback(null);
      }
    }, (error) => {
      console.error('Error in conductor listener:', error);
      callback(null);
    });
    
    this.listeners.set(`conductor_${conductorId}`, unsubscribe);
    return unsubscribe;
  }

  // Get online conductors
  async getOnlineConductors() {
    try {
      const conductorsRef = collection(db, 'conductors');
      const onlineQuery = query(conductorsRef, where('isOnline', '==', true));
      const snapshot = await getDocs(onlineQuery);
      
      const onlineConductors = [];
      snapshot.docs.forEach(doc => {
        onlineConductors.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return onlineConductors;
    } catch (error) {
      console.error('Error fetching online conductors:', error);
      return [];
    }
  }

  // Search conductors
  async searchConductors(searchTerm) {
    try {
      const conductors = await this.getAllConductors();
      
      return conductors.filter(conductor => 
        conductor.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conductor.route?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conductor.busNumber?.toString().includes(searchTerm) ||
        conductor.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    } catch (error) {
      console.error('Error searching conductors:', error);
      return [];
    }
  }

  // Utility functions
  isToday(dateString) {
    const today = new Date().toISOString().split('T')[0];
    const compareDate = new Date(dateString).toISOString().split('T')[0];
    return today === compareDate;
  }

  formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error formatting timestamp:', error);
      return 'Invalid Date';
    }
  }

  getStatusColor(isOnline, lastSeen) {
    if (isOnline) return '#4CAF50'; // Green
    
    if (!lastSeen) return '#757575'; // Gray
    
    const now = new Date();
    const lastSeenDate = lastSeen.toDate ? lastSeen.toDate() : new Date(lastSeen);
    const diffMinutes = (now - lastSeenDate) / (1000 * 60);
    
    if (diffMinutes < 30) return '#FF9800'; // Orange
    return '#F44336'; // Red
  }

  getStatusText(isOnline, lastSeen) {
    if (isOnline) return 'Online';
    
    if (!lastSeen) return 'Never seen';
    
    const now = new Date();
    const lastSeenDate = lastSeen.toDate ? lastSeen.toDate() : new Date(lastSeen);
    const diffMinutes = (now - lastSeenDate) / (1000 * 60);
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${Math.floor(diffMinutes)}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    return `${Math.floor(diffMinutes / 1440)}d ago`;
  }

  // Clean up listeners
  removeListener(key) {
    const unsubscribe = this.listeners.get(key);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(key);
    }
  }

  removeAllListeners() {
    this.listeners.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.listeners.clear();
  }
  
  // Extract document ID from email (matches your current logic)
  extractDocumentId(email) {
    return email.split('@')[0].replace(/\./g, '_');
  }

  // Create new conductor (matches your current implementation but with improvements)
  async createConductor(formData) {
    try {
      const { busNumber, email, name, route, password } = formData;
      
      // Validate required fields
      if (!busNumber || !email || !name || !route || !password) {
        throw new Error('All fields are required');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Please enter a valid email address');
      }

      // Validate password length
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      // Check if conductor already exists
      const documentId = this.extractDocumentId(email);
      const existingConductor = await this.checkConductorExists(documentId);
      if (existingConductor) {
        throw new Error('A conductor with this email already exists');
      }

      // Step 1: Create user in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Step 2: Update user profile
      await updateProfile(user, {
        displayName: name
      });

      // Step 3: Create conductor document in Firestore
      const conductorData = {
        busNumber: parseInt(busNumber),
        email: email,
        name: name,
        route: route,
        isOnline: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastSeen: null,
        currentLocation: null,
        uid: user.uid, // Link to Firebase Auth user
        
        // Initialize trip counters
        totalTrips: 0,
        todayTrips: 0,
        
        // Status tracking
        status: 'offline'
      };

      await setDoc(doc(db, 'conductors', documentId), conductorData);

      console.log('Conductor created successfully:', {
        documentId: documentId,
        uid: user.uid,
        email: email
      });

      return {
        success: true,
        data: {
          id: documentId,
          uid: user.uid,
          ...conductorData
        },
        message: 'Conductor created successfully'
      };

    } catch (error) {
      console.error('Error creating conductor:', error);
      
      // Handle specific Firebase Auth errors
      let errorMessage = 'Failed to create conductor';
      
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'Email address is already registered';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address format';
          break;
        case 'auth/weak-password':
          errorMessage = 'Password should be at least 6 characters';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Please check your internet connection';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many failed attempts. Please try again later';
          break;
        default:
          errorMessage = error.message || 'An unexpected error occurred';
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  // Check if conductor exists
  async checkConductorExists(documentId) {
    try {
      const conductorRef = doc(db, 'conductors', documentId);
      const conductorDoc = await getDoc(conductorRef);
      return conductorDoc.exists();
    } catch (error) {
      console.error('Error checking conductor existence:', error);
      return false;
    }
  }

  // Update conductor information
  async updateConductor(documentId, updateData) {
    try {
      const conductorRef = doc(db, 'conductors', documentId);
      
      // Check if conductor exists
      const exists = await this.checkConductorExists(documentId);
      if (!exists) {
        throw new Error('Conductor not found');
      }

      const updatedData = {
        ...updateData,
        updatedAt: serverTimestamp()
      };

      await updateDoc(conductorRef, updatedData);

      return {
        success: true,
        message: 'Conductor updated successfully'
      };

    } catch (error) {
      console.error('Error updating conductor:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update conductor online status
  async updateConductorStatus(documentId, isOnline) {
    try {
      const conductorRef = doc(db, 'conductors', documentId);
      
      const statusUpdate = {
        isOnline: isOnline,
        lastSeen: serverTimestamp(),
        status: isOnline ? 'online' : 'offline',
        updatedAt: serverTimestamp()
      };

      await updateDoc(conductorRef, statusUpdate);

      return {
        success: true,
        message: 'Status updated successfully'
      };

    } catch (error) {
      console.error('Error updating conductor status:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get conductor by document ID
  async getConductorById(documentId) {
    try {
      const conductorRef = doc(db, 'conductors', documentId);
      const conductorDoc = await getDoc(conductorRef);
      
      if (!conductorDoc.exists()) {
        return {
          success: false,
          error: 'Conductor not found'
        };
      }

      return {
        success: true,
        data: {
          id: conductorDoc.id,
          ...conductorDoc.data()
        }
      };

    } catch (error) {
      console.error('Error fetching conductor:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Validate form data
  validateConductorData(formData) {
    const errors = [];
    
    if (!formData.name || formData.name.trim().length < 2) {
      errors.push('Name must be at least 2 characters long');
    }
    
    if (!formData.email) {
      errors.push('Email is required');
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        errors.push('Please enter a valid email address');
      }
    }
    
    if (!formData.busNumber) {
      errors.push('Bus number is required');
    } else if (isNaN(formData.busNumber) || parseInt(formData.busNumber) <= 0) {
      errors.push('Please enter a valid bus number');
    }
    
    if (!formData.route || formData.route.trim().length < 3) {
      errors.push('Route must be at least 3 characters long');
    }
    
    if (!formData.password) {
      errors.push('Password is required');
    } else if (formData.password.length < 6) {
      errors.push('Password must be at least 6 characters long');
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }
}


// Export singleton instance
export const conductorService = new ConductorService();
export default conductorService;