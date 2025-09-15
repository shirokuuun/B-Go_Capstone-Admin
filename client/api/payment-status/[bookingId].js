import { initializeFirebase } from "./firebase.js";

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed. Use GET.",
    });
  }

  try {
    const db = initializeFirebase();
    const { bookingId } = req.query;
    const { userId } = req.query;

    if (!bookingId || !userId) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters: bookingId and userId",
        usage: "GET /api/payment-status/{bookingId}?userId={userId}",
      });
    }

    console.log(
      `Checking payment status for booking: ${bookingId}, user: ${userId}`
    );

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
        bookingId,
        userId,
      });
    }

    const bookingData = bookingDoc.data();

    // Convert Firestore timestamps to ISO strings for JSON serialization
    const convertTimestamp = (timestamp) => {
      if (!timestamp) return null;
      if (timestamp.toDate) return timestamp.toDate().toISOString();
      if (timestamp instanceof Date) return timestamp.toISOString();
      return timestamp;
    };

    // Return comprehensive payment status information
    const response = {
      success: true,
      bookingId,
      userId,
      status: bookingData.status || "pending_payment",
      paymentStatus: bookingData.paymentStatus || "pending",
      boardingStatus: bookingData.boardingStatus || "pending",

      // Payment details
      amount: bookingData.amount || 0,
      currency: bookingData.currency || "PHP",
      paymentMethod: bookingData.paymentMethod || null,

      // PayMongo specific fields
      paymongoPaymentId: bookingData.paymongoPaymentId || null,
      paymongoCheckoutId: bookingData.paymongoCheckoutId || null,
      paymongoCheckoutUrl: bookingData.paymongoCheckoutUrl || null,

      // Timestamps
      createdAt: convertTimestamp(bookingData.createdAt),
      updatedAt: convertTimestamp(bookingData.updatedAt),
      paymentInitiatedAt: convertTimestamp(bookingData.paymentInitiatedAt),
      paidAt: convertTimestamp(bookingData.paidAt),
      paymentCompletedAt: convertTimestamp(bookingData.paymentCompletedAt),
      paymentFailedAt: convertTimestamp(bookingData.paymentFailedAt),
      webhookProcessedAt: convertTimestamp(bookingData.webhookProcessedAt),

      // Error handling
      paymentError: bookingData.paymentError || null,

      // Booking details (for reference)
      route: bookingData.route || null,
      fromPlace: bookingData.fromPlace || null,
      toPlace: bookingData.toPlace || null,
      quantity: bookingData.quantity || null,
      fareTypes: bookingData.fareTypes || null,
    };

    console.log(
      `Payment status retrieved for booking ${bookingId}: ${response.status}`
    );

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error checking payment status:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to check payment status",
      bookingId: req.query.bookingId,
      userId: req.query.userId,
      ...(process.env.NODE_ENV === "development" && {
        debug: {
          message: error.message,
          stack: error.stack?.split("\n").slice(0, 5),
        },
      }),
    });
  }
}
