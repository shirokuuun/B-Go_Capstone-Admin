// pages/payment-success.js
import { useRouter } from "next/router";
import { useEffect } from "react";

export default function PaymentSuccess() {
  const router = useRouter();
  const { bookingId, userId } = router.query;

  useEffect(() => {
    if (bookingId && userId) {
      // Optionally update booking status or send confirmation
      console.log("Payment successful for:", { bookingId, userId });

      // Redirect back to app after 3 seconds
      setTimeout(() => {
        window.location.href = "bgocapstone://payment-success";
      }, 3000);
    }
  }, [bookingId, userId]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "20px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          background: "#d4edda",
          border: "1px solid #c3e6cb",
          borderRadius: "8px",
          padding: "30px",
          textAlign: "center",
          maxWidth: "500px",
        }}
      >
        <h1 style={{ color: "#155724", marginBottom: "20px" }}>
          Payment Successful!
        </h1>
        <p style={{ color: "#155724", marginBottom: "20px" }}>
          Your B-GO bus pre-booking has been confirmed.
        </p>
        <p style={{ color: "#6c757d", fontSize: "14px", marginBottom: "20px" }}>
          Booking ID: {bookingId}
        </p>
        <p style={{ color: "#6c757d", fontSize: "14px" }}>
          You will be redirected back to the app in 3 seconds...
        </p>
        <button
          onClick={() =>
            (window.location.href = "bgocapstone://payment-success")
          }
          style={{
            background: "#28a745",
            color: "white",
            border: "none",
            padding: "10px 20px",
            borderRadius: "5px",
            cursor: "pointer",
            marginTop: "20px",
          }}
        >
          Return to App
        </button>
      </div>
    </div>
  );
}
