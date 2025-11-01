import {
  collection,
  getDocs,
  serverTimestamp,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  getDoc,
  Timestamp
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  deleteObject,
  getDownloadURL
} from 'firebase/storage';
import { db, storage } from '/src/firebase/firebase.js';
import { logActivity, ACTIVITY_TYPES } from './auditService.js';

// Available data collections for backup
export const BACKUP_COLLECTIONS = {
  ADMIN: { 
    name: 'Admin Users', 
    collection: 'Admin',
    description: 'Admin user accounts and permissions'
  },
  USERS: {
    name: 'Users',
    collection: 'users',
    description: 'Regular user accounts'
  },
  ACTIVITY_LOGS: { 
    name: 'Activity Logs', 
    collection: 'AuditLogs',
    description: 'System audit and activity logs'
  },
  TRIP_SCHEDULES: { 
    name: 'Trip Schedules', 
    collection: 'trip_sched',
    description: 'Bus route schedules and timing'
  },
  CONDUCTOR_DATA: {
    name: 'Conductor Data (Complete)',
    collection: 'conductors',
    description: 'Complete conductor data including profiles, dailyTrips, preTickets, preBookings, scannedQRCodes, and remittance with tickets'
  }
};

class BackupService {
  constructor() {
    this.backupFolder = 'system-backups';
  }

