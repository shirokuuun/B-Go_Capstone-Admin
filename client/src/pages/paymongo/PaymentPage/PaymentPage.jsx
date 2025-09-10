import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API_BASE_URL from '../../../config/api.js';
import './PaymentPage.css';

const PaymentPage = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [isMockMode, setIsMockMode] = useState(true); // Enable mock mode by default

  // Mock booking data
  const getMockBooking = async (sessionId) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      success: true,
      booking: {
        sessionId: sessionId,
        bookingId: `booking_${Date.now()}`,
        status: "pending",
        passengerInfo: {
          name: "Juan Dela Cruz",
          email: "juan@example.com",
          phone: "09123456789",
          userId: "user123"
        },
        tripDetails: {
          origin: "Cebu City",
          destination: "Manila",
          departureTime: "08:00 AM",
          departureDate: "2025-08-15",
          routeId: "route123",
          busId: "bus456",
          seats: ["A1", "A2"]
        },
        billingInfo: {
          numberOfPassengers: 2,
          farePerPassenger: 600.00,
          amount: 1100.00,
          discounts: [
            {
              name: "Student Discount",
              amount: 100.00
            }
          ]
        },
        createdAt: new Date().toISOString()
      }
    };
  };

  // Mock payment processing
  const mockProcessPayment = async (paymentMethod) => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate success and redirect to success page
    return {
      success: true,
      checkoutUrl: `/payment-success/${sessionId}?mock=true`,
      message: `Payment processed with ${paymentMethod} (MOCK MODE)`
    };
  };

  // Fetch booking details
  useEffect(() => {
    const fetchBooking = async () => {
      try {
        let data;
        
        if (isMockMode) {
          // Use mock data
          data = await getMockBooking(sessionId);
        } else {
          // Use real API
          const response = await fetch(`${API_BASE_URL}/api/payment/booking/${sessionId}`);
          data = await response.json();
        }
        
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
        setError(isMockMode ? 'Mock data error' : 'Failed to load booking details');
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
      let result;
      
      if (isMockMode) {
        // Use mock payment processing
        result = await mockProcessPayment(paymentMethod);
      } else {
        // Use real API
        const response = await fetch(`${API_BASE_URL}/api/payment/initiate-payment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sessionId: sessionId,
            paymentMethod: paymentMethod
          })
        });
        result = await response.json();
      }

      if (result.success) {
        if (isMockMode) {
          // Navigate to success page for mock mode
          navigate(`/payment-success/${sessionId}?mock=true`);
        } else {
          // Redirect to real payment gateway
          window.location.href = result.checkoutUrl;
        }
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(isMockMode ? 'Mock payment error' : 'Payment processing failed. Please try again.');
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
          {isMockMode && (
            <div className="mock-mode-indicator">
              🧪 Mock Mode - Demo Payment Flow
            </div>
          )}
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

          {/* Payment QR Code Section */}
          <div className="payment-section qr-section">
            <h2 className="section-title">Complete Your Payment</h2>
            
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
              <div className="qr-payment-container">
                {/* QR Code Display */}
                <div className="qr-code-section">
                  <div className="qr-code-display">
                    <div className="qr-code-placeholder">
                      <div className="qr-pattern">
                        <div className="qr-corner top-left"></div>
                        <div className="qr-corner top-right"></div>
                        <div className="qr-corner bottom-left"></div>
                        <div className="qr-corner bottom-right"></div>
                        <div className="qr-center"></div>
                        <div className="qr-dots">
                          {Array.from({length: 64}).map((_, i) => (
                            <div key={i} className={`qr-dot ${Math.random() > 0.6 ? 'filled' : ''}`}></div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="qr-instructions">
                    <p className="qr-instruction-title">💳 Scan to Pay</p>
                    <p className="qr-instruction-text">
                      Use your mobile banking app or e-wallet to scan this QR code
                    </p>
                  </div>
                </div>

                {/* Payment Amount Display */}
                <div className="payment-amount-section">
                  <div className="amount-display">
                    <div className="amount-label">Total Amount</div>
                    <div className="amount-value">₱{booking.billingInfo.amount.toFixed(2)}</div>
                  </div>
                  
                  <div className="payment-reference">
                    <div className="reference-label">Reference Number</div>
                    <div className="reference-value">{sessionId}</div>
                  </div>
                </div>

                {/* Payment Options */}
                <div className="payment-options">
                  <div className="payment-option-group">
                    <h3 className="payment-option-title">Choose Payment Method:</h3>
                    
                    <div className="payment-buttons-grid">
                      <button 
                        onClick={() => processPayment('gcash-qr')}
                        className="payment-btn gcash-qr"
                      >
                        <span className="btn-icon">📱</span>
                        <span className="btn-text">
                          <span className="btn-title">Scan QR with GCash</span>
                          <span className="btn-subtitle">Open GCash app and scan</span>
                        </span>
                      </button>
                      
                      <button 
                        onClick={() => processPayment('paymaya-qr')}
                        className="payment-btn paymaya-qr"
                      >
                        <span className="btn-icon">💰</span>
                        <span className="btn-text">
                          <span className="btn-title">Scan QR with PayMaya</span>
                          <span className="btn-subtitle">Open PayMaya app and scan</span>
                        </span>
                      </button>
                    </div>

                    <div className="payment-divider">
                      <span className="divider-text">OR</span>
                    </div>

                    <div className="direct-payment-section">
                      <h4 className="direct-payment-title">Pay Directly:</h4>
                      <div className="direct-payment-buttons">
                        <button 
                          onClick={() => processPayment('gcash-direct')}
                          className="payment-btn gcash-direct"
                        >
                          <span className="btn-icon">📱</span>
                          <span className="btn-text">Pay with GCash</span>
                        </button>
                        
                        <button 
                          onClick={() => processPayment('paymaya-direct')}
                          className="payment-btn paymaya-direct"
                        >
                          <span className="btn-icon">💰</span>
                          <span className="btn-text">Pay with PayMaya</span>
                        </button>
                        
                        <button 
                          onClick={() => processPayment('card')}
                          className="payment-btn card"
                        >
                          <span className="btn-icon">💳</span>
                          <span className="btn-text">Credit/Debit Card</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;