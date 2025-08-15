// setAdmin.js
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Validation function for required environment variables
function validateEnvVars() {
  const requiredVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    process.exit(1);
  }
}

// Validate environment variables
validateEnvVars();

// Construct service account credentials from environment variables
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

// Initialize Firebase Admin (with error handling)
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID
  });
  console.log('🔥 Firebase Admin initialized successfully');
} catch (error) {
  console.error('❌ Error initializing Firebase Admin:', error);
  process.exit(1);
}

// Admin email - you can make this configurable
const adminEmail = process.env.ADMIN_EMAIL || 'batrascoservices@gmail.com';

// Enhanced function to set admin claims
async function setAdminClaims(email) {
  try {
    console.log(`🔍 Looking up user with email: ${email}`);
    
    // Get user by email
    const user = await admin.auth().getUserByEmail(email);
    console.log(`👤 Found user: ${user.uid}`);
    
    // Check current claims
    const currentClaims = user.customClaims || {};
    console.log('📋 Current claims:', currentClaims);
    
    // Set comprehensive admin claims (compatible with your Firestore rules)
    const adminClaims = {
      admin: true,
      conductor: false, // Explicitly set to false for admins
      role: 'admin',
      permissions: [
        'read_all_users',
        'write_all_users', 
        'manage_buses',
        'manage_routes',
        'manage_conductors',
        'view_all_reservations',
        'manage_system_settings'
      ],
      grantedAt: admin.firestore.Timestamp.now().toDate().toISOString(),
      grantedBy: 'system'
    };
    
    // Set custom claims
    await admin.auth().setCustomUserClaims(user.uid, adminClaims);
    console.log('✅ Admin claims set successfully');
    
    // Create/update admin document in Firestore
    const db = admin.firestore();
    const adminDoc = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || 'Admin User',
      role: 'admin',
      permissions: adminClaims.permissions,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Use merge to avoid overwriting existing data
    await db.collection('Admin').doc(user.uid).set(adminDoc, { merge: true });
    console.log('📄 Admin document created/updated in Firestore');
    
    // Also create user document if it doesn't exist
    const userDoc = {
      uid: user.uid,
      email: user.email,
      fullName: user.displayName || 'Admin User',
      phone: user.phoneNumber || '',
      role: 'admin',
      isAdmin: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('users').doc(user.uid).set(userDoc, { merge: true });
    console.log('👤 User document created/updated in Firestore');
    
    console.log('\n🎉 SUCCESS! Admin setup completed for:', email);
    console.log('📝 Claims set:', JSON.stringify(adminClaims, null, 2));
    
    return { success: true, uid: user.uid, claims: adminClaims };
    
  } catch (error) {
    console.error('❌ Error setting admin claims:', error);
    
    if (error.code === 'auth/user-not-found') {
      console.error(`💡 User with email ${email} not found. Make sure the user is registered first.`);
    } else if (error.code === 'auth/invalid-email') {
      console.error(`💡 Invalid email format: ${email}`);
    }
    
    throw error;
  }
}

// Enhanced function to set conductor claims
async function setConductorClaims(email) {
  try {
    console.log(`🔍 Looking up conductor with email: ${email}`);
    
    const user = await admin.auth().getUserByEmail(email);
    console.log(`👤 Found user: ${user.uid}`);
    
    const conductorClaims = {
      admin: false,
      conductor: true,
      role: 'conductor',
      permissions: [
        'scan_tickets',
        'update_boarding_status',
        'view_route_bookings',
        'manage_trips'
      ],
      grantedAt: admin.firestore.Timestamp.now().toDate().toISOString(),
      grantedBy: 'admin'
    };
    
    await admin.auth().setCustomUserClaims(user.uid, conductorClaims);
    console.log('✅ Conductor claims set successfully');
    
    // Create/update conductor document
    const db = admin.firestore();
    const conductorDoc = {
      uid: user.uid,
      email: user.email,
      fullName: user.displayName || 'Conductor',
      phone: user.phoneNumber || '',
      licenseNumber: '', // To be filled later
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('conductors').doc(user.uid).set(conductorDoc, { merge: true });
    console.log('📄 Conductor document created/updated in Firestore');
    
    console.log('\n🎉 SUCCESS! Conductor setup completed for:', email);
    return { success: true, uid: user.uid, claims: conductorClaims };
    
  } catch (error) {
    console.error('❌ Error setting conductor claims:', error);
    throw error;
  }
}

// Function to revoke admin/conductor claims
async function revokeSpecialClaims(email) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    
    const basicClaims = {
      admin: false,
      conductor: false,
      role: 'user',
      permissions: [],
      revokedAt: admin.firestore.Timestamp.now().toDate().toISOString()
    };
    
    await admin.auth().setCustomUserClaims(user.uid, basicClaims);
    console.log('✅ Special claims revoked successfully');
    
    return { success: true, uid: user.uid };
  } catch (error) {
    console.error('❌ Error revoking claims:', error);
    throw error;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const email = args[1] || adminEmail;
  
  try {
    switch (command) {
      case 'admin':
        await setAdminClaims(email);
        break;
      case 'conductor':
        await setConductorClaims(email);
        break;
      case 'revoke':
        await revokeSpecialClaims(email);
        break;
      default:
        console.log('🚀 Setting admin claims for default email...');
        await setAdminClaims(adminEmail);
        break;
    }
  } catch (error) {
    console.error('💥 Script failed:', error.message);
    process.exit(1);
  } finally {
    // Cleanup
    try {
      await admin.app().delete();
      console.log('🔥 Firebase Admin app deleted');
    } catch (error) {
      console.error('⚠️ Error deleting admin app:', error);
    }
    process.exit(0);
  }
}

// Usage information
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
📚 Usage:
  node setAdmin.js                           # Set admin claims for default email
  node setAdmin.js admin user@example.com    # Set admin claims for specific email
  node setAdmin.js conductor user@email.com  # Set conductor claims for specific email
  node setAdmin.js revoke user@email.com     # Revoke special claims for specific email

🔧 Environment Variables Required:
  FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, ADMIN_EMAIL (optional)

📝 Examples:
  node setAdmin.js admin batrascoservices@gmail.com
  node setAdmin.js conductor conductor@yourapp.com
  node setAdmin.js revoke someuser@example.com
  `);
  process.exit(0);
}

// Run the main function
main();