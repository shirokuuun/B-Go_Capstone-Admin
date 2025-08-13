import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './PaymentPage.css';

const PaymentPage = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  // Fetch booking details
  useEffect(() => {
    const fetchBooking = async () => {
      try {
        const response = await fetch(`http://localhost:3000/api/payment/booking/${sessionId}`);
        const data = await response.json();
        
        if (data.success) {
          setBooking(data.booking);
          
          if (data.booking.status === 'Paid') {
            navigate(`/payment-success/${sessionId}`);
            return;
          }
        } else {
          setError(data.error);
        }
      } catch (err) {
        setError('Failed to load booking details');
      } finally {
        setLoading(false);
      }
    };

    if (sessionId) {
      fetchBooking();
    }
  }, [sessionId, navigate]);

  // Process payment
  const processPayment = async (paymentMethod) => {
    setProcessing(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:3000/api/payment/initiate-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: sessionId,
          paymentMethod: paymentMethod
        })
      });

      const result = await response.json();

      if (result.success) {
        window.location.href = result.checkoutUrl;
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Payment processing failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="payment-loading">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading payment details...</p>
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="payment-error-page">
        <div className="error-card">
          <div className="error-icon">❌</div>
          <h1 className="error-title">Error</h1>
          <p className="error-message">{error || 'Booking not found'}</p>
          <button 
            onClick={() => navigate('/')}
            className="back-btn"
          >
            Go Back
          </button>
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
    <div className="payment-page">
      <div className="payment-container">
        {/* Header */}
        <div className="payment-header">
          <h1 className="payment-title">Complete Your Booking Payment</h1>
          <p className="payment-subtitle">B-GO Bus Booking System</p>
        </div>

        {/* Payment Card */}
        <div className="payment-card">
          {/* Passenger Information */}
          <div className="payment-section">
            <h2 className="section-title">Passenger Information</h2>
            <div className="info-row">
              <span className="info-label">Name:</span>
              <span className="info-value">{booking.passengerInfo.name}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Email:</span>
              <span className="info-value">{booking.passengerInfo.email}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Phone:</span>
              <span className="info-value">{booking.passengerInfo.phone}</span>
            </div>
          </div>

          {/* Trip Details */}
          <div className="payment-section">
            <h2 className="section-title">Trip Details</h2>
            <div className="info-row">
              <span className="info-label">Route:</span>
              <span className="info-value">{booking.tripDetails.origin} → {booking.tripDetails.destination}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Date:</span>
              <span className="info-value">{departureDate}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Departure Time:</span>
              <span className="info-value">{booking.tripDetails.departureTime}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Seats:</span>
              <span className="info-value">{booking.tripDetails.seats.join(', ')}</span>
            </div>
          </div>

          {/* Payment Summary */}
          <div className="payment-section summary">
            <h2 className="section-title">Payment Summary</h2>
            <div className="info-row">
              <span className="info-label">Number of Passengers:</span>
              <span className="info-value">{booking.billingInfo.numberOfPassengers}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Fare per Passenger:</span>
              <span className="info-value">₱{booking.billingInfo.farePerPassenger.toFixed(2)}</span>
            </div>
            {booking.billingInfo.discounts.length > 0 && 
              booking.billingInfo.discounts.map((discount, index) => (
                <div key={index} className="info-row">
                  <span className="info-label">{discount.name}:</span>
                  <span className="info-value discount">-₱{discount.amount.toFixed(2)}</span>
                </div>
              ))
            }
            <hr className="payment-divider" />
            <div className="info-row">
              <span className="info-label">Total Amount:</span>
              <span className="info-value total">₱{booking.billingInfo.amount.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="payment-section">
            <h2 className="section-title">Choose Payment Method</h2>
            
            {error && (
              <div className="payment-error">
                {error}
              </div>
            )}

            {processing && (
              <div className="processing-container">
                <div className="processing-spinner"></div>
                <p className="processing-text">Processing payment...</p>
              </div>
            )}

            {!processing && (
              <div className="payment-buttons">
                <button 
                  onClick={() => processPayment('card')}
                  className="payment-btn card"
                >
                  💳 Credit/Debit Card
                </button>
                
                <button 
                  onClick={() => processPayment('gcash')}
                  className="payment-btn gcash"
                >
                  📱 GCash
                </button>
                
                <button 
                  onClick={() => processPayment('paymaya')}
                  className="payment-btn paymaya"
                >
                  💰 PayMaya
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;