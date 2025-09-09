import { initializeFirebase } from "../lib/firebase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  try {
    const db = initializeFirebase();
    const event = req.body.data;

    if (event.attributes.type === "checkout_session.payment.paid") {
      const metadata = event.attributes.data.attributes.metadata;
      const { sessionId, userId } = metadata;

      const sessionDoc = await db
        .collection("payment_sessions")
        .doc(sessionId)
        .get();
      const bookingData = sessionDoc.data();

      if (bookingData) {
        // Move to confirmed pre-bookings
        await db
          .collection("users")
          .doc(userId)
          .collection("preBookings")
          .add({
            ...bookingData,
            status: "paid",
            boardingStatus: "pending",
            paymentId: event.attributes.data.id,
            paidAt: new Date(),
            paymentMethod: event.attributes.data.attributes.payment_method_used,
          });

        // Clean up payment session
        await db.collection("payment_sessions").doc(sessionId).delete();

        console.log(`Payment completed for session: ${sessionId}`);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(400).json({ error: error.message });
  }
}
