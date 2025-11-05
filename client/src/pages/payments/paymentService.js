import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { db } from '/src/firebase/firebase.js';
import { logActivity, ACTIVITY_TYPES } from '/src/pages/settings/auditService.js';

class PaymentService {
  // Set up real-time listener for reservations (which include payment info)
  setupReservationsListener(callback) {
    const reservationsRef = collection(db, 'reservations');
    const q = query(reservationsRef, orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        // Process reservations immediately for basic data
        const reservationsList = snapshot.docs.map(doc => {
          const data = doc.data();

          // Get price from reservation data first
          let busPrice = data.totalAmount || data.amount || data.Price || data.price || 2000;

          // Transform reservation data to match payment structure using new fields
          return {
            id: doc.id,
            ...data,
            // Map reservation fields to payment fields for compatibility
            type: 'bus_reservation',
            bookingReference: doc.id,
            passengerName: data.fullName,
            route: `${data.from} → ${data.to}`,
            amount: busPrice,
            paymentMethod: data.paymentMethod || 'GCash',
            status: this.mapReservationStatus(data.status),
            createdAt: data.timestamp,
            busNumber: data.selectedBusIds?.[0] || 'N/A',
            travelDate: data.travelDate || data.timestamp,
            // Payment proof/receipt from user - using new field names
            paymentProof: data.receiptUrl,
            receiptUploadedAt: data.receiptUploadedAt,
            // New reservation fields
            email: data.email,
            from: data.from,
            to: data.to,
            fullName: data.fullName,
            isRoundTrip: data.isRoundTrip,
            selectedBusIds: data.selectedBusIds,
            request: data.request || '', 
            // Keep original reservation data
            originalReservation: data
          };
        });

        // Send immediate update to UI
        callback(reservationsList);

        // Then fetch missing bus prices in background (if needed)
        const needsPriceUpdate = reservationsList.some(reservation =>
          reservation.amount === 2000 &&
          reservation.originalReservation.selectedBusIds?.length > 0 &&
          !reservation.originalReservation.totalAmount &&
          !reservation.originalReservation.amount
        );

        if (needsPriceUpdate) {
          // Background price fetching without blocking UI updates
          this.updateReservationPrices(reservationsList, callback);
        }

      } catch (error) {
        console.error('Error processing reservations snapshot:', error);
        callback([], error);
      }
    }, (error) => {
      console.error('Error fetching reservations:', error);
      callback([], error);
    });

    return unsubscribe;
  }

  // Map reservation status to payment status for display
  mapReservationStatus(reservationStatus) {
    switch (reservationStatus) {
      case 'pending':
        return 'pending';
      case 'receipt_uploaded':
        return 'pending';
      case 'confirmed':
        return 'verified';
      case 'cancelled':
        return 'rejected';
      case 'completed':
        return 'completed';
      default:
        return 'pending';
    }
  }

  // Background method to update reservation prices without blocking UI
  async updateReservationPrices(reservationsList, callback) {
    try {
      const updatedReservations = [...reservationsList];
      let hasUpdates = false;

      for (let i = 0; i < updatedReservations.length; i++) {
        const reservation = updatedReservations[i];

        // Skip if already has proper price
        if (reservation.amount !== 2000 || !reservation.originalReservation.selectedBusIds?.length) {
          continue;
        }

        try {
          // Try to fetch bus data by plate number first
          const busRef = collection(db, 'AvailableBuses');
          let busQuery = query(busRef, where('plateNumber', '==', reservation.originalReservation.selectedBusIds[0]));
          let busSnapshot = await getDocs(busQuery);

          // If not found by plate number, try by bus number
          if (busSnapshot.empty) {
            busQuery = query(busRef, where('busID', '==', reservation.originalReservation.selectedBusIds[0]));
            busSnapshot = await getDocs(busQuery);
          }

          // If still not found, try matching by name containing the bus number
          if (busSnapshot.empty) {
            const allBusesSnapshot = await getDocs(busRef);
            allBusesSnapshot.forEach((busDoc) => {
              const busData = busDoc.data();
              if (busData.name && busData.name.includes(reservation.originalReservation.selectedBusIds[0])) {
                updatedReservations[i] = {
                  ...updatedReservations[i],
                  amount: busData.Price || 2000
                };
                hasUpdates = true;
              }
            });
          } else {
            const busData = busSnapshot.docs[0].data();
            updatedReservations[i] = {
              ...updatedReservations[i],
              amount: busData.Price || 2000
            };
            hasUpdates = true;
          }
        } catch (error) {
          console.warn('Error fetching bus price for reservation:', reservation.id, error);
        }
      }

      // Only call callback if there were actual price updates
      if (hasUpdates) {
        callback(updatedReservations);
      }
    } catch (error) {
      console.error('Error updating reservation prices:', error);
    }
  }

  // Handle reservation payment verification actions
  async handlePaymentAction(reservationId, action, reason = '') {
    try {
      let newReservationStatus;
      let newBusAvailabilityStatus;
      let actionDescription;

      switch (action) {
        case 'approve':
          newReservationStatus = 'confirmed';
          newBusAvailabilityStatus = 'confirmed';
          actionDescription = 'approved';
          break;
        case 'reject':
          newReservationStatus = 'cancelled';
          newBusAvailabilityStatus = 'no-reservation';
          actionDescription = 'rejected';
          break;
        case 'review':
          newReservationStatus = 'pending';
          newBusAvailabilityStatus = 'pending';
          actionDescription = 'marked for review';
          break;
        case 'pending':
          newReservationStatus = 'receipt_uploaded';
          newBusAvailabilityStatus = 'pending';
          actionDescription = 'marked as pending';
          break;
        default:
          throw new Error('Invalid action');
      }

      // Get reservation data first to get the bus IDs
      const reservationRef = doc(db, 'reservations', reservationId);
      const reservationSnap = await getDoc(reservationRef);

      if (!reservationSnap.exists()) {
        throw new Error('Reservation not found');
      }

      const reservationData = reservationSnap.data();

      // Update reservation status
      const actionPastTense = action === 'approve' ? 'approved' : `${action}ed`;
      const updateData = {
        status: newReservationStatus,
        [`${actionPastTense}At`]: serverTimestamp(),
        [`${actionPastTense}By`]: 'admin',
        updatedAt: serverTimestamp()
      };

      if (reason) {
        updateData.rejectionReason = reason;
      }

      await updateDoc(reservationRef, updateData);

      // Update conductor's busAvailabilityStatus and reservationDetails for each selected bus
      if (reservationData.selectedBusIds && reservationData.selectedBusIds.length > 0) {
        const conductorUpdatePromises = reservationData.selectedBusIds.map(async (busId) => {
          try {
            // Find conductor by busId in selectedBusIds array or reservationId
            const conductorsRef = collection(db, 'conductors');

            // First try to find by email matching the busId pattern 
            let conductorQuery = query(conductorsRef, where('email', '==', `${busId}@gmail.com`));
            let conductorSnap = await getDocs(conductorQuery);

            // If not found, try by plateNumber
            if (conductorSnap.empty) {
              conductorQuery = query(conductorsRef, where('plateNumber', '==', busId));
              conductorSnap = await getDocs(conductorQuery);
            }

            // If not found, try by selectedBusIds array containing the busId
            if (conductorSnap.empty) {
              conductorQuery = query(conductorsRef, where('selectedBusIds', 'array-contains', busId));
              conductorSnap = await getDocs(conductorQuery);
            }

            // If not found, try by reservationId
            if (conductorSnap.empty) {
              conductorQuery = query(conductorsRef, where('reservationId', '==', reservationId));
              conductorSnap = await getDocs(conductorQuery);
            }

            // If still not found, try searching by reservationId in reservationDetails
            if (conductorSnap.empty) {
              conductorQuery = query(conductorsRef, where('reservationDetails.reservationId', '==', reservationId));
              conductorSnap = await getDocs(conductorQuery);
            }

            // If still not found, try searching by reservationId in activeTrip
            if (conductorSnap.empty) {
              conductorQuery = query(conductorsRef, where('activeTrip.reservationDetails.reservationId', '==', reservationId));
              conductorSnap = await getDocs(conductorQuery);
            }

            if (!conductorSnap.empty) {
              const conductorRef = doc(db, 'conductors', conductorSnap.docs[0].id);
              const conductorData = conductorSnap.docs[0].data();

              // Build update data for conductor
              const conductorUpdateData = {
                updatedAt: serverTimestamp()
              };

              // Check if busAvailabilityStatus is inside activeTrip or at root level
              if (conductorData.activeTrip && typeof conductorData.activeTrip === 'object' && 'busAvailabilityStatus' in conductorData.activeTrip) {
                // busAvailabilityStatus is inside activeTrip
                console.log(`Updating activeTrip.busAvailabilityStatus for ${busId} from ${conductorData.activeTrip.busAvailabilityStatus} to ${newBusAvailabilityStatus}`);
                conductorUpdateData['activeTrip.busAvailabilityStatus'] = newBusAvailabilityStatus;
              } else if ('busAvailabilityStatus' in conductorData) {
                // busAvailabilityStatus is at root level
                console.log(`Updating busAvailabilityStatus for ${busId} from ${conductorData.busAvailabilityStatus} to ${newBusAvailabilityStatus}`);
                conductorUpdateData.busAvailabilityStatus = newBusAvailabilityStatus;
              }

              // Check if reservationDetails is inside activeTrip or at root level
              if (conductorData.activeTrip && typeof conductorData.activeTrip === 'object' && 'reservationDetails' in conductorData.activeTrip) {
                // reservationDetails is inside activeTrip
                conductorUpdateData['activeTrip.reservationDetails.status'] = newReservationStatus;
                if (action === 'approve') {
                  conductorUpdateData['activeTrip.reservationDetails.approvedAt'] = serverTimestamp();
                  conductorUpdateData['activeTrip.reservationDetails.approvedBy'] = 'admin';
                }
              } else {
                // reservationDetails is at root level
                conductorUpdateData['reservationDetails.status'] = newReservationStatus;
                if (action === 'approve') {
                  conductorUpdateData['reservationDetails.approvedAt'] = serverTimestamp();
                  conductorUpdateData['reservationDetails.approvedBy'] = 'admin';
                }
              }

              // Update conductor document
              await updateDoc(conductorRef, conductorUpdateData);
            }
          } catch (conductorError) {
            console.warn(`Error updating conductor for bus ${busId}:`, conductorError);
          }
        });

        await Promise.all(conductorUpdatePromises);
      }

      // Log activity
      await logActivity(
        ACTIVITY_TYPES.PAYMENT_UPDATE,
        `Reservation payment ${actionDescription}: ${reservationId}`,
        {
          reservationId: reservationId,
          action: action,
          newReservationStatus: newReservationStatus,
          newBusAvailabilityStatus: newBusAvailabilityStatus,
          affectedBuses: reservationData.selectedBusIds || [],
          reason: reason
        }
      );

      return {
        success: true,
        message: `Reservation payment ${actionDescription} successfully`
      };

    } catch (error) {
      console.error(`Error ${action}ing reservation payment:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Delete payment record
  async deletePayment(reservationId) {
    try {
      // Delete reservation document
      const reservationRef = doc(db, 'reservations', reservationId);
      await deleteDoc(reservationRef);

      // Log activity
      await logActivity(
        ACTIVITY_TYPES.PAYMENT_DELETE,
        `Payment record deleted: ${reservationId}`,
        {
          reservationId: reservationId,
          action: 'delete'
        }
      );

      return {
        success: true,
        message: 'Payment record deleted successfully'
      };

    } catch (error) {
      console.error('Error deleting payment record:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Filter payments based on status and search
  filterPayments(payments, filterStatus, searchTerm) {
    return payments.filter(payment => {
      // Filter by original reservation status, not mapped display status
      let matchesStatus = false;

      if (filterStatus === 'all') {
        matchesStatus = true;
      } else if (filterStatus === 'receipt_uploaded') {
        // Show if status is receipt_uploaded OR if receipt exists (receiptUrl or paymentProof)
        matchesStatus = payment.originalReservation?.status === 'receipt_uploaded' ||
                       (payment.receiptUrl || payment.paymentProof || payment.receiptUploadedAt);
      } else {
        matchesStatus = payment.originalReservation?.status === filterStatus;
      }

      const matchesSearch = searchTerm === '' ||
        payment.bookingReference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.passengerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.route?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.busNumber?.toString().includes(searchTerm.toLowerCase()) ||
        payment.email?.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }

  // Format currency
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount);
  }

  // Format date
  formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Get payment statistics
  getPaymentStatistics(payments) {
    return {
      pending: payments.filter(p => p.originalReservation?.status === 'pending' || p.originalReservation?.status === 'receipt_uploaded').length,
      verified: payments.filter(p => p.originalReservation?.status === 'confirmed').length,
      rejected: payments.filter(p => p.originalReservation?.status === 'cancelled').length,
      completed: payments.filter(p => p.originalReservation?.status === 'completed').length,
      total: payments.length
    };
  }

  // Payment type configuration 
  getPaymentTypes(icons = {}) {
    return {
      bus_reservation: {
        icon: icons.FaBus || null,
        label: 'Bus Reservation',
        color: '#007c91'
      }
    };
  }

  // Payment status colors
  getStatusColors() {
    return {
      pending: '#FF9800',
      under_review: '#2196F3',
      verified: '#4CAF50',
      rejected: '#F44336',
      refunding: '#9C27B0',
      completed: '#1976D2'
    };
  }
}

// Create and export a singleton instance
const paymentService = new PaymentService();
export default paymentService;