import '/src/pages/settings/settings.css';
import Header from '/src/components/HeaderTemplate/header.jsx';
import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '/src/firebase/firebase.js';
import {
  fetchCurrentUserData,
  changeUserPassword,
  uploadProfileImage,
  createImagePreview,
  isValidImageFile,
  getRoleDisplayName,
  updateUsername
} from './settings.js';
import {
  getActivityLogs,
  getErrorLogs,
  exportLogsToCSV,
  getLogStatistics,
  ACTIVITY_TYPES
} from './auditService.js';

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
  const [errorLogs, setErrorLogs] = useState([]);
  const [logStatistics, setLogStatistics] = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [activeLogTab, setActiveLogTab] = useState('activity');
  const [logFilters, setLogFilters] = useState({
    activityType: '',
    severity: '',
    startDate: '',
    endDate: '',
    limit: 50
  });

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

  // System logs functions
  const loadActivityLogs = async () => {
    setLogsLoading(true);
    try {
      const filters = { ...logFilters };
      if (filters.startDate) filters.startDate = new Date(filters.startDate);
      if (filters.endDate) filters.endDate = new Date(filters.endDate);
      
      const logs = await getActivityLogs(filters);
      setActivityLogs(logs);
    } catch (err) {
      setError('Failed to load activity logs: ' + err.message);
    } finally {
      setLogsLoading(false);
    }
  };

  const loadErrorLogs = async () => {
    setLogsLoading(true);
    try {
      const filters = {};
      if (logFilters.startDate) filters.startDate = new Date(logFilters.startDate);
      if (logFilters.endDate) filters.endDate = new Date(logFilters.endDate);
      filters.limit = logFilters.limit;
      
      const logs = await getErrorLogs(filters);
      setErrorLogs(logs);
    } catch (err) {
      setError('Failed to load error logs: ' + err.message);
    } finally {
      setLogsLoading(false);
    }
  };

  const loadLogStatistics = async () => {
    try {
      const startDate = logFilters.startDate ? new Date(logFilters.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const endDate = logFilters.endDate ? new Date(logFilters.endDate) : new Date();
      
      const stats = await getLogStatistics(startDate, endDate);
      setLogStatistics(stats);
    } catch (err) {
      console.error('Failed to load log statistics:', err);
    }
  };

  const handleExportLogs = async () => {
    try {
      const currentDate = new Date().toISOString().split('T')[0];
      if (activeLogTab === 'activity') {
        exportLogsToCSV(activityLogs, `activity-logs-${currentDate}`, 'activity');
        setMessage('Activity logs exported successfully');
      } else if (activeLogTab === 'error') {
        exportLogsToCSV(errorLogs, `error-logs-${currentDate}`, 'error');
        setMessage('Error logs exported successfully');
      }
    } catch (err) {
      setError('Failed to export logs: ' + err.message);
    }
  };

  const handleFilterChange = (field, value) => {
    setLogFilters(prev => ({ ...prev, [field]: value }));
  };

  const applyFilters = () => {
    if (activeLogTab === 'activity') {
      loadActivityLogs();
    } else if (activeLogTab === 'error') {
      loadErrorLogs();
    }
    loadLogStatistics();
  };

  // Load logs when component mounts or tab changes - only for superadmin
  useEffect(() => {
    if (userData && userData.role === 'superadmin' && userData.isSuperAdmin === true) {
      applyFilters();
    }
  }, [activeLogTab, userData]);

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
                      ✏️ Edit
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

        {/* System Logs & Audit Section - Only for superadmin */}
        {userData.role === 'superadmin' && userData.isSuperAdmin === true && (
        <div className="settings-card settings-full-width">
          <div className="settings-card-header">
            <div className="audit-logs-header-actions">
              <h2 className="settings-card-title">System Logs & Audit</h2>
              <button 
                onClick={handleExportLogs} 
                className="audit-export-btn"
                disabled={logsLoading || (activeLogTab === 'activity' ? activityLogs.length === 0 : errorLogs.length === 0)}
              >
                📊 Export {activeLogTab === 'activity' ? 'Activity' : 'Error'} Logs
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
                <button onClick={applyFilters} className="audit-apply-filters-btn" disabled={logsLoading}>
                  {logsLoading ? 'Loading...' : 'Apply Filters'}
                </button>
                <button 
                  onClick={() => {
                    setLogFilters({ activityType: '', severity: '', startDate: '', endDate: '', limit: 50 });
                    setTimeout(applyFilters, 100);
                  }} 
                  className="audit-clear-filters-btn"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            {/* Log Tabs */}
            <div className="settings-log-tabs">
              <button 
                className={`settings-tab ${activeLogTab === 'activity' ? 'active' : ''}`}
                onClick={() => setActiveLogTab('activity')}
              >
                Activity Logs ({activityLogs.length})
              </button>
              <button 
                className={`settings-tab ${activeLogTab === 'error' ? 'active' : ''}`}
                onClick={() => setActiveLogTab('error')}
              >
                Error Reports ({errorLogs.length})
              </button>
            </div>

            {/* Log Content */}
            <div className="settings-log-content">
              {logsLoading ? (
                <div className="settings-log-loading">Loading logs...</div>
              ) : (
                <>
                  {activeLogTab === 'activity' && (
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
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeLogTab === 'error' && (
                    <div className="settings-error-logs">
                      {errorLogs.length === 0 ? (
                        <div className="settings-no-logs">No error reports found</div>
                      ) : (
                        <div className="settings-log-table">
                          <div className="settings-log-header">
                            <span>Date/Time</span>
                            <span>User</span>
                            <span>Error</span>
                            <span>Context</span>
                            <span>URL</span>
                          </div>
                          {errorLogs.map(log => (
                            <div key={log.id} className="settings-log-row error">
                              <span className="settings-log-date">
                                {log.timestamp.toLocaleString()}
                              </span>
                              <span className="settings-log-user">
                                {log.userEmail || 'anonymous'}
                              </span>
                              <span className="settings-log-error">
                                {log.errorMessage}
                              </span>
                              <span className="settings-log-context">
                                {log.context}
                              </span>
                              <span className="settings-log-url">
                                {log.url ? log.url.split('/').pop() : 'N/A'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
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
