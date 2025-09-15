import { initializeFirebase } from "./firebase.js";
import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed. Use POST.",
    });
  }

  try {
    const db = initializeFirebase();
    const rawBody = JSON.stringify(req.body);

    // Verify webhook signature if webhook secret is configured
    if (process.env.PAYMONGO_WEBHOOK_SECRET) {
      const signature = req.headers["paymongo-signature"];
      if (!signature) {
        console.error("Missing PayMongo signature header");
        return res.status(400).json({ error: "Missing signature" });
      }

      const expectedSignature = crypto
        .createHmac("sha256", process.env.PAYMONGO_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

      if (signature !== expectedSignature) {
        console.error("Invalid PayMongo webhook signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    const event = req.body.data;
    console.log("PayMongo webhook received:", {
      type: event.attributes?.type,
      id: event.id,
      timestamp: new Date().toISOString(),
    });

    // Handle payment successful events
    if (event.attributes.type === "checkout_session.payment.paid") {
      await handlePaymentSuccess(db, event);
    }
    // Handle payment failed events
    else if (event.attributes.type === "checkout_session.payment.failed") {
      await handlePaymentFailure(db, event);
    }
    // Handle checkout expired events
    else if (event.attributes.type === "checkout_session.expired") {
      await handleCheckoutExpired(db, event);
    } else {
      console.log(`Unhandled webhook event type: ${event.attributes.type}`);
    }

    return res.status(200).json({
      success: true,
      received: true,
      eventType: event.attributes?.type,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("PayMongo webhook processing error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Webhook processing failed",
      timestamp: new Date().toISOString(),
    });
  }
}

async function handlePaymentSuccess(db, event) {
  const checkoutSession = event.attributes.data;
  const metadata = checkoutSession.attributes.metadata;
  const { bookingId, userId } = metadata;

  if (!bookingId || !userId) {
    console.error(
      "Missing bookingId or userId in payment success webhook metadata"
    );
    throw new Error("Missing required metadata in webhook");
  }

  console.log(
    `Processing payment success for booking: ${bookingId}, user: ${userId}`
  );

  // Get the booking reference
  const bookingRef = db
    .collection("users")
    .doc(userId)
    .collection("preBookings")
    .doc(bookingId);

  const bookingDoc = await bookingRef.get();

  if (!bookingDoc.exists) {
    console.error(`Booking ${bookingId} not found for user ${userId}`);
    throw new Error("Booking not found");
  }

  const bookingData = bookingDoc.data();

  // Prevent double processing
  if (bookingData.paymentStatus === "paid") {
    console.log(`Payment already processed for booking: ${bookingId}`);
    return;
  }

  // Update booking status to paid
  await bookingRef.update({
    status: "paid",
    boardingStatus: "pending",
    paymentStatus: "paid",
    paymongoPaymentId: checkoutSession.id,
    paidAt: new Date(),
    paymentMethod: checkoutSession.attributes.payment_method_used || "unknown",
    paymentCompletedAt: new Date(),
    updatedAt: new Date(),
    webhookProcessedAt: new Date(),
    paymentError: null, // Clear any previous errors
  });

  console.log(`Payment completed successfully for booking: ${bookingId}`);

  // TODO: Add notification logic here if needed
  // await sendPaymentConfirmationNotification(userId, bookingId);
}

async function handlePaymentFailure(db, event) {
  const checkoutSession = event.attributes.data;
  const metadata = checkoutSession.attributes.metadata;
  const { bookingId, userId } = metadata;

  if (!bookingId || !userId) {
    console.error(
      "Missing bookingId or userId in payment failure webhook metadata"
    );
    throw new Error("Missing required metadata in webhook");
  }

  console.log(
    `Processing payment failure for booking: ${bookingId}, user: ${userId}`
  );

  const bookingRef = db
    .collection("users")
    .doc(userId)
    .collection("preBookings")
    .doc(bookingId);

  const bookingDoc = await bookingRef.get();

  if (bookingDoc.exists) {
    await bookingRef.update({
      status: "payment_failed",
      paymentStatus: "failed",
      paymentError:
        checkoutSession.attributes.failure_reason || "Payment failed",
      paymentFailedAt: new Date(),
      updatedAt: new Date(),
      webhookProcessedAt: new Date(),
    });

    console.log(`Payment failure recorded for booking: ${bookingId}`);
  }
}

async function handleCheckoutExpired(db, event) {
  const checkoutSession = event.attributes.data;
  const metadata = checkoutSession.attributes.metadata;
  const { bookingId, userId } = metadata;

  if (!bookingId || !userId) {
    console.error(
      "Missing bookingId or userId in checkout expired webhook metadata"
    );
    return; // Don't throw error for expired sessions
  }

  console.log(
    `Processing checkout expiry for booking: ${bookingId}, user: ${userId}`
  );

  const bookingRef = db
    .collection("users")
    .doc(userId)
    .collection("preBookings")
    .doc(bookingId);

  const bookingDoc = await bookingRef.get();

  if (bookingDoc.exists) {
    const bookingData = bookingDoc.data();

    // Only update if payment hasn't been completed
    if (bookingData.paymentStatus !== "paid") {
      await bookingRef.update({
        status: "payment_expired",
        paymentStatus: "expired",
        paymentError: "Checkout session expired",
        paymentExpiredAt: new Date(),
        updatedAt: new Date(),
        webhookProcessedAt: new Date(),
      });

      console.log(`Checkout expiry recorded for booking: ${bookingId}`);
    }
  }
}
