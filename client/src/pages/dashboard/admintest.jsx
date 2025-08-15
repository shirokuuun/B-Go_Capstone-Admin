// AdminTest.jsx - Add this to your React app to test admin access
import React, { useState, useEffect } from 'react';
import { auth, db } from '/src/firebase/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const AdminTest = () => {
  const [user, setUser] = useState(null);
  const [adminDoc, setAdminDoc] = useState(null);
  const [testResults, setTestResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        console.log('Current user UID:', currentUser.uid);
        console.log('Current user email:', currentUser.email);
      }
    });

    return () => unsubscribe();
  }, []);

  const runTests = async () => {
    if (!user) {
      addTestResult('❌ No user signed in', 'error');
      return;
    }

    setLoading(true);
    setTestResults([]);

    try {
      // Test 1: Check if Admin document exists
      addTestResult('🔍 Checking Admin document...', 'info');
      
      const adminDocRef = doc(db, 'Admin', user.uid);
      const adminDocSnap = await getDoc(adminDocRef);
      
      if (adminDocSnap.exists()) {
        const adminData = adminDocSnap.data();
        setAdminDoc(adminData);
        addTestResult(`✅ Admin document found: ${adminData.email} (${adminData.role})`, 'success');
        
        // Check if email matches
        if (adminData.email === 'batrascoservices@gmail.com') {
          addTestResult('✅ Email matches batrascoservices@gmail.com', 'success');
        } else {
          addTestResult(`❌ Email mismatch: ${adminData.email}`, 'error');
        }
        
        // Check if role is admin
        if (adminData.role === 'admin') {
          addTestResult('✅ Role is admin', 'success');
        } else {
          addTestResult(`❌ Role is not admin: ${adminData.role}`, 'error');
        }
      } else {
        addTestResult('❌ Admin document not found', 'error');
        return;
      }

      // Test 2: Try to read conductors collection
      addTestResult('🔍 Testing conductor access...', 'info');
      
      try {
        const conductorsRef = collection(db, 'conductors');
        const conductorsSnap = await getDocs(conductorsRef);
        addTestResult(`✅ Can read conductors collection (${conductorsSnap.size} documents)`, 'success');
      } catch (error) {
        addTestResult(`❌ Cannot read conductors: ${error.message}`, 'error');
      }

      // Test 3: Try to read a specific conductor's trips
      addTestResult('🔍 Testing conductor trips access...', 'info');
      
      try {
        // Get first conductor for testing
        const conductorsRef = collection(db, 'conductors');
        const conductorsSnap = await getDocs(conductorsRef);
        
        if (!conductorsSnap.empty) {
          const firstConductor = conductorsSnap.docs[0];
          const tripsRef = collection(db, 'conductors', firstConductor.id, 'trips');
          const tripsSnap = await getDocs(tripsRef);
          addTestResult(`✅ Can read conductor trips (${tripsSnap.size} trip dates)`, 'success');
        } else {
          addTestResult('ℹ️ No conductors found to test trips access', 'info');
        }
      } catch (error) {
        addTestResult(`❌ Cannot read conductor trips: ${error.message}`, 'error');
      }

      // Test 4: Try to read other admin-only collections
      addTestResult('🔍 Testing other admin collections...', 'info');
      
      try {
        const usersRef = collection(db, 'users');
        const usersSnap = await getDocs(usersRef);
        addTestResult(`✅ Can read users collection (${usersSnap.size} documents)`, 'success');
      } catch (error) {
        addTestResult(`❌ Cannot read users: ${error.message}`, 'error');
      }

    } catch (error) {
      addTestResult(`❌ Test failed: ${error.message}`, 'error');
      console.error('Test error:', error);
    } finally {
      setLoading(false);
    }
  };

  const addTestResult = (message, type) => {
    setTestResults(prev => [...prev, { message, type, timestamp: new Date().toLocaleTimeString() }]);
  };

  const getResultColor = (type) => {
    switch (type) {
      case 'success': return '#4CAF50';
      case 'error': return '#f44336';
      case 'info': return '#2196F3';
      default: return '#666';
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>🔧 Admin Access Test</h2>
      
      {/* User Info */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
        <h3>Current User</h3>
        {user ? (
          <div>
            <p><strong>UID:</strong> {user.uid}</p>
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>Display Name:</strong> {user.displayName || 'Not set'}</p>
          </div>
        ) : (
          <p style={{ color: '#f44336' }}>❌ Not signed in</p>
        )}
      </div>

      {/* Admin Document Info */}
      {adminDoc && (
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#e8f5e8', borderRadius: '8px' }}>
          <h3>Admin Document</h3>
          <p><strong>Email:</strong> {adminDoc.email}</p>
          <p><strong>Name:</strong> {adminDoc.name}</p>
          <p><strong>Role:</strong> {adminDoc.role}</p>
          <p><strong>UID:</strong> {adminDoc.uid}</p>
        </div>
      )}

      {/* Test Button */}
      <button 
        onClick={runTests}
        disabled={!user || loading}
        style={{
          padding: '12px 24px',
          backgroundColor: user ? '#4CAF50' : '#ccc',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: user ? 'pointer' : 'not-allowed',
          fontSize: '16px',
          marginBottom: '20px'
        }}
      >
        {loading ? '🔄 Running Tests...' : '🧪 Run Admin Tests'}
      </button>

      {/* Test Results */}
      {testResults.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3>Test Results</h3>
          <div style={{ backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '8px', fontFamily: 'monospace' }}>
            {testResults.map((result, index) => (
              <div key={index} style={{ 
                color: getResultColor(result.type), 
                marginBottom: '8px',
                fontSize: '14px'
              }}>
                <span style={{ color: '#666', fontSize: '12px' }}>[{result.timestamp}]</span> {result.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '8px' }}>
        <h4>📋 Instructions</h4>
        <ol>
          <li>Make sure you're signed in with <code>batrascoservices@gmail.com</code></li>
          <li>Click "Run Admin Tests" to verify your admin access</li>
          <li>All tests should show ✅ green checkmarks</li>
          <li>If you see ❌ red errors, check your Firestore rules and Admin document</li>
        </ol>
      </div>
    </div>
  );
};

export default AdminTest;