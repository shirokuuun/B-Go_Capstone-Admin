import React, { useState, useEffect } from 'react';
import paymentService from './paymentService.js';
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
  FaTimesCircle,
  FaReceipt,
  FaClipboardCheck,
  FaRedo
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

  // Get configuration from service
  const paymentTypes = paymentService.getPaymentTypes({
    FaBus,
    FaMoneyBill,
    FaTicketAlt,
    FaMobile
  });
  const statusColors = paymentService.getStatusColors();

  // Set up real-time listener for reservations (which include payment info)
  useEffect(() => {
    const unsubscribe = paymentService.setupReservationsListener((reservationsList, error) => {
      if (error) {
        setLoading(false);
        return;
      }
      setPayments(reservationsList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Handle reservation payment verification actions
  const handlePaymentAction = async (reservationId, action, reason = '') => {
    setProcessingPayment(reservationId);

    try {
      const result = await paymentService.handlePaymentAction(reservationId, action, reason);

      if (result.success) {
        // Close modal if open
        setSelectedPayment(null);
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error handling payment action:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setProcessingPayment(null);
    }
  };

  // Filter payments using service
  const filteredPayments = paymentService.filterPayments(payments, filterType, filterStatus, searchTerm);

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
                          <strong>Bus:</strong> #{payment.busNumber}
                        </div>
                        <div className="detail-row">
                          <strong>Passenger:</strong> {payment.passengerName}
                        </div>
                        <div className="detail-row">
                          <strong>Email:</strong> {payment.email}
                        </div>
                        <div className="detail-row">
                          <strong>Trip Type:</strong> {payment.isRoundTrip ? 'Round Trip' : 'One Way'}
                        </div>
                        <div className="detail-row">
                          <strong>Reserved:</strong> {formatDate(payment.timestamp)}
                        </div>
                      </div>
                    )}

                    {payment.paymentProof && (
                      <div className="receipt-preview">
                        <div className="detail-row">
                          <strong>Payment Receipt:</strong>
                        </div>
                        <div className="receipt-thumbnail-container">
                          <img
                            src={payment.paymentProof}
                            alt="Payment receipt"
                            className="receipt-thumbnail"
                            onClick={() => {
                              setSelectedImage(payment.paymentProof);
                              setShowImageModal(true);
                            }}
                          />
                          <div className="receipt-overlay">
                            <FaEye className="view-icon" />
                            <span>Click to view</span>
                          </div>
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
                      <FaEye /> View Details & Verify Receipt
                    </button>
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
          formatDate={formatDate}
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
const PaymentDetailsModal = ({ payment, onClose, onAction, processing, onViewImage, formatDate }) => {
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
    <div className="payment-modal-overlay" onClick={onClose}>
      <div className="payment-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="payment-modal-header">
          <h2>Payment Details</h2>
          <button className="payment-modal-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="payment-modal-body">
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
                    <label>From:</label>
                    <span>{payment.from}</span>
                  </div>
                  <div className="info-item">
                    <label>To:</label>
                    <span>{payment.to}</span>
                  </div>
                  <div className="info-item">
                    <label>Passenger Name:</label>
                    <span>{payment.fullName}</span>
                  </div>
                  <div className="info-item">
                    <label>Email:</label>
                    <span>{payment.email}</span>
                  </div>
                  <div className="info-item">
                    <label>Trip Type:</label>
                    <span>{payment.isRoundTrip ? 'Round Trip' : 'One Way'}</span>
                  </div>
                  <div className="info-item">
                    <label>Selected Bus:</label>
                    <span>#{payment.selectedBusIds?.[0] || 'N/A'}</span>
                  </div>
                  <div className="info-item">
                    <label>Reserved Date:</label>
                    <span>{formatDate(payment.timestamp)}</span>
                  </div>
                </div>
              </div>
            )}

            {payment.paymentProof && (
              <div className="info-section payment-proof-section">
                <h3><FaReceipt /> Payment Receipt Verification</h3>
                <p className="verification-instruction">
                  Review the payment receipt submitted by the customer. Verify the amount, payment method, and authenticity before approving the reservation.
                </p>
                <div className="payment-proof">
                  <div className="proof-image-container">
                    <img
                      src={payment.paymentProof}
                      alt="Payment receipt submitted by customer"
                      className="proof-thumbnail"
                      onClick={() => onViewImage(payment.paymentProof)}
                    />
                    <div className="proof-overlay">
                      <FaEye className="view-icon" />
                      <span>Click to enlarge</span>
                    </div>
                  </div>
                  <div className="proof-actions">
                    <button
                      className="view-full-btn"
                      onClick={() => onViewImage(payment.paymentProof)}
                    >
                      <FaEye /> View Full Size Receipt
                    </button>
                  </div>
                </div>
                <div className="verification-checklist">
                  <h4>Verification Checklist:</h4>
                  <ul>
                    <li><FaCheckCircle /> Amount matches reservation total: <strong>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(payment.amount)}</strong></li>
                    <li><FaCheckCircle /> Payment method is valid</li>
                    <li><FaCheckCircle /> Receipt appears authentic</li>
                    <li><FaCheckCircle /> Transaction date is reasonable</li>
                  </ul>
                </div>
              </div>
            )}

            {payment.status === 'pending' && (
              <div className="action-section receipt-verification-actions">
                <h3><FaClipboardCheck /> Receipt Verification Decision</h3>
                <p className="action-instruction">
                  Based on your review of the payment receipt above, decide the reservation status:
                </p>
                <div className="action-buttons">
                  <button
                    className="action-btn approve"
                    onClick={() => onAction(payment.id, 'approve')}
                    disabled={processing}
                  >
                    <FaCheckCircle /> Accept Receipt & Confirm Reservation
                  </button>
                  <button
                    className="action-btn reject"
                    onClick={() => {
                      const reason = prompt('Reason for rejecting receipt (e.g., invalid amount, fake receipt, etc.):');
                      onAction(payment.id, 'reject', reason || '');
                    }}
                    disabled={processing}
                  >
                    <FaTimesCircle /> Reject Receipt & Cancel Reservation
                  </button>
                  <button
                    className="action-btn review"
                    onClick={() => onAction(payment.id, 'review')}
                    disabled={processing}
                  >
                    <FaRedo /> Need More Review
                  </button>
                </div>
                <div className="action-note">
                  <strong>Note:</strong> Approving will confirm the customer's bus reservation. Rejecting will cancel their booking.
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
    <div className="payment-image-modal-overlay" onClick={onClose}>
      <div className="payment-image-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="payment-image-modal-close-btn" onClick={onClose}>×</button>
        <img src={imageUrl} alt="Payment proof full size" className="payment-full-size-image" />
      </div>
    </div>
  );
};

export default PaymentTransactions;
