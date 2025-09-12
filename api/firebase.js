import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const initializeFirebase = () => {
  if (getApps().length === 0) {
    // Use API-specific environment variables if available, otherwise fall back to general ones
    const projectId =
      process.env.FIREBASE_API_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    const clientEmail =
      process.env.FIREBASE_API_CLIENT_EMAIL ||
      process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey =
      process.env.FIREBASE_API_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY;

    // Check if all required environment variables are present
    const requiredEnvVars = {
      FIREBASE_PROJECT_ID: projectId,
      FIREBASE_CLIENT_EMAIL: clientEmail,
      FIREBASE_PRIVATE_KEY: privateKey,
    };

    const missingVars = Object.entries(requiredEnvVars)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingVars.length > 0) {
      console.error("Missing Firebase environment variables:", missingVars);
      console.error("Available env vars:", {
        FIREBASE_PROJECT_ID: !!projectId,
        FIREBASE_CLIENT_EMAIL: !!clientEmail,
        FIREBASE_PRIVATE_KEY: !!privateKey,
        FIREBASE_API_PROJECT_ID: !!process.env.FIREBASE_API_PROJECT_ID,
        FIREBASE_API_CLIENT_EMAIL: !!process.env.FIREBASE_API_CLIENT_EMAIL,
        FIREBASE_API_PRIVATE_KEY: !!process.env.FIREBASE_API_PRIVATE_KEY,
      });
      throw new Error(
        `Missing required Firebase environment variables: ${missingVars.join(
          ", "
        )}. ` + `Please check your .env file or environment configuration.`
      );
    }

    const formattedPrivateKey = privateKey.replace(/\\n/g, "\n");

    console.log(
      "Initializing Firebase with project ID:",
      projectId,
      "using service account:",
      clientEmail
    );

    initializeApp({
      credential: cert({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: formattedPrivateKey,
      }),
    });
  }

  return getFirestore();
};