  /**
   * Create a backup of selected collections
   * @param {Array} selectedCollections - Array of collection keys to backup
   * @param {string} backupName - Optional custom backup name
   * @param {Function} progressCallback - Optional progress callback function
   * @returns {Promise<Object>} Backup result with download URL
   */
  async createBackup(selectedCollections, backupName = null, progressCallback = null) {
    try {
      const timestamp = new Date();
      const backupId = `backup_${timestamp.getTime()}`;
      const fileName = backupName || `system-backup-${timestamp.toISOString().split('T')[0]}-${timestamp.getTime()}`;
      
      // Initialize progress tracking with predefined percentages
      const totalCollections = selectedCollections.length;
      const collectionProgress = 80; // 80% for collection processing
      const uploadProgress = 90;     // 90% for upload
      const finalProgress = 100;     // 100% for completion
      
      const updateProgress = async (message, percentage) => {
        if (progressCallback) {
          progressCallback({
            percentage: Math.round(percentage),
            message,
            totalCollections,
            currentStep: Math.round(percentage / (100 / (totalCollections + 2)))
          });
        }
        // Add small delay to make progress visible
        await new Promise(resolve => setTimeout(resolve, 300));
      };

      await updateProgress('Initializing backup...', 0);

      // Collect data from selected collections
      const backupData = {
        metadata: {
          backupId,
          createdAt: timestamp.toISOString(),
          expiresAt: new Date(timestamp.getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString(), // 30 days
          collections: selectedCollections,
          version: '1.0'
        },
        data: {}
      };

      let collectionIndex = 0;
      for (const collectionKey of selectedCollections) {
        collectionIndex++;
        // Calculate percentage for each collection (spread across 0% to 80%)
        const collectionPercentage = (collectionIndex / totalCollections) * collectionProgress;
        await updateProgress(`Processing ${collectionKey} collection...`, collectionPercentage);
        const collectionInfo = BACKUP_COLLECTIONS[collectionKey.toUpperCase()];
        if (!collectionInfo) {
          continue;
        }
        
        try {
          // Special handling for CONDUCTOR_DATA to include all subcollections
          if (collectionKey.toUpperCase() === 'CONDUCTOR_DATA') {
            const conductorsData = await this.backupCompleteCondutorData();
            backupData.data[collectionKey] = conductorsData;
          } else {
            // Standard collection backup
            const collectionRef = collection(db, collectionInfo.collection);
            const snapshot = await getDocs(collectionRef);
            
            const documents = [];
            snapshot.forEach(doc => {
              documents.push({
                id: doc.id,
                data: doc.data()
              });
            });

            backupData.data[collectionKey] = {
              collection: collectionInfo.collection,
              count: documents.length,
              documents: documents
            };
          }
        } catch (collectionError) {
          backupData.data[collectionKey] = {
            collection: collectionInfo.collection,
            error: collectionError.message,
            count: 0,
            documents: []
          };
        }
      }

      // Convert to JSON and upload to Firebase Storage
      await updateProgress('Uploading backup file to storage...', uploadProgress);
      const jsonData = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });

      const storageRef = ref(storage, `${this.backupFolder}/${fileName}.json`);

      // Upload with metadata to force download instead of display
      const metadata = {
        contentType: 'application/json',
        contentDisposition: `attachment; filename="${fileName}.json"`
      };
      const uploadResult = await uploadBytes(storageRef, blob, metadata);
      
      // Get download URL
      const downloadURL = await getDownloadURL(uploadResult.ref);
      
      // Save backup metadata to Firestore for tracking
      await updateProgress('Saving backup metadata...', 95);
      await setDoc(doc(db, 'systemBackups', backupId), {
        backupId,
        fileName: `${fileName}.json`,
        createdAt: serverTimestamp(),
        expiresAt: new Date(timestamp.getTime() + (30 * 24 * 60 * 60 * 1000)),
        collections: selectedCollections,
        totalDocuments: Object.values(backupData.data).reduce((sum, col) => sum + col.count, 0),
        fileSizeBytes: blob.size,
        downloadURL,
        status: 'completed'
      });

      // Log the backup activity
      await logActivity(
        ACTIVITY_TYPES.SYSTEM_BACKUP,
        `Created system backup: ${fileName}`,
        {
          backupId,
          fileName,
          collections: selectedCollections,
          totalDocuments: Object.values(backupData.data).reduce((sum, col) => sum + col.count, 0),
          fileSizeKB: Math.round(blob.size / 1024)
        }
      );

      // Final progress update
      await updateProgress('Backup completed successfully!', finalProgress);

      return {
        success: true,
        backupId,
        fileName,
        downloadURL,
        totalDocuments: Object.values(backupData.data).reduce((sum, col) => sum + col.count, 0),
        fileSizeKB: Math.round(blob.size / 1024),
        expiresAt: backupData.metadata.expiresAt
      };

    } catch (error) {
      await logActivity(
        ACTIVITY_TYPES.SYSTEM_ERROR,
        `Backup creation failed: ${error.message}`,
        {
          error: error.message,
          selectedCollections
        }
      );

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Backup complete conductor data including all subcollections
   * @returns {Promise<Object>} Complete conductor data structure
   */
  async backupCompleteCondutorData() {
    try {
      const conductorsRef = collection(db, 'conductors');
      const conductorsSnapshot = await getDocs(conductorsRef);
      
      const completeData = {
        collection: 'conductors_complete',
        totalDocuments: 0,
        conductors: {}
      };

      for (const conductorDoc of conductorsSnapshot.docs) {
        const conductorId = conductorDoc.id;
        const conductorData = {
          profile: conductorDoc.data(),
          subcollections: {
            dailyTrips: {},
            preTickets: {},
            preBookings: {},
            scannedQRCodes: {},
            remittance: {}
          }
        };

        // Backup dailyTrips subcollection
        try {
          const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
          const dailyTripsSnapshot = await getDocs(dailyTripsRef);
          
          for (const dayDoc of dailyTripsSnapshot.docs) {
            const dateId = dayDoc.id;
            const dayData = dayDoc.data();
            conductorData.subcollections.dailyTrips[dateId] = {
              data: dayData,
              trips: {}
            };

            // Dynamically discover trip names from the date document
            const tripNames = [];
            for (const [key, value] of Object.entries(dayData)) {
              if (key.startsWith('trip') && typeof value === 'object' && value !== null) {
                tripNames.push(key);
              }
            }

            // Backup individual trips discovered from the document
            for (const tripName of tripNames) {
              try {
                // Fetch all 3 subcollections in parallel for better performance
                const [ticketsSnapshot, preBookingsSnapshot, preTicketsSnapshot] = await Promise.all([
                  getDocs(collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets')),
                  getDocs(collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'preBookings', 'preBookings')),
                  getDocs(collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'preTickets', 'preTickets'))
                ]);

                // Only add trip data if at least one subcollection has documents
                if (ticketsSnapshot.docs.length > 0 || preBookingsSnapshot.docs.length > 0 || preTicketsSnapshot.docs.length > 0) {
                  conductorData.subcollections.dailyTrips[dateId].trips[tripName] = {};

                  if (ticketsSnapshot.docs.length > 0) {
                    conductorData.subcollections.dailyTrips[dateId].trips[tripName].tickets = ticketsSnapshot.docs.map(doc => ({
                      id: doc.id,
                      data: doc.data()
                    }));
                    completeData.totalDocuments += ticketsSnapshot.docs.length;
                  }

                  if (preBookingsSnapshot.docs.length > 0) {
                    conductorData.subcollections.dailyTrips[dateId].trips[tripName].preBookings = preBookingsSnapshot.docs.map(doc => ({
                      id: doc.id,
                      data: doc.data()
                    }));
                    completeData.totalDocuments += preBookingsSnapshot.docs.length;
                  }

                  if (preTicketsSnapshot.docs.length > 0) {
                    conductorData.subcollections.dailyTrips[dateId].trips[tripName].preTickets = preTicketsSnapshot.docs.map(doc => ({
                      id: doc.id,
                      data: doc.data()
                    }));
                    completeData.totalDocuments += preTicketsSnapshot.docs.length;
                  }
                }
              } catch (tripError) {
                // Trip doesn't exist, continue
              }
            }
          }
        } catch (dailyTripsError) {
          // No dailyTrips for this conductor
        }

        // Backup preTickets subcollection (flat)
        try {
          const preTicketsRef = collection(db, 'conductors', conductorId, 'preTickets');
          const preTicketsSnapshot = await getDocs(preTicketsRef);

          preTicketsSnapshot.forEach(doc => {
            conductorData.subcollections.preTickets[doc.id] = doc.data();
            completeData.totalDocuments++;
          });
        } catch (preTicketsError) {
          // No preTickets for this conductor
        }

        // Backup preBookings subcollection (flat)
        try {
          const preBookingsRef = collection(db, 'conductors', conductorId, 'preBookings');
          const preBookingsSnapshot = await getDocs(preBookingsRef);

          preBookingsSnapshot.forEach(doc => {
            conductorData.subcollections.preBookings[doc.id] = doc.data();
            completeData.totalDocuments++;
          });
        } catch (preBookingsError) {
          // No preBookings for this conductor
        }

        // Backup scannedQRCodes subcollection (flat)
        try {
          const scannedQRCodesRef = collection(db, 'conductors', conductorId, 'scannedQRCodes');
          const scannedQRCodesSnapshot = await getDocs(scannedQRCodesRef);

          scannedQRCodesSnapshot.forEach(doc => {
            conductorData.subcollections.scannedQRCodes[doc.id] = doc.data();
            completeData.totalDocuments++;
          });
        } catch (scannedQRCodesError) {
          // No scannedQRCodes for this conductor
        }

        // Backup remittance subcollection with nested tickets
        try {
          const remittanceRef = collection(db, 'conductors', conductorId, 'remittance');
          const remittanceSnapshot = await getDocs(remittanceRef);

          for (const remittanceDoc of remittanceSnapshot.docs) {
            const dateId = remittanceDoc.id;
            conductorData.subcollections.remittance[dateId] = {
              data: remittanceDoc.data(),
              tickets: {}
            };
            completeData.totalDocuments++;

            // Backup tickets subcollection under this remittance date
            try {
              const ticketsRef = collection(db, 'conductors', conductorId, 'remittance', dateId, 'tickets');
              const ticketsSnapshot = await getDocs(ticketsRef);

              ticketsSnapshot.forEach(ticketDoc => {
                conductorData.subcollections.remittance[dateId].tickets[ticketDoc.id] = ticketDoc.data();
                completeData.totalDocuments++;
              });
            } catch (ticketsError) {
              // No tickets for this remittance date
            }
          }
        } catch (remittanceError) {
          // No remittance for this conductor
        }

        completeData.conductors[conductorId] = conductorData;
        completeData.totalDocuments++; // Count the conductor profile itself
      }

      return {
        collection: 'conductors_complete',
        count: Object.keys(completeData.conductors).length,
        totalDocuments: completeData.totalDocuments,
        documents: completeData.conductors
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * List all available backups
   * @returns {Promise<Array>} List of backup metadata
   */
  async listBackups() {
    try {
      const backupsRef = collection(db, 'systemBackups');
      const snapshot = await getDocs(query(backupsRef, orderBy('createdAt', 'desc')));
      
      const backups = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        backups.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
          expiresAt: data.expiresAt?.toDate?.() || new Date(data.expiresAt),
          isExpired: new Date() > (data.expiresAt?.toDate?.() || new Date(data.expiresAt))
        });
      });

      return { success: true, backups };
    } catch (error) {
      return { success: false, error: error.message, backups: [] };
    }
  }

  /**
   * Delete expired backups (called automatically)
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupExpiredBackups() {
    try {
      
      const backupsRef = collection(db, 'systemBackups');
      const snapshot = await getDocs(
        query(backupsRef, where('expiresAt', '<=', new Date()))
      );
      
      let deletedCount = 0;
      const deletePromises = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        
        // Delete from Storage
        const storageRef = ref(storage, `${this.backupFolder}/${data.fileName}`);
        deletePromises.push(
          deleteObject(storageRef).catch(() => {
            // Ignore storage deletion errors
          })
        );
        
        // Delete metadata from Firestore
        deletePromises.push(deleteDoc(doc.ref));
        deletedCount++;
      });

      await Promise.all(deletePromises);

      if (deletedCount > 0) {
        await logActivity(
          ACTIVITY_TYPES.SYSTEM_MAINTENANCE,
          `Cleaned up ${deletedCount} expired backup(s)`,
          { deletedCount }
        );
      }
      
      return { success: true, deletedCount };
    } catch (error) {
      return { success: false, error: error.message, deletedCount: 0 };
    }
  }

  /**
   * Get backup statistics
   * @returns {Promise<Object>} Backup statistics
   */
  async getBackupStatistics() {
    try {
      const listResult = await this.listBackups();
      if (!listResult.success) {
        return listResult;
      }

      const stats = {
        total: listResult.backups.length,
        active: listResult.backups.filter(b => !b.isExpired).length,
        expired: listResult.backups.filter(b => b.isExpired).length,
        totalSizeKB: listResult.backups.reduce((sum, b) => sum + (b.fileSizeBytes || 0), 0) / 1024
      };

      return { success: true, stats };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Download a backup file
   * @param {string} fileName - The backup file name
   * @returns {Promise<void>}
   */
  async downloadBackup(fileName) {
    try {
      // Get the backup metadata from Firestore
      const backupsRef = collection(db, 'systemBackups');
      const snapshot = await getDocs(query(backupsRef, where('fileName', '==', fileName)));

      if (snapshot.empty) {
        throw new Error('Backup metadata not found');
      }

      // Manual download approach (CORS auto-download requires Firebase Admin SDK)
      try {
        const storageRef = ref(storage, `${this.backupFolder}/${fileName}`);

        // Get the authenticated download URL
        const downloadURL = await getDownloadURL(storageRef);

        // Open in new tab for manual download (browser will handle it)
        const link = document.createElement('a');
        link.href = downloadURL;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        await logActivity(
          ACTIVITY_TYPES.SYSTEM_BACKUP,
          `Downloaded backup file: ${fileName}`,
          { fileName }
        );

        return { success: true };

      } catch (storageError) {
        throw new Error('Cannot download backup file from storage. The file may have been deleted or is no longer accessible.');
      }

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a backup file
   * @param {string} backupId - The backup ID
   * @returns {Promise<Object>} Delete result
   */
  async deleteBackup(backupId) {
    try {
      // Find the backup document by ID
      const backupDocRef = doc(db, 'systemBackups', backupId);
      const backupDoc = await getDocs(query(collection(db, 'systemBackups'), where('backupId', '==', backupId)));
      
      if (backupDoc.empty) {
        throw new Error('Backup not found');
      }

      const backupData = backupDoc.docs[0].data();
      const fileName = backupData.fileName;
      
      // Delete from Storage (ignore if file doesn't exist)
      const storageRef = ref(storage, `${this.backupFolder}/${fileName}`);
      try {
        await deleteObject(storageRef);
      } catch (storageError) {
        // If file doesn't exist (404), that's okay - ignore it
        if (storageError.code !== 'storage/object-not-found') {
          // Re-throw other storage errors
          throw storageError;
        }
      }
      
      // Delete metadata from Firestore
      await deleteDoc(backupDoc.docs[0].ref);
      
      await logActivity(
        ACTIVITY_TYPES.SYSTEM_MAINTENANCE,
        `Deleted backup file: ${fileName}`,
        { fileName, backupId }
      );
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Schedule automatic cleanup (call this periodically)
   */
  scheduleCleanup() {
    // Run cleanup every 24 hours
    setInterval(() => {
      this.cleanupExpiredBackups();
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Restore data from a backup file
   * @param {Object} backupFile - The backup file metadata
   * @param {Object} options - Restore options
   * @param {string} options.mode - Restore mode: 'missing_only', 'overwrite'
   * @param {Function} options.progressCallback - Progress callback function
   * @returns {Promise<Object>} Restore result
   */
  async restoreFromBackup(backupFile, options = {}) {
    const { mode = 'missing_only', progressCallback } = options;
    
    try {
      // Initialize progress
      const progress = {
        phase: 'initializing',
        totalConductors: 0,
        processedConductors: 0,
        totalSubcollections: 0,
        processedSubcollections: 0,
        totalDocuments: 0,
        processedDocuments: 0,
        errors: [],
        currentConductor: null,
        currentCollection: null,
        startTime: Date.now(),
        estimatedTimeRemaining: null
      };

      if (progressCallback) progressCallback(progress);

      // First, fetch the backup data
      progress.phase = 'analyzing';
      progress.currentCollection = 'Loading backup data...';
      if (progressCallback) progressCallback(progress);

      const backupData = await this.getBackupData(backupFile);
      if (!backupData.success) {
        throw new Error(backupData.error);
      }

      // Analyze backup to get totals for progress tracking
      const analysisResult = this.analyzeBackupData(backupData.data);
      progress.totalDocuments = analysisResult.totalDocuments;
      progress.totalConductors = analysisResult.totalConductors;
      progress.totalSubcollections = analysisResult.totalSubcollections;

      // Start restoration process
      progress.phase = 'restoring';
      if (progressCallback) progressCallback(progress);

      // Restore based on mode
      switch (mode) {
        case 'missing_only':
          await this.restoreMissingOnly(backupData.data, progress, progressCallback);
          break;
        case 'overwrite':
          await this.restoreOverwrite(backupData.data, progress, progressCallback);
          break;
        default:
          throw new Error(`Unknown restore mode: ${mode}`);
      }

      progress.phase = 'completed';
      progress.currentCollection = 'Restore completed successfully!';
      if (progressCallback) progressCallback(progress);

      // Log the restoration
      await logActivity(
        ACTIVITY_TYPES.SYSTEM_BACKUP,
        `Restored data from backup: ${backupFile.fileName} (mode: ${mode})`,
        {
          backupFile: backupFile.fileName,
          mode,
          documentsRestored: progress.processedDocuments,
          errors: progress.errors.length
        }
      );

      return {
        success: true,
        documentsRestored: progress.processedDocuments,
        errors: progress.errors
      };

    } catch (error) {
      await logActivity(
        ACTIVITY_TYPES.SYSTEM_ERROR,
        `Restore failed: ${error.message}`,
        {
          backupFile: backupFile.fileName,
          mode,
          error: error.message
        }
      );

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get backup data from file or uploaded JSON
   * @param {Object} backupFile - Backup file metadata or uploaded file data
   * @returns {Promise<Object>} Backup data
   */
  async getBackupData(backupFile) {
    try {
      // If backupFile has uploadedData, use it directly
      if (backupFile.uploadedData) {
        return { success: true, data: backupFile.uploadedData };
      }

      const { collection, getDocs, query, where } = await import('firebase/firestore');
      
      // Fetch backup metadata
      const backupsRef = collection(db, 'systemBackups');
      const snapshot = await getDocs(query(backupsRef, where('fileName', '==', backupFile.fileName)));
      
      if (snapshot.empty) {
        throw new Error('Backup metadata not found');
      }

      const backupMetadata = snapshot.docs[0].data();
      
      // Try to download from Firebase Storage first
      try {
        const storageRef = ref(storage, `${this.backupFolder}/${backupFile.fileName}`);
        
        // Try using the stored download URL from metadata
        if (backupMetadata.downloadURL) {
          // Create a temporary link to download the file
          const link = document.createElement('a');
          link.href = backupMetadata.downloadURL;
          link.download = backupFile.fileName;
          link.style.display = 'none';
          document.body.appendChild(link);
          
          // Prompt user to download and upload the file manually
          throw new Error('Please download the backup file manually and upload it using the file input below');
        }
      } catch (storageError) {
        throw new Error('Cannot access backup file from Firebase Storage. Please upload the backup file manually.');
      }

      return { success: false, error: 'Backup file not accessible' };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse uploaded backup file
   * @param {File} file - The uploaded backup file
   * @returns {Promise<Object>} Parsed backup data
   */
  async parseUploadedBackup(file) {
    try {
      const text = await file.text();
      const backupData = JSON.parse(text);
      
      // Validate backup structure
      if (!backupData.metadata || !backupData.data) {
        throw new Error('Invalid backup file format');
      }
      
      return { success: true, data: backupData };
    } catch (error) {
      return { success: false, error: `Failed to parse backup file: ${error.message}` };
    }
  }

  /**
   * Analyze backup data to get document counts
   * @param {Object} backupData - The backup data
   * @returns {Object} Analysis results
   */
  analyzeBackupData(backupData) {
    let totalDocuments = 0;
    let totalConductors = 0;
    let totalSubcollections = 0;

    // Since we're using current data, estimate based on collection types
    if (backupData.metadata.collections.includes('CONDUCTOR_DATA')) {
      totalConductors = 25; // Estimate
      totalSubcollections = 150; // Estimate
      totalDocuments = 2500; // Estimate
    } else {
      totalDocuments = backupData.metadata.collections.length * 100; // Estimate
    }

    return { totalDocuments, totalConductors, totalSubcollections };
  }

  /**
   * Restore only missing documents
   * @param {Object} backupData - The backup data
   * @param {Object} progress - Progress object
   * @param {Function} progressCallback - Progress callback
   */
  async restoreMissingOnly(backupData, progress, progressCallback) {
    // Process each collection in the backup
    for (const collectionKey of backupData.metadata.collections) {
      const collectionInfo = BACKUP_COLLECTIONS[collectionKey.toUpperCase()];

      if (!collectionInfo || !backupData.data[collectionKey]) {
        continue;
      }

      progress.currentCollection = `Checking missing documents in ${collectionInfo.name}`;
      if (progressCallback) progressCallback(progress);

      const collectionData = backupData.data[collectionKey];

      // Special handling for CONDUCTOR_DATA with deep subcollections
      if (collectionKey.toUpperCase() === 'CONDUCTOR_DATA') {
        await this.restoreMissingConductorData(collectionData, progress, progressCallback);
        continue;
      }

      // Handle different backup data formats for simple collections
      let documentsToProcess = [];
      if (collectionData.documents && Array.isArray(collectionData.documents)) {
        // Standard backup format
        documentsToProcess = collectionData.documents;
      } else if (typeof collectionData === 'object') {
        // Direct object format
        documentsToProcess = Object.entries(collectionData).map(([id, data]) => ({ id, data }));
      }

      // Process each document in this collection
      for (const docItem of documentsToProcess) {
        const docId = docItem.id;
        const docData = docItem.data;

        try {
          // Check if document exists in Firestore
          const docRef = doc(db, collectionInfo.collection, docId);
          const docSnap = await getDoc(docRef);

          if (!docSnap.exists()) {
            // Document is missing, restore it
            const convertedDocData = this.convertTimestamps(docData);
            await setDoc(docRef, convertedDocData);
            progress.processedDocuments++;

            progress.currentConductor = `Restored document: ${docId}`;
            if (progressCallback) progressCallback(progress);

            // Add delay to make progress visible
            await new Promise(resolve => setTimeout(resolve, 500));
          } else {
            progress.processedDocuments++;

            progress.currentConductor = `Skipped existing document: ${docId}`;
            if (progressCallback) progressCallback(progress);

            // Add small delay even for skipped documents to show progress
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          progress.errors.push(`Failed to restore document ${docId}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Convert timestamp objects to Firebase Timestamp instances
   * @param {*} data - Data to convert
   * @returns {*} Data with converted timestamps
   */
  convertTimestamps(data) {
    if (!data || typeof data !== 'object') return data;

    // Check if this is a timestamp object
    if (data.seconds !== undefined && data.nanoseconds !== undefined) {
      return new Timestamp(data.seconds, data.nanoseconds);
    }

    // Recursively process nested objects
    if (Array.isArray(data)) {
      return data.map(item => this.convertTimestamps(item));
    }

    const converted = {};
    for (const [key, value] of Object.entries(data)) {
      converted[key] = this.convertTimestamps(value);
    }
    return converted;
  }

  /**
   * Deep restore for conductor data with nested subcollections
   * @param {Object} conductorBackupData - The conductor backup data
   * @param {Object} progress - Progress object
   * @param {Function} progressCallback - Progress callback
   */
  async restoreMissingConductorData(conductorBackupData, progress, progressCallback) {
    // Extract conductors from backup data structure
    const conductors = conductorBackupData.documents || conductorBackupData;

    for (const [conductorId, conductorData] of Object.entries(conductors)) {
      progress.currentConductor = `Processing conductor: ${conductorId}`;
      if (progressCallback) progressCallback(progress);

      try {
        // Step 1: Check and restore conductor profile
        const conductorRef = doc(db, 'conductors', conductorId);
        const conductorSnap = await getDoc(conductorRef);

        if (!conductorSnap.exists() && conductorData.profile) {
          const convertedProfile = this.convertTimestamps(conductorData.profile);
          await setDoc(conductorRef, convertedProfile);
          progress.processedDocuments++;
        }

        // Step 2: Restore dailyTrips subcollection
        if (conductorData.subcollections?.dailyTrips) {
          await this.restoreMissingDailyTrips(conductorId, conductorData.subcollections.dailyTrips, progress, progressCallback);
        }

        // Step 3: Restore preTickets subcollection (flat structure)
        if (conductorData.subcollections?.preTickets) {
          await this.restoreMissingFlatSubcollection(
            conductorId,
            'preTickets',
            conductorData.subcollections.preTickets,
            progress,
            progressCallback
          );
        }

        // Step 4: Restore preBookings subcollection (flat structure)
        if (conductorData.subcollections?.preBookings) {
          await this.restoreMissingFlatSubcollection(
            conductorId,
            'preBookings',
            conductorData.subcollections.preBookings,
            progress,
            progressCallback
          );
        }

        // Step 5: Restore scannedQRCodes subcollection (flat structure)
        if (conductorData.subcollections?.scannedQRCodes) {
          await this.restoreMissingFlatSubcollection(
            conductorId,
            'scannedQRCodes',
            conductorData.subcollections.scannedQRCodes,
            progress,
            progressCallback
          );
        }

        // Step 6: Restore remittance subcollection (with nested tickets)
        if (conductorData.subcollections?.remittance) {
          await this.restoreMissingFlatSubcollection(
            conductorId,
            'remittance',
            conductorData.subcollections.remittance,
            progress,
            progressCallback
          );
        }

      } catch (error) {
        progress.errors.push(`Failed to restore conductor ${conductorId}: ${error.message}`);
      }
    }
  }

  /**
   * Restore missing dailyTrips with nested trip structure
   * @param {string} conductorId - Conductor ID
   * @param {Object} dailyTripsData - Daily trips backup data
   * @param {Object} progress - Progress object
   * @param {Function} progressCallback - Progress callback
   */
  async restoreMissingDailyTrips(conductorId, dailyTripsData, progress, progressCallback) {
    for (const [dateId, dateData] of Object.entries(dailyTripsData)) {
      progress.currentConductor = `Checking date: ${dateId} for conductor ${conductorId}`;
      if (progressCallback) progressCallback(progress);

      try {
        // Check if date document exists
        const dateDocRef = doc(db, 'conductors', conductorId, 'dailyTrips', dateId);
        const dateDocSnap = await getDoc(dateDocRef);

        if (!dateDocSnap.exists() && dateData.data) {
          // Date document is missing, restore it with all trip maps
          const convertedDateData = this.convertTimestamps(dateData.data);
          await setDoc(dateDocRef, convertedDateData);
          progress.processedDocuments++;
        }

        // Restore nested trip tickets/preBookings/preTickets
        if (dateData.trips) {
          for (const [tripName, tripData] of Object.entries(dateData.trips)) {
            progress.currentConductor = `Restoring ${tripName} on ${dateId}`;
            if (progressCallback) progressCallback(progress);

            // Restore tickets subcollection
            if (tripData.tickets) {
              await this.restoreMissingTripDocuments(
                conductorId,
                dateId,
                tripName,
                'tickets',
                'tickets',
                tripData.tickets,
                progress
              );
            }

            // Restore preBookings subcollection
            if (tripData.preBookings) {
              await this.restoreMissingTripDocuments(
                conductorId,
                dateId,
                tripName,
                'preBookings',
                'preBookings',
                tripData.preBookings,
                progress
              );
            }

            // Restore preTickets subcollection
            if (tripData.preTickets) {
              await this.restoreMissingTripDocuments(
                conductorId,
                dateId,
                tripName,
                'preTickets',
                'preTickets',
                tripData.preTickets,
                progress
              );
            }
          }
        }

      } catch (error) {
        progress.errors.push(`Failed to restore date ${dateId}: ${error.message}`);
      }
    }
  }

  /**
   * Restore missing trip documents (tickets/preBookings/preTickets)
   * @param {string} conductorId - Conductor ID
   * @param {string} dateId - Date ID
   * @param {string} tripName - Trip name (e.g., trip1)
   * @param {string} collectionName - Collection name
   * @param {string} subcollectionName - Subcollection name
   * @param {Array} documents - Documents to restore
   * @param {Object} progress - Progress object
   */
  async restoreMissingTripDocuments(conductorId, dateId, tripName, collectionName, subcollectionName, documents, progress) {
    for (const docItem of documents) {
      try {
        const docId = docItem.id;
        const docData = docItem.data;

        // Path: /conductors/{conductorId}/dailyTrips/{dateId}/{tripName}/{collectionName}/{subcollectionName}/{docId}
        const docRef = doc(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, collectionName, subcollectionName, docId);

        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          const convertedDocData = this.convertTimestamps(docData);
          await setDoc(docRef, convertedDocData);
          progress.processedDocuments++;
        }

        // Small delay to avoid overwhelming Firestore
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (error) {
        progress.errors.push(`Failed to restore ${collectionName}/${docItem.id}: ${error.message}`);
      }
    }
  }

  /**
   * Restore missing documents in flat subcollection (preTickets) or nested subcollection (remittance)
   * @param {string} conductorId - Conductor ID
   * @param {string} subcollectionName - Subcollection name
   * @param {Object} subcollectionData - Subcollection backup data
   * @param {Object} progress - Progress object
   * @param {Function} progressCallback - Progress callback
   */
  async restoreMissingFlatSubcollection(conductorId, subcollectionName, subcollectionData, progress, progressCallback) {
    // Special handling for remittance with nested tickets structure
    if (subcollectionName === 'remittance') {
      await this.restoreMissingRemittanceData(conductorId, subcollectionData, progress, progressCallback);
      return;
    }

    // Handle flat subcollections (like preTickets)
    for (const [docId, docData] of Object.entries(subcollectionData)) {
      try {
        const docRef = doc(db, 'conductors', conductorId, subcollectionName, docId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          const convertedDocData = this.convertTimestamps(docData);
          await setDoc(docRef, convertedDocData);
          progress.processedDocuments++;
        }

        // Small delay
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (error) {
        progress.errors.push(`Failed to restore ${subcollectionName}/${docId}: ${error.message}`);
      }
    }
  }

  /**
   * Restore missing remittance data with nested tickets subcollection
   * @param {string} conductorId - Conductor ID
   * @param {Object} remittanceData - Remittance backup data
   * @param {Object} progress - Progress object
   * @param {Function} progressCallback - Progress callback
   */
  async restoreMissingRemittanceData(conductorId, remittanceData, progress, progressCallback) {
    for (const [dateId, dateInfo] of Object.entries(remittanceData)) {
      progress.currentConductor = `Restoring remittance ${dateId} for conductor ${conductorId}`;
      if (progressCallback) progressCallback(progress);

      try {
        // Check if remittance date document exists
        const remittanceDateRef = doc(db, 'conductors', conductorId, 'remittance', dateId);
        const remittanceDateSnap = await getDoc(remittanceDateRef);

        // Restore remittance date document if missing
        if (!remittanceDateSnap.exists() && dateInfo.data) {
          const convertedData = this.convertTimestamps(dateInfo.data);
          await setDoc(remittanceDateRef, convertedData);
          progress.processedDocuments++;
        }

        // Restore tickets subcollection if it exists in backup
        if (dateInfo.tickets && typeof dateInfo.tickets === 'object') {
          for (const [ticketId, ticketData] of Object.entries(dateInfo.tickets)) {
            try {
              const ticketRef = doc(db, 'conductors', conductorId, 'remittance', dateId, 'tickets', ticketId);
              const ticketSnap = await getDoc(ticketRef);

              if (!ticketSnap.exists()) {
                const convertedTicketData = this.convertTimestamps(ticketData);
                await setDoc(ticketRef, convertedTicketData);
                progress.processedDocuments++;
              }

              // Small delay
              await new Promise(resolve => setTimeout(resolve, 50));

            } catch (ticketError) {
              progress.errors.push(`Failed to restore remittance ticket ${dateId}/${ticketId}: ${ticketError.message}`);
            }
          }
        }

      } catch (error) {
        progress.errors.push(`Failed to restore remittance date ${dateId}: ${error.message}`);
      }
    }
  }


  /**
   * Restore with overwrite strategy
   * @param {Object} backupData - The backup data
   * @param {Object} progress - Progress object
   * @param {Function} progressCallback - Progress callback
   */
  async restoreOverwrite(backupData, progress, progressCallback) {
    const { collection: firestoreCollection, doc, setDoc } = await import('firebase/firestore');
    
    // Process each collection in the backup
    for (const collectionKey of backupData.metadata.collections) {
      const collectionInfo = BACKUP_COLLECTIONS[collectionKey.toUpperCase()];
      if (!collectionInfo || !backupData.data[collectionKey]) continue;

      progress.currentCollection = `Overwriting ${collectionInfo.name}`;
      if (progressCallback) progressCallback(progress);

      const collectionData = backupData.data[collectionKey];
      
      // Handle different backup data formats
      let documentsToProcess = [];
      if (collectionData.documents && Array.isArray(collectionData.documents)) {
        // Standard backup format
        documentsToProcess = collectionData.documents;
      } else if (typeof collectionData === 'object') {
        // Direct object format
        documentsToProcess = Object.entries(collectionData).map(([id, data]) => ({ id, data }));
      }
      
      // Process each document in this collection
      for (const docItem of documentsToProcess) {
        const docId = docItem.id;
        const docData = docItem.data;
        
        try {
          // Overwrite document (creates if doesn't exist, replaces if exists)
          const docRef = doc(db, collectionInfo.collection, docId);
          const convertedDocData = this.convertTimestamps(docData);
          await setDoc(docRef, convertedDocData);

          progress.processedDocuments++;
          progress.currentConductor = `Overwritten document: ${docId}`;
          if (progressCallback) progressCallback(progress);

          // Add delay to make progress visible
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          progress.errors.push(`Failed to overwrite document ${docId}: ${error.message}`);
        }
      }
    }
  }

}

export const backupService = new BackupService();
export default backupService;