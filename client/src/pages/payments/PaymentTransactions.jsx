import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '/src/firebase/firebase.js';
import { fetchCurrentUserData } from '/src/pages/settings/settings.js';
import paymentService from './paymentService.js';
import './PaymentTransactions.css';
import {
  FaBus,
  FaMoneyBill,
  FaTicketAlt,
  FaMobile,
  FaClock,
  FaEye,
  FaSearch,
  FaExclamationTriangle,
  FaCheckCircle,
  FaTimesCircle,
  FaTrash,
  FaCheck
} from 'react-icons/fa';

function PaymentTransactions() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  const [processingPayment, setProcessingPayment] = useState(null);

  // Authentication and role states
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Get configuration from service
  const paymentTypes = paymentService.getPaymentTypes({
    FaBus,
    FaMoneyBill,
    FaTicketAlt,
    FaMobile
  });
  const statusColors = paymentService.getStatusColors();

  // Authentication and role checking useEffect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userData = await fetchCurrentUserData();
          setCurrentUser(userData);
          setUserRole(userData?.role);
          setIsSuperAdmin(userData?.role === 'superadmin');
        } catch (error) {
          console.error('Error fetching user data:', error);
        }
      } else {
        window.location.href = '/login';
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Set up real-time listener for reservations (which include payment info)
  useEffect(() => {
    if (!authLoading) {
      const unsubscribe = paymentService.setupReservationsListener((reservationsList, error) => {
        if (error) {
          setLoading(false);
          return;
        }
        setPayments(reservationsList);
        setLoading(false);
      });

      return () => unsubscribe();
    }
  }, [authLoading]);

  // Handle reservation payment verification actions
  const handlePaymentAction = async (reservationId, action, reason = '') => {
    setProcessingPayment(reservationId);

    try {
      const result = await paymentService.handlePaymentAction(reservationId, action, reason);

      if (!result.success) {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error handling payment action:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setProcessingPayment(null);
    }
  };

  // Handle payment deletion
  const handleDeletePayment = async (paymentId) => {
    // Check if user is superadmin
    if (!isSuperAdmin) {
      alert('Access denied. Only super administrators can delete payment transactions.');
      return;
    }

    if (!window.confirm('⚠️ SUPER ADMIN ACTION ⚠️\n\nAre you sure you want to delete this payment record?\n\nThis action cannot be undone and will be logged in the activity logs.')) {
      return;
    }

    setProcessingPayment(paymentId);

    try {
      const result = await paymentService.deletePayment(paymentId);

      if (result.success) {
        // Optimistic update - remove from local state immediately
        setPayments(prevPayments =>
          prevPayments.filter(payment => payment.id !== paymentId)
        );
        alert('✅ Payment record deleted successfully. This action has been logged.');
      } else {
        alert(`❌ Error deleting payment: ${result.error}`);
      }
    } catch (error) {
      console.error('Error deleting payment:', error);
      alert(`❌ Error deleting payment: ${error.message}`);
    } finally {
      setProcessingPayment(null);
    }
  };

  // Filter payments using service
  const filteredPayments = paymentService.filterPayments(payments, filterStatus, searchTerm);

  // Use service methods for formatting
  const formatCurrency = paymentService.formatCurrency;
  const formatDate = paymentService.formatDate;

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
            {(() => {
              const stats = paymentService.getPaymentStatistics(payments);
              return (
                <>
                  <div className="payment-stat-card payment-pending">
                    <div className="payment-stat-icon-wrapper">
                      <FaClock className="payment-stat-icon" />
                    </div>
                    <div className="payment-stat-content">
                      <div className="payment-stat-number">{stats.pending}</div>
                      <div className="payment-stat-label">Pending</div>
                    </div>
                  </div>

                  <div className="payment-stat-card payment-verified">
                    <div className="payment-stat-icon-wrapper">
                      <FaCheckCircle className="payment-stat-icon" />
                    </div>
                    <div className="payment-stat-content">
                      <div className="payment-stat-number">{stats.verified}</div>
                      <div className="payment-stat-label">Verified</div>
                    </div>
                  </div>

                  <div className="payment-stat-card payment-rejected">
                    <div className="payment-stat-icon-wrapper">
                      <FaTimesCircle className="payment-stat-icon" />
                    </div>
                    <div className="payment-stat-content">
                      <div className="payment-stat-number">{stats.rejected}</div>
                      <div className="payment-stat-label">Rejected</div>
                    </div>
                  </div>

                  <div className="payment-stat-card payment-completed">
                    <div className="payment-stat-icon-wrapper">
                      <FaCheck className="payment-stat-icon" />
                    </div>
                    <div className="payment-stat-content">
                      <div className="payment-stat-number">{stats.completed}</div>
                      <div className="payment-stat-label">Completed</div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="payment-content">

        {/* Filters */}
        <div className="payment-filters">
          <div className="filter-group">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="receipt_uploaded">Receipt Uploaded</option>
              <option value="confirmed">Verified</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
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
                          <strong>Route:</strong> {payment.from} → {payment.to}
                        </div>
                        <div className="detail-row">
                          <strong>Selected Bus:</strong> {payment.selectedBusIds?.[0] || 'N/A'}
                        </div>
                        <div className="detail-row">
                          <strong>Customer:</strong> {payment.fullName}
                        </div>
                        <div className="detail-row">
                          <strong>Email:</strong> {payment.email}
                        </div>
                        <div className="detail-row">
                          <strong>Trip Type:</strong> {payment.isRoundTrip ? 'Round Trip' : 'One Way'}
                        </div>
                        {payment.timestamp && (
                          <div className="detail-row">
                            <strong>Requested:</strong> {formatDate(payment.timestamp)}
                          </div>
                        )}
                        <div className="detail-row">
                          <strong>Payment Method:</strong> {payment.paymentMethod}
                        </div>
                        {payment.receiptUploadedAt && (
                          <div className="detail-row">
                            <strong>Receipt Uploaded:</strong> {formatDate(payment.receiptUploadedAt)}
                          </div>
                        )}
                        <div className="detail-row">
                          <strong>Approved At:</strong> {payment.approvedAt ? formatDate(payment.approvedAt) : 'N/A'}
                        </div>
                        {payment.approvedBy && (
                          <div className="detail-row">
                            <strong>Approved By:</strong> {payment.approvedBy}
                          </div>
                        )}
                        {payment.reference && (
                          <div className="detail-row">
                            <strong>Reference:</strong> {payment.reference}
                          </div>
                        )}
                      </div>
                    )}

                    {payment.paymentProof && (
                      <div className="receipt-preview">
                        <div className="detail-row">
                          <strong>Payment Receipt:</strong>
                        </div>
                        <div
                          className="receipt-thumbnail-container"
                          onClick={() => {
                            setSelectedImage(payment.paymentProof);
                            setShowImageModal(true);
                          }}
                        >
                          <img
                            src={payment.paymentProof}
                            alt="Payment receipt"
                            className="receipt-thumbnail clickable-receipt"
                          />
                          <div className="receipt-overlay">
                            <FaEye className="view-icon" />
                            <span>Click to view full size</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="payment-actions">
                    {(payment.status === 'pending' || payment.originalReservation?.status === 'receipt_uploaded') && (
                      <div className="verification-actions">
                        <button
                          className="action-btn approve"
                          onClick={() => handlePaymentAction(payment.id, 'approve')}
                          disabled={processingPayment === payment.id || !payment.paymentProof}
                        >
                          <FaCheckCircle /> {processingPayment === payment.id ? 'Processing...' : 'Accept & Confirm'}
                        </button>
                        <button
                          className="action-btn reject"
                          onClick={() => {
                            const reason = prompt('Reason for rejecting receipt (e.g., invalid amount, fake receipt, etc.):');
                            if (reason !== null) {
                              handlePaymentAction(payment.id, 'reject', reason || 'No reason provided');
                            }
                          }}
                          disabled={processingPayment === payment.id}
                        >
                          <FaTimesCircle /> {processingPayment === payment.id ? 'Processing...' : 'Reject'}
                        </button>
                      </div>
                    )}
                    <button
                      className="action-btn delete"
                      onClick={() => handleDeletePayment(payment.id)}
                      disabled={processingPayment === payment.id || !isSuperAdmin}
                      title={isSuperAdmin ? 'Delete payment record' : 'Delete not allowed for admin users'}
                      style={{
                        opacity: !isSuperAdmin ? 0.5 : 1,
                        cursor: !isSuperAdmin ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <FaTrash /> {processingPayment === payment.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>


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


// Image Modal Component
const ImageModal = ({ imageUrl, onClose }) => {
  return (
    <div className="payment-image-modal-overlay" onClick={onClose}>
      <div className="payment-image-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="payment-image-modal-close-btn" onClick={onClose}>×</button>
        <img src={imageUrl} alt="Payment proof full size" className="payment-full-size-image" />
      </div>
    </div>
  );
};

export default PaymentTransactions;
