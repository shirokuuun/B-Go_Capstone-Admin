import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./PaymentCancelled.css";

const PaymentCancelled = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const handleRetryPayment = () => {
    navigate(`/payment/${sessionId}`);
  };

  const handleGoHome = () => {
    navigate("/");
  };

  return (
    <div className="payment-cancelled-page">
      <div className="payment-cancelled-container">
        <div className="cancelled-card">
          <div className="cancelled-icon">❌</div>
          <h1 className="cancelled-title">Payment Cancelled</h1>
          <p className="cancelled-message">
            Your payment was cancelled. No charges have been made to your
            account.
          </p>

          {sessionId && (
            <div className="session-info">
              <p className="session-label">Session ID:</p>
              <p className="session-value">{sessionId}</p>
            </div>
          )}

          <div className="cancelled-actions">
            <button onClick={handleRetryPayment} className="retry-btn">
              Try Again
            </button>

            <button onClick={handleGoHome} className="home-btn">
              Go Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentCancelled;
