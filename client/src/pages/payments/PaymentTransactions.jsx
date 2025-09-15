import React, { useState, useEffect } from 'react';
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
// import Header from '/src/components/HeaderTemplate/header.jsx'; // Removed header
import './PaymentTransactions.css';
import {
  FaBus,
  FaMoneyBill,
  FaTicketAlt,
  FaMobile,
  FaCheck,
  FaTimes,
  FaClock,
  FaEye,
  FaFilter,
  FaSearch,
  FaExclamationTriangle,
  FaCheckCircle,
  FaTimesCircle
} from 'react-icons/fa';

function PaymentTransactions() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  const [processingPayment, setProcessingPayment] = useState(null);

  // Payment type icons and labels
  const paymentTypes = {
    bus_reservation: { icon: FaBus, label: 'Bus Reservation', color: '#2196F3' },
    general: { icon: FaMoneyBill, label: 'General Payment', color: '#4CAF50' },
    ticket: { icon: FaTicketAlt, label: 'Ticket Purchase', color: '#FF9800' },
    app_service: { icon: FaMobile, label: 'App Service', color: '#9C27B0' }
  };

  // Payment status colors
  const statusColors = {
    pending: '#FF9800',
    under_review: '#2196F3',
    verified: '#4CAF50',
    rejected: '#F44336',
    refunding: '#9C27B0'
  };

  // Set up real-time listener for payments
  useEffect(() => {
    const paymentsRef = collection(db, 'payments');
    const q = query(paymentsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const paymentsList = [];
      snapshot.forEach((doc) => {
        paymentsList.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setPayments(paymentsList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching payments:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Handle payment verification actions
  const handlePaymentAction = async (paymentId, action, reason = '') => {
    setProcessingPayment(paymentId);

    try {
      const payment = payments.find(p => p.id === paymentId);
      if (!payment) throw new Error('Payment not found');

      let newStatus;
      let actionDescription;

      switch (action) {
        case 'approve':
          newStatus = 'verified';
          actionDescription = 'approved';
          break;
        case 'reject':
          newStatus = 'rejected';
          actionDescription = 'rejected';
          break;
        case 'review':
          newStatus = 'under_review';
          actionDescription = 'marked for review';
          break;
        case 'pending':
          newStatus = 'pending';
          actionDescription = 'marked as pending';
          break;
        default:
          throw new Error('Invalid action');
      }

      // Update payment status
      const paymentRef = doc(db, 'payments', paymentId);
      const updateData = {
        status: newStatus,
        [`${action}edAt`]: serverTimestamp(),
        [`${action}edBy`]: 'admin', // Replace with current user
        updatedAt: serverTimestamp()
      };

      if (reason) {
        updateData.reason = reason;
      }

      await updateDoc(paymentRef, updateData);

      // If it's a bus reservation, update the reservation status too
      if (payment.type === 'bus_reservation' && payment.reservationId) {
        const reservationRef = doc(db, 'reservations', payment.reservationId);
        const reservationStatus = newStatus === 'verified' ? 'confirmed' :
                                newStatus === 'rejected' ? 'cancelled' : 'pending_payment';

        await updateDoc(reservationRef, {
          status: reservationStatus,
          paymentStatus: newStatus,
          updatedAt: serverTimestamp()
        });
      }

      // Log activity
      await logActivity(
        ACTIVITY_TYPES.PAYMENT_UPDATE,
        `Payment ${actionDescription}: ${payment.bookingReference || payment.id}`,
        {
          paymentId: paymentId,
          action: action,
          newStatus: newStatus,
          paymentType: payment.type,
          amount: payment.amount,
          bookingReference: payment.bookingReference,
          reason: reason
        }
      );

      // Close modal if open
      setSelectedPayment(null);

    } catch (error) {
      console.error(`Error ${action}ing payment:`, error);
      alert(`Error ${action}ing payment: ${error.message}`);
    } finally {
      setProcessingPayment(null);
    }
  };

  // Filter payments based on type, status, and search
  const filteredPayments = payments.filter(payment => {
    const matchesType = filterType === 'all' || payment.type === filterType;
    const matchesStatus = filterStatus === 'all' || payment.status === filterStatus;
    const matchesSearch = searchTerm === '' ||
      payment.bookingReference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.passengerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.route?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.busNumber?.toString().includes(searchTerm.toLowerCase());

    return matchesType && matchesStatus && matchesSearch;
  });

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount);
  };

  // Format date
  const formatDate = (timestamp) => {
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
  };

  if (loading) {
    return (
      <div className="payment-transactions-main">
        <div className="payment-loading">
          <div className="loading-spinner"></div>
          <p>Loading payments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-transactions-main">
      {/* Header Section - Bus Reservation Style */}
      <div className="payment-header">
        <div className="payment-header-pattern"></div>
        <div className="payment-header-content">
          <div className="payment-header-top">
            <div className="payment-title-section">
              <div className="payment-title-text">
                <h1 className="payment-main-title">Payment Transactions</h1>
              </div>
            </div>
          </div>

          <div className="payment-stats-container">
            <div className="payment-stat-card payment-pending">
              <div className="payment-stat-icon-wrapper">
                <FaClock className="payment-stat-icon" />
              </div>
              <div className="payment-stat-content">
                <div className="payment-stat-number">
                  {payments.filter(p => p.status === 'pending').length}
                </div>
                <div className="payment-stat-label">Pending</div>
              </div>
            </div>

            <div className="payment-stat-card payment-verified">
              <div className="payment-stat-icon-wrapper">
                <FaCheckCircle className="payment-stat-icon" />
              </div>
              <div className="payment-stat-content">
                <div className="payment-stat-number">
                  {payments.filter(p => p.status === 'verified').length}
                </div>
                <div className="payment-stat-label">Verified</div>
              </div>
            </div>

            <div className="payment-stat-card payment-rejected">
              <div className="payment-stat-icon-wrapper">
                <FaTimesCircle className="payment-stat-icon" />
              </div>
              <div className="payment-stat-content">
                <div className="payment-stat-number">
                  {payments.filter(p => p.status === 'rejected').length}
                </div>
                <div className="payment-stat-label">Rejected</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="payment-content">

        {/* Filters */}
        <div className="payment-filters">
          <div className="filter-group">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Types</option>
              <option value="bus_reservation">Bus Reservations</option>
              <option value="general">General Payments</option>
              <option value="ticket">Ticket Purchases</option>
              <option value="app_service">App Services</option>
            </select>
          </div>

          <div className="filter-group">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="under_review">Under Review</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="search-group">
            <FaSearch />
            <input
              type="text"
              placeholder="Search by booking ref, passenger name, route..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        {/* Payments List */}
        <div className="payments-list">
          {filteredPayments.length === 0 ? (
            <div className="no-payments">
              <FaExclamationTriangle />
              <p>No payments found matching your criteria</p>
            </div>
          ) : (
            filteredPayments.map(payment => {
              const typeInfo = paymentTypes[payment.type] || paymentTypes.general;
              const TypeIcon = typeInfo.icon;

              return (
                <div key={payment.id} className="payment-card">
                  <div className="payment-card-header">
                    <div className="payment-type">
                      <TypeIcon style={{ color: typeInfo.color }} />
                      <span className="type-label">{typeInfo.label}</span>
                      <span
                        className={`status-badge ${payment.status}`}
                        style={{ backgroundColor: statusColors[payment.status] }}
                      >
                        {payment.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="payment-amount">
                      {formatCurrency(payment.amount)}
                    </div>
                  </div>

                  <div className="payment-details">
                    {payment.type === 'bus_reservation' && (
                      <div className="bus-details">
                        <div className="detail-row">
                          <strong>Booking:</strong> {payment.bookingReference}
                        </div>
                        <div className="detail-row">
                          <strong>Route:</strong> {payment.route}
                        </div>
                        <div className="detail-row">
                          <strong>Bus:</strong> #{payment.busNumber} • {payment.departureTime}
                        </div>
                        <div className="detail-row">
                          <strong>Passenger:</strong> {payment.passengerName}
                        </div>
                        <div className="detail-row">
                          <strong>Travel Date:</strong> {formatDate(payment.travelDate)}
                        </div>
                      </div>
                    )}

                    <div className="detail-row">
                      <strong>Payment Method:</strong> {payment.paymentMethod}
                    </div>
                    <div className="detail-row">
                      <strong>Created:</strong> {formatDate(payment.createdAt)}
                    </div>
                    {payment.reference && (
                      <div className="detail-row">
                        <strong>Reference:</strong> {payment.reference}
                      </div>
                    )}
                  </div>

                  <div className="payment-actions">
                    <button
                      className="action-btn view"
                      onClick={() => setSelectedPayment(payment)}
                    >
                      <FaEye /> View Details
                    </button>

                    {payment.status === 'pending' && (
                      <>
                        <button
                          className="action-btn approve"
                          onClick={() => handlePaymentAction(payment.id, 'approve')}
                          disabled={processingPayment === payment.id}
                        >
                          <FaCheck /> Approve
                        </button>
                        <button
                          className="action-btn reject"
                          onClick={() => handlePaymentAction(payment.id, 'reject')}
                          disabled={processingPayment === payment.id}
                        >
                          <FaTimes /> Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Payment Details Modal */}
      {selectedPayment && (
        <PaymentDetailsModal
          payment={selectedPayment}
          onClose={() => setSelectedPayment(null)}
          onAction={handlePaymentAction}
          processing={processingPayment === selectedPayment.id}
          onViewImage={(imageUrl) => {
            setSelectedImage(imageUrl);
            setShowImageModal(true);
          }}
        />
      )}

      {/* Image Modal */}
      {showImageModal && (
        <ImageModal
          imageUrl={selectedImage}
          onClose={() => {
            setShowImageModal(false);
            setSelectedImage('');
          }}
        />
      )}
    </div>
  );
}

// Payment Details Modal Component
const PaymentDetailsModal = ({ payment, onClose, onAction, processing, onViewImage }) => {
  const [reason, setReason] = useState('');
  const [actionType, setActionType] = useState('');

  const handleAction = () => {
    if (actionType) {
      onAction(payment.id, actionType, reason);
      setReason('');
      setActionType('');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content payment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Payment Details</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="payment-info">
            <div className="info-section">
              <h3>Payment Information</h3>
              <div className="info-grid">
                <div className="info-item">
                  <label>Amount:</label>
                  <span>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(payment.amount)}</span>
                </div>
                <div className="info-item">
                  <label>Method:</label>
                  <span>{payment.paymentMethod}</span>
                </div>
                <div className="info-item">
                  <label>Reference:</label>
                  <span>{payment.reference || 'N/A'}</span>
                </div>
                <div className="info-item">
                  <label>Status:</label>
                  <span className={`status-badge ${payment.status}`}>
                    {payment.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {payment.type === 'bus_reservation' && (
              <div className="info-section">
                <h3>Bus Reservation Details</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <label>Booking Reference:</label>
                    <span>{payment.bookingReference}</span>
                  </div>
                  <div className="info-item">
                    <label>Route:</label>
                    <span>{payment.route}</span>
                  </div>
                  <div className="info-item">
                    <label>Bus Number:</label>
                    <span>#{payment.busNumber}</span>
                  </div>
                  <div className="info-item">
                    <label>Departure:</label>
                    <span>{payment.departureTime}</span>
                  </div>
                  <div className="info-item">
                    <label>Passenger:</label>
                    <span>{payment.passengerName}</span>
                  </div>
                  <div className="info-item">
                    <label>Seat Number:</label>
                    <span>{payment.seatNumber || 'N/A'}</span>
                  </div>
                </div>
              </div>
            )}

            {payment.paymentProof && (
              <div className="info-section">
                <h3>Payment Proof</h3>
                <div className="payment-proof">
                  <img
                    src={payment.paymentProof}
                    alt="Payment proof"
                    className="proof-thumbnail"
                    onClick={() => onViewImage(payment.paymentProof)}
                  />
                  <button
                    className="view-full-btn"
                    onClick={() => onViewImage(payment.paymentProof)}
                  >
                    <FaEye /> View Full Size
                  </button>
                </div>
              </div>
            )}

            {payment.status === 'pending' && (
              <div className="action-section">
                <h3>Verification Actions</h3>
                <div className="action-buttons">
                  <button
                    className="action-btn approve"
                    onClick={() => onAction(payment.id, 'approve')}
                    disabled={processing}
                  >
                    <FaCheck /> Approve Payment
                  </button>
                  <button
                    className="action-btn reject"
                    onClick={() => {
                      const reason = prompt('Reason for rejection (optional):');
                      onAction(payment.id, 'reject', reason || '');
                    }}
                    disabled={processing}
                  >
                    <FaTimes /> Reject Payment
                  </button>
                  <button
                    className="action-btn review"
                    onClick={() => onAction(payment.id, 'review')}
                    disabled={processing}
                  >
                    <FaClock /> Mark for Review
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Image Modal Component
const ImageModal = ({ imageUrl, onClose }) => {
  return (
    <div className="modal-overlay image-modal-overlay" onClick={onClose}>
      <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>×</button>
        <img src={imageUrl} alt="Payment proof full size" className="full-size-image" />
      </div>
    </div>
  );
};

export default PaymentTransactions;
