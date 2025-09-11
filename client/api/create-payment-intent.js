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
    const { amount, currency, metadata } = req.body;

    // Validate required fields
    if (
      !amount ||
      !currency ||
      !metadata ||
      !metadata.bookingId ||
      !metadata.userId
    ) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: amount, currency, or metadata",
      });
    }

    // Get the booking details from Firestore
    const bookingDoc = await db
      .collection("users")
      .doc(metadata.userId)
      .collection("preBookings")
      .doc(metadata.bookingId)
      .get();

    if (!bookingDoc.exists) {
      return res.status(404).json({
        success: false,
        error: "Booking not found",
      });
    }

    const bookingData = bookingDoc.data();

    // Create PayMongo checkout session
    const checkoutData = {
      data: {
        attributes: {
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          success_url: `${
            process.env.VERCEL_URL ||
            "https://b-go-capstone-admin-chi.vercel.app"
          }/payment-success?bookingId=${metadata.bookingId}&userId=${
            metadata.userId
          }`,
          cancel_url: `${
            process.env.VERCEL_URL ||
            "https://b-go-capstone-admin-chi.vercel.app"
          }/payment-cancelled?bookingId=${metadata.bookingId}&userId=${
            metadata.userId
          }`,
          payment_method_types: ["card", "gcash", "paymaya"],
          line_items: [
            {
              currency: currency,
              amount: amount, // Amount is already in centavos from Flutter
              description: `Pre-booking: ${metadata.route} - ${metadata.fromPlace} to ${metadata.toPlace}`,
              name: "B-GO Bus Pre-booking",
              quantity: 1,
            },
          ],
          metadata: {
            bookingId: metadata.bookingId,
            userId: metadata.userId,
            route: metadata.route,
            fromPlace: metadata.fromPlace,
            toPlace: metadata.toPlace,
            quantity: metadata.quantity.toString(),
            fareTypes: metadata.fareTypes,
            source: metadata.source || "flutter_app",
          },
        },
      },
    };

    console.log(
      "Creating PayMongo checkout with data:",
      JSON.stringify(checkoutData, null, 2)
    );

    const paymongoResponse = await createPayMongoCheckout(checkoutData);

    if (paymongoResponse.data) {
      // Update the booking with PayMongo checkout details
      await db
        .collection("users")
        .doc(metadata.userId)
        .collection("preBookings")
        .doc(metadata.bookingId)
        .update({
          paymongoCheckoutId: paymongoResponse.data.id,
          paymongoCheckoutUrl: paymongoResponse.data.attributes.checkout_url,
          status: "payment_initiated",
          paymentInitiatedAt: new Date(),
          updatedAt: new Date(),
        });

      console.log(
        `PayMongo checkout created successfully for booking ${metadata.bookingId}`
      );

      res.status(200).json({
        success: true,
        checkoutUrl: paymongoResponse.data.attributes.checkout_url,
        checkoutId: paymongoResponse.data.id,
        paymentIntentId: paymongoResponse.data.id, // For compatibility
      });
    } else {
      throw new Error("Failed to create PayMongo checkout session");
    }
  } catch (error) {
    console.error("PayMongo checkout creation error:", error);

    // Log more details about the error
    if (error.response) {
      console.error("PayMongo API response:", error.response.data);
    }

    res.status(500).json({
      success: false,
      error: error.message || "Failed to create payment session",
    });
  }
}
