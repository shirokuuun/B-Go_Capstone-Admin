const express = require("express");
const crypto = require("crypto");
require('dotenv').config();

const app = express();


// Body parsing middleware
app.use(express.json());

// Raw body parsing for webhook signature verification
//app.use('/api/webhook', express.raw({ type: 'application/json' }));

// PayMongo Configuration
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_PUBLIC_KEY = process.env.PAYMONGO_PUBLIC_KEY;
const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// In-memory storage for bookings (replace with your database later)
const bookings = new Map();

// PayMongo API Helper
const paymongoAPI = {
  async createCheckoutSession(data) {
    const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`
      },
      body: JSON.stringify({ data })
    });
    return await response.json();
  }
};

// Helper function to get payment method types
function getPaymentMethodTypes(paymentMethod) {
  const methodMap = {
    'card': ['card'],
    'gcash': ['gcash'],
    'paymaya': ['paymaya'],
    'all': ['card', 'gcash', 'paymaya']
  };
  return methodMap[paymentMethod] || ['card', 'gcash', 'paymongo'];
}

// Verify webhook signature
// Fixed webhook signature verification
function verifyWebhookSignature(payload, signature, webhookSecret) {
  if (!signature || !webhookSecret) return true;
  
  // Convert payload to string if it's an object
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  
  const computedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payloadString, 'utf8')
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(computedSignature, 'hex')
  );
}

// ==================== YOUR EXISTING ROUTES ====================

// Your existing API route (keeping it exactly as you had it)
app.get("/api", (req, res) => {
  res.json({ fruits: ["Apple", "strawberry", "mango"] });
});


// ==================== PAYMONGO API ROUTES ====================

// 1. CREATE BOOKING WITH PAYMENT SESSION
app.post('/api/payment/create-booking', async (req, res) => {
  try {
    const {
      passengerInfo,
      tripDetails,
      amount,
      numberOfPassengers,
      discounts
    } = req.body;

    // Validate required fields
    if (!passengerInfo || !tripDetails || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required booking information'
      });
    }

    // Generate payment session ID
    const sessionId = crypto.randomUUID();

    // Prepare booking data
    const bookingData = {
      sessionId,
      passengerInfo: {
        name: passengerInfo.name,
        email: passengerInfo.email,
        phone: passengerInfo.phone,
        userId: passengerInfo.userId || 'guest'
      },
      tripDetails: {
        origin: tripDetails.origin,
        destination: tripDetails.destination,
        departureTime: tripDetails.departureTime,
        departureDate: tripDetails.departureDate,
        routeId: tripDetails.routeId || 'default-route',
        busId: tripDetails.busId || 'default-bus',
        seats: tripDetails.seats || ['A1']
      },
      billingInfo: {
        amount: amount,
        numberOfPassengers: numberOfPassengers || 1,
        farePerPassenger: amount / (numberOfPassengers || 1),
        discounts: discounts || [],
        currency: 'PHP'
      },
      status: 'Pending Payment',
      createdAt: new Date().toISOString(),
      paymentReference: null
    };

    // Save booking to memory (replace with your database later)
    bookings.set(sessionId, bookingData);

    console.log(`✅ Booking created: ${sessionId}`);

    // Return booking data
    res.json({
      success: true,
      sessionId,
      booking: bookingData,
      paymentPageURL: `http://localhost:5173/payment/${sessionId}`
    });

  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create booking'
    });
  }
});

// 2. GET BOOKING DETAILS (for React frontend)
app.get('/api/payment/booking/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const booking = bookings.get(sessionId);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    res.json({
      success: true,
      booking: booking
    });

  } catch (error) {
    console.error('Error getting booking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get booking'
    });
  }
});

