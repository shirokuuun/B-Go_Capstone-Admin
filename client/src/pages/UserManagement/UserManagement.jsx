import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '/src/firebase/firebase.js';
import { fetchCurrentUserData } from '/src/pages/settings/settings.js';
import { fetchAllUsers, deleteUser, fetchUserById, subscribeToUsers } from './UserManagement.js';
import { MdDeleteForever } from "react-icons/md";
import './UserManagement.css';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  // Image modal states
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  
  // Authentication and role states
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Authentication and role checking useEffect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userData = await fetchCurrentUserData();
          setCurrentUser(userData);
          setUserRole(userData?.role);
          setIsSuperAdmin(userData?.role === 'superadmin');
        } catch (error) {
          console.error('Error fetching user data:', error);
          setError('Failed to load user permissions');
        }
      } else {
        window.location.href = '/login';
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authLoading) {
      let unsubscribe = null;
      
      try {
        setLoading(true);
        setError('');
        
        unsubscribe = subscribeToUsers((updatedUsers, error) => {
          if (error) {
            console.error('Real-time listener error:', error);
            setError(error.message);
            setLoading(false);
            return;
          }
          
          if (updatedUsers) {
            setUsers(updatedUsers);
            console.log(`📊 Real-time update: ${updatedUsers.length} users loaded`);
          }
          setLoading(false);
        });
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }

      // Cleanup function to unsubscribe when component unmounts or dependencies change
      return () => {
        if (unsubscribe) {
          console.log('🔇 Unsubscribing from users real-time listener');
          unsubscribe();
        }
      };
    }
  }, [authLoading]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const usersData = await fetchAllUsers();
      setUsers(usersData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewUser = async (userId) => {
    try {
      setActionLoading(true);
      const userData = await fetchUserById(userId);
      setSelectedUser(userData);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteClick = async (user) => {
    // Check if user is superadmin
    if (!isSuperAdmin) {
      alert('Access denied. Only super administrators can delete users.');
      return;
    }

    const confirmMessage = `⚠️ SUPER ADMIN ACTION ⚠️\n\nAre you sure you want to delete this user?\n\nName: ${user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.name || user.displayName || 'Unknown User'}\nEmail: ${user.email || 'No email'}\nID: ${user.id}\n\nThis action cannot be undone and will be logged in the activity logs.`;
    
    const confirmed = window.confirm(confirmMessage);
    
    if (confirmed) {
      try {
        setActionLoading(true);
        const result = await deleteUser(user.id, currentUser);
        setUsers(users.filter(u => u.id !== user.id));
        
        // Show detailed feedback based on deletion result
        if (result && result.success) {
          const alertMessage = `✅ ${result.message}\n\n${result.details}\n\nThis action has been logged in the activity logs.`;
          alert(alertMessage);
        } else {
          alert('User deleted successfully. This action has been logged.');
        }
      } catch (err) {
        setError(err.message);
        alert('❌ Failed to delete user: ' + err.message);
      } finally {
        setActionLoading(false);
      }
    }
  };


  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    
    let date;
    
    // Handle Firestore timestamp object format
    if (timestamp && typeof timestamp === 'object' && timestamp.type === 'firestore/timestamp/1.0') {
      date = new Date(timestamp.seconds * 1000);
    }
    // Handle standard Firestore timestamp
    else if (timestamp.toDate) {
      date = timestamp.toDate();
    } 
    // Handle timestamp with seconds property
    else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } 
    // Handle regular Date or timestamp
    else {
      date = new Date(timestamp);
    }
    
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };


  const sortUsers = (users) => {
    return [...users].sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'name':
          aValue = (a.firstName && a.lastName 
            ? `${a.firstName} ${a.lastName}`
            : a.name || a.displayName || 'Unknown User').toLowerCase();
          bValue = (b.firstName && b.lastName 
            ? `${b.firstName} ${b.lastName}`
            : b.name || b.displayName || 'Unknown User').toLowerCase();
          break;
        case 'email':
          aValue = (a.email || '').toLowerCase();
          bValue = (b.email || '').toLowerCase();
          break;
        case 'createdAt':
          aValue = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(0);
          bValue = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(0);
          break;
        case 'lastLogin':
          aValue = a.lastLogin ? (a.lastLogin.toDate ? a.lastLogin.toDate() : new Date(a.lastLogin)) : new Date(0);
          bValue = b.lastLogin ? (b.lastLogin.toDate ? b.lastLogin.toDate() : new Date(b.lastLogin)) : new Date(0);
          break;
        default:
          aValue = a.id;
          bValue = b.id;
      }
      
      if (sortBy === 'createdAt' || sortBy === 'lastLogin') {
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const handleSortChange = (newSortBy) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('asc');
    }
  };

  const getSortedUsers = () => {
    return sortUsers(users);
  };

  const getReadableFieldName = (fieldName) => {
    const fieldMapping = {
      'firstName': 'First Name',
      'lastName': 'Last Name',
      'email': 'Email Address',
      'phone': 'Phone Number',
      'phoneNumber': 'Phone Number',
      'createdAt': 'Account Created',
      'lastLogin': 'Last Login',
      'lastLoginAt': 'Last Login',
      'displayName': 'Display Name',
      'name': 'Full Name',
      'uid': 'User ID',
      'id': 'User ID',
      'emailVerified': 'Email Verified',
      'isVerified': 'Account Verified',
      'profilePicture': 'Profile Picture',
      'photoURL': 'Profile Photo',
      'role': 'User Role',
      'userType': 'User Type',
      'status': 'Account Status',
      'isActive': 'Active Status',
      'dateOfBirth': 'Date of Birth',
      'dob': 'Date of Birth',
      'address': 'Address',
      'city': 'City',
      'state': 'State',
      'zipCode': 'Zip Code',
      'country': 'Country',
      'gender': 'Gender',
      'occupation': 'Occupation',
      'company': 'Company',
      'website': 'Website',
      'bio': 'Biography',
      'description': 'Description',
      'preferences': 'Preferences',
      'settings': 'Settings',
      'metadata': 'Additional Info',
      'customClaims': 'Custom Claims',
      'permissions': 'Permissions',
      'lastUpdated': 'Last Updated',
      'updatedAt': 'Last Updated',
      'providerData': 'Login Providers',
      'provider': 'Login Provider',
      'idVerifiedAt' : 'ID Verified At',
      'idVerificationStatus' : 'ID Verification Status',
      'profileImageUrl' : 'Profile Picture'
    };
    
    return fieldMapping[fieldName] || fieldName.charAt(0).toUpperCase() + fieldName.slice(1).replace(/([A-Z])/g, ' $1');
  };

  if (loading) {
    return (
      <div className="usermgmt-container">
        <div className="usermgmt-loading">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="usermgmt-container">
      <div className="usermgmt-header">
        <div className="usermgmt-sort-section">
          <label className="usermgmt-sort-label">Sort by:</label>
          <select 
            className="usermgmt-sort-select"
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split('-');
              setSortBy(field);
              setSortOrder(order);
            }}
          >
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="email-asc">Email (A-Z)</option>
            <option value="email-desc">Email (Z-A)</option>
            <option value="createdAt-desc">Newest First</option>
            <option value="createdAt-asc">Oldest First</option>
          </select>
        </div>
        <div className="usermgmt-stats">
          <p className="usermgmt-stats-text">
            Total Users: {users.length}
          </p>
        </div>
      </div>

      {error && (
        <div className="usermgmt-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="usermgmt-split-layout">
        {/* Left Side - Users List */}
        <div className="usermgmt-users-panel">
          <div className="usermgmt-users-header">
            <h2 className="usermgmt-users-title">All Users</h2>
            <p className="usermgmt-users-subtitle">Select a user to view details</p>
          </div>
          {users.length === 0 && !loading ? (
            <div className="usermgmt-no-users">
              <div className="usermgmt-no-users-icon">👥</div>
              <h3 className="usermgmt-no-users-title">No Users Found</h3>
              <p className="usermgmt-no-users-text">
                There are currently no users in the system.
              </p>
            </div>
          ) : (
            <div className="usermgmt-user-list">
              {getSortedUsers().map((user) => (
                <div 
                  key={user.id} 
                  className={`usermgmt-user-item ${selectedUser && selectedUser.id === user.id ? 'active' : ''}`}
                  onClick={() => handleViewUser(user.id)}
                >
                  <div className="usermgmt-user-item-main">
                    {(() => {
                      // Find any profile image field
                      const profileImageUrl = Object.entries(user).find(([key, value]) => 
                        value && typeof value === 'string' && value.startsWith('http') && 
                        (key.toLowerCase().includes('image') || key.toLowerCase().includes('photo') || 
                         key.toLowerCase().includes('pic') || key === 'photoURL' || key === 'avatar')
                      )?.[1];
                      
                      return profileImageUrl ? (
                        <div className="usermgmt-user-avatar">
                          <img
                            src={profileImageUrl}
                            alt="Profile"
                            className="usermgmt-user-avatar-img"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                          <div className="usermgmt-user-avatar-fallback" style={{ display: 'none' }}>
                            {((user.firstName && user.lastName)
                              ? (user.firstName.charAt(0) + user.lastName.charAt(0))
                              : (user.name || user.displayName || user.email || 'U').charAt(0)
                            ).toUpperCase()}
                          </div>
                        </div>
                      ) : (
                        <div className="usermgmt-user-avatar">
                          <div className="usermgmt-user-avatar-fallback">
                            {((user.firstName && user.lastName) 
                              ? (user.firstName.charAt(0) + user.lastName.charAt(0))
                              : (user.name || user.displayName || user.email || 'U').charAt(0)
                            ).toUpperCase()}
                          </div>
                        </div>
                      );
                    })()}
                    <div className="usermgmt-user-item-info">
                      <h4 className="usermgmt-user-item-name">
                        {user.firstName && user.lastName 
                          ? `${user.firstName} ${user.lastName}`
                          : user.name || user.displayName || 'Unknown User'
                        }
                      </h4>
                      <p className="usermgmt-user-item-email">
                        {user.email || 'No email'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={isSuperAdmin ? (e) => {
                      e.stopPropagation();
                      handleDeleteClick(user);
                    } : undefined}
                    className={`settings-admin-delete-btn ${!isSuperAdmin ? 'disabled' : ''}`}
                    disabled={actionLoading || !isSuperAdmin}
                    title={isSuperAdmin ? `Delete ${user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.name || user.displayName || user.email}` : "Delete not allowed for admin users"}
                    style={{
                      color: !isSuperAdmin ? '#999' : '',
                      cursor: !isSuperAdmin ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <MdDeleteForever />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side - User Details */}
        <div className="usermgmt-details-panel">
          {selectedUser ? (
            <div className="usermgmt-user-details-view">
              <div className="usermgmt-details-header">
                <h2 className="usermgmt-details-title">User Details</h2>
                <p className="usermgmt-details-subtitle">Complete user information</p>
              </div>
              
              <div className="usermgmt-details-content">
                {Object.entries(selectedUser).map(([key, value]) => {
                  if (key === 'id') return null;
                  
                  let displayValue = value;
                  let isProfileImage = false;
                  
                  // Check if this is a profile image field
                  if (key === 'photoURL' || key === 'profilePicture' || key === 'profileImage' || key === 'avatar' || 
                      key.toLowerCase().includes('image') || key.toLowerCase().includes('photo') || key.toLowerCase().includes('pic')) {
                    isProfileImage = true;
                  }
                  
                  // Check if it's a timestamp field or Firestore timestamp object
                  if (key.includes('reatedAt') || key.includes('Login') || key.includes('ime') || key.includes('Updated') ||
                      (typeof value === 'object' && value !== null && 
                       (value.type === 'firestore/timestamp/1.0' || value.seconds || value.toDate))) {
                    displayValue = formatDate(value);
                  } else if (typeof value === 'object' && value !== null) {
                    displayValue = JSON.stringify(value, null, 2);
                  } else if (value === null || value === undefined) {
                    displayValue = 'N/A';
                  }

                  return (
                    <div key={key} className="usermgmt-detail-row">
                      <span className="usermgmt-detail-label">
                        {getReadableFieldName(key)}:
                      </span>
                      <span className="usermgmt-detail-value">
                        {isProfileImage && value && value !== 'N/A' ? (
                          <div
                            className="usermgmt-profile-image-container usermgmt-clickable-profile-image"
                            onClick={() => {
                              setSelectedImage(value);
                              setShowImageModal(true);
                            }}
                            title="Click to view full size"
                          >
                            <img
                              src={value}
                              alt="Profile"
                              className="usermgmt-profile-image-details"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'block';
                              }}
                            />
                            <span className="usermgmt-profile-image-fallback" style={{ display: 'none' }}>
                              Image not available
                            </span>
                            <div className="usermgmt-profile-image-overlay">
                            </div>
                          </div>
                        ) : (
                          String(displayValue)
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="usermgmt-no-selection">
              <div className="usermgmt-no-selection-icon">👤</div>
              <h3 className="usermgmt-no-selection-title">Select a User</h3>
              <p className="usermgmt-no-selection-text">
                Choose a user from the list to view their details.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Image Modal */}
      {showImageModal && (
        <ImageModal
          imageUrl={selectedImage}
          onClose={() => {
            setShowImageModal(false);
            setSelectedImage('');
          }}
        />
      )}

    </div>
  );
};

// Image Modal Component
const ImageModal = ({ imageUrl, onClose }) => {
  return (
    <div className="usermgmt-image-modal-overlay" onClick={onClose}>
      <div className="usermgmt-image-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="usermgmt-image-modal-close-btn" onClick={onClose}>×</button>
        <img src={imageUrl} alt="Profile picture full size" className="usermgmt-full-size-image" />
      </div>
    </div>
  );
};

export default UserManagement;