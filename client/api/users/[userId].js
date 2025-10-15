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

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow DELETE method
  if (req.method !== 'DELETE') {
    console.log(`Method not allowed: ${req.method}`);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} not allowed. Use DELETE.`
    });
  }

  try {
    // Get userId from URL path parameter
    const { userId } = req.query;
    const { adminInfo } = req.body;

    // Validate required fields
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Check if admin has superadmin role
    if (!adminInfo || adminInfo.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Only super administrators can delete users.'
      });
    }

    const db = admin.firestore();

    // Get user data before deletion
    const userDocRef = db.collection('users').doc(userId);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDocSnap.data();
    const userName = userData.firstName && userData.lastName
      ? `${userData.firstName} ${userData.lastName}`
      : userData.name || userData.displayName || 'Unknown User';

    // Delete user document from Firestore
    await userDocRef.delete();

    res.status(200).json({
      success: true,
      message: 'User profile deleted successfully',
      authDeleted: false,
      deletedUser: {
        id: userId,
        name: userName,
        email: userData.email
      }
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete user: ' + error.message
    });
  }
}