// 3. INITIATE PAYMENT
app.post('/api/payment/initiate-payment', async (req, res) => {
  try {
    const { sessionId, paymentMethod } = req.body;

    if (!sessionId || !paymentMethod) {
      return res.status(400).json({
        success: false,
        error: 'Missing sessionId or paymentMethod'
      });
    }

    // Get booking details
    const booking = bookings.get(sessionId);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    // Check if already paid
    if (booking.status === 'Paid') {
      return res.json({
        success: false,
        error: 'This booking has already been paid'
      });
    }

    console.log(`💳 Processing payment for booking: ${sessionId}`);

    // Create PayMongo checkout session
    const checkoutData = {
      attributes: {
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        description: `B-GO Bus Booking - ${booking.tripDetails.origin} to ${booking.tripDetails.destination}`,
        line_items: [
          {
            currency: 'PHP',
            amount: Math.round(booking.billingInfo.amount * 100), // PayMongo expects amount in centavos
            description: `${booking.billingInfo.numberOfPassengers} passenger(s) - ${booking.tripDetails.origin} to ${booking.tripDetails.destination}`,
            name: 'Bus Ticket',
            quantity: 1
          }
        ],
        payment_method_types: getPaymentMethodTypes(paymentMethod),
        success_url: `http://localhost:5173/payment-success/${sessionId}`,
        cancel_url: `http://localhost:5173/payment/${sessionId}?cancelled=true`,
        metadata: {
          booking_id: sessionId,
          passenger_name: booking.passengerInfo.name,
          route: `${booking.tripDetails.origin}-${booking.tripDetails.destination}`
        }
      }
    };

    const checkoutSession = await paymongoAPI.createCheckoutSession(checkoutData);

    if (checkoutSession.data) {
      // Update booking with PayMongo session info
      booking.paymongoSessionId = checkoutSession.data.id;
      booking.status = 'Processing Payment';
      booking.updatedAt = new Date().toISOString();
      bookings.set(sessionId, booking);

      console.log(`🔗 PayMongo checkout URL created for ${sessionId}`);

      res.json({
        success: true,
        checkoutUrl: checkoutSession.data.attributes.checkout_url,
        sessionId: checkoutSession.data.id
      });
    } else {
      console.error('PayMongo checkout creation failed:', checkoutSession);
      throw new Error('Failed to create PayMongo session');
    }

  } catch (error) {
    console.error('Error initiating payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate payment: ' + error.message
    });
  }
});

// 4. GET PAYMENT STATUS (for polling from React)
app.get('/api/payment/status/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const booking = bookings.get(sessionId);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    res.json({
      success: true,
      status: booking.status,
      paymentReference: booking.paymentReference,
      booking: booking
    });

  } catch (error) {
    console.error('Error getting payment status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payment status'
    });
  }
});

