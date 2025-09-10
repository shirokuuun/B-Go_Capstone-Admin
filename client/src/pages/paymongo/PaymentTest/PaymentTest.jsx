import React, { useState } from 'react';
import './PaymentTest.css';
import API_BASE_URL from '../../../config/api.js';

const PaymentTest = () => {
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [isMockMode, setIsMockMode] = useState(true); // Toggle for mock/production

  // Mock API responses for testing without backend
  const mockCreateBooking = async (testBookingData) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const mockSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      success: true,
      message: "Booking created successfully (MOCK MODE)",
      sessionId: mockSessionId,
      bookingDetails: {
        ...testBookingData,
        bookingId: `booking_${Date.now()}`,
        status: "pending",
        createdAt: new Date().toISOString(),
        paymentUrl: `/payment/${mockSessionId}`
      }
    };
  };

  const mockGetBookingDetails = async (sessionId) => {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    return {
      success: true,
      message: "Booking details retrieved (MOCK MODE)",
      booking: {
        sessionId: sessionId,
        bookingId: `booking_${Date.now()}`,
        status: "pending",
        amount: 1200.00,
        passengerInfo: {
          name: "Juan Dela Cruz",
          email: "juan@example.com",
          phone: "09123456789"
        },
        tripDetails: {
          origin: "Cebu City",
          destination: "Manila",
          departureTime: "08:00 AM",
          departureDate: "2025-08-15"
        }
      }
    };
  };

  // Test creating a booking
  const createTestBooking = async () => {
    setLoading(true);
    setResponse(null);

    const testBookingData = {
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
      amount: 1200.00,
      numberOfPassengers: 2,
      discounts: [
        {
          name: "Student Discount",
          amount: 100.00
        }
      ]
    };

    try {
      let result;
      
      if (isMockMode) {
        // Use mock API for testing
        result = await mockCreateBooking(testBookingData);
      } else {
        // Use real API for production
        const response = await fetch(`${API_BASE_URL}/api/payment/create-booking`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(testBookingData)
        });
        result = await response.json();
      }

      setResponse(result);

      if (result.success) {
        setSessionId(result.sessionId);
      }
    } catch (error) {
      setResponse({ 
        success: false, 
        error: isMockMode 
          ? 'Mock API error occurred' 
          : 'Failed to connect to server. Make sure your backend is running on port 3000.' 
      });
    } finally {
      setLoading(false);
    }
  };

  // Test getting booking details
  const getBookingDetails = async () => {
    if (!sessionId) {
      alert('Please create a booking first');
      return;
    }

    try {
      let result;
      
      if (isMockMode) {
        // Use mock API for testing
        result = await mockGetBookingDetails(sessionId);
      } else {
        // Use real API for production
        const response = await fetch(`${API_BASE_URL}/api/payment/booking/${sessionId}`);
        result = await response.json();
      }
      
      setResponse(result);
    } catch (error) {
      setResponse({ 
        success: false, 
        error: isMockMode 
          ? 'Mock API error occurred' 
          : 'Failed to get booking details' 
      });
    }
  };

  return (
    <div className="test-page">
      <div className="test-container">
        <div className="test-card">
          <h1 className="test-title">B-GO PayMongo Integration Test</h1>
          
          {/* Mode Toggle */}
          <div className="test-mode-toggle">
            <h2 className="test-mode-title">🔧 Test Mode:</h2>
            <div className="test-mode-controls">
              <label className="test-mode-label">
                <input
                  type="radio"
                  name="testMode"
                  checked={isMockMode}
                  onChange={() => setIsMockMode(true)}
                />
                <span className={`test-mode-option ${isMockMode ? 'active' : ''}`}>
                  🧪 Mock Mode (No Backend Required)
                </span>
              </label>
              <label className="test-mode-label">
                <input
                  type="radio"
                  name="testMode"
                  checked={!isMockMode}
                  onChange={() => setIsMockMode(false)}
                />
                <span className={`test-mode-option ${!isMockMode ? 'active' : ''}`}>
                  🚀 Production Mode (Backend Required)
                </span>
              </label>
            </div>
          </div>
          
          {/* Instructions */}
          <div className="test-instructions">
            <h2 className="test-instructions-title">🚀 How to Test:</h2>
            {isMockMode ? (
              <ol className="test-instructions-list">
                <li className="test-instructions-item">Currently in Mock Mode - no backend server needed</li>
                <li className="test-instructions-item">Click "Create Test Booking" to generate a sample booking</li>
                <li className="test-instructions-item">Click "Go to Payment Page" to see the payment interface</li>
                <li className="test-instructions-item">Use test payment methods to complete the flow</li>
                <li className="test-instructions-item">Switch to Production Mode when backend is ready</li>
              </ol>
            ) : (
              <ol className="test-instructions-list">
                <li className="test-instructions-item">Make sure your backend server is running on port 3000</li>
                <li className="test-instructions-item">Click "Create Test Booking" to generate a sample booking</li>
                <li className="test-instructions-item">Click "Go to Payment Page" to see the payment interface</li>
                <li className="test-instructions-item">Use test payment methods to complete the flow</li>
              </ol>
            )}
          </div>

          {/* Test Controls */}
          <div className="test-controls">
            <button
              onClick={createTestBooking}
              disabled={loading}
              className="test-btn create"
            >
              {loading ? '⏳ Creating...' : '🎯 Create Test Booking'}
            </button>

            <button
              onClick={getBookingDetails}
              disabled={!sessionId}
              className="test-btn details"
            >
              📋 Get Booking Details
            </button>
          </div>

          {/* Session ID Display */}
          {sessionId && (
            <div className="test-session">
              <h3 className="test-session-title">Current Session ID:</h3>
              <code className="test-session-code">
                {sessionId}
              </code>
              <div>
                <a
                  href={`/payment/${sessionId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="test-session-link"
                >
                  🔗 Go to Payment Page
                </a>
              </div>
            </div>
          )}

          {/* API Response */}
          {response && (
            <div className="test-response">
              <h3 className="test-response-title">API Response:</h3>
              <div className={`test-response-content ${response.success ? 'success' : 'error'}`}>
                <pre className="test-response-code">
                  {JSON.stringify(response, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Test Payment Methods */}
          <div className="test-payment-methods">
            <h3 className="test-payment-title">💳 Test Payment Methods:</h3>
            <div className="test-payment-list">
              <p className="test-payment-item">
                <span className="test-payment-label">Test Card:</span> 4343434343434345
              </p>
              <p className="test-payment-item">
                <span className="test-payment-label">Expiry:</span> Any future date (e.g., 12/25)
              </p>
              <p className="test-payment-item">
                <span className="test-payment-label">CVC:</span> Any 3 digits (e.g., 123)
              </p>
              <p className="test-payment-item">
                <span className="test-payment-label">GCash:</span> Use any mobile number, OTP: 123456
              </p>
            </div>
          </div>

          {/* Backend Status Check */}
          <div className="test-status">
            <h3 className="test-status-title">🔧 Current Status:</h3>
            {isMockMode ? (
              <div>
                <p className="test-status-text">
                  ✅ <strong>Mock Mode Active:</strong> Testing flow without backend server
                </p>
                <p className="test-status-text">
                  🎭 All API calls are simulated for UI/UX testing
                </p>
                <p className="test-status-text">
                  🔄 Switch to Production Mode when backend is deployed
                </p>
              </div>
            ) : (
              <div>
                <p className="test-status-text">
                  🚀 <strong>Production Mode:</strong> Connecting to real backend
                </p>
                <p className="test-status-text">
                  Make sure your Node.js server is running on port 3000.
                </p>
                <p className="test-status-text">
                  Check console for: "🚀 B-GO Server is running on port 3000"
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentTest;