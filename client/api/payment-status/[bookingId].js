import { initializeFirebase } from "../../lib/firebase.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const db = initializeFirebase();
    const { bookingId } = req.query;
    const { userId } = req.query;

    if (!bookingId || !userId) {
      return res.status(400).json({
        success: false,
        error: "Missing bookingId or userId parameter",
      });
    }

    // Get the booking from Firestore
    const bookingDoc = await db
      .collection("users")
      .doc(userId)
      .collection("preBookings")
      .doc(bookingId)
      .get();

    if (!bookingDoc.exists) {
      return res.status(404).json({
        success: false,
        error: "Booking not found",
      });
    }

    const bookingData = bookingDoc.data();

    // Return payment status information
    const response = {
      success: true,
      status: bookingData.status || "pending_payment",
      paymentStatus: bookingData.paymentStatus || "pending",
      paymongoPaymentId: bookingData.paymongoPaymentId || null,
      paymongoCheckoutId: bookingData.paymongoCheckoutId || null,
      paymongoCheckoutUrl: bookingData.paymongoCheckoutUrl || null,
      amount: bookingData.amount || 0,
      paidAt: bookingData.paidAt ? bookingData.paidAt.toDate() : null,
      paymentError: bookingData.paymentError || null,
      boardingStatus: bookingData.boardingStatus || "pending",
      createdAt: bookingData.createdAt ? bookingData.createdAt.toDate() : null,
      updatedAt: bookingData.updatedAt ? bookingData.updatedAt.toDate() : null,
    };

    console.log(
      `Payment status checked for booking ${bookingId}: ${response.status}`
    );

    res.status(200).json(response);
  } catch (error) {
    console.error("Error checking payment status:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