// 5. WEBHOOK HANDLER
// 5. WEBHOOK HANDLER (Simplified - No signature verification)
// 5. WEBHOOK HANDLER (Fixed event type detection)
app.post('/api/webhook/paymongo-webhook', express.json(), async (req, res) => {
  try {
    console.log('🎯 WEBHOOK RECEIVED!');
    console.log('📄 Full webhook body:', JSON.stringify(req.body, null, 2));
    
    const event = req.body;
    
    // Fix: PayMongo webhook structure can vary, let's handle both formats
    const eventType = event.data?.attributes?.type || event.type;
    const eventData = event.data?.attributes?.data || event.data;
    
    console.log('📡 PayMongo Webhook Event Type:', eventType);

    // Handle different webhook events
    switch (eventType) {
      case 'checkout_session.payment.paid':
      case 'payment.paid':
        console.log('💰 Processing payment paid event...');
        await handlePaymentPaid(eventData);
        break;
        
      case 'checkout_session.payment.failed':
      case 'payment.failed':
        console.log('❌ Processing payment failed event...');
        await handlePaymentFailed(eventData);
        break;
        
      default:
        console.log('❓ Unhandled webhook event:', eventType);
        console.log('📄 Event data structure:', JSON.stringify(event, null, 2));
    }

    console.log('✅ Webhook processed successfully');
    res.status(200).json({ received: true });

  } catch (error) {
    console.error('❌ Webhook processing error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Handle successful payment
async function handlePaymentPaid(eventData) {
  try {
    console.log('🔍 Processing payment paid with data:', JSON.stringify(eventData, null, 2));
    
    // Try multiple ways to extract the booking ID from metadata
    let sessionId = null;
    
    if (eventData?.attributes?.metadata?.booking_id) {
      sessionId = eventData.attributes.metadata.booking_id;
    } else if (eventData?.metadata?.booking_id) {
      sessionId = eventData.metadata.booking_id;
    } else if (eventData?.attributes?.checkout_session?.metadata?.booking_id) {
      sessionId = eventData.attributes.checkout_session.metadata.booking_id;
    }
    
    console.log('🔑 Extracted sessionId:', sessionId);
    
    if (!sessionId) {
      console.error('❌ No booking_id found in webhook metadata');
      console.log('Available metadata:', eventData?.attributes?.metadata || eventData?.metadata);
      return;
    }

    const booking = bookings.get(sessionId);
    if (!booking) {
      console.error(`❌ Booking ${sessionId} not found in memory`);
      console.log('Available bookings:', Array.from(bookings.keys()));
      return;
    }

    console.log(`✅ Found booking ${sessionId}, current status: ${booking.status}`);

    // Update booking status to Paid
    booking.status = 'Paid';
    booking.paymentReference = eventData?.id || eventData?.attributes?.id || 'PAID_' + Date.now();
    booking.paymentCompletedAt = new Date().toISOString();
    booking.updatedAt = new Date().toISOString();
    
    // Add webhook event info for debugging
    booking.webhookEventReceived = {
      eventType: eventData?.type || 'payment.paid',
      receivedAt: new Date().toISOString(),
      paymentId: eventData?.id || eventData?.attributes?.id
    };
    
    bookings.set(sessionId, booking);

    console.log(`🎉 Booking ${sessionId} successfully marked as PAID!`);
    console.log('Updated booking status:', booking.status);

  } catch (error) {
    console.error('❌ Error handling payment success:', error);
    console.error('Error stack:', error.stack);
  }
}

// Handle failed payment
async function handlePaymentFailed(eventData) {
  try {
    const sessionId = eventData.attributes.metadata?.booking_id;
    
    if (!sessionId) {
      console.error('❌ No booking_id in webhook metadata');
      return;
    }

    console.log(`❌ Processing payment failure for booking: ${sessionId}`);

    const booking = bookings.get(sessionId);
    if (booking) {
      booking.status = 'Payment Failed';
      booking.paymentFailedAt = new Date().toISOString();
      booking.updatedAt = new Date().toISOString();
      bookings.set(sessionId, booking);
      console.log(`💔 Booking ${sessionId} marked as payment failed`);
    }

  } catch (error) {
    console.error('❌ Error handling payment failure:', error);
  }
}

// 6. DEBUG ROUTE - View all bookings (for testing)
app.get('/api/payment/debug/bookings', (req, res) => {
  const allBookings = Array.from(bookings.entries()).map(([id, booking]) => ({
    sessionId: id,
    ...booking
  }));

  res.json({
    success: true,
    count: allBookings.length,
    bookings: allBookings
  });
});

// ==================== SERVER START ====================

app.listen(3000, () => {
  console.log("🚀 B-GO Server is running on port 3000");
  
  // Check PayMongo configuration
  if (PAYMONGO_SECRET_KEY) {
    console.log("💳 PayMongo integration ready!");
    console.log(`📡 Webhook URL: ${BASE_URL}/api/webhook/paymongo-webhook`);
  } else {
    console.log("⚠️  PayMongo not configured. Add PAYMONGO_SECRET_KEY to .env file");
  }
  
  console.log("🔗 Frontend should run on: http://localhost:5173");
  console.log("🧪 Test payments at: http://localhost:5173/test-payment");
});

module.exports = app;