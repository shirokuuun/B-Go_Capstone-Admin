// createAdminDoc.mjs
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID
});

async function createAdminDocument() {
  try {
    // Get user by email first, create if doesn't exist
    let user;
    try {
      user = await admin.auth().getUserByEmail('batrascoservices@gmail.com');
      console.log('Found existing user:', user.uid);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        console.log('User not found, creating new user...');
        user = await admin.auth().createUser({
          email: 'batrascoservices@gmail.com',
          password: 'TempAdmin123!', // Change this after first login
          displayName: 'Neo'
        });
        console.log('✅ New user created:', user.uid);
      } else {
        throw error;
      }
    }
    
    // Create Admin document with correct UID (this is all you need!)
    const db = admin.firestore();
    const adminDoc = {
      email: 'batrascoservices@gmail.com',
      name: 'Neo',
      role: 'admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      uid: user.uid
    };
    
    await db.collection('Admin').doc(user.uid).set(adminDoc);
    console.log('✅ Admin document created successfully!');
    console.log('Document ID (UID):', user.uid);
    console.log('🎉 You now have admin access through Firestore rules!');
    
    return { success: true, uid: user.uid };
    
  } catch (error) {
    console.error('❌ Error creating admin document:', error);
    throw error;
  } finally {
    await admin.app().delete();
  }
}

createAdminDocument();