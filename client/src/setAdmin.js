// setAdmin.js
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// For ES Modules: get __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the service account JSON
const serviceAccountPath = path.join(__dirname, 'it-capstone-6fe19-firebase-adminsdk-fbsvc-5f34d322d7.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const email = 'batrascoservices@gmail.com';

admin.auth().getUserByEmail(email)
  .then(user => admin.auth().setCustomUserClaims(user.uid, { admin: true }))
  .then(() => {
    console.log(`✅ Custom claim 'admin: true' set for ${email}`);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error setting admin claim:', error);
    process.exit(1);
  });
