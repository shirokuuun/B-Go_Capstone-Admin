# Conductor Partial Deletion System - Flutter Implementation Guide

## Overview
This document explains our **partial deletion system** for conductors. When an admin deletes a conductor from the dashboard, the conductor **cannot login to the app** even though their email still exists in Firebase Authentication and Firestore. This is achieved through a clever **status-based authentication system**.

## How Partial Deletion Works

### Admin Dashboard Deletion Process (conductor.js:1391-1480)
```javascript
// When admin deletes conductor:
async deleteConductor(conductorId) {
  // 1. Generate unique deleted email
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const deletedEmail = `deleted_${timestamp}_${randomId}@deleted.invalid`;

  // 2. Update conductor document (pseudo-delete)
  const deletedConductorData = {
    ...conductorData,
    email: deletedEmail,              // ← KEY: Change email to deleted format
    name: `[DELETED] ${conductorData.name}`,
    status: "deleted",                // ← KEY: Mark as deleted
    
    // Store original data for potential recovery
    originalEmail: conductorData.email,
    originalName: conductorData.name,
    
    deletedAt: serverTimestamp(),
    deletedBy: auth.currentUser?.uid,
    isOnline: false
  };
  
  await updateDoc(conductorRef, deletedConductorData);
  // Note: Firebase Auth account still exists!
}
```

### Authentication Logic (conductor.js:51-94)
```javascript
// All conductor queries exclude deleted ones:
async getAllConductors() {
  // Skip deleted conductors (handles missing status field)
  if (conductorData.status === 'deleted') {
    continue; // ← Deleted conductors are invisible
  }
}
```

## Flutter Implementation Guide

### AI Prompt for Your Teammate

---

**🤖 AI PROMPT FOR FLUTTER CONDUCTOR LOGIN VALIDATION:**

```
I need to implement conductor login validation in Flutter/Dart that matches our admin dashboard's partial deletion system. Here's how our system works:

CONTEXT:
- When admin deletes a conductor, we DON'T delete Firebase Auth or Firestore document
- Instead we change the conductor's status to "deleted" in Firestore
- The Firebase Auth email remains unchanged, but conductor document is marked as deleted
- Deleted conductors should NOT be able to login to the app

CURRENT ADMIN SYSTEM:
1. Conductor document path: `/conductors/{documentId}` where documentId = email.split('@')[0].replace(/\./g, '_')
2. When deleted: `status` field = "deleted", `email` field changed to `deleted_{timestamp}_{randomId}@deleted.invalid`
3. Original email stored in `originalEmail` field
4. Firebase Auth account remains active with original email

REQUIREMENTS FOR FLUTTER LOGIN:
1. User enters email + password
2. Firebase Auth will succeed (email still exists in Auth)
3. BUT we must check Firestore conductor document status
4. If status == "deleted", reject login with error message
5. Only allow login if status != "deleted" (or missing status field)

Please provide Flutter/Dart code for:
1. Login function that validates against Firestore after Firebase Auth
2. Error handling for deleted conductor accounts
3. Proper document ID extraction from email (replace dots with underscores)
4. Clean error messages for users

EXAMPLE FLOW:
- User: conductor@example.com
- Document ID: conductor_example_com  
- Firebase Auth: ✅ Success
- Firestore check: status == "deleted" → ❌ Reject login
- Show error: "Account has been deactivated. Contact administrator."

Generate the complete login validation code.
```

---

## Technical Implementation Details

### Document ID Generation
```dart
// Dart equivalent of JavaScript email processing
String generateDocumentId(String email) {
  return email.split('@')[0].replaceAll('.', '_');
}
```

### Expected Firestore Structure
```json
{
  "conductors": {
    "conductor_example_com": {
      "email": "deleted_1704067200000_abc123@deleted.invalid",  // Changed
      "name": "[DELETED] John Doe",
      "status": "deleted",                                      // Key field
      "originalEmail": "conductor@example.com",                 // Original
      "originalName": "John Doe",
      "deletedAt": "timestamp",
      "deletedBy": "admin_uid",
      "uid": "firebase_auth_uid"  // Still linked to Firebase Auth
    }
  }
}
```

### Login Validation Logic (Pseudo-code)
```dart
Future<bool> validateConductorLogin(String email, String password) async {
  try {
    // Step 1: Firebase Auth login (will succeed for deleted accounts)
    UserCredential credential = await FirebaseAuth.instance
        .signInWithEmailAndPassword(email: email, password: password);
    
    // Step 2: Check Firestore conductor document
    String docId = generateDocumentId(email);
    DocumentSnapshot doc = await FirebaseFirestore.instance
        .collection('conductors')
        .doc(docId)
        .get();
    
    if (!doc.exists) {
      // No conductor document found
      await FirebaseAuth.instance.signOut();
      throw Exception('Conductor account not found');
    }
    
    Map<String, dynamic> data = doc.data();
    
    // Step 3: Check if conductor is deleted
    if (data['status'] == 'deleted') {
      // Account is deleted - sign out and reject
      await FirebaseAuth.instance.signOut();
      throw Exception('Account has been deactivated. Contact administrator.');
    }
    
    // Step 4: Login successful
    return true;
    
  } catch (e) {
    // Handle all errors
    return false;
  }
}
```

## Why This System Works

1. **Firebase Auth remains intact** - No issues with existing authentication
2. **Firestore controls access** - Document status determines login permission  
3. **Data preservation** - All conductor data preserved for potential recovery
4. **Clean separation** - Admin dashboard and app use same validation logic
5. **Flexible recovery** - Can reactivate by changing status back to "active"

## Error Messages for Users
- ✅ **Success**: Normal login flow continues
- ❌ **Deleted Account**: "Account has been deactivated. Contact administrator."
- ❌ **Not Found**: "Conductor account not found. Contact administrator."
- ❌ **Network Error**: "Connection error. Please try again."

## Testing Scenarios

1. **Active Conductor**: `status: "active"` or no status field → Allow login
2. **Deleted Conductor**: `status: "deleted"` → Reject login  
3. **Missing Document**: No Firestore doc → Reject login
4. **Firebase Auth Fails**: Wrong password → Standard Firebase error

---

**💡 Key Point**: The Flutter app must **ALWAYS check Firestore after Firebase Auth success** to validate conductor status. Never rely solely on Firebase Authentication for conductor login validation.