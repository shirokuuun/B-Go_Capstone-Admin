// AdminTest.jsx - Add this to your React app to test admin access
import React, { useState, useEffect } from 'react';
import { auth, db } from '/src/firebase/firebase';
import { doc, getDoc, collection, getDocs, deleteDoc, addDoc } from 'firebase/firestore';
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
      // Test 1: Check if Admin document exists and get role
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
          addTestResult(`ℹ️ Email: ${adminData.email}`, 'info');
        }
        
        // Check role type
        if (adminData.role === 'superadmin') {
          addTestResult('🚀 Role: SUPERADMIN (can delete anything)', 'success');
        } else if (adminData.role === 'admin') {
          addTestResult('👤 Role: Regular Admin (no delete permissions)', 'info');
        } else {
          addTestResult(`❌ Unexpected role: ${adminData.role}`, 'error');
        }

        // Check isSuperAdmin flag
        if (adminData.isSuperAdmin === true) {
          addTestResult('✅ isSuperAdmin flag: TRUE', 'success');
        } else if (adminData.isSuperAdmin === false) {
          addTestResult('ℹ️ isSuperAdmin flag: FALSE (regular admin)', 'info');
        } else {
          addTestResult('⚠️ isSuperAdmin flag: Not set', 'info');
        }

        // List permissions
        if (adminData.permissions && adminData.permissions.length > 0) {
          const deletePermissions = adminData.permissions.filter(p => p.includes('delete'));
          if (deletePermissions.length > 0) {
            addTestResult(`✅ Delete permissions: ${deletePermissions.join(', ')}`, 'success');
          } else {
            addTestResult('ℹ️ No delete permissions found', 'info');
          }
        }
        
      } else {
        addTestResult('❌ Admin document not found', 'error');
        return;
      }

      // Test 2: Try to read conductors collection
      addTestResult('🔍 Testing conductor read access...', 'info');
      
      try {
        const conductorsRef = collection(db, 'conductors');
        const conductorsSnap = await getDocs(conductorsRef);
        addTestResult(`✅ Can read conductors collection (${conductorsSnap.size} documents)`, 'success');
      } catch (error) {
        addTestResult(`❌ Cannot read conductors: ${error.message}`, 'error');
      }

      // Test 3: Try to read users collection
      addTestResult('🔍 Testing users read access...', 'info');
      
      try {
        const usersRef = collection(db, 'users');
        const usersSnap = await getDocs(usersRef);
        addTestResult(`✅ Can read users collection (${usersSnap.size} documents)`, 'success');
      } catch (error) {
        addTestResult(`❌ Cannot read users: ${error.message}`, 'error');
      }

      // Test 4: Test DELETE permissions (only for superadmin)
      if (adminDoc?.role === 'superadmin' && adminDoc?.isSuperAdmin === true) {
        addTestResult('🧪 Testing SUPERADMIN delete permissions...', 'info');
        
        try {
          // Create a test document first
          const testDocRef = await addDoc(collection(db, 'testCollection'), {
            message: 'Test document for deletion',
            createdAt: new Date(),
            createdBy: user.uid
          });
          
          addTestResult('✅ Created test document for deletion test', 'success');
          
          // Try to delete it
          await deleteDoc(testDocRef);
          addTestResult('🚀 SUPERADMIN DELETE TEST PASSED! Can delete documents', 'success');
          
        } catch (error) {
          addTestResult(`❌ SUPERADMIN delete test failed: ${error.message}`, 'error');
        }
        
      } else if (adminDoc?.role === 'admin') {
        addTestResult('ℹ️ Skipping delete test - Regular admin should NOT have delete permissions', 'info');
        
        // Optional: Test that regular admin CANNOT delete (should fail)
        try {
          const testDocRef = await addDoc(collection(db, 'testCollection'), {
            message: 'Test document - regular admin should not be able to delete this',
            createdAt: new Date(),
            createdBy: user.uid
          });
          
          addTestResult('✅ Created test document', 'success');
          
          // This should fail for regular admins
          try {
            await deleteDoc(testDocRef);
            addTestResult('❌ ERROR: Regular admin was able to delete! Check your Firestore rules!', 'error');
          } catch (deleteError) {
            addTestResult('✅ CORRECT: Regular admin cannot delete (as expected)', 'success');
          }
          
        } catch (error) {
          addTestResult(`ℹ️ Could not test delete restrictions: ${error.message}`, 'info');
        }
      }

      // Test 5: Try to read conductor trips
      addTestResult('🔍 Testing conductor trips access...', 'info');
      
      try {
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

      // Test 6: Try to read Admin collection (should work for superadmin, limited for regular admin)
      addTestResult('🔍 Testing Admin collection access...', 'info');
      
      try {
        const adminCollectionRef = collection(db, 'Admin');
        const adminCollectionSnap = await getDocs(adminCollectionRef);
        addTestResult(`✅ Can read Admin collection (${adminCollectionSnap.size} documents)`, 'success');
      } catch (error) {
        addTestResult(`❌ Cannot read Admin collection: ${error.message}`, 'error');
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

  const getRoleDisplay = () => {
    if (!adminDoc) return 'Unknown';
    
    if (adminDoc.role === 'superadmin' && adminDoc.isSuperAdmin === true) {
      return '🚀 SUPERADMIN (Full Access + Delete)';
    } else if (adminDoc.role === 'admin') {
      return '👤 Regular Admin (No Delete)';
    }
    return adminDoc.role || 'Unknown';
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>🔧 Admin Access Test - Superadmin vs Regular Admin</h2>
      
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
        <div style={{ 
          marginBottom: '20px', 
          padding: '15px', 
          backgroundColor: adminDoc.role === 'superadmin' ? '#e8f5e8' : '#fff3cd', 
          borderRadius: '8px',
          border: adminDoc.role === 'superadmin' ? '2px solid #4CAF50' : '2px solid #ffc107'
        }}>
          <h3>Admin Document</h3>
          <p><strong>Email:</strong> {adminDoc.email}</p>
          <p><strong>Name:</strong> {adminDoc.name}</p>
          <p><strong>Role:</strong> {getRoleDisplay()}</p>
          <p><strong>UID:</strong> {adminDoc.uid}</p>
          {adminDoc.permissions && (
            <div>
              <strong>Permissions:</strong>
              <ul style={{ marginTop: '5px' }}>
                {adminDoc.permissions.map((permission, index) => (
                  <li key={index} style={{ 
                    color: permission.includes('delete') ? '#4CAF50' : '#666',
                    fontWeight: permission.includes('delete') ? 'bold' : 'normal'
                  }}>
                    {permission}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
          <li>Make sure you're signed in with the correct account</li>
          <li>Click "Run Admin Tests" to verify your access level</li>
          <li><strong>SUPERADMIN (batrascoservices@gmail.com):</strong> Should see ✅ green checkmarks for everything including delete tests</li>
          <li><strong>Regular Admin:</strong> Should see ✅ for read/write but ❌ or restrictions for delete operations</li>
          <li>If you see unexpected results, check your Firestore rules and Admin document</li>
        </ol>
        
        <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#d4edda', borderRadius: '5px' }}>
          <strong>Expected Results:</strong>
          <ul>
            <li>🚀 <strong>SUPERADMIN:</strong> Full access + delete permissions</li>
            <li>👤 <strong>Regular Admin:</strong> Read/write access, NO delete permissions</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AdminTest;