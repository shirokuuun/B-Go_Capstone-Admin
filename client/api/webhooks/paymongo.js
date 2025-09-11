import { initializeFirebase } from "../lib/firebase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  try {
    const db = initializeFirebase();
    const event = req.body.data;

    console.log("Webhook received:", JSON.stringify(event, null, 2));

    if (event.attributes.type === "checkout_session.payment.paid") {
      const metadata = event.attributes.data.attributes.metadata;
      const { bookingId, userId } = metadata;

      if (!bookingId || !userId) {
        console.error("Missing bookingId or userId in webhook metadata");
        return res.status(400).json({ error: "Missing required metadata" });
      }

      console.log(
        `Processing payment completion for booking: ${bookingId}, user: ${userId}`
      );

      // Update the booking in the user's preBookings collection
      const bookingRef = db
        .collection("users")
        .doc(userId)
        .collection("preBookings")
        .doc(bookingId);

      const bookingDoc = await bookingRef.get();

      if (!bookingDoc.exists) {
        console.error(`Booking ${bookingId} not found for user ${userId}`);
        return res.status(404).json({ error: "Booking not found" });
      }

      // Update booking status to paid
      await bookingRef.update({
        status: "paid",
        boardingStatus: "pending",
        paymentStatus: "paid",
        paymongoPaymentId: event.attributes.data.id,
        paidAt: new Date(),
        paymentMethod: event.attributes.data.attributes.payment_method_used,
        paymentCompletedAt: new Date(),
        updatedAt: new Date(),
        webhookProcessedAt: new Date(),
      });

      console.log(`Payment completed successfully for booking: ${bookingId}`);

      // Optionally: Send notification to user (implement if needed)
      // await sendPaymentConfirmationNotification(userId, bookingId);
    } else if (event.attributes.type === "checkout_session.payment.failed") {
      const metadata = event.attributes.data.attributes.metadata;
      const { bookingId, userId } = metadata;

      if (bookingId && userId) {
        // Update booking status to failed
        await db
          .collection("users")
          .doc(userId)
          .collection("preBookings")
          .doc(bookingId)
          .update({
            status: "payment_failed",
            paymentStatus: "failed",
            paymentError:
              event.attributes.data.attributes.failure_reason ||
              "Payment failed",
            paymentFailedAt: new Date(),
            updatedAt: new Date(),
            webhookProcessedAt: new Date(),
          });

        console.log(`Payment failed for booking: ${bookingId}`);
      }
    } else {
      console.log(`Unhandled webhook event type: ${event.attributes.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: error.message });
  }
}
