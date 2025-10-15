const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID
  });
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { busNumber, email, name, route, password } = req.body;

    // Validate required fields
    if (!busNumber || !email || !name || !route || !password) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required: busNumber, email, name, route, password'
      });
    }

    // Create Firebase Auth user using Admin SDK
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: name,
    });

    // Extract document ID from email (same logic as frontend)
    const documentId = email.split('@')[0].replace(/\./g, '_');

    // Create conductor document in Firestore using Admin SDK
    const db = admin.firestore();
    const conductorData = {
      busNumber: parseInt(busNumber),
      email: email,
      name: name,
      route: route,
      isOnline: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSeen: null,
      currentLocation: null,
      uid: userRecord.uid,
      totalTrips: 0,
      todayTrips: 0,
      status: 'offline'
    };

    await db.collection('conductors').doc(documentId).set(conductorData);

    res.status(200).json({
      success: true,
      message: 'Conductor created successfully',
      conductorId: documentId,
      uid: userRecord.uid
    });

  } catch (error) {
    console.error('Error creating conductor:', error);

    let errorMessage = 'Failed to create conductor';
    if (error.code === 'auth/email-already-exists') {
      errorMessage = 'Email already exists';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Invalid email format';
    } else if (error.code === 'auth/weak-password') {
      errorMessage = 'Password is too weak';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.message
    });
  }
};
