import React, { useState } from "react";
import "./PaymentForm.css";

const PaymentForm = ({ onSubmit, loading = false, error = null }) => {
  const [paymentMethod, setPaymentMethod] = useState("card");

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(paymentMethod);
  };

  return (
    <form onSubmit={handleSubmit} className="payment-form">
      <div className="payment-method-selection">
        <h3>Select Payment Method</h3>

        <div className="payment-options">
          <label className="payment-option">
            <input
              type="radio"
              name="paymentMethod"
              value="card"
              checked={paymentMethod === "card"}
              onChange={(e) => setPaymentMethod(e.target.value)}
            />
            <span className="payment-option-content">
              <span className="payment-icon">💳</span>
              <span className="payment-text">Credit/Debit Card</span>
            </span>
          </label>

          <label className="payment-option">
            <input
              type="radio"
              name="paymentMethod"
              value="gcash"
              checked={paymentMethod === "gcash"}
              onChange={(e) => setPaymentMethod(e.target.value)}
            />
            <span className="payment-option-content">
              <span className="payment-icon">📱</span>
              <span className="payment-text">GCash</span>
            </span>
          </label>

          <label className="payment-option">
            <input
              type="radio"
              name="paymentMethod"
              value="paymaya"
              checked={paymentMethod === "paymaya"}
              onChange={(e) => setPaymentMethod(e.target.value)}
            />
            <span className="payment-option-content">
              <span className="payment-icon">💰</span>
              <span className="payment-text">PayMaya</span>
            </span>
          </label>
        </div>
      </div>

      {error && (
        <div className="payment-error">
          <span className="error-icon">⚠️</span>
          <span className="error-message">{error}</span>
        </div>
      )}

      <button type="submit" className="payment-submit-btn" disabled={loading}>
        {loading ? (
          <>
            <span className="loading-spinner"></span>
            Processing...
          </>
        ) : (
          "Proceed to Payment"
        )}
      </button>
    </form>
  );
};

export default PaymentForm;
