// simpleSuperAdmin.mjs - Firestore only approach
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

async function createSuperAdminFirestoreOnly() {
  try {
    console.log('🔥 Creating SUPERADMIN document in Firestore only...');
    
    // We'll use a known UID for batrascoservices@gmail.com
    // You can get this from Firebase Auth console or by logging in once
    const superAdminEmail = 'batrascoservices@gmail.com';
    
    // First, try to find the user by email to get their UID
    let userUID;
    try {
      const user = await admin.auth().getUserByEmail(superAdminEmail);
      userUID = user.uid;
      console.log('✅ Found existing user UID:', userUID);
    } catch (error) {
      console.log('❌ Could not find user by email. Creating user first...');
      const newUser = await admin.auth().createUser({
        email: superAdminEmail,
        password: 'TempSuperAdmin123!',
        displayName: 'Neo - Super Admin'
      });
      userUID = newUser.uid;
      console.log('✅ Created new user with UID:', userUID);
    }

    // Create SUPERADMIN document in Firestore
    const db = admin.firestore();
    const superAdminDoc = {
      email: superAdminEmail,
      name: 'Neo',
      role: 'superadmin', // This is the key change
      isSuperAdmin: true,
      permissions: [
        'read_all_users',
        'write_all_users', 
        'delete_all_users',
        'manage_buses',
        'manage_routes',
        'manage_conductors',
        'delete_conductors',
        'view_all_reservations',
        'delete_reservations',
        'manage_system_settings',
        'manage_admins',
        'delete_any_data',
        'system_override'
      ],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      uid: userUID
    };

    await db.collection('Admin').doc(userUID).set(superAdminDoc, { merge: true });
    console.log('✅ SUPERADMIN document created in Firestore!');

    // Also create/update user document
    const userDoc = {
      uid: userUID,
      email: superAdminEmail,
      fullName: 'Neo - Super Admin',
      phone: '',
      role: 'superadmin',
      isAdmin: true,
      isSuperAdmin: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('users').doc(userUID).set(userDoc, { merge: true });
    console.log('✅ SUPERADMIN user document created!');
    
    console.log('\n🎉 SUCCESS! SUPERADMIN setup completed!');
    console.log('📧 Email:', superAdminEmail);
    console.log('🆔 UID:', userUID);
    console.log('🚀 Role: superadmin');
    console.log('🔑 Can delete: YES');
    
    console.log('\n📝 Next steps:');
    console.log('1. Update your Firestore rules');
    console.log('2. Sign in with batrascoservices@gmail.com');
    console.log('3. Test admin access');

    return { success: true, uid: userUID, email: superAdminEmail };
    
  } catch (error) {
    console.error('❌ Error creating superadmin:', error);
    throw error;
  } finally {
    await admin.app().delete();
  }
}

// Function to create regular admin
async function createRegularAdmin(email, name = 'Admin User') {
  try {
    console.log(`🔧 Creating regular admin for: ${email}`);
    
    let userUID;
    try {
      const user = await admin.auth().getUserByEmail(email);
      userUID = user.uid;
      console.log('✅ Found existing user UID:', userUID);
    } catch (error) {
      console.log('❌ User not found. Creating new user...');
      const newUser = await admin.auth().createUser({
        email: email,
        password: 'TempAdmin123!',
        displayName: name
      });
      userUID = newUser.uid;
      console.log('✅ Created new user with UID:', userUID);
    }

    // Create regular ADMIN document (NO delete permissions)
    const db = admin.firestore();
    const adminDoc = {
      email: email,
      name: name,
      role: 'admin', // Regular admin role
      isSuperAdmin: false,
      permissions: [
        'read_all_users',
        'write_all_users', 
        // NO delete permissions
        'manage_buses',
        'manage_routes',
        'manage_conductors',
        'view_all_reservations',
        'manage_system_settings'
      ],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      uid: userUID
    };

    await db.collection('Admin').doc(userUID).set(adminDoc, { merge: true });
    console.log('✅ Regular ADMIN document created!');

    const userDoc = {
      uid: userUID,
      email: email,
      fullName: name,
      phone: '',
      role: 'admin',
      isAdmin: true,
      isSuperAdmin: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('users').doc(userUID).set(userDoc, { merge: true });
    console.log('✅ Regular admin user document created!');
    
    console.log('\n🎉 Regular admin created!');
    console.log('📧 Email:', email);
    console.log('🆔 UID:', userUID);
    console.log('👤 Role: admin (NO delete permissions)');

    return { success: true, uid: userUID, email: email };
    
  } catch (error) {
    console.error('❌ Error creating regular admin:', error);
    throw error;
  } finally {
    await admin.app().delete();
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const email = args[1];
  const name = args[2];
  
  try {
    if (command === 'admin' && email) {
      await createRegularAdmin(email, name || 'Admin User');
    } else {
      // Default: Create superadmin
      await createSuperAdminFirestoreOnly();
    }
  } catch (error) {
    console.error('💥 Script failed:', error.message);
    process.exit(1);
  }
}

// Usage info
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
📚 Usage:
  node simpleSuperAdmin.mjs                               # Create SUPERADMIN for batrascoservices@gmail.com
  node simpleSuperAdmin.mjs admin user@example.com        # Create regular admin
  node simpleSuperAdmin.mjs admin user@example.com "Name" # Create regular admin with custom name

📝 Examples:
  node simpleSuperAdmin.mjs                              # Creates superadmin
  node simpleSuperAdmin.mjs admin newadmin@company.com   # Creates regular admin

⚠️  IMPORTANT:
  - This creates Firestore documents only (no custom claims)
  - Your Firestore rules will handle the permissions
  - SUPERADMIN gets role: 'superadmin' with delete permissions
  - Regular admins get role: 'admin' with NO delete permissions
  `);
  process.exit(0);
}

main();