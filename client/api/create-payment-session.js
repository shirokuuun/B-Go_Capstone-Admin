import { initializeFirebase } from "../lib/firebase.js";
import { createPayMongoCheckout } from "../lib/paymongo.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const db = initializeFirebase();
    const { sessionId, paymentMethod } = req.body;

    const sessionDoc = await db
      .collection("payment_sessions")
      .doc(sessionId)
      .get();

    if (!sessionDoc.exists) {
      return res
        .status(404)
        .json({ success: false, error: "Session not found" });
    }

    const bookingData = sessionDoc.data();

    let paymentMethods = ["card"];
    if (paymentMethod === "gcash") paymentMethods = ["gcash"];
    if (paymentMethod === "paymaya") paymentMethods = ["paymaya"];

    const checkoutData = {
      data: {
        attributes: {
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          success_url: `${
            process.env.VERCEL_URL || "http://localhost:5173"
          }/payment-success/${sessionId}`,
          cancel_url: `${
            process.env.VERCEL_URL || "http://localhost:5173"
          }/payment-cancelled/${sessionId}`,
          payment_method_types: paymentMethods,
          line_items: [
            {
              currency: "PHP",
              amount: Math.round(bookingData.totalAmount * 100),
              description: `Pre-booking: ${bookingData.route}`,
              name: "B-GO Bus Pre-booking",
              quantity: 1,
            },
          ],
          metadata: {
            sessionId: sessionId,
            userId: bookingData.userId,
            route: bookingData.route,
          },
        },
      },
    };

    const paymongoData = await createPayMongoCheckout(checkoutData);

    if (paymongoData.data) {
      await db.collection("payment_sessions").doc(sessionId).update({
        paymongoCheckoutId: paymongoData.data.id,
        paymongoCheckoutUrl: paymongoData.data.attributes.checkout_url,
        updatedAt: new Date(),
      });

      res.status(200).json({
        success: true,
        checkoutUrl: paymongoData.data.attributes.checkout_url,
        checkoutId: paymongoData.data.id,
      });
    } else {
      throw new Error("Failed to create PayMongo checkout session");
    }
  } catch (error) {
    console.error("PayMongo checkout error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}
