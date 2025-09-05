import { 
  collection, 
  getDocs, 
  serverTimestamp,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy 
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  listAll, 
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
}

export const backupService = new BackupService();
export default backupService;