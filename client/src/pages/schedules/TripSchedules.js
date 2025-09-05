import { 
  collection, 
  onSnapshot, 
  addDoc, 
  setDoc,
  deleteDoc, 
  doc, 
  getDoc,
  updateDoc, 
  orderBy, 
  query,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '/src/firebase/firebase.js';
import { logActivity, ACTIVITY_TYPES } from '/src/pages/settings/auditService.js';

// Collection reference
const TRIP_SCHEDULES_COLLECTION = 'trip_sched';

/**
 * Convert 24-hour time to 12-hour format with AM/PM
 * @param {string} time24 - Time in 24-hour format (HH:MM)
 * @returns {string} Time in 12-hour format with AM/PM
 */
const convertTo12Hour = (time24) => {
  try {
    if (!time24 || typeof time24 !== 'string') return '';
    
    const [hours, minutes] = time24.split(':');
    const hour24 = parseInt(hours);
    const minute = parseInt(minutes);
    
    if (isNaN(hour24) || isNaN(minute)) return time24;
    
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    
    return `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`;
  } catch (error) {
    console.warn('Error converting to 12-hour format:', error);
    return time24;
  }
};

/**
 * Convert 12-hour time to 24-hour format
 * @param {string} time12 - Time in 12-hour format with AM/PM
 * @returns {string} Time in 24-hour format (HH:MM)
 */
const convertTo24Hour = (time12) => {
  try {
    if (!time12 || typeof time12 !== 'string') return '';
    
    const timeStr = time12.trim().toUpperCase();
    const [timePart, ampm] = timeStr.split(/\s+/);
    const [hours, minutes] = timePart.split(':');
    
    let hour24 = parseInt(hours);
    const minute = parseInt(minutes);
    
    if (isNaN(hour24) || isNaN(minute)) return time12;
    
    if (ampm === 'PM' && hour24 !== 12) {
      hour24 += 12;
    } else if (ampm === 'AM' && hour24 === 12) {
      hour24 = 0;
    }
    
    return `${hour24.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  } catch (error) {
    console.warn('Error converting to 24-hour format:', error);
    return time12;
  }
};

/**
 * Parse schedule string to array
 * @param {string|Array} schedules - Comma-separated string or array of schedules
 * @returns {Array<string>} Array of schedule times
 */
const parseSchedules = (schedules) => {
  if (Array.isArray(schedules)) {
    return schedules;
  }
  
  if (typeof schedules === 'string') {
    return schedules.split(',').map(time => time.trim()).filter(time => time);
  }
  
  return [];
};

/**
 * Format schedules array to string for storage
 * @param {Array<string>} schedulesArray - Array of schedule times
 * @returns {string} Comma-separated string of schedules
 */
const formatSchedulesForStorage = (schedulesArray) => {
  if (!Array.isArray(schedulesArray)) return '';
  return schedulesArray.join(', ');
};

/**
 * Subscribe to real-time trip schedules updates
 * @param {Function} callback - Function to handle the schedules data
 * @param {Function} errorCallback - Function to handle errors
 * @returns {Function} Unsubscribe function
 */
export const subscribeToTripSchedules = (callback, errorCallback) => {
  try {
    console.log('Setting up trip schedules subscription...'); // Debug log
    
    // Since we can't orderBy when documents have custom IDs without createdAt field,
    // we'll get all documents and sort them in memory if needed
    const unsubscribe = onSnapshot(
      collection(db, TRIP_SCHEDULES_COLLECTION),
      (querySnapshot) => {
        const schedules = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          schedules.push({
            id: doc.id, // This will be the conductor ID 
            conductorId: doc.id, // Store conductor ID explicitly
            ...data,
            // Parse schedules string to array for consistent handling
            schedulesArray: parseSchedules(data.schedules)
          });
        });
        
        // Sort by conductor ID or route name for consistent display
        schedules.sort((a, b) => {
          if (a.route && b.route) {
            return a.route.localeCompare(b.route);
          }
          return a.id.localeCompare(b.id);
        });
        
        callback(schedules);
      },
      (error) => {
        console.error('Error subscribing to trip schedules:', error);
        if (errorCallback) {
          errorCallback('Failed to load trip schedules: ' + error.message);
        }
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('Error setting up trip schedules subscription:', error);
    if (errorCallback) {
      errorCallback('Failed to initialize trip schedules: ' + error.message);
    }
    return () => {}; // Return empty function as fallback
  }
};

/**
 * Add a new trip schedule
 * @param {Object} scheduleData - The schedule data to add
 * @param {string} scheduleData.conductorId - Conductor ID to use as document ID
 * @param {string} scheduleData.route - Route name
 * @param {Array<string>|string} scheduleData.schedules - Array of departure times or comma-separated string
 * @param {string} scheduleData.status - Schedule status ('active' or 'inactive')
 * @returns {Promise<string>} The ID of the created document
 */
export const addTripSchedule = async (scheduleData) => {
  try {
    // Validate required fields
    if (!scheduleData.conductorId || !scheduleData.conductorId.trim()) {
      throw new Error('Conductor ID is required');
    }
    
    if (!scheduleData.route || !scheduleData.route.trim()) {
      throw new Error('Route name is required');
    }

    let schedulesArray = [];
    
    // Handle both array and string input
    if (Array.isArray(scheduleData.schedules)) {
      schedulesArray = scheduleData.schedules;
    } else if (typeof scheduleData.schedules === 'string') {
      schedulesArray = parseSchedules(scheduleData.schedules);
    }

    if (schedulesArray.length === 0) {
      throw new Error('At least one schedule time is required');
    }

    // Clean and validate schedule times
    const cleanSchedules = schedulesArray
      .filter(time => time && time.trim())
      .map(time => time.trim());

    if (cleanSchedules.length === 0) {
      throw new Error('At least one valid schedule time is required');
    }

    // Validate time format (both 12-hour and 24-hour)
    const time12Regex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM)$/i;
    const time24Regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    
    const invalidTimes = cleanSchedules.filter(time => 
      !time12Regex.test(time) && !time24Regex.test(time)
    );
    
    if (invalidTimes.length > 0) {
      throw new Error(`Invalid time format: ${invalidTimes.join(', ')}. Please use HH:MM AM/PM or HH:MM format.`);
    }

    // Convert all times to 12-hour format and sort
    const formattedSchedules = cleanSchedules.map(time => {
      if (time24Regex.test(time)) {
        return convertTo12Hour(time);
      }
      return time;
    });

    // Sort schedules by time (convert to 24-hour for sorting, then back to 12-hour)
    const sortedSchedules = formattedSchedules.sort((a, b) => {
      const time24A = convertTo24Hour(a);
      const time24B = convertTo24Hour(b);
      return time24A.localeCompare(time24B);
    });

    // Prepare the document data
    const docData = {
      route: scheduleData.route.trim(),
      schedules: formatSchedulesForStorage(sortedSchedules), // Store as comma-separated string
      status: scheduleData.status || 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    // Add to Firestore using conductor ID as document ID
    const conductorId = scheduleData.conductorId.trim();
    const docRef = doc(db, TRIP_SCHEDULES_COLLECTION, conductorId);
    await setDoc(docRef, docData);
    
    // Log the activity
    await logActivity(
      ACTIVITY_TYPES.SCHEDULE_CREATE,
      {
        scheduleId: conductorId,
        route: docData.route,
        conductorId: conductorId,
        schedules: sortedSchedules,
        schedulesCount: sortedSchedules.length,
        status: docData.status,
        formattedSchedules: formatSchedulesForStorage(sortedSchedules)
      }
    );
  
    return conductorId;

  } catch (error) {
    console.error('Error adding trip schedule:', error);
    throw new Error(`Failed to add trip schedule: ${error.message}`);
  }
};

/**
 * Update an existing trip schedule
 * @param {string} scheduleId - The ID of the schedule to update
 * @param {Object} updateData - The data to update
 * @returns {Promise<void>}
 */
export const updateTripSchedule = async (scheduleId, updateData) => {
  try {
    if (!scheduleId) {
      throw new Error('Schedule ID is required');
    }

    const processedData = { ...updateData };

    // Validate and clean data if schedules are being updated
    if (updateData.schedules) {
      let schedulesArray = [];
      
      // Handle both array and string input
      if (Array.isArray(updateData.schedules)) {
        schedulesArray = updateData.schedules;
      } else if (typeof updateData.schedules === 'string') {
        schedulesArray = parseSchedules(updateData.schedules);
      }

      if (schedulesArray.length === 0) {
        throw new Error('At least one schedule time is required');
      }

      const cleanSchedules = schedulesArray
        .filter(time => time && time.trim())
        .map(time => time.trim());

      if (cleanSchedules.length === 0) {
        throw new Error('At least one valid schedule time is required');
      }

      // Validate time format
      const time12Regex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM)$/i;
      const time24Regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      
      const invalidTimes = cleanSchedules.filter(time => 
        !time12Regex.test(time) && !time24Regex.test(time)
      );
      
      if (invalidTimes.length > 0) {
        throw new Error(`Invalid time format: ${invalidTimes.join(', ')}. Please use HH:MM AM/PM or HH:MM format.`);
      }

      // Convert and sort schedules
      const formattedSchedules = cleanSchedules.map(time => {
        if (time24Regex.test(time)) {
          return convertTo12Hour(time);
        }
        return time;
      });

      const sortedSchedules = formattedSchedules.sort((a, b) => {
        const time24A = convertTo24Hour(a);
        const time24B = convertTo24Hour(b);
        return time24A.localeCompare(time24B);
      });

      processedData.schedules = formatSchedulesForStorage(sortedSchedules);
    }

    // Add update timestamp
    const docData = {
      ...processedData,
      updatedAt: serverTimestamp()
    };

    // Get current schedule data before update for activity logging
    const scheduleRef = doc(db, TRIP_SCHEDULES_COLLECTION, scheduleId);
    const currentDoc = await getDoc(scheduleRef);
    const currentData = currentDoc.exists() ? currentDoc.data() : null;

    // Update in Firestore
    await updateDoc(scheduleRef, docData);

    // Log the update activity
    const changedFields = Object.keys(processedData).filter(key => key !== 'updatedAt');
    await logActivity(
      ACTIVITY_TYPES.SCHEDULE_UPDATE,
      {
        scheduleId: scheduleId,
        route: currentData?.route || processedData.route || 'Unknown Route',
        conductorId: scheduleId,
        changedFields: changedFields,
        previousData: {
          route: currentData?.route,
          schedules: currentData?.schedules ? parseSchedules(currentData.schedules) : [],
          status: currentData?.status
        },
        newData: {
          route: processedData.route || currentData?.route,
          schedules: processedData.schedules || (currentData?.schedules ? parseSchedules(currentData.schedules) : []),
          status: processedData.status || currentData?.status
        },
        updatedAt: new Date().toISOString()
      }
    );

  } catch (error) {
    console.error('Error updating trip schedule:', error);
    throw new Error(`Failed to update trip schedule: ${error.message}`);
  }
};

/**
 * Delete a trip schedule
 * @param {string} scheduleId - The ID of the schedule to delete
 * @returns {Promise<void>}
 */
export const deleteTripSchedule = async (scheduleId) => {
  try {
    if (!scheduleId) {
      throw new Error('Schedule ID is required');
    }

    // Get schedule data before deletion for activity logging
    const scheduleRef = doc(db, TRIP_SCHEDULES_COLLECTION, scheduleId);
    const scheduleDoc = await getDoc(scheduleRef);
    const scheduleData = scheduleDoc.exists() ? scheduleDoc.data() : null;

    // Delete from Firestore
    await deleteDoc(scheduleRef);

    // Log the deletion activity
    await logActivity(
      ACTIVITY_TYPES.SCHEDULE_DELETE,
      {
        scheduleId: scheduleId,
        route: scheduleData?.route || 'Unknown Route',
        conductorId: scheduleId,
        deletedSchedules: scheduleData?.schedules ? parseSchedules(scheduleData.schedules) : [],
        schedulesCount: scheduleData?.schedules ? parseSchedules(scheduleData.schedules).length : 0,
        status: scheduleData?.status || 'unknown',
        deletedAt: new Date().toISOString()
      }
    );

  } catch (error) {
    console.error('Error deleting trip schedule:', error);
    throw new Error(`Failed to delete trip schedule: ${error.message}`);
  }
};

/**
 * Get a single trip schedule by ID
 * @param {string} scheduleId - The ID of the schedule to fetch
 * @returns {Promise<Object|null>} The schedule data or null if not found
 */
export const getTripScheduleById = async (scheduleId) => {
  try {
    if (!scheduleId) {
      throw new Error('Schedule ID is required');
    }

    const scheduleRef = doc(db, TRIP_SCHEDULES_COLLECTION, scheduleId);
    const docSnap = await getDoc(scheduleRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        // Add parsed schedules array for easier handling
        schedulesArray: parseSchedules(data.schedules)
      };
    } else {
      return null;
    }

  } catch (error) {
    console.error('Error getting trip schedule:', error);
    throw new Error(`Failed to get trip schedule: ${error.message}`);
  }
};

/**
 * Toggle schedule status between 'active' and 'inactive'
 * @param {string} scheduleId - The ID of the schedule to toggle
 * @param {string} currentStatus - The current status
 * @returns {Promise<void>}
 */
export const toggleScheduleStatus = async (scheduleId, currentStatus) => {
  try {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    await updateTripSchedule(scheduleId, { status: newStatus });

  } catch (error) {
    console.error('Error toggling schedule status:', error);
    throw new Error(`Failed to toggle schedule status: ${error.message}`);
  }
};

/**
 * Validate schedule time format (supports both 12-hour and 24-hour)
 * @param {string} time - Time string to validate
 * @returns {boolean} True if valid, false otherwise
 */
export const validateTimeFormat = (time) => {
  const time12Regex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM)$/i;
  const time24Regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return time12Regex.test(time) || time24Regex.test(time);
};

/**
 * Format time for display (ensures 12-hour format)
 * @param {string} time - Time string
 * @returns {string} Formatted time string in 12-hour format
 */
export const formatDisplayTime = (time) => {
  try {
    if (!time) return 'N/A';
    
    // If already in 12-hour format, return as is
    const time12Regex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM)$/i;
    if (time12Regex.test(time)) {
      return time;
    }
    
    // If in 24-hour format, convert to 12-hour
    const time24Regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (time24Regex.test(time)) {
      return convertTo12Hour(time);
    }
    
    return time; // Return original if format is unclear
  } catch (error) {
    console.warn('Error formatting time:', error);
    return time;
  }
};

/**
 * Sort schedules by time
 * @param {Array<string>|string} schedules - Array of time strings or comma-separated string
 * @returns {Array<string>} Sorted array of time strings
 */
export const sortSchedulesByTime = (schedules) => {
  const schedulesArray = parseSchedules(schedules);
  
  return schedulesArray.sort((a, b) => {
    try {
      const time24A = convertTo24Hour(a);
      const time24B = convertTo24Hour(b);
      return time24A.localeCompare(time24B);
    } catch (error) {
      console.warn('Error sorting schedules:', error);
      return 0;
    }
  });
};

/**
 * Get schedules statistics
 * @param {Array<Object>} schedules - Array of schedule objects
 * @returns {Object} Statistics object
 */
export const getSchedulesStats = (schedules) => {
  if (!Array.isArray(schedules)) return { total: 0, active: 0, inactive: 0 };
  
  const stats = {
    total: schedules.length,
    active: schedules.filter(s => s.status === 'active').length,
    inactive: schedules.filter(s => s.status === 'inactive').length
  };
  
  return stats;
};

/**
 * Convert schedules from array format to database string format
 * @param {Array<string>} schedulesArray - Array of schedule times
 * @returns {string} Comma-separated string for database storage
 */
export const convertSchedulesToDatabaseFormat = (schedulesArray) => {
  if (!Array.isArray(schedulesArray)) return '';
  
  const formattedSchedules = schedulesArray.map(time => {
    // Ensure all times are in 12-hour format
    const time24Regex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (time24Regex.test(time)) {
      return convertTo12Hour(time);
    }
    return time;
  });
  
  return formatSchedulesForStorage(formattedSchedules);
};

/**
 * Convert schedules from database string format to array
 * @param {string} schedulesString - Comma-separated string from database
 * @returns {Array<string>} Array of schedule times
 */
export const convertSchedulesFromDatabaseFormat = (schedulesString) => {
  return parseSchedules(schedulesString);
};