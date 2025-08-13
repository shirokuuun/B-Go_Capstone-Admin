import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './PaymentSuccess.css';

const PaymentSuccess = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  // Poll for payment status
  useEffect(() => {
    const checkPaymentStatus = async () => {
      try {
        const response = await fetch(`http://localhost:3000/api/payment/status/${sessionId}`);
        const data = await response.json();
        
        if (data.success) {
          setBooking(data.booking);
          
          // If not paid yet, keep polling
          if (data.status !== 'Paid') {
            setTimeout(checkPaymentStatus, 2000); // Poll every 2 seconds
            return;
          }
        }
      } catch (err) {
        console.error('Error checking payment status:', err);
        setTimeout(checkPaymentStatus, 5000); // Retry after 5 seconds
      } finally {
        setLoading(false);
      }
    };

    if (sessionId) {
      checkPaymentStatus();
    }
  }, [sessionId]);

  if (loading) {
    return (
      <div className="success-loading">
        <div className="success-loading-card">
          <div className="success-loading-spinner"></div>
          <h1 className="success-loading-title">Confirming Payment...</h1>
          <p className="success-loading-text">Please wait while we verify your payment.</p>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="success-error-page">
        <div className="success-error-card">
          <div className="success-error-icon">❌</div>
          <h1 className="success-error-title">Payment Not Found</h1>
          <p className="success-error-text">We couldn't find your payment information.</p>
          <button 
            onClick={() => navigate('/')}
            className="success-btn back"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (booking.status !== 'Paid') {
    return (
      <div className="success-pending-page">
        <div className="success-pending-card">
          <div className="success-pending-icon">⏳</div>
          <h1 className="success-pending-title">Payment Pending</h1>
          <p className="success-pending-text">Your payment is being processed. This page will update automatically.</p>
          <div className="success-pending-status">
            Status: {booking.status}
          </div>
        </div>
      </div>
    );
  }

  const departureDate = new Date(booking.tripDetails.departureDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="success-page">
      <div className="success-container">
        {/* Success Icon */}
        <div className="success-icon">✓</div>
        
        {/* Success Message */}
        <h1 className="success-title">Payment Successful!</h1>
        <p className="success-subtitle">Your booking has been confirmed and your ticket has been reserved.</p>
        
        {/* Booking Summary */}
        <div className="success-summary">
          <h3 className="success-summary-title">Booking Confirmation</h3>
          
          <div className="success-summary-grid">
            <div className="success-detail-section">
              <h4 className="success-detail-title">Trip Details</h4>
              <div className="success-detail-list">
                <p className="success-detail-item">
                  <span className="success-detail-label">Route:</span> {booking.tripDetails.origin} → {booking.tripDetails.destination}
                </p>
                <p className="success-detail-item">
                  <span className="success-detail-label">Date:</span> {departureDate}
                </p>
                <p className="success-detail-item">
                  <span className="success-detail-label">Time:</span> {booking.tripDetails.departureTime}
                </p>
                <p className="success-detail-item">
                  <span className="success-detail-label">Seats:</span> {booking.tripDetails.seats.join(', ')}
                </p>
              </div>
            </div>
            
            <div className="success-detail-section">
              <h4 className="success-detail-title">Passenger Details</h4>
              <div className="success-detail-list">
                <p className="success-detail-item">
                  <span className="success-detail-label">Name:</span> {booking.passengerInfo.name}
                </p>
                <p className="success-detail-item">
                  <span className="success-detail-label">Email:</span> {booking.passengerInfo.email}
                </p>
                <p className="success-detail-item">
                  <span className="success-detail-label">Phone:</span> {booking.passengerInfo.phone}
                </p>
                <p className="success-detail-item">
                  <span className="success-detail-label">Passengers:</span> {booking.billingInfo.numberOfPassengers}
                </p>
              </div>
            </div>
          </div>
          
          <div className="success-payment-summary">
            <div className="success-amount-row">
              <span className="success-amount-label">Total Amount Paid:</span>
              <span className="success-amount-value">₱{booking.billingInfo.amount.toFixed(2)}</span>
            </div>
            {booking.paymentReference && (
              <div className="success-reference-row">
                <span className="success-reference-label">Reference Number:</span>
                <span className="success-reference-value">{booking.paymentReference}</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="success-actions">
          <button 
            onClick={() => window.print()}
            className="success-btn print"
          >
            🖨️ Print Ticket
          </button>
          
          <button 
            onClick={() => navigate('/bookings')}
            className="success-btn bookings"
          >
            📋 View My Bookings
          </button>
          
          <button 
            onClick={() => navigate('/')}
            className="success-btn home"
          >
            🏠 Book Another Trip
          </button>
        </div>
        
        {/* Important Note */}
        <div className="success-note">
          <p className="success-note-text">
            <span className="success-note-label">Important:</span> Please arrive at the terminal at least 30 minutes before departure. 
            Bring a valid ID and this confirmation for boarding.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;