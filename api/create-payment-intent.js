import { initializeFirebase } from "./firebase.js";
import { createPayMongoCheckout } from "./paymongo.js";

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed. Use POST.",
    });
  }

  try {
    const db = initializeFirebase();
    const { amount, currency = "PHP", metadata } = req.body;

    // Validate required fields
    if (!amount || !metadata?.bookingId || !metadata?.userId) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: amount, bookingId, or userId in metadata",
        required: {
          amount: "number (in centavos)",
          currency: "string (default: PHP)",
          metadata: {
            bookingId: "string",
            userId: "string",
            route: "string",
            fromPlace: "string",
            toPlace: "string",
            quantity: "number",
            fareTypes: "string",
          },
        },
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
    console.log(`Creating payment intent for booking: ${metadata.bookingId}`);

    // Create PayMongo checkout session
    const checkoutData = {
      data: {
        attributes: {
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          success_url: `${
            process.env.VERCEL_URL ||
            process.env.VERCEL_BRANCH_URL ||
            "https://b-go-capstone-admin-chi.vercel.app"
          }/payment-success?bookingId=${metadata.bookingId}&userId=${
            metadata.userId
          }`,
          cancel_url: `${
            process.env.VERCEL_URL ||
            process.env.VERCEL_BRANCH_URL ||
            "https://b-go-capstone-admin-chi.vercel.app"
          }/payment-cancelled?bookingId=${metadata.bookingId}&userId=${
            metadata.userId
          }`,
          payment_method_types: ["card", "gcash", "paymaya"],
          line_items: [
            {
              currency: currency.toUpperCase(),
              amount: parseInt(amount),
              description: `Pre-booking: ${metadata.route || "Route"} - ${
                metadata.fromPlace || "Origin"
              } to ${metadata.toPlace || "Destination"}`,
              name: "B-GO Bus Pre-booking",
              quantity: 1,
            },
          ],
          metadata: {
            bookingId: metadata.bookingId,
            userId: metadata.userId,
            route: metadata.route || "",
            fromPlace: metadata.fromPlace || "",
            toPlace: metadata.toPlace || "",
            quantity: (metadata.quantity || 1).toString(),
            fareTypes: metadata.fareTypes || "",
            source: metadata.source || "flutter_app",
            createdAt: new Date().toISOString(),
          },
        },
      },
    };

    console.log("Creating PayMongo checkout with data:", {
      ...checkoutData,
      data: {
        ...checkoutData.data,
        attributes: {
          ...checkoutData.data.attributes,
          // Don't log sensitive URLs in production
          success_url: "[REDACTED]",
          cancel_url: "[REDACTED]",
        },
      },
    });

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

      return res.status(200).json({
        success: true,
        checkoutUrl: paymongoResponse.data.attributes.checkout_url,
        checkoutId: paymongoResponse.data.id,
        paymentIntentId: paymongoResponse.data.id, // For compatibility
      });
    } else {
      throw new Error("Invalid response from PayMongo API");
    }
  } catch (error) {
    console.error("PayMongo checkout creation error:", error);

    // Log more details about the error for debugging
    if (error.response) {
      console.error("PayMongo API response:", {
        status: error.response.status,
        data: error.response.data,
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to create payment session",
      ...(process.env.NODE_ENV === "development" && {
        debug: {
          message: error.message,
          stack: error.stack?.split("\n").slice(0, 5),
        },
      }),
    });
  }
}
