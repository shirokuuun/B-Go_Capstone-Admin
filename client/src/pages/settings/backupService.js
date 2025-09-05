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
  writeBatch,
  runTransaction 
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  listAll, 
  deleteObject,
  getDownloadURL,
  getBytes 
} from 'firebase/storage';
import { db, storage, auth } from '/src/firebase/firebase.js';
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
  BUS_RESERVATIONS: { 
    name: 'Bus Reservations', 
    collection: 'busReservations',
    description: 'Bus booking and reservation data'
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
    description: 'Complete conductor data including profiles, dailyTrips, preTickets, and remittance'
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
   * @returns {Promise<Object>} Backup result with download URL
   */
  async createBackup(selectedCollections, backupName = null) {
    try {
      const timestamp = new Date();
      const backupId = `backup_${timestamp.getTime()}`;
      const fileName = backupName || `system-backup-${timestamp.toISOString().split('T')[0]}-${timestamp.getTime()}`;
      
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

      for (const collectionKey of selectedCollections) {
        const collectionInfo = BACKUP_COLLECTIONS[collectionKey.toUpperCase()];
        if (!collectionInfo) {
          console.warn(`Unknown collection: ${collectionKey}`);
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
          console.error(`Error backing up collection ${collectionInfo.collection}:`, collectionError);
          backupData.data[collectionKey] = {
            collection: collectionInfo.collection,
            error: collectionError.message,
            count: 0,
            documents: []
          };
        }
      }

      // Convert to JSON and upload to Firebase Storage
      const jsonData = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      
      const storageRef = ref(storage, `${this.backupFolder}/${fileName}.json`);
      const uploadResult = await uploadBytes(storageRef, blob);
      
      // Get download URL
      const downloadURL = await getDownloadURL(uploadResult.ref);
      
      // Save backup metadata to Firestore for tracking
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

      console.log('Backup completed successfully', {
        backupId,
        fileName,
        downloadURL,
        sizeKB: Math.round(blob.size / 1024)
      });

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
      console.error('Backup creation failed:', error);
      
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
            remittance: {}
          }
        };

        // Backup dailyTrips subcollection
        try {
          const dailyTripsRef = collection(db, 'conductors', conductorId, 'dailyTrips');
          const dailyTripsSnapshot = await getDocs(dailyTripsRef);
          
          for (const dayDoc of dailyTripsSnapshot.docs) {
            const dateId = dayDoc.id;
            conductorData.subcollections.dailyTrips[dateId] = {
              data: dayDoc.data(),
              trips: {}
            };

            // Backup individual trips (trip1, trip2, etc.)
            const tripNames = ['trip1', 'trip2', 'trip3', 'trip4', 'trip5', 'trip6', 'trip7', 'trip8', 'trip9', 'trip10'];
            for (const tripName of tripNames) {
              try {
                const ticketsRef = collection(db, 'conductors', conductorId, 'dailyTrips', dateId, tripName, 'tickets', 'tickets');
                const ticketsSnapshot = await getDocs(ticketsRef);
                
                if (ticketsSnapshot.docs.length > 0) {
                  conductorData.subcollections.dailyTrips[dateId].trips[tripName] = {
                    tickets: ticketsSnapshot.docs.map(doc => ({
                      id: doc.id,
                      data: doc.data()
                    }))
                  };
                  completeData.totalDocuments += ticketsSnapshot.docs.length;
                }
              } catch (tripError) {
                // Trip doesn't exist, continue
              }
            }
          }
        } catch (dailyTripsError) {
          console.warn(`No dailyTrips for conductor ${conductorId}:`, dailyTripsError.message);
        }

        // Backup preTickets subcollection
        try {
          const preTicketsRef = collection(db, 'conductors', conductorId, 'preTickets');
          const preTicketsSnapshot = await getDocs(preTicketsRef);
          
          preTicketsSnapshot.forEach(doc => {
            conductorData.subcollections.preTickets[doc.id] = doc.data();
            completeData.totalDocuments++;
          });
        } catch (preTicketsError) {
          console.warn(`No preTickets for conductor ${conductorId}:`, preTicketsError.message);
        }

        // Backup remittance subcollection
        try {
          const remittanceRef = collection(db, 'conductors', conductorId, 'remittance');
          const remittanceSnapshot = await getDocs(remittanceRef);
          
          remittanceSnapshot.forEach(doc => {
            conductorData.subcollections.remittance[doc.id] = doc.data();
            completeData.totalDocuments++;
          });
        } catch (remittanceError) {
          console.warn(`No remittance for conductor ${conductorId}:`, remittanceError.message);
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
      console.error('Error backing up complete conductor data:', error);
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
      console.error('Error listing backups:', error);
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
          deleteObject(storageRef).catch(err => {
            if (err.code === 'storage/object-not-found') {
              console.warn(`Storage file not found (already deleted?): ${data.fileName}`);
            } else {
              console.warn(`Failed to delete storage file ${data.fileName}:`, err);
            }
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
      console.error('Error cleaning up expired backups:', error);
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
      console.error('Error getting backup statistics:', error);
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
      // Get the backup data directly from Firestore to recreate the JSON file
      const backupsRef = collection(db, 'systemBackups');
      const snapshot = await getDocs(query(backupsRef, where('fileName', '==', fileName)));
      
      if (snapshot.empty) {
        throw new Error('Backup metadata not found');
      }

      const backupMetadata = snapshot.docs[0].data();
      
      // Recreate the backup data by fetching from collections again
      const backupData = {
        metadata: {
          backupId: backupMetadata.backupId,
          createdAt: backupMetadata.createdAt?.toDate?.()?.toISOString() || backupMetadata.createdAt,
          expiresAt: backupMetadata.expiresAt?.toDate?.()?.toISOString() || backupMetadata.expiresAt,
          collections: backupMetadata.collections || [],
          version: '1.0',
          downloadedAt: new Date().toISOString()
        },
        data: {}
      };

      // Re-fetch the data for each collection that was in the original backup
      for (const collectionKey of backupMetadata.collections || []) {
        const collectionInfo = BACKUP_COLLECTIONS[collectionKey.toUpperCase()];
        if (!collectionInfo) {
          console.warn(`Unknown collection: ${collectionKey}`);
          continue;
        }

        try {
          if (collectionKey.toUpperCase() === 'CONDUCTOR_DATA') {
            const conductorsData = await this.backupCompleteCondutorData();
            backupData.data[collectionKey] = conductorsData;
          } else {
            const collectionRef = collection(db, collectionInfo.collection);
            const collectionSnapshot = await getDocs(collectionRef);
            
            const documents = [];
            collectionSnapshot.forEach(doc => {
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
          console.error(`Error re-fetching collection ${collectionInfo.collection}:`, collectionError);
          backupData.data[collectionKey] = {
            collection: collectionInfo.collection,
            error: `Re-fetch failed: ${collectionError.message}`,
            count: 0,
            documents: []
          };
        }
      }

      // Convert to JSON and create download
      const jsonData = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
      
      await logActivity(
        ACTIVITY_TYPES.SYSTEM_BACKUP,
        `Downloaded backup file: ${fileName}`,
        { fileName }
      );
      
      return { success: true };
    } catch (error) {
      console.error('Error downloading backup:', error);
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
        // If file doesn't exist (404), that's okay - just log it
        if (storageError.code === 'storage/object-not-found') {
          console.warn(`Storage file not found (already deleted?): ${fileName}`);
        } else {
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
      console.error('Error deleting backup:', error);
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
   * @param {string} options.mode - Restore mode: 'missing_only', 'merge', 'overwrite', 'backup_first'
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

      // Handle backup_first mode
      if (mode === 'backup_first') {
        progress.phase = 'creating_backup';
        progress.currentCollection = 'Creating backup of current data...';
        if (progressCallback) progressCallback(progress);

        const preBackupResult = await this.createBackup(
          backupData.data.metadata.collections,
          `pre-restore-backup-${Date.now()}`
        );
        
        if (!preBackupResult.success) {
          throw new Error(`Failed to create pre-restore backup: ${preBackupResult.error}`);
        }
      }

      // Start restoration process
      progress.phase = 'restoring';
      if (progressCallback) progressCallback(progress);

      // Restore based on mode
      switch (mode) {
        case 'missing_only':
          await this.restoreMissingOnly(backupData.data, progress, progressCallback);
          break;
        case 'merge':
          await this.restoreMerge(backupData.data, progress, progressCallback);
          break;
        case 'overwrite':
          await this.restoreOverwrite(backupData.data, progress, progressCallback);
          break;
        case 'backup_first':
          // After creating backup, proceed with overwrite
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
      console.error('Restore failed:', error);
      
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
        console.log('Firebase Storage access failed, falling back to manual upload');
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
    const { collection: firestoreCollection, doc, getDoc, setDoc } = await import('firebase/firestore');
    
    // Debug logging
    console.log('BACKUP_COLLECTIONS available:', typeof BACKUP_COLLECTIONS, !!BACKUP_COLLECTIONS);
    console.log('Backup data structure:', {
      metadata: backupData.metadata,
      data: backupData.data,
      dataType: Array.isArray(backupData.data) ? 'array' : typeof backupData.data,
      BACKUP_COLLECTIONS_keys: BACKUP_COLLECTIONS ? Object.keys(BACKUP_COLLECTIONS) : 'undefined'
    });
    
    // Process each collection in the backup
    for (const collectionKey of backupData.metadata.collections) {
      console.log(`Processing collection: ${collectionKey}, looking for: ${collectionKey.toUpperCase()}`);
      const collectionInfo = BACKUP_COLLECTIONS[collectionKey.toUpperCase()];
      console.log('Collection info found:', collectionInfo);
      
      if (!collectionInfo || !backupData.data[collectionKey]) {
        console.log(`Skipping collection ${collectionKey}: info=${!!collectionInfo}, data=${!!backupData.data[collectionKey]}`);
        continue;
      }

      progress.currentCollection = `Checking missing documents in ${collectionInfo.name}`;
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
          // Check if document exists in Firestore
          const docRef = doc(db, collectionInfo.collection, docId);
          const docSnap = await getDoc(docRef);
          
          if (!docSnap.exists()) {
            // Document is missing, restore it
            await setDoc(docRef, docData);
            progress.processedDocuments++;
            
            progress.currentConductor = `Restored document: ${docId}`;
            if (progressCallback) progressCallback(progress);
            
            console.log(`Restored missing document: ${docId} to collection: ${collectionInfo.collection}`);
          } else {
            console.log(`Document ${docId} already exists, skipping`);
          }
        } catch (error) {
          console.error(`Failed to restore document ${docId}:`, error);
          progress.errors.push(`Failed to restore document ${docId}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Restore with merge strategy
   * @param {Object} backupData - The backup data
   * @param {Object} progress - Progress object
   * @param {Function} progressCallback - Progress callback
   */
  async restoreMerge(backupData, progress, progressCallback) {
    const { collection: firestoreCollection, doc, getDoc, setDoc, updateDoc } = await import('firebase/firestore');
    
    // Process each collection in the backup
    for (const collectionKey of backupData.metadata.collections) {
      const collectionInfo = BACKUP_COLLECTIONS[collectionKey.toUpperCase()];
      if (!collectionInfo || !backupData.collections[collectionKey]) continue;

      progress.currentCollection = `Merging ${collectionInfo.name}`;
      if (progressCallback) progressCallback(progress);

      const collectionData = backupData.collections[collectionKey];
      
      // Process each document in this collection
      for (const [docId, docData] of Object.entries(collectionData)) {
        try {
          // Check if document exists in Firestore
          const docRef = doc(db, collectionInfo.collection, docId);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            // Document exists, merge data (backup data takes precedence)
            const existingData = docSnap.data();
            const mergedData = { ...existingData, ...docData };
            await updateDoc(docRef, mergedData);
          } else {
            // Document doesn't exist, create it
            await setDoc(docRef, docData);
          }
          
          progress.processedDocuments++;
          progress.currentConductor = `Merged document: ${docId}`;
          if (progressCallback) progressCallback(progress);
        } catch (error) {
          progress.errors.push(`Failed to merge document ${docId}: ${error.message}`);
        }
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
      if (!collectionInfo || !backupData.collections[collectionKey]) continue;

      progress.currentCollection = `Overwriting ${collectionInfo.name}`;
      if (progressCallback) progressCallback(progress);

      const collectionData = backupData.collections[collectionKey];
      
      // Process each document in this collection
      for (const [docId, docData] of Object.entries(collectionData)) {
        try {
          // Overwrite document (creates if doesn't exist, replaces if exists)
          const docRef = doc(db, collectionInfo.collection, docId);
          await setDoc(docRef, docData);
          
          progress.processedDocuments++;
          progress.currentConductor = `Overwritten document: ${docId}`;
          if (progressCallback) progressCallback(progress);
        } catch (error) {
          progress.errors.push(`Failed to overwrite document ${docId}: ${error.message}`);
        }
      }
    }
  }

}

export const backupService = new BackupService();
export default backupService;