import '/src/pages/verification/IDVerification.css';
import Header from '/src/components/HeaderTemplate/header.jsx';
import React, { useEffect, useState } from 'react';
import { fetchUsers, fetchUserIDData, updateIDVerificationStatus, subscribeToUsers, subscribeToUserIDData } from '/src/pages/verification/IDVerification.js';


function IDVerification() {
  const [collapsed, setCollapsed] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserID, setSelectedUserID] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'verified', 'rejected'

  useEffect(() => {
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
  }, []);

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
    
    setLoading(true);
    try {
      await updateIDVerificationStatus(selectedUser.id, action);
      
      // Note: State updates will happen automatically via real-time subscriptions
      // No need to manually update local state anymore
      
      // AUTO-SWITCH TO THE APPROPRIATE TAB
      if (action === 'verified') {
        setActiveTab('verified');
      } else if (action === 'rejected') {
        setActiveTab('pending'); // Switch to pending tab since user goes back to pending
      }
      
      alert(`ID ${action} successfully!`);
    } catch (error) {
      console.error(`Failed to ${action} ID:`, error);
      alert(`Failed to ${action} ID. Please try again.`);
    } finally {
      setLoading(false);
    }
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
  const rejectedCount = users.filter(user => user.idVerificationStatus === 'rejected').length;

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
              <span className="id-verification-count-badge rejected">
                {rejectedCount} rejected
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
            className={`id-verification-tab ${activeTab === 'rejected' ? 'active' : ''}`}
            onClick={() => setActiveTab('rejected')}
          >
            Rejected ({rejectedCount})
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
                          className="id-verification-btn verify"
                          onClick={() => handleVerificationAction('verified')}
                          disabled={loading}
                        >
                          {loading ? 'Processing...' : 'Verify ID'}
                        </button>
                        <button 
                          className="id-verification-btn reject"
                          onClick={() => handleVerificationAction('rejected')}
                          disabled={loading}
                        >
                          {loading ? 'Processing...' : 'Reject ID'}
                        </button>
                      </div>
                    )}
                    
                    {selectedUserID.status === 'verified' && (
                      <div className="id-verification-buttons">
                        <button 
                          className="id-verification-btn reject"
                          onClick={() => handleVerificationAction('rejected')}
                          disabled={loading}
                        >
                          {loading ? 'Processing...' : 'Revoke Verification'}
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