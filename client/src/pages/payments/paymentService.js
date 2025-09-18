import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
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

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reservationsList = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Transform reservation data to match payment structure
        reservationsList.push({
          id: doc.id,
          ...data,
          // Map reservation fields to payment fields for compatibility
          type: 'bus_reservation',
          bookingReference: doc.id,
          passengerName: data.fullName,
          route: `${data.from} → ${data.to}`,
          amount: data.totalAmount || 0,
          paymentMethod: data.paymentMethod || 'Unknown',
          status: data.paymentStatus || 'pending',
          createdAt: data.timestamp,
          busNumber: data.selectedBusIds?.[0] || 'N/A',
          travelDate: data.travelDate || data.timestamp,
          // Payment proof/receipt from user
          paymentProof: data.paymentProof || data.receiptImage || data.paymentReceipt,
          // Keep original reservation data
          originalReservation: data
        });
      });
      callback(reservationsList);
    }, (error) => {
      console.error('Error fetching reservations:', error);
      callback([], error);
    });

    return unsubscribe;
  }

  // Handle reservation payment verification actions
  async handlePaymentAction(reservationId, action, reason = '') {
    try {
      let newPaymentStatus;
      let newReservationStatus;
      let actionDescription;

      switch (action) {
        case 'approve':
          newPaymentStatus = 'verified';
          newReservationStatus = 'confirmed';
          actionDescription = 'approved';
          break;
        case 'reject':
          newPaymentStatus = 'rejected';
          newReservationStatus = 'cancelled';
          actionDescription = 'rejected';
          break;
        case 'review':
          newPaymentStatus = 'under_review';
          newReservationStatus = 'pending_payment';
          actionDescription = 'marked for review';
          break;
        case 'pending':
          newPaymentStatus = 'pending';
          newReservationStatus = 'pending_payment';
          actionDescription = 'marked as pending';
          break;
        default:
          throw new Error('Invalid action');
      }

      // Update reservation with payment status
      const reservationRef = doc(db, 'reservations', reservationId);
      const updateData = {
        paymentStatus: newPaymentStatus,
        status: newReservationStatus,
        [`${action}edAt`]: serverTimestamp(),
        [`${action}edBy`]: 'admin', // Replace with current user
        updatedAt: serverTimestamp()
      };

      if (reason) {
        updateData.rejectionReason = reason;
      }

      await updateDoc(reservationRef, updateData);

      // Log activity
      await logActivity(
        ACTIVITY_TYPES.PAYMENT_UPDATE,
        `Reservation payment ${actionDescription}: ${reservationId}`,
        {
          reservationId: reservationId,
          action: action,
          newPaymentStatus: newPaymentStatus,
          newReservationStatus: newReservationStatus,
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

  // Filter payments based on type, status, and search
  filterPayments(payments, filterType, filterStatus, searchTerm) {
    return payments.filter(payment => {
      const matchesType = filterType === 'all' || payment.type === filterType;
      const matchesStatus = filterStatus === 'all' || payment.status === filterStatus;
      const matchesSearch = searchTerm === '' ||
        payment.bookingReference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.passengerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.route?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.busNumber?.toString().includes(searchTerm.toLowerCase()) ||
        payment.email?.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesType && matchesStatus && matchesSearch;
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
      pending: payments.filter(p => p.status === 'pending').length,
      verified: payments.filter(p => p.status === 'verified').length,
      rejected: payments.filter(p => p.status === 'rejected').length,
      underReview: payments.filter(p => p.status === 'under_review').length,
      total: payments.length
    };
  }

  // Payment type configuration (icon components should be passed from the UI)
  getPaymentTypes(icons = {}) {
    return {
      bus_reservation: {
        icon: icons.FaBus || null,
        label: 'Bus Reservation',
        color: '#2196F3'
      },
      general: {
        icon: icons.FaMoneyBill || null,
        label: 'General Payment',
        color: '#4CAF50'
      },
      ticket: {
        icon: icons.FaTicketAlt || null,
        label: 'Ticket Purchase',
        color: '#FF9800'
      },
      app_service: {
        icon: icons.FaMobile || null,
        label: 'App Service',
        color: '#9C27B0'
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
      refunding: '#9C27B0'
    };
  }
}

// Create and export a singleton instance
const paymentService = new PaymentService();
export default paymentService;