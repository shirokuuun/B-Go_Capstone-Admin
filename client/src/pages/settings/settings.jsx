import '/src/pages/settings/settings.css';
import Header from '/src/components/HeaderTemplate/header.jsx';
import { MdDeleteForever } from "react-icons/md";
import { IoMdArrowDropdownCircle } from "react-icons/io";
import { PiMicrosoftExcelLogoFill } from "react-icons/pi";
import { RiEdit2Fill } from "react-icons/ri";
import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '/src/firebase/firebase.js';
import {
  fetchCurrentUserData,
  changeUserPassword,
  uploadProfileImage,
  createImagePreview,
  isValidImageFile,
  getRoleDisplayName,
  updateUsername,
  deleteCurrentAccount,
  subscribeToAdminUsers,
  deleteAdminUser
} from './settings.js';
import {
  getActivityLogs,
  exportLogsToCSV,
  getLogStatistics,
  ACTIVITY_TYPES
} from './auditService.js';
import { onSnapshot, collection, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '/src/firebase/firebase.js';

function Settings() {
  const [collapsed, setCollapsed] = useState(false);
  const [userData, setUserData] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileImage, setProfileImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [editedUsername, setEditedUsername] = useState('');
  
  // System logs state
  const [activityLogs, setActivityLogs] = useState([]);
  const [logStatistics, setLogStatistics] = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFilters, setLogFilters] = useState({
    activityType: '',
    severity: '',
    startDate: '',
    endDate: '',
    limit: 50
  });
  
  // Store unsubscribe function for cleanup
  const [activityLogsUnsubscribe, setActivityLogsUnsubscribe] = useState(null);
  
  // Admin users management state (superadmin only)
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersUnsubscribe, setAdminUsersUnsubscribe] = useState(null);
  const [isAdminUsersExpanded, setIsAdminUsersExpanded] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const adminData = await fetchCurrentUserData();
          setUserData(adminData);
          setEditedUsername(adminData?.name || '');
          if (adminData?.profileImageUrl) {
            setImagePreview(adminData.profileImageUrl);
          }
        } catch (err) {
          setError(err.message);
        }
      } else {
        setError('You must be logged in to access settings');
        window.location.href = '/login';
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const successMessage = await changeUserPassword(currentPassword, newPassword, confirmPassword);
      
      // Show browser alert for immediate feedback
      alert('Password changed successfully! ✅');
      
      // Also set the message state for UI feedback
      setMessage(successMessage);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!isValidImageFile(file)) {
        setError('Please select a valid image file (JPEG, PNG, GIF, WebP) under 5MB');
        return;
      }
      
      setProfileImage(file);
      try {
        const previewUrl = await createImagePreview(file);
        setImagePreview(previewUrl);
        setError(''); // Clear any previous errors
      } catch (err) {
        setError('Failed to preview image');
      }
    }
  };

  const handleImageUpload = async () => {
    if (!profileImage) return;

    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const result = await uploadProfileImage(profileImage);
      
      // Update local state
      setUserData(prev => ({ ...prev, profileImageUrl: result.imageUrl }));
      setProfileImage(null);
      setMessage(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUsernameEdit = () => {
    setIsEditingUsername(true);
    setError('');
    setMessage('');
  };

  const handleUsernameSave = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const successMessage = await updateUsername(editedUsername);
      
      // Show browser alert for immediate feedback
      alert('Username updated successfully! ✅');
      
      // Update local state
      setUserData(prev => ({ ...prev, name: editedUsername.trim() }));
      setIsEditingUsername(false);
      setMessage(successMessage);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUsernameCancel = () => {
    setEditedUsername(userData?.name || '');
    setIsEditingUsername(false);
    setError('');
    setMessage('');
  };

  const handleDeleteLog = async (logId) => {
    const confirmed = window.confirm(
      '⚠️ Are you sure you want to delete this log entry? This action cannot be undone.'
    );
    
    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      // Import the delete function
      const { deleteDoc, doc } = await import('firebase/firestore');
      const { db } = await import('/src/firebase/firebase.js');
      
      await deleteDoc(doc(db, 'AuditLogs', logId));
      
      // Note: No need to update local state since real-time listeners will handle this automatically
      
      setMessage('Activity log deleted successfully');
    } catch (err) {
      setError('Failed to delete log: ' + err.message);
    } finally {
      setLoading(false);
    }
  };


  // Real-time snapshot listeners for logs
  const setupActivityLogsListener = () => {
    // Cleanup existing listener
    if (activityLogsUnsubscribe) {
      activityLogsUnsubscribe();
    }

    setLogsLoading(true);
    
    try {
      let q = collection(db, 'AuditLogs');
      const constraints = [orderBy('timestamp', 'desc')];

      // Apply filters
      if (logFilters.activityType) {
        constraints.push(where('activityType', '==', logFilters.activityType));
      }
      if (logFilters.severity) {
        constraints.push(where('severity', '==', logFilters.severity));
      }
      if (logFilters.startDate) {
        constraints.push(where('timestamp', '>=', new Date(logFilters.startDate)));
      }
      if (logFilters.endDate) {
        constraints.push(where('timestamp', '<=', new Date(logFilters.endDate)));
      }

      constraints.push(limit(logFilters.limit || 50));
      q = query(q, ...constraints);

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const logs = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate() || new Date()
        }));
        
        setActivityLogs(logs);
        
        // Calculate real-time statistics from current logs
        const stats = calculateLogStatistics(logs);
        setLogStatistics(stats);
        
        setLogsLoading(false);
      }, (err) => {
        setError('Failed to load activity logs: ' + err.message);
        setLogsLoading(false);
      });

      setActivityLogsUnsubscribe(() => unsubscribe);
    } catch (err) {
      setError('Failed to setup activity logs listener: ' + err.message);
      setLogsLoading(false);
    }
  };


  // Real-time statistics calculation from current logs
  const calculateLogStatistics = (logs) => {
    const activityByType = {};
    const activityByUser = {};
    let totalErrors = 0;

    logs.forEach(log => {
      // Count by activity type
      activityByType[log.activityType] = (activityByType[log.activityType] || 0) + 1;
      
      // Count by user
      const userName = log.userName || 'Unknown';
      activityByUser[userName] = (activityByUser[userName] || 0) + 1;
      
      // Count errors
      if (log.severity === 'error') {
        totalErrors++;
      }
    });

    return {
      totalActivities: logs.length,
      totalErrors: totalErrors,
      activityByType,
      activityByUser,
      dateRange: {
        startDate: logFilters.startDate ? new Date(logFilters.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: logFilters.endDate ? new Date(logFilters.endDate) : new Date()
      }
    };
  };

  const handleExportLogs = async () => {
    try {
      const currentDate = new Date().toISOString().split('T')[0];
      exportLogsToCSV(activityLogs, `activity-logs-${currentDate}`, 'activity');
      setMessage('Activity logs exported successfully');
    } catch (err) {
      setError('Failed to export logs: ' + err.message);
    }
  };

  const handleFilterChange = (field, value) => {
    setLogFilters(prev => ({ ...prev, [field]: value }));
  };

  const applyFilters = () => {
    setupActivityLogsListener();
  };

  // Setup admin users subscription (superadmin only)
  const setupAdminUsersListener = () => {
    if (adminUsersUnsubscribe) {
      adminUsersUnsubscribe();
    }

    setAdminUsersLoading(true);
    
    const unsubscribe = subscribeToAdminUsers(
      (users) => {
        setAdminUsers(users);
        setAdminUsersLoading(false);
      },
      (errorMsg) => {
        setError('Failed to load admin users: ' + errorMsg);
        setAdminUsersLoading(false);
      }
    );

    setAdminUsersUnsubscribe(() => unsubscribe);
  };

  // Handle admin user deletion
  const handleDeleteUser = useCallback(async (user) => {
    const confirmed = window.confirm(
      `⚠️ Are you sure you want to delete admin user "${user.name || user.email}"?\n\nThis action cannot be undone.`
    );
    
    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      await deleteAdminUser(user.id, user.email, user.name);
      setMessage(`✅ Admin user "${user.name || user.email}" has been successfully deleted from the system.`);
    } catch (err) {
      setError(`❌ Failed to delete admin user: ${err.message}. Please try again or contact support if the issue persists.`);
    } finally {
      setLoading(false);
    }
  }, []);


  // Load logs when component mounts - for all admins
  useEffect(() => {
    if (userData && (userData.role === 'admin' || userData.role === 'superadmin')) {
      applyFilters();
    }
  }, [userData]);

  // Auto-apply filters when logFilters change
  useEffect(() => {
    if (userData && (userData.role === 'admin' || userData.role === 'superadmin')) {
      applyFilters();
    }
  }, [logFilters]);

  // Load admin users when component mounts - for all admin roles
  useEffect(() => {
    if (userData && (userData.role === 'admin' || userData.role === 'superadmin')) {
      setupAdminUsersListener();
    }
  }, [userData]);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      if (activityLogsUnsubscribe) {
        activityLogsUnsubscribe();
      }
      if (adminUsersUnsubscribe) {
        adminUsersUnsubscribe();
      }
    };
  }, []);

  if (authLoading || !userData) {
    return <div className="settings-loading-container">Loading...</div>;
  }

  return (
    <div className="settings-container">
      {/* Messages */}
      {message && <div className="settings-message-success">{message}</div>}
      {error && <div className="settings-message-error">{error}</div>}

      <div className="settings-grid">
        {/* Account & Profile Section */}
        <div className="settings-card">
          <div className="settings-card-header">
            <h2 className="settings-card-title">Account & Profile</h2>
          </div>
          <div className="settings-card-content">
            <div className="settings-profile-info-grid">
              <div className="settings-info-row">
                <span className="settings-info-label">Username</span>
                {isEditingUsername ? (
                  <div className="settings-username-edit-container">
                    <input
                      type="text"
                      value={editedUsername}
                      onChange={(e) => setEditedUsername(e.target.value)}
                      className="settings-username-input"
                      placeholder="Enter username"
                      maxLength={50}
                      disabled={loading}
                    />
                    <div className="settings-username-buttons">
                      <button
                        onClick={handleUsernameSave}
                        disabled={loading || !editedUsername.trim()}
                        className="settings-username-save-btn"
                      >
                        ✓
                      </button>
                      <button
                        onClick={handleUsernameCancel}
                        disabled={loading}
                        className="settings-username-cancel-btn"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="settings-username-display">
                    <span className="settings-info-value">{userData.name}</span>
                    <button
                      onClick={handleUsernameEdit}
                      className="settings-username-edit-btn"
                    >
                      <RiEdit2Fill size={16} /> Edit
                    </button>
                  </div>
                )}
              </div>
              <div className="settings-info-row">
                <span className="settings-info-label">Email</span>
                <span className="settings-info-value">{userData.email}</span>
              </div>
              <div className="settings-info-row">
                <span className="settings-info-label">Role</span>
                <span className={`settings-role-badge ${userData.role}`}>
                  {getRoleDisplayName(userData)}
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* Profile Picture Section */}
        <div className="settings-card">
          <div className="settings-card-header">
            <h2 className="settings-card-title">Profile Picture</h2>
          </div>
          <div className="settings-card-content">
            <div className="settings-profile-picture-container">
              <div className="settings-picture-preview">
                {imagePreview ? (
                  <img src={imagePreview} alt="Profile" className="settings-profile-image" />
                ) : (
                  <div className="settings-no-image-placeholder">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                    <span>No profile picture</span>
                  </div>
                )}
              </div>
              <div className="settings-picture-upload">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="settings-file-input"
                  id="profile-upload"
                />
                <label htmlFor="profile-upload" className="settings-file-input-label">
                  Choose File
                </label>
                {profileImage && (
                  <button 
                    onClick={handleImageUpload} 
                    disabled={loading}
                    className="settings-btn-primary"
                  >
                    {loading ? 'Uploading...' : 'Upload Picture'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Change Password Section */}
        <div className="settings-card settings-full-width">
          <div className="settings-card-header">
            <h2 className="settings-card-title">Change Password</h2>
          </div>
          <div className="settings-card-content">
            <form onSubmit={handlePasswordChange} className="settings-password-form">
              <div className="settings-form-field">
                <label className="settings-form-label">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="settings-form-input"
                  placeholder="Enter current password"
                  autoComplete="current-password"
                />
              </div>
              <div className="settings-form-row">
                <div className="settings-form-field">
                  <label className="settings-form-label">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="settings-form-input"
                    placeholder="Enter new password"
                    autoComplete="new-password"
                  />
                </div>
                <div className="settings-form-field">
                  <label className="settings-form-label">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="settings-form-input"
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="settings-form-actions">
                <button type="submit" disabled={loading} className="settings-btn-primary">
                  {loading ? 'Updating...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Admin Users Management Section - Available to all admins */}
        {(userData.role === 'admin' || userData.role === 'superadmin') && (
        <div className="settings-card settings-full-width">
          <div className="settings-card-header">
            <div className="settings-dropdown-header" onClick={() => setIsAdminUsersExpanded(!isAdminUsersExpanded)}>
              <h2 className="settings-card-title">Admin Users Management</h2>
              <span className={`settings-dropdown-arrow ${isAdminUsersExpanded ? 'expanded' : ''}`}>
                <IoMdArrowDropdownCircle size={24} />
              </span>
            </div>
          </div>
          {isAdminUsersExpanded && (
          <>
            <div className="settings-admin-users-stats">
              <div className="settings-admin-users-pattern"></div>
              <div className="settings-stat-item">
                <span className="settings-stat-number">{adminUsers.length}</span>
                <span className="settings-stat-label">Total Admin Users</span>
              </div>
              <div className="settings-stat-item">
                <span className="settings-stat-number">
                  {adminUsers.filter(user => user.role === 'superadmin').length}
                </span>
                <span className="settings-stat-label">Superadmins</span>
              </div>
              <div className="settings-stat-item">
                <span className="settings-stat-number">
                  {adminUsers.filter(user => user.role === 'admin').length}
                </span>
                <span className="settings-stat-label">Admins</span>
              </div>
            </div>
            <div className="settings-card-content">
            {adminUsersLoading ? (
              <div className="settings-log-loading">Loading admin users...</div>
            ) : adminUsers.length === 0 ? (
              <div className="settings-no-logs">No admin users found</div>
            ) : (
              <div className="settings-admin-users-table">
                <div className="settings-admin-users-header">
                  <span>Profile</span>
                  <span>Name</span>
                  <span>Email</span>
                  <span>Role</span>
                  <span>Created</span>
                  <span>Actions</span>
                </div>
                {adminUsers.map(user => (
                  <div key={user.id} className={`settings-admin-user-row ${user.id === userData.id ? 'current-user' : ''}`}>
                    <span className="settings-admin-user-profile">
                      {user.profileImageUrl ? (
                        <img src={user.profileImageUrl} alt="Profile" className="settings-admin-user-avatar" />
                      ) : (
                        <div className="settings-admin-user-avatar-placeholder">
                          {(user.name || user.email || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </span>
                    <span className="settings-admin-user-name">
                      {user.name || 'N/A'}
                      {user.id === userData.id && <span className="settings-current-badge"> (You)</span>}
                    </span>
                    <span className="settings-admin-user-email">{user.email}</span>
                    <span className={`settings-admin-user-role role-${user.role}`}>
                      {user.role === 'superadmin' ? ' SuperAdmin' : ' Admin'}
                    </span>
                    <span className="settings-admin-user-created">
                      {user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                    </span>
                    <span className="settings-admin-user-actions">
                      {user.id !== userData.id && (
                        <button
                          onClick={userData.role === 'superadmin' ? () => handleDeleteUser(user) : undefined}
                          className={`settings-admin-delete-btn ${userData.role === 'admin' ? 'disabled' : ''}`}
                          disabled={loading || userData.role === 'admin'}
                          title={userData.role === 'admin' ? "Delete not allowed for admin users" : `Delete ${user.name || user.email}`}
                          style={{
                            color: userData.role === 'admin' ? '#999' : '',
                            cursor: userData.role === 'admin' ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <MdDeleteForever />
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
            </div>
          </>
          )}
        </div>
        )}

        {/* System Logs & Audit Section - Visible to all admins */}
        {(userData.role === 'admin' || userData.role === 'superadmin') && (
        <div className="settings-card settings-full-width">
          <div className="settings-card-header">
            <div className="audit-logs-header-actions">
              <h2 className="settings-card-title">System Logs & Audit</h2>
              <button 
                onClick={handleExportLogs} 
                className="audit-export-btn"
                disabled={logsLoading || activityLogs.length === 0}
              >
                <PiMicrosoftExcelLogoFill size={24} /> Export to Excel
              </button>
            </div>
          </div>
          <div className="settings-card-content">
            {/* Log Statistics */}
            {logStatistics && (
              <div className="settings-log-stats">
                <div className="settings-stat-item">
                  <span className="settings-stat-number">{logStatistics.totalActivities}</span>
                  <span className="settings-stat-label">Total Activities</span>
                </div>
                <div className="settings-stat-item">
                  <span className="settings-stat-number">{logStatistics.totalErrors}</span>
                  <span className="settings-stat-label">System Errors</span>
                </div>
                <div className="settings-stat-item">
                  <span className="settings-stat-number">{Object.keys(logStatistics.activityByUser || {}).length}</span>
                  <span className="settings-stat-label">Active Users</span>
                </div>
              </div>
            )}

            {/* Filter Controls */}
            <div className="settings-log-filters">
              <div className="settings-filter-row">
                <div className="settings-filter-field">
                  <label>Activity Type</label>
                  <select 
                    value={logFilters.activityType} 
                    onChange={(e) => handleFilterChange('activityType', e.target.value)}
                  >
                    <option value="">All Activities</option>
                    {Object.values(ACTIVITY_TYPES).map(type => (
                      <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div className="settings-filter-field">
                  <label>Severity</label>
                  <select 
                    value={logFilters.severity} 
                    onChange={(e) => handleFilterChange('severity', e.target.value)}
                  >
                    <option value="">All Severities</option>
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="error">Error</option>
                  </select>
                </div>
                <div className="settings-filter-field">
                  <label>Start Date</label>
                  <input 
                    type="date" 
                    value={logFilters.startDate} 
                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  />
                </div>
                <div className="settings-filter-field">
                  <label>End Date</label>
                  <input 
                    type="date" 
                    value={logFilters.endDate} 
                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  />
                </div>
              </div>
              <div className="audit-filter-actions">
                <button 
                  onClick={() => {
                    setLogFilters({ activityType: '', severity: '', startDate: '', endDate: '', limit: 50 });
                  }} 
                  className="audit-clear-filters-btn"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            {/* Activity Logs Content */}
            <div className="settings-log-content">
              {logsLoading ? (
                <div className="settings-log-loading">Loading logs...</div>
              ) : (
                <div className="settings-activity-logs">
                  {activityLogs.length === 0 ? (
                    <div className="settings-no-logs">No activity logs found</div>
                  ) : (
                    <div className="settings-log-table">
                      <div className="settings-log-header">
                        <span>Date/Time</span>
                        <span>User</span>
                        <span>Activity</span>
                        <span>Description</span>
                        <span>Severity</span>
                        <span>Actions</span>
                      </div>
                      {activityLogs.map(log => (
                        <div key={log.id} className={`settings-log-row ${log.severity}`}>
                          <span className="settings-log-date">
                            {log.timestamp.toLocaleString()}
                          </span>
                          <span className="settings-log-user">
                            {log.userName || 'Unknown'}
                          </span>
                          <span className="settings-log-activity">
                            {log.activityType.replace(/_/g, ' ')}
                          </span>
                          <span className="settings-log-description">
                            {log.description}
                          </span>
                          <span className={`settings-log-severity ${log.severity}`}>
                            {log.severity}
                          </span>
                          <span className="settings-log-actions">
                            <button
                              onClick={userData.role === 'superadmin' && userData.isSuperAdmin === true ? () => handleDeleteLog(log.id) : undefined}
                              className={`settings-log-delete-btn ${userData.role === 'admin' && userData.isSuperAdmin !== true ? 'disabled' : ''}`}
                              disabled={loading || (userData.role === 'admin' && userData.isSuperAdmin !== true)}
                              title={userData.role === 'admin' && userData.isSuperAdmin !== true ? "Delete not allowed for admin users" : "Delete log entry"}
                              style={{
                                color: userData.role === 'admin' && userData.isSuperAdmin !== true ? '#999' : '',
                                cursor: userData.role === 'admin' && userData.isSuperAdmin !== true ? 'not-allowed' : 'pointer'
                              }}
                            >
                              <MdDeleteForever />
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        )}

      </div>
    </div>
  );
}

export default Settings;
