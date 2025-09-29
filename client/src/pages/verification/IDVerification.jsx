import '/src/pages/verification/IDVerification.css';
import Header from '/src/components/HeaderTemplate/header.jsx';
import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '/src/firebase/firebase.js';
import { fetchCurrentUserData } from '/src/pages/settings/settings.js';
import { fetchUsers, fetchUserIDData, updateIDVerificationStatus, subscribeToUsers, subscribeToUserIDData, fetchRevokedVerifications } from '/src/pages/verification/IDVerification.js';


function IDVerification() {
  const [collapsed, setCollapsed] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserID, setSelectedUserID] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'verified', 'revoked'

  // Authentication and role checking states
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  // Authentication and role checking useEffect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userData = await fetchCurrentUserData();
          setCurrentUser(userData);
          setUserRole(userData?.role);
          
          // Check if user has admin or superadmin role
          if (userData?.role === 'admin' || userData?.role === 'superadmin') {
            setAccessDenied(false);
          } else {
            setAccessDenied(true);
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          setAccessDenied(true);
        }
      } else {
        // User not logged in, redirect to login
        window.location.href = '/login';
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Only set up subscription if user is authorized
    if (!accessDenied && !authLoading) {
      // Set up real-time subscription to users
      const unsubscribeUsers = subscribeToUsers((usersData) => {
        setUsers(usersData);
      });

      // Cleanup subscription on unmount
      return () => {
        if (unsubscribeUsers) {
          unsubscribeUsers();
        }
      };
    }
  }, [accessDenied, authLoading]);

  // Real-time subscription for selected user's ID data
  useEffect(() => {
    let unsubscribeUserID = null;

    if (selectedUser) {
      setLoading(true);
      unsubscribeUserID = subscribeToUserIDData(selectedUser.id, (idData) => {
        setSelectedUserID(idData);
        setLoading(false);
      });
    } else {
      setSelectedUserID(null);
      setLoading(false);
    }

    // Cleanup previous subscription
    return () => {
      if (unsubscribeUserID) {
        unsubscribeUserID();
      }
    };
  }, [selectedUser]);

  const handleUserClick = (user) => {
    setSelectedUser(user);
    console.log("Selected user data:", user); // Debug log
    // Note: ID data will be loaded automatically via useEffect subscription
  };

  const handleVerificationAction = async (action) => {
    if (!selectedUser || !selectedUserID) return;

    // Check if user has admin or superadmin role
    if (!canPerformVerification()) {
      alert('Access denied: Only admin and superadmin users can verify or revoke ID verifications.');
      return;
    }
    
    setLoading(true);
    try {
      await updateIDVerificationStatus(selectedUser.id, action, currentUser);
      
      // Note: State updates will happen automatically via real-time subscriptions
      // No need to manually update local state anymore
      
      // AUTO-SWITCH TO THE APPROPRIATE TAB
      if (action === 'verified') {
        setActiveTab('verified');
      } else if (action === 'rejected') {
        setActiveTab('pending'); // Switch to pending tab since user goes back to pending
      } else if (action === 'revoked') {
        setActiveTab('revoked'); // Switch to revoked tab for revoked users
      }
      
      alert(`ID ${action} successfully!`);
    } catch (error) {
      console.error(`Failed to ${action} ID:`, error);
      alert(`Failed to ${action} ID. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to check if user can perform ID verification actions
  const canPerformVerification = () => {
    return userRole === 'admin' || userRole === 'superadmin';
  };

  const getFilteredUsers = () => {
    return users.filter(user => {
      const status = user.idVerificationStatus || 'pending';
      return status === activeTab;
    });
  };

  const filteredData = getFilteredUsers();
  const pendingCount = users.filter(user => (user.idVerificationStatus || 'pending') === 'pending').length;
  const verifiedCount = users.filter(user => user.idVerificationStatus === 'verified').length;
  const revokedCount = users.filter(user => user.idVerificationStatus === 'revoked').length;

  // Show loading screen while checking authentication
  if (authLoading) {
    return (
      <div className="id-verification-container">
        <div className="id-verification-loading-container">
          <div className="id-verification-loading">
            <h2>Loading...</h2>
            <p>Checking permissions...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show access denied message if user doesn't have proper role
  if (accessDenied) {
    return (
      <div className="id-verification-container">
        <div className="id-verification-access-denied">
          <div className="access-denied-content">
            <h2>🚫 Access Denied</h2>
            <p>You don't have permission to access ID Verification.</p>
            <p>This feature is only available to administrators.</p>
            <div className="access-denied-info">
              <p><strong>Your Role:</strong> {userRole || 'Unknown'}</p>
              <p><strong>Required Roles:</strong> Admin, Super Admin</p>
            </div>
            <button 
              onClick={() => window.history.back()} 
              className="id-verification-back-btn"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="id-verification-container">
      <div className="id-verification-left-panel">
        <div className="id-verification-left-panel-header">
          <h2>ID Verification</h2>
          <div className="id-verification-stats">
            <div className="id-verification-stat-item">
              <span className="id-verification-count-badge pending">
                {pendingCount} pending
              </span>
            </div>
            <div className="id-verification-stat-item">
              <span className="id-verification-count-badge verified">
                {verifiedCount} verified
              </span>
            </div>
            <div className="id-verification-stat-item">
              <span className="id-verification-count-badge revoked">
                {revokedCount} revoked
              </span>
            </div>
          </div>
        </div>
        
        <div className="id-verification-tabs">
          <button
            className={`id-verification-tab ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            Pending ({pendingCount})
          </button>
          <button
            className={`id-verification-tab ${activeTab === 'verified' ? 'active' : ''}`}
            onClick={() => setActiveTab('verified')}
          >
            Verified ({verifiedCount})
          </button>
          <button
            className={`id-verification-tab revoked ${activeTab === 'revoked' ? 'active' : ''}`}
            onClick={() => setActiveTab('revoked')}
          >
            Revoked ({revokedCount})
          </button>
        </div>

        <div className="id-verification-user-list">
          {filteredData.length === 0 ? (
            <div className="id-verification-no-data">
              No {activeTab} verifications
            </div>
          ) : (
            filteredData.map((user) => (
              <div 
                key={user.id} 
                className={`id-verification-user-item ${selectedUser?.id === user.id ? 'selected' : ''}`}
                onClick={() => handleUserClick(user)}
              >
                <div className="id-verification-user-info">
                  <div className="id-verification-user-name">
                    {user.name || user.displayName || 'Unnamed User'}
                  </div>
                  <div className="id-verification-user-email">
                    {user.email}
                  </div>
                </div>
                <div className={`id-verification-status-indicator ${user.idVerificationStatus || 'pending'}`}>
                  {(user.idVerificationStatus || 'pending').toUpperCase()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="id-verification-right-panel">
        <div className="id-verification-right-panel-scroll">
          {selectedUser ? (
            <div className="id-verification-details">
              <div className="id-verification-header">
                <div className="id-verification-header-row">
                  <h2>ID Details</h2>
                </div>
                <div className="id-verification-user-details">
                  <h3>{selectedUser.name || selectedUser.displayName || 'Unnamed User'}</h3>
                  <p>{selectedUser.email}</p>
                </div>
              </div>
              {loading ? (
                <div className="id-verification-loading">
                  <p>Loading ID data...</p>
                </div>
              ) : selectedUserID ? (
                <div className="id-verification-content">
                  <div className="id-verification-images">
                    <div className="id-verification-image-container">
                      <h4>Front ID</h4>
                      {selectedUserID.frontUrl ? (
                        <img 
                          src={selectedUserID.frontUrl} 
                          alt="Front ID" 
                          className="id-verification-image"
                          onError={(e) => {
                            e.target.src = '';
                            e.target.alt = 'Failed to load image';
                          }}
                        />
                      ) : (
                        <div className="id-verification-no-image">No front image available</div>
                      )}
                    </div>
                    
                    <div className="id-verification-image-container">
                      <h4>Back ID</h4>
                      {selectedUserID.backUrl ? (
                        <img 
                          src={selectedUserID.backUrl} 
                          alt="Back ID" 
                          className="id-verification-image"
                          onError={(e) => {
                            e.target.src = '';
                            e.target.alt = 'Failed to load image';
                          }}
                        />
                      ) : (
                        <div className="id-verification-no-image">No back image available</div>
                      )}
                    </div>
                  </div>

                  <div className="id-verification-actions">
                    <div className="id-verification-current-status">
                      <span className={`id-verification-status-badge ${selectedUserID.status || 'pending'}`}>
                        Current Status: {(selectedUserID.status || 'pending').toUpperCase()}
                      </span>
                    </div>
                    
                    {(selectedUserID.status || 'pending') === 'pending' && (
                      <div className="id-verification-buttons">
                        <button
                          className={`id-verification-btn verify ${!canPerformVerification() ? 'disabled' : ''}`}
                          onClick={canPerformVerification() ? () => handleVerificationAction('verified') : undefined}
                          disabled={loading || !canPerformVerification()}
                          title={!canPerformVerification() ? "Verify not allowed for your role" : "Verify ID"}
                          style={{
                            color: !canPerformVerification() ? '#999' : '',
                            backgroundColor: !canPerformVerification() ? '#f5f5f5' : '',
                            borderColor: !canPerformVerification() ? '#ccc' : '',
                            cursor: !canPerformVerification() ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {loading ? 'Processing...' : 'Verify ID'}
                        </button>
                        <button
                          className={`id-verification-btn reject ${!canPerformVerification() ? 'disabled' : ''}`}
                          onClick={canPerformVerification() ? () => handleVerificationAction('rejected') : undefined}
                          disabled={loading || !canPerformVerification()}
                          title={!canPerformVerification() ? "Reject not allowed for your role" : "Reject ID"}
                          style={{
                            color: !canPerformVerification() ? '#999' : '',
                            backgroundColor: !canPerformVerification() ? '#f5f5f5' : '',
                            borderColor: !canPerformVerification() ? '#ccc' : '',
                            cursor: !canPerformVerification() ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {loading ? 'Processing...' : 'Reject ID'}
                        </button>
                      </div>
                    )}
                    
                    {selectedUserID.status === 'verified' && (
                      <div className="id-verification-buttons">
                        <button
                          className={`id-verification-btn revoke ${!canPerformVerification() ? 'disabled' : ''}`}
                          onClick={canPerformVerification() ? () => handleVerificationAction('revoked') : undefined}
                          disabled={loading || !canPerformVerification()}
                          title={!canPerformVerification() ? "Revoke not allowed for your role" : "Revoke Verification"}
                          style={{
                            color: !canPerformVerification() ? '#999' : '',
                            backgroundColor: !canPerformVerification() ? '#f5f5f5' : '',
                            borderColor: !canPerformVerification() ? '#ccc' : '',
                            cursor: !canPerformVerification() ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {loading ? 'Processing...' : 'Revoke Verification'}
                        </button>
                      </div>
                    )}

                    {selectedUserID.status === 'revoked' && (
                      <div className="id-verification-buttons">
                        <button
                          className={`id-verification-btn verify ${!canPerformVerification() ? 'disabled' : ''}`}
                          onClick={canPerformVerification() ? () => handleVerificationAction('verified') : undefined}
                          disabled={loading || !canPerformVerification()}
                          title={!canPerformVerification() ? "Re-verify not allowed for your role" : "Re-verify ID"}
                          style={{
                            color: !canPerformVerification() ? '#999' : '',
                            backgroundColor: !canPerformVerification() ? '#f5f5f5' : '',
                            borderColor: !canPerformVerification() ? '#ccc' : '',
                            cursor: !canPerformVerification() ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {loading ? 'Processing...' : 'Re-verify ID'}
                        </button>
                        <button
                          className={`id-verification-btn reject ${!canPerformVerification() ? 'disabled' : ''}`}
                          onClick={canPerformVerification() ? () => handleVerificationAction('rejected') : undefined}
                          disabled={loading || !canPerformVerification()}
                          title={!canPerformVerification() ? "Reject not allowed for your role" : "Reject ID"}
                          style={{
                            color: !canPerformVerification() ? '#999' : '',
                            backgroundColor: !canPerformVerification() ? '#f5f5f5' : '',
                            borderColor: !canPerformVerification() ? '#ccc' : '',
                            cursor: !canPerformVerification() ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {loading ? 'Processing...' : 'Reject ID'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="id-verification-no-data">
                  <p>No ID data found for this user</p>
                </div>
              )}
            </div>
          ) : (
            <div className="id-verification-placeholder">
              <h2>Select a user to view their ID verification details</h2>
              <p>Click on a user from the list to see their submitted ID documents and verification status.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default IDVerification;