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
    const { sessionId } = req.query;

    const doc = await db.collection("payment_sessions").doc(sessionId).get();

    if (!doc.exists) {
      return res
        .status(404)
        .json({ success: false, error: "Booking not found" });
    }

    const booking = doc.data();

    // Format booking data for frontend
    const formattedBooking = {
      passengerInfo: {
        name: `${booking.quantity} Passenger(s)`,
        email: "N/A",
        phone: "N/A",
      },
      tripDetails: {
        origin: booking.fromPlace?.name || "N/A",
        destination: booking.toPlace?.name || "N/A",
        departureDate: booking.createdAt?.toDate?.() || new Date(),
        departureTime: "TBD",
        seats: booking.fareTypes || [],
      },
      billingInfo: {
        numberOfPassengers: booking.quantity,
        farePerPassenger: booking.totalAmount / booking.quantity,
        discounts: [],
        amount: booking.totalAmount,
      },
      status: booking.status,
    };

    res.status(200).json({ success: true, booking: formattedBooking });
  } catch (error) {
    console.error("Error fetching booking:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}
