import '/src/pages/settings/settings.css';
import Header from '/src/components/HeaderTemplate/header.jsx';
import { MdDeleteForever, MdBackup, MdCloudDownload, MdRestore  } from "react-icons/md";
import { FaDownload, FaMagnifyingGlass } from "react-icons/fa6";
import { MdOutlineSecurity } from "react-icons/md";
import { FaCheckCircle, FaPlusCircle, FaTimesCircle, FaExclamationTriangle, FaCog, FaUpload, FaFolder, FaEye, FaEyeSlash } from "react-icons/fa";
import { PiMicrosoftExcelLogoFill } from "react-icons/pi";
import { RiEdit2Fill } from "react-icons/ri";
import { HiDatabase } from "react-icons/hi";
import { IoSettings, IoWarning  } from "react-icons/io5";
import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '/src/firebase/firebase.js';
import { signupAdmin } from '/src/pages/auth/authService.js';
import {
  fetchCurrentUserData,
  changeUserPassword,
  uploadProfileImage,
  createImagePreview,
  isValidImageFile,
  getRoleDisplayName,
  getVerificationStatusDisplay,
  updateUsername,
  deleteCurrentAccount,
  subscribeToAdminUsers,
  deleteAdminUser,
  changeUserRole
} from './settings.js';
import {
  getActivityLogs,
  exportLogsToCSV,
  getLogStatistics,
  getTotalLogCounts,
  ACTIVITY_TYPES
} from './auditService.js';
import { backupService, BACKUP_COLLECTIONS } from './backupService.js';
import { onSnapshot, collection, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '/src/firebase/firebase.js';

function Settings() {
  // Helper function to safely render values in JSX
// Updated safeRender function to handle all data types safely
const safeRender = (value) => {
  // Handle null/undefined
  if (value === null || value === undefined) return '';
  
  // Handle primitive types that React can render directly
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  
  // Handle Date objects
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  
  // Handle arrays - render each element safely
  if (Array.isArray(value)) {
    return value.map((item, index) => (
      <span key={index} style={{ display: 'block' }}>
        {safeRender(item)}
      </span>
    ));
  }
  
  // Handle objects - convert to readable string format
  if (typeof value === 'object') {
    try {
      // For objects, create a more readable format
      if (Object.keys(value).length === 0) {
        return '{}';
      }
      
      // Create a formatted string representation
      const formatted = Object.entries(value)
        .map(([key, val]) => `${key}: ${JSON.stringify(val)}`)
        .join(', ');
      
      return `{${formatted}}`;
    } catch (error) {
      return '[Object - cannot display]';
    }
  }
  
  // Fallback for any other type
  return String(value);
};

// Format activity log descriptions for better readability
const formatLogDescription = (description) => {
  if (!description) return 'No description available';
  
  // Handle object descriptions (legacy or malformed logs)
  if (typeof description === 'object') {
    try {
      // Try to extract useful info from the object
      if (description.route) {
        return `Deleted schedule: ${description.route} (${description.schedulesCount || 0} trips)`;
      }
      if (description.scheduleId) {
        return `Deleted schedule: ID ${description.scheduleId}`;
      }
      // Fallback for other objects
      return 'Schedule operation completed';
    } catch (error) {
      return 'Schedule operation (details unavailable)';
    }
  }
  
  let formatted = String(description);
  
  // Make descriptions more direct and readable
  formatted = formatted
    // User actions
    .replace(/User successfully changed their password/g, 'Changed password')
    .replace(/User uploaded a new profile picture/g, 'Updated profile picture')
    .replace(/User updated username from "([^"]*)" to "([^"]*)"/g, 'Changed username: $1 → $2')
    .replace(/User updated username from/g, 'Changed username from')
    
    // Admin actions
    .replace(/Admin user "([^"]*)" has been successfully deleted from the system/g, 'Deleted administrator: $1')
    .replace(/Superadmin deleted admin user: ([^(]*) \([^)]*\)/g, 'Deleted administrator: $1')
    .replace(/Superadmin deleted their own account: ([^(]*)/g, 'Deleted own account')
    
    // Backup operations
    .replace(/Created system backup: ([^\s]*)/g, 'Created backup: $1')
    .replace(/Downloaded backup file: ([^\s]*)/g, 'Downloaded: $1')
    .replace(/Deleted backup file: ([^\s]*)/g, 'Deleted backup: $1')
    .replace(/Restored data from backup: ([^\s]*) \(mode: ([^)]*)\)/g, 'Restored from $1 ($2 mode)')
    .replace(/Data restored successfully! (\d+) documents processed/g, 'Successfully restored $1 documents')
    
    // Schedule operations
    .replace(/Deleted trip schedule for ([^(]*) \((\d+) trips\)/g, 'Deleted schedule: $1 ($2 trips)')
    
    // System operations
    .replace(/Cleaned up (\d+) expired backup\(s\)/g, 'Cleaned up $1 expired backups')
    .replace(/Activity log deleted successfully/g, 'Deleted activity log')
    
    // Clean up formatting
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return formatted;
};

  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('account');
  const [adminTab, setAdminTab] = useState('logs'); // 'logs', 'users', or 'backup'
  const [userData, setUserData] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
  const [totalLogCounts, setTotalLogCounts] = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFilters, setLogFilters] = useState({
    activityType: '',
    severity: '',
    date: '',
    limit: 50
  });
  
  // Store unsubscribe function for cleanup
  const [activityLogsUnsubscribe, setActivityLogsUnsubscribe] = useState(null);

  // Bulk selection states for activity logs
  const [selectedLogs, setSelectedLogs] = useState(new Set());
  const [isLogSelectMode, setIsLogSelectMode] = useState(false);
  
  // Admin users management state (superadmin only)
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersUnsubscribe, setAdminUsersUnsubscribe] = useState(null);
  const [isAdminUsersExpanded, setIsAdminUsersExpanded] = useState(false);

  // Admin registration modal state (superadmin only)
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerFormData, setRegisterFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    role: 'admin'
  });
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);

  // Backup system state (superadmin only)
  const [isBackupExpanded, setIsBackupExpanded] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [backupFiles, setBackupFiles] = useState([]);
  const [backupFilesLoading, setBackupFilesLoading] = useState(false);
  const [backupProgress, setBackupProgress] = useState(null);

  // Restore system state
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedBackupFile, setSelectedBackupFile] = useState(null);
  const [restoreMode, setRestoreMode] = useState('missing_only');
  const [restoreProgress, setRestoreProgress] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showRestoreConfirmation, setShowRestoreConfirmation] = useState(false);
  const [restoreConfirmationText, setRestoreConfirmationText] = useState('');
  const [uploadedBackupFile, setUploadedBackupFile] = useState(null);

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
      alert('Password changed successfully!');
      
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
      alert('Username updated successfully!');
      
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
      <IoWarning size={20}/> +
      ' Are you sure you want to delete this log entry? This action cannot be undone.'
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

      // Refresh total counts after deletion
      fetchTotalLogCounts();

      setMessage('Activity log deleted successfully');
    } catch (err) {
      setError('Failed to delete log: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Bulk selection handlers for activity logs
  const toggleLogSelectMode = () => {
    setIsLogSelectMode(!isLogSelectMode);
    setSelectedLogs(new Set());
  };

  const toggleLogSelection = (logId) => {
    const newSelection = new Set(selectedLogs);
    if (newSelection.has(logId)) {
      newSelection.delete(logId);
    } else {
      newSelection.add(logId);
    }
    setSelectedLogs(newSelection);
  };

  const selectAllLogs = () => {
    const allLogIds = new Set(activityLogs.map(log => log.id));
    setSelectedLogs(allLogIds);
  };

  const deselectAllLogs = () => {
    setSelectedLogs(new Set());
  };

  const handleBulkDeleteLogs = async () => {
    // Check if user is authorized
    if (userData.role === 'admin' && userData.isSuperAdmin !== true) {
      setError('Only superadmin users can delete activity logs.');
      return;
    }

    if (selectedLogs.size === 0) {
      alert('Please select logs to delete.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedLogs.size} selected log entries? This action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Import the delete function
      const { deleteDoc, doc } = await import('firebase/firestore');
      const { db } = await import('/src/firebase/firebase.js');

      const deletePromises = Array.from(selectedLogs).map(logId => {
        return deleteDoc(doc(db, 'AuditLogs', logId));
      });

      await Promise.all(deletePromises);

      // Clear selections
      setSelectedLogs(new Set());
      setIsLogSelectMode(false);

      // Refresh total counts after bulk deletion
      fetchTotalLogCounts();

      setMessage(`Successfully deleted ${selectedLogs.size} activity log entries`);
    } catch (error) {
      console.error('Error in bulk delete logs:', error);
      setError('Failed to delete some log entries: ' + error.message);
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
      let constraints = [];

      // Simplify query to avoid complex index requirements
      // Use only timestamp ordering for now, apply filters client-side
      if (logFilters.date) {
        // If date filter is applied, use it as the primary filter
        const selectedDate = new Date(logFilters.date);
        const startOfDay = new Date(selectedDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(selectedDate.setHours(23, 59, 59, 999));
        constraints = [
          where('timestamp', '>=', startOfDay),
          where('timestamp', '<=', endOfDay),
          orderBy('timestamp', 'desc')
        ];
      } else if (logFilters.activityType && !logFilters.date) {
        // If only activity type filter (no date), use activityType + timestamp
        constraints = [
          where('activityType', '==', logFilters.activityType),
          orderBy('timestamp', 'desc')
        ];
      } else {
        // Default: just order by timestamp
        constraints = [orderBy('timestamp', 'desc')];
      }

      // Use user-selected limit, with a reasonable maximum for performance
      const queryLimit = Math.min(logFilters.limit || 50, 1000);
      constraints.push(limit(queryLimit));
      q = query(q, ...constraints);

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        let logs = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Ensure severity field exists with fallback to 'info'
            severity: data.severity || 'info',
            timestamp: data.timestamp?.toDate() || new Date()
          };
        });

        // Apply client-side filters for reliability and to avoid complex index requirements

        // Filter by activity type (if not already filtered by Firestore)
        if (logFilters.activityType && logFilters.date) {
          // When both date and activity type filters are active, activityType is filtered client-side
          logs = logs.filter(log => log.activityType === logFilters.activityType);
        }

        // Filter by severity
        if (logFilters.severity) {
          logs = logs.filter(log => {
            const logSeverity = log.severity || 'info';
            return logSeverity === logFilters.severity;
          });
        }

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


  // Fetch total log counts (no filters)
  const fetchTotalLogCounts = async () => {
    try {
      const counts = await getTotalLogCounts();
      setTotalLogCounts(counts);
    } catch (error) {
      console.error('Error fetching total log counts:', error);
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
        selectedDate: logFilters.date ? new Date(logFilters.date) : null
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
    // Refresh total counts when filters change to ensure accuracy
    if (userData && (userData.role === 'admin' || userData.role === 'superadmin')) {
      fetchTotalLogCounts();
    }
  };

  // Admin registration handlers
  const handleRegisterInputChange = (field, value) => {
    setRegisterFormData(prev => ({ ...prev, [field]: value }));
    setRegisterError('');
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegisterError('');

    // Validation
    if (registerFormData.password !== registerFormData.confirmPassword) {
      setRegisterError('Passwords do not match');
      return;
    }

    if (registerFormData.password.length < 6) {
      setRegisterError('Password must be at least 6 characters');
      return;
    }

    if (!registerFormData.firstName || !registerFormData.lastName) {
      setRegisterError('First name and last name are required');
      return;
    }

    try {
      setRegisterLoading(true);
      const name = `${registerFormData.firstName} ${registerFormData.lastName}`;

      await signupAdmin({
        name,
        email: registerFormData.email,
        password: registerFormData.password,
        role: registerFormData.role
      });

      // Reset form and close modal
      setRegisterFormData({
        email: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        lastName: '',
        role: 'admin'
      });
      setShowRegisterPassword(false);
      setShowRegisterConfirmPassword(false);
      setShowRegisterModal(false);
      setMessage('Admin user registered successfully.');

      // Refresh admin users list
      setupAdminUsersListener();
    } catch (err) {
      setRegisterError(err.message || 'Failed to register admin user');
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleCloseRegisterModal = () => {
    setShowRegisterModal(false);
    setRegisterFormData({
      email: '',
      password: '',
      confirmPassword: '',
      firstName: '',
      lastName: '',
      role: 'admin'
    });
    setRegisterError('');
    setShowRegisterPassword(false);
    setShowRegisterConfirmPassword(false);
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
      `Are you sure you want to delete admin user "${user.name || user.email}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      await deleteAdminUser(user.id, user.email, user.name);
      setMessage(<><FaCheckCircle style={{ color: 'green', marginRight: '8px' }} />Admin user "{user.name || user.email}" has been successfully deleted from the system.</>);
    } catch (err) {
      setError(`Failed to delete admin user: ${err.message}. Please try again or contact support if the issue persists.`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle role change
  const handleRoleChange = useCallback(async (userId, newRole) => {
    // Prevent user from changing their own role
    if (userData && userId === userData.id) {
      setError('You cannot change your own role.');
      return;
    }
    
    const confirmed = window.confirm(
      `Are you sure you want to change this user's role to ${newRole.toUpperCase()}?`
    );
    
    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      await changeUserRole(userId, newRole);
      setMessage(`Successfully changed user role to ${newRole}`);
    } catch (err) {
      setError(`Failed to change role: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [userData]);

  // Load logs when component mounts - for all admins
  useEffect(() => {
    if (userData && (userData.role === 'admin' || userData.role === 'superadmin')) {
      applyFilters();
      fetchTotalLogCounts();
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

  // Auto-clear error and success messages after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

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

  // Backup handlers
  const handleCollectionToggle = (collectionName) => {
    setSelectedCollections(prev => 
      prev.includes(collectionName) 
        ? prev.filter(name => name !== collectionName)
        : [...prev, collectionName]
    );
  };

  const handleSelectAllCollections = () => {
    if (selectedCollections.length === Object.keys(BACKUP_COLLECTIONS).length) {
      setSelectedCollections([]);
    } else {
      setSelectedCollections(Object.keys(BACKUP_COLLECTIONS));
    }
  };

  const handleCreateBackup = async () => {
    if (selectedCollections.length === 0) {
      setError('Please select at least one collection to backup');
      return;
    }

    setBackupLoading(true);
    setBackupProgress({ percentage: 0, message: 'Starting backup...' });
    setError('');
    setMessage('');

    try {
      const result = await backupService.createBackup(
        selectedCollections, 
        null, // default backup name
        (progress) => {
          // Update progress state, but don't override completed state
          setBackupProgress(current => {
            if (current?.completed) return current; // Don't override completed state
            return progress;
          });
        }
      );
      
      if (result.success) {
        // Set final success state
        setBackupProgress({
          percentage: 100,
          message: `Backup Created: ${result.fileName}`,
          completed: true,
          fileName: result.fileName
        });
        
        setMessage(`Backup created successfully! File: ${result.fileName}`);
        setSelectedCollections([]);
        // Refresh backup files list
        loadBackupFiles();
        setBackupLoading(false);
      } else {
        setError(`Failed to create backup: ${result.error}`);
        setBackupProgress(null);
        setBackupLoading(false);
      }
    } catch (err) {
      setError(`Failed to create backup: ${err.message}`);
      setBackupProgress(null);
      setBackupLoading(false);
    }
  };

  const handleCloseBackupProgress = () => {
    setBackupProgress(null);
  };

  const handleDownloadBackup = async (fileName) => {
    try {
      const result = await backupService.downloadBackup(fileName);
      if (result.success) {
        setMessage(`Backup downloaded successfully!`);
      } else {
        setError(`Failed to download backup: ${result.error}`);
      }
    } catch (err) {
      setError(`Failed to download backup: ${err.message}`);
    }
  };

  const handleDeleteBackup = async (backupId, fileName) => {
    const confirmed = window.confirm(
      <IoWarning size={20}/> +
      ` Are you sure you want to delete backup "${fileName}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      const result = await backupService.deleteBackup(backupId);
      if (result.success) {
        setMessage(`Backup deleted successfully!`);
        // Refresh backup files list
        loadBackupFiles();
      } else {
        setError(`Failed to delete backup: ${result.error}`);
      }
    } catch (err) {
      setError(`Failed to delete backup: ${err.message}`);
    }
  };

  const loadBackupFiles = async () => {
    setBackupFilesLoading(true);
    try {
      // First, cleanup expired backups automatically
      await backupService.cleanupExpiredBackups();

      // Then load the remaining backups
      const result = await backupService.listBackups();
      if (result.success) {
        setBackupFiles(result.backups || []);
      } else {
        setError(`Failed to load backup files: ${result.error}`);
        setBackupFiles([]);
      }
    } catch (err) {
      setError(`Failed to load backup files: ${err.message}`);
      setBackupFiles([]);
    } finally {
      setBackupFilesLoading(false);
    }
  };

  // Load backup files when backup tab is active
  useEffect(() => {
    if (adminTab === 'backup' && userData?.role === 'superadmin') {
      loadBackupFiles();
    }
  }, [adminTab, userData]);

  // Restore handlers
  const handleRestoreClick = (file, event) => {
    setSelectedBackupFile(file);
    
    // Calculate position relative to the clicked button
    if (event && event.target) {
      const buttonRect = event.target.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      
      // Position modal near the button (with some offset)
      const modalTop = Math.max(50, buttonRect.top + scrollTop - 100);
      
      // Set CSS custom property for modal positioning
      document.documentElement.style.setProperty('--restore-modal-top', `${modalTop}px`);
    }
    
    setShowRestoreModal(true);
  };

  const handleRestoreConfirm = () => {
    setShowRestoreModal(false);
    setShowRestoreConfirmation(true);
  };

  const handleRestoreCancel = () => {
    setShowRestoreModal(false);
    setSelectedBackupFile(null);
    setRestoreMode('missing_only');
    setRestoreConfirmationText('');
  };

  const handleRestoreExecute = async () => {
    setShowRestoreConfirmation(false);
    setIsRestoring(true);
    setRestoreProgress({
      phase: 'initializing',
      totalConductors: 0,
      processedConductors: 0,
      totalSubcollections: 0,
      processedSubcollections: 0,
      totalDocuments: 0,
      processedDocuments: 0,
      errors: [],
      currentConductor: null,
      currentCollection: null,
      startTime: Date.now(),
      estimatedTimeRemaining: null
    });

    try {
      // Determine which backup file to use - prioritize uploaded file
      const backupFileToUse = uploadedBackupFile || selectedBackupFile;
      
      if (!backupFileToUse) {
        throw new Error('No backup file selected or uploaded');
      }
      
      // Use the real restore logic from backupService
      const result = await backupService.restoreFromBackup(backupFileToUse, {
        mode: restoreMode,
        progressCallback: (progress) => setRestoreProgress(progress)
      });
      
      if (result.success) {
        // Force 100% completion when restore is successful
        setRestoreProgress(prev => ({
          ...prev,
          phase: 'completed',
          processedDocuments: prev.totalDocuments,
          currentCollection: 'Restore completed successfully!'
        }));
        
        // Clear the uploaded backup file after successful restore
        setUploadedBackupFile(null);
        
        const docsRestored = typeof result.documentsRestored === 'number' ? result.documentsRestored : 'unknown';
        setMessage(`Data restored successfully! ${docsRestored} documents processed.`);
        if (result.errors && result.errors.length > 0) {
          setError(`Warning: Restore completed with ${result.errors.length} errors. Check the error log for details.`);
        }
      } else {
        const errorMsg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
        throw new Error(errorMsg);
      }
      
      setTimeout(() => {
        setIsRestoring(false);
        setRestoreProgress(null);
        setSelectedBackupFile(null);
      }, 3000);
      
    } catch (err) {
      setError(`Restore failed: ${err.message}`);
      setIsRestoring(false);
      setRestoreProgress(null);
    }
  };


  const handleRestoreCancelProgress = () => {
    // TODO: Implement cancel logic
    setIsRestoring(false);
    setRestoreProgress(null);
    setError('Restore operation cancelled');
  };

  // Upload backup file handlers
  const handleUploadBackupFile = async (file) => {
    try {
      setError('');
      setMessage('');

      const result = await backupService.parseUploadedBackup(file);
      if (!result.success) {
        throw new Error(result.error);
      }

      const uploadedData = result.data;
      const backupInfo = {
        fileName: file.name,
        createdAt: uploadedData.metadata?.createdAt || new Date().toISOString(),
        collections: uploadedData.metadata?.collections || [],
        totalDocuments: Object.values(uploadedData.data || {}).reduce((sum, collection) => {
          return sum + (collection.count || collection.documents?.length || 0);
        }, 0),
        uploadedData: uploadedData
      };

      setUploadedBackupFile(backupInfo);
      setSelectedBackupFile(backupInfo);
      setMessage(`Backup file "${file.name}" loaded successfully! Click restore to proceed.`);
    } catch (error) {
      setError(`Failed to upload backup file: ${error.message}`);
    }
  };

  const handleFileInputChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
        setError('Please select a JSON backup file');
        return;
      }
      handleUploadBackupFile(file);
    }
  };


  if (authLoading || !userData) {
    return <div className="settings-loading-container">Loading...</div>;
  }

  return (
    <div className="settings-container">
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
                    <span className="settings-info-value">{safeRender(userData.name)}</span>
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
                <span className="settings-info-value">{safeRender(userData.email)}</span>
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
                <div className="password-input-container">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="settings-form-input"
                    placeholder="Enter current password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                  >
                    {showCurrentPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>
              <div className="settings-form-row">
                <div className="settings-form-field">
                  <label className="settings-form-label">New Password</label>
                  <div className="password-input-container">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      className="settings-form-input"
                      placeholder="Enter new password"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
                </div>
                <div className="settings-form-field">
                  <label className="settings-form-label">Confirm New Password</label>
                  <div className="password-input-container">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="settings-form-input"
                      placeholder="Confirm new password"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
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

        {/* System Management Section - Available to all admins */}
        {(userData.role === 'admin' || userData.role === 'superadmin') && (
        <div className="settings-card settings-full-width">
          <div className="settings-card-header">
            <h2 className="settings-card-title">System Management</h2>
          </div>
          <div className="settings-card-content">
            {/* Tab buttons */}
            <div className="admin-tab-buttons">
              <button
                type="button"
                className={`admin-tab-button ${adminTab === 'logs' ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setAdminTab('logs');
                }}
                disabled={loading}
              >
                System Logs
              </button>
              <button
                type="button"
                className={`admin-tab-button ${adminTab === 'users' ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setAdminTab('users');
                }}
                disabled={loading}
              >
                Admin Users
              </button>
              {userData.role === 'superadmin' && (
                <button
                  type="button"
                  className={`admin-tab-button ${adminTab === 'backup' ? 'active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setAdminTab('backup');
                  }}
                  disabled={loading}
                >
                  Data Backup
                </button>
              )}
            </div>

            {/* Admin Users Tab Content */}
            {adminTab === 'users' && (
              <div className="admin-users-tab">
                {/* Register New Admin Button (Superadmin Only) */}
                {userData.role === 'superadmin' && (
                  <div className="settings-register-button-container">
                    <button
                      onClick={() => setShowRegisterModal(true)}
                      className="settings-register-admin-button"
                    >
                      <FaPlusCircle />
                      Register New Admin
                    </button>
                  </div>
                )}

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

                {/* Error and Success Messages */}
                {error && (
                  <div className="settings-error-message" style={{
                    backgroundColor: '#fee',
                    color: '#c00',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    border: '1px solid #fcc',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <FaExclamationTriangle />
                    {error}
                  </div>
                )}
                {message && (
                  <div className="settings-success-message" style={{
                    backgroundColor: '#efe',
                    color: '#060',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    border: '1px solid #cfc',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    {message}
                  </div>
                )}

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
                      <span>Verification</span>
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
                        <span className="settings-admin-user-email">{safeRender(user.email)}</span>
                        <span className="settings-admin-user-role">
                          {/* Show verification buttons ONLY for truly pending users (not already admin/superadmin) */}
                          {userData.role === 'superadmin' && 
                           user.id !== userData.id &&
                           user.role !== 'admin' && 
                           user.role !== 'superadmin' &&
                           (user.verificationStatus === 'pending' || (!user.verificationStatus && !user.isVerified)) ? (
                            <div className="settings-role-verification-buttons">
                              <button
                                onClick={() => handleVerifyUser(user.id, 'admin')}
                                className="settings-verify-admin-btn"
                                disabled={loading}
                                title="Verify as Admin"
                              >
                                ✓ Admin
                              </button>
                              <button
                                onClick={() => handleVerifyUser(user.id, 'superadmin')}
                                className="settings-verify-superadmin-btn"
                                disabled={loading}
                                title="Verify as SuperAdmin"
                              >
                                ✓ Super
                              </button>
                            </div>
                          ) : (
                            // Show dropdown for role change (superadmin only) or styled display for others
                            userData.role === 'superadmin' && (user.role === 'admin' || user.role === 'superadmin') ? (
                              <select 
                                value={user.role}
                                onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                className="settings-role-dropdown"
                                data-role={user.role}
                                disabled={loading || (userData && user.id === userData.id)}
                                title={(userData && user.id === userData.id) ? "Cannot change your own role" : "Click to change role"}
                              >
                                <option value="admin">Admin</option>
                                <option value="superadmin">SuperAdmin</option>
                              </select>
                            ) : (
                              <span className={`settings-role-display role-${user.role || 'undefined'}`}>
                                {user.role === 'superadmin' ? 'SuperAdmin' : user.role === 'admin' ? 'Admin' : 'Pending Verification'}
                              </span>
                            )
                          )}
                        </span>
                        <div style={{ textAlign: 'center', width: '100%' }}>
                          <span className={`settings-admin-user-verification verification-${user.verificationStatus || (user.role === 'admin' || user.role === 'superadmin' ? 'verified' : (user.isVerified ? 'verified' : 'pending'))}`}>
                            {getVerificationStatusDisplay(user)}
                          </span>
                        </div>
                        <span className="settings-admin-user-created">
                          {user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                        </span>
                        <span className="settings-admin-user-actions">
                          {user.id !== userData.id && (
                            <>
                              {/* Reject button ONLY for truly pending users (not already admin/superadmin) */}
                              {user.role !== 'admin' && 
                               user.role !== 'superadmin' &&
                               (user.verificationStatus === 'pending' || (!user.verificationStatus && !user.isVerified)) && (
                                <button
                                  onClick={userData.role === 'superadmin' ? () => handleRejectUser(user.id) : undefined}
                                  className={`settings-reject-btn ${userData.role !== 'superadmin' ? 'disabled' : ''}`}
                                  disabled={loading || userData.role !== 'superadmin'}
                                  title={userData.role === 'superadmin' ? "Reject verification" : "Only superadmin can perform this action"}
                                >
                                  ✗ Reject
                                </button>
                              )}
                              
                              {/* Delete button for all users */}
                              <button
                                onClick={userData.role === 'superadmin' ? () => handleDeleteUser(user) : undefined}
                                className={`settings-admin-delete-btn ${userData.role !== 'superadmin' ? 'disabled' : ''}`}
                                disabled={loading || userData.role !== 'superadmin'}
                                title={userData.role === 'superadmin' ? `Delete ${user.name || user.email}` : "Only superadmin can perform this action"}
                              >
                                <MdDeleteForever />
                              </button>
                            </>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* System Logs Tab Content */}
            {adminTab === 'logs' && (
              <div className="system-logs-tab">
                {/* Log Statistics */}
                <div className="settings-log-stats">
                  <div className="settings-stat-item">
                    <span className="settings-stat-number">
                      {totalLogCounts ? totalLogCounts.totalActivities : (logStatistics?.totalActivities || 0)}
                    </span>
                    <span className="settings-stat-label">Total Activities</span>
                    {logStatistics && logFilters && (logFilters.activityType || logFilters.severity || logFilters.date) && (
                      <span className="settings-stat-sublabel">({logStatistics.totalActivities} filtered)</span>
                    )}
                  </div>
                  <div className="settings-stat-item">
                    <span className="settings-stat-number">
                      {totalLogCounts ? totalLogCounts.totalActivityErrors : (logStatistics?.totalErrors || 0)}
                    </span>
                    <span className="settings-stat-label">System Errors</span>
                    {logStatistics && logFilters && (logFilters.activityType || logFilters.severity || logFilters.date) && (
                      <span className="settings-stat-sublabel">({logStatistics.totalErrors} filtered)</span>
                    )}
                  </div>
                  <div className="settings-stat-item">
                    <span className="settings-stat-number">
                      {logStatistics ? Object.keys(logStatistics.activityByUser || {}).length : 0}
                    </span>
                    <span className="settings-stat-label">Active Users</span>
                    {logStatistics && logFilters && (logFilters.activityType || logFilters.severity || logFilters.date) && (
                      <span className="settings-stat-sublabel">(filtered view)</span>
                    )}
                  </div>
                </div>

                <div className="audit-logs-header-actions">
                  <button
                    onClick={handleExportLogs}
                    className="audit-export-btn"
                    disabled={logsLoading || activityLogs.length === 0}
                  >
                    <PiMicrosoftExcelLogoFill size={24} /> Export to Excel
                  </button>

                  {/* Bulk Select Button - Only for superadmin */}
                  {userData.role === 'superadmin' && userData.isSuperAdmin === true && activityLogs.length > 0 && (
                    <button
                      onClick={toggleLogSelectMode}
                      className={`settings-btn ${isLogSelectMode ? 'settings-btn-secondary' : 'settings-btn-primary'}`}
                      disabled={logsLoading}
                    >
                      {isLogSelectMode ? 'Cancel Select' : 'Select Logs'}
                    </button>
                  )}
                </div>

                {/* Bulk Actions Bar */}
                {isLogSelectMode && (
                  <div className="settings-bulk-actions-bar" style={{
                    background: '#f8f9fa',
                    padding: '15px 20px',
                    margin: '10px 0',
                    borderRadius: '8px',
                    border: '1px solid #e9ecef',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <span style={{ fontWeight: '600', color: '#2c3e50' }}>
                        {selectedLogs.size} of {activityLogs.length} selected
                      </span>
                      <button
                        onClick={selectAllLogs}
                        className="settings-btn settings-btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '14px' }}
                      >
                        Select All
                      </button>
                      <button
                        onClick={deselectAllLogs}
                        className="settings-btn settings-btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '14px' }}
                      >
                        Deselect All
                      </button>
                    </div>

                    <button
                      onClick={handleBulkDeleteLogs}
                      className="settings-btn settings-btn-danger"
                      disabled={selectedLogs.size === 0}
                      style={{
                        padding: '8px 16px',
                        fontSize: '14px',
                        opacity: selectedLogs.size === 0 ? 0.6 : 1,
                        cursor: selectedLogs.size === 0 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <MdDeleteForever size={16} style={{ marginRight: '4px' }} />
                      Delete Selected ({selectedLogs.size})
                    </button>
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
                      <label>Filter by Date</label>
                      <input
                        type="date"
                        value={logFilters.date}
                        onChange={(e) => handleFilterChange('date', e.target.value)}
                      />
                    </div>
                    <div className="settings-filter-field">
                      <label>Show</label>
                      <select
                        value={logFilters.limit}
                        onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
                      >
                        <option value={25}>25 logs</option>
                        <option value={50}>50 logs</option>
                        <option value={100}>100 logs</option>
                        <option value={200}>200 logs</option>
                        <option value={500}>500 logs</option>
                      </select>
                    </div>
                  </div>
                  <div className="audit-filter-actions">
                    <button 
                      onClick={() => {
                        setLogFilters({ activityType: '', severity: '', date: '', limit: 50 });
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
                            <div
                              key={log.id}
                              className={`settings-log-row ${log.severity} ${isLogSelectMode ? 'selectable' : ''} ${selectedLogs.has(log.id) ? 'selected' : ''}`}
                              style={{
                                border: selectedLogs.has(log.id) ? '2px solid #007bff' : '',
                                backgroundColor: selectedLogs.has(log.id) ? '#f8f9ff' : '',
                                position: 'relative'
                              }}
                            >
                              {/* Checkbox for selection mode */}
                              {isLogSelectMode && (
                                <span className="settings-log-checkbox" style={{
                                  position: 'absolute',
                                  left: '10px',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  zIndex: 10
                                }}>
                                  <input
                                    type="checkbox"
                                    checked={selectedLogs.has(log.id)}
                                    onChange={() => toggleLogSelection(log.id)}
                                    style={{
                                      width: '16px',
                                      height: '16px',
                                      cursor: 'pointer'
                                    }}
                                  />
                                </span>
                              )}
                              <span
                                className="settings-log-date"
                                style={{ paddingLeft: isLogSelectMode ? '35px' : '12px' }}
                              >
                                {log.timestamp.toLocaleString()}
                              </span>
                              <span className="settings-log-user">
                                {log.userName || 'Unknown'}
                              </span>
                              <span className="settings-log-activity">
                                {log.activityType.replace(/_/g, ' ')}
                              </span>
                              <span className="settings-log-description">
                                {formatLogDescription(log.description)}
                              </span>
                              <span className={`settings-log-severity ${log.severity}`}>
                                {log.severity}
                              </span>
                              <span className="settings-log-actions">
                                {!isLogSelectMode && (
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
                                )}
                                {isLogSelectMode && (
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#6c757d',
                                    fontStyle: 'italic',
                                    fontSize: '12px'
                                  }}>
                                    Use checkboxes
                                  </div>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Data Backup Tab Content */}
            {adminTab === 'backup' && userData.role === 'superadmin' && (
              <div className="data-backup-tab">
                <div className="backup-stats-container">
                  <div className="backup-pattern"></div>
                  <div className="backup-stat-item">
                    <span className="backup-stat-number">{backupFiles.length}</span>
                    <span className="backup-stat-label">Available Backups</span>
                  </div>
                  <div className="backup-stat-item">
                    <span className="backup-stat-number">{Object.keys(BACKUP_COLLECTIONS).length}</span>
                    <span className="backup-stat-label">Data Collections</span>
                  </div>
                  <div className="backup-stat-item">
                    <span className="backup-stat-number">30</span>
                    <span className="backup-stat-label">Days Auto-Delete</span>
                  </div>
                </div>

                {/* Create New Backup Section */}
                <div className="backup-section">
                  <div className="backup-section-header">
                    <MdBackup size={24} />
                    <h3>Create New Backup</h3>
                  </div>
                  <div className="backup-collections-grid">
                    <div className="backup-collections-header">
                      <span>Select Collections to Backup:</span>
                      <button 
                        onClick={handleSelectAllCollections}
                        className="backup-select-all-btn"
                        disabled={backupLoading}
                      >
                        {selectedCollections.length === Object.keys(BACKUP_COLLECTIONS).length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    {Object.entries(BACKUP_COLLECTIONS).map(([key, config]) => (
                      <label key={key} className="backup-collection-item">
                        <input
                          type="checkbox"
                          checked={selectedCollections.includes(key)}
                          onChange={() => handleCollectionToggle(key)}
                          disabled={backupLoading}
                          className="backup-checkbox"
                        />
                        <div className="backup-collection-info">
                          <div className="backup-collection-icon">
                            <HiDatabase size={20} />
                          </div>
                          <div className="backup-collection-details">
                            <span className="backup-collection-name">{config.name}</span>
                            <span className="backup-collection-description">{config.description}</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="backup-create-actions">
                    {backupProgress && (
                      <div className="backup-progress-container">
                        <div className="backup-progress-header">
                          <div className="backup-progress-info">
                            <span>{backupProgress.message}</span>
                            <span>{backupProgress.percentage}%</span>
                          </div>
                          {backupProgress.completed && (
                            <button 
                              onClick={handleCloseBackupProgress} 
                              className="backup-progress-close"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <div className="backup-progress-bar">
                          <div 
                            className="backup-progress-fill"
                            style={{ width: `${backupProgress.percentage}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <button
                      onClick={handleCreateBackup}
                      disabled={backupLoading || selectedCollections.length === 0}
                      className="backup-create-btn"
                    >
                      {backupLoading ? (
                        <>
                          <div className="backup-loading-spinner"></div>
                          Creating Backup...
                        </>
                      ) : (
                        <>
                          <MdBackup size={20} />
                          Create Backup ({selectedCollections.length} selected)
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Existing Backups Section */}
                <div className="backup-section">
                  <div className="backup-section-header">
                    <MdCloudDownload size={24} />
                    <h3>Backup Files Management</h3>
                  </div>
                  {backupFilesLoading ? (
                    <div className="backup-loading">Loading backup files...</div>
                  ) : backupFiles.length === 0 ? (
                    <div className="backup-empty-state">
                      <HiDatabase size={48} />
                      <p>No backup files found</p>
                      <span>Create your first backup using the section above</span>
                    </div>
                  ) : (
                    <div className="backup-files-table">
                      <div className="backup-files-header">
                        <span>Filename</span>
                        <span>Collections</span>
                        <span>Created</span>
                        <span>Size</span>
                        <span>Expires</span>
                        <span>Actions</span>
                      </div>
                      {backupFiles.map(file => {
                        const createdDate = new Date(file.createdAt);
                        const expiresDate = new Date(file.expiresAt);
                        const now = new Date();
                        const isExpired = expiresDate <= now;
                        const daysUntilExpiry = Math.ceil((expiresDate - now) / (24 * 60 * 60 * 1000));
                        const isExpiringSoon = !isExpired && daysUntilExpiry <= 7 && daysUntilExpiry > 0; // 7 days or less but not expired
                        const fileSizeKB = Math.round((file.fileSizeBytes || 0) / 1024);

                        // Skip rendering expired files (they should be auto-deleted)
                        if (isExpired) return null;

                        return (
                          <div key={file.id || file.backupId} className={`backup-file-row ${isExpiringSoon ? 'expiring-soon' : ''}`}>
                            <span className="backup-file-name">
                              <HiDatabase size={16} />
                              {file.fileName}
                            </span>
                            <span className="backup-file-collections">
                              <div className="backup-collections-tags">
                                {(file.collections || []).map(collection => (
                                  <span key={collection} className="backup-collection-tag">
                                    {BACKUP_COLLECTIONS[collection.toUpperCase()]?.name || collection}
                                  </span>
                                ))}
                              </div>
                            </span>
                            <span className="backup-file-created">
                              {createdDate.toLocaleDateString()}
                              <br />
                              <small>{createdDate.toLocaleTimeString()}</small>
                            </span>
                            <span className="backup-file-size">{fileSizeKB} KB</span>
                            <span className={`backup-file-expires ${isExpiringSoon ? 'expiring' : ''}`}>
                              {expiresDate.toLocaleDateString()}
                              {isExpiringSoon && <span className="backup-expiring-badge">Soon</span>}
                            </span>
                            <span className="backup-file-actions">
                              <button
                                onClick={() => handleDownloadBackup(file.fileName)}
                                className="backup-download-btn"
                                title="Download backup file"
                                disabled={isRestoring}
                              >
                                <FaDownload size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteBackup(file.id || file.backupId, file.fileName)}
                                className="backup-delete-btn"
                                title="Delete backup from storage"
                                disabled={isRestoring}
                              >
                                <MdDeleteForever size={18} />
                              </button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Restore and Upload Grid */}
                <div className="backup-grid">
                  {/* Restore Data Section */}
                  <div className="backup-section">
                    <div className="backup-section-header">
                      <h3>Restore Data from Backup</h3>
                    </div>
                    <div className="restore-info-container">
                      {!uploadedBackupFile && (
                        <>
                          <p>To restore data from a backup file:</p>
                          <ol className="restore-steps">
                            <li>Download a backup file from below</li>
                            <li>Upload it using the section on the right</li>
                            <li>Choose your restore mode and click "Restore"</li>
                          </ol>
                        </>
                      )}
                      {uploadedBackupFile && (
                        <div className="restore-ready-notice">
                          <div className="restore-ready-header">
                            <span><FaCheckCircle style={{ marginRight: '8px' }} /> Ready to Restore</span>
                            <button 
                              onClick={() => {
                                setUploadedBackupFile(null);
                                setMessage(<><FaUpload style={{ marginRight: '8px' }} />Uploaded backup file cleared.</>);
                              }}
                              className="clear-uploaded-btn"
                            >
                              Clear
                            </button>
                          </div>
                          <div className="restore-ready-details">
                            <span>File: {uploadedBackupFile.fileName}</span>
                            <span>Collections: {uploadedBackupFile.collections?.length || 0}</span>
                            <span>Documents: ~{uploadedBackupFile.totalDocuments || 0}</span>
                          </div>
                          <button 
                            onClick={() => setShowRestoreModal(true)}
                            className="restore-execute-btn"
                            disabled={isRestoring}
                          >
                            <MdRestore size={18} />
                            Restore Now
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Upload Backup File Section */}
                  <div className="backup-section">
                    <div className="backup-section-header">
                      <MdBackup size={24} />
                      <h3>Upload Backup File</h3>
                    </div>
                    <div className="backup-upload-container">
                      <p>Select a backup JSON file from your computer:</p>
                      <div className="backup-upload-actions">
                        {/* Inline File Upload */}
                        <div className="backup-upload-input-container">
                          <input
                            type="file"
                            accept=".json"
                            onChange={handleFileInputChange}
                            className="backup-upload-input"
                            id="backup-file-input"
                          />
                          <label htmlFor="backup-file-input" className="backup-upload-label">
                            <MdRestore size={20} />
                            Choose JSON Backup File
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Backup Info Section */}
                <div className="backup-info-section">
                  <div className="backup-info-card">
                    <h4><MdOutlineSecurity size={20}/> Security & Privacy</h4>
                    <ul>
                      <li>Backups are stored securely in Firebase Cloud Storage</li>
                      <li>All data is encrypted in transit and at rest</li>
                      <li>Only superadmin accounts can access backup functionality</li>
                      <li>Backup files automatically expire after 30 days</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Restore Modal */}
        {showRestoreModal && uploadedBackupFile && (
          <div className="restore-modal-overlay">
            <div className="restore-modal">
              <div className="restore-modal-header">
                <h2>Restore Data from Backup</h2>
                <button onClick={handleRestoreCancel} className="restore-modal-close">✕</button>
              </div>
              
              <div className="restore-modal-content">
                <div className="restore-backup-info">
                  <h3><FaFolder style={{ marginRight: '8px' }} />Backup File</h3>
                  <div className="restore-backup-details">
                    <div className="restore-backup-item">
                      <span className="restore-backup-label">File:</span>
                      <span className="restore-backup-value">{safeRender(uploadedBackupFile.fileName)}</span>
                    </div>
                    <div className="restore-backup-item">
                      <span className="restore-backup-label">Created:</span>
                      <span className="restore-backup-value">{new Date(uploadedBackupFile.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="restore-backup-item">
                      <span className="restore-backup-label">Collections:</span>
                      <span className="restore-backup-value">
                        <div className="restore-collections-tags">
                          {(uploadedBackupFile.collections || []).map(collection => (
                            <span key={collection} className="restore-collection-tag">
                              {BACKUP_COLLECTIONS[collection.toUpperCase()]?.name || collection}
                            </span>
                          ))}
                        </div>
                      </span>
                    </div>
                    <div className="restore-backup-item">
                      <span className="restore-backup-label">Documents:</span>
                      <span className="restore-backup-value">{uploadedBackupFile.totalDocuments || 'Unknown'}</span>
                    </div>
                  </div>
                </div>

                <div className="restore-mode-section">
                  <h3><IoSettings style={{ marginRight: '8px', verticalAlign: 'middle' }} />Restore Mode</h3>
                  <div className="restore-mode-options">
                    <label className={`restore-mode-option ${restoreMode === 'missing_only' ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="restoreMode"
                        value="missing_only"
                        checked={restoreMode === 'missing_only'}
                        onChange={(e) => setRestoreMode(e.target.value)}
                      />
                      <div className="restore-mode-content">
                        <div className="restore-mode-title">
                          <span className="restore-mode-icon"><FaPlusCircle size={20}/></span>
                          <strong>Missing Only (Recommended)</strong>
                        </div>
                        <div className="restore-mode-description">
                          <p>✓ Restores only missing <strong>documents</strong> (e.g., deleted dates, tickets, conductors)</p>
                          <p>✓ Keeps all existing data untouched - safest option</p>
                          <p className="note-text">⚠ Note: Does NOT restore individual missing fields inside existing documents</p>
                        </div>
                      </div>
                    </label>

                    <label className={`restore-mode-option ${restoreMode === 'overwrite' ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="restoreMode"
                        value="overwrite"
                        checked={restoreMode === 'overwrite'}
                        onChange={(e) => setRestoreMode(e.target.value)}
                      />
                      <div className="restore-mode-content">
                        <div className="restore-mode-title">
                          <span className="restore-mode-icon"><IoWarning size={20}/></span>
                          <strong>Overwrite All</strong>
                        </div>
                        <div className="restore-mode-description">
                          <p>✓ Replaces ALL documents with backup versions</p>
                          <p>✓ Can restore missing fields inside documents</p>
                          <p className="warning-text">⚠ WARNING: Overwrites current data - any changes after backup will be LOST!</p>
                        </div>
                      </div>
                    </label>

                  </div>
                </div>

                <div className="restore-info-section">
                  <div className="flex-container">
                    <div className="icon-wrapper">
                      <FaMagnifyingGlass size={20} />
                    </div>
                    <div className="flex-content">
                      <h4>Understanding Documents vs Fields</h4>
                      <div>
                        <p>
                          <strong>Document:</strong> A complete record (e.g., a date like "2025-10-16", a ticket, a conductor profile)
                        </p>
                        <p>
                          <strong>Field:</strong> A piece of data inside a document (e.g., "currentTrip", "ticketCount", "totalFare")
                        </p>
                        <div className="restore-info-examples-box">
                          <p>Examples:</p>
                          <ul>
                            <li>
                              Delete entire date "2025-10-16" → <strong className="text-success">Missing Only restores it</strong>
                            </li>
                            <li>
                              Delete field "currentTrip" inside "2025-10-16" → <strong className="text-danger">Missing Only skips it</strong>, use Overwrite
                            </li>
                            <li>
                              Delete entire ticket → <strong className="text-success">Missing Only restores it</strong>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="restore-warning-section">
                  <div className="restore-warning-box">
                    <span className="restore-warning-icon"><IoWarning size={20}/></span>
                    <div className="restore-warning-content">
                      <strong>Important:</strong> This operation cannot be undone. Make sure you have selected the correct restore mode.
                      {restoreMode === 'overwrite' && (
                        <div className="restore-critical-warning">
                          <strong>CRITICAL:</strong> Overwrite mode will replace ALL existing data!
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="restore-modal-actions">
                <button onClick={handleRestoreCancel} className="restore-btn-cancel">
                  Cancel
                </button>
                <button onClick={handleRestoreConfirm} className="restore-btn-confirm">
                  Continue to Confirmation
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Restore Confirmation Dialog */}
        {showRestoreConfirmation && selectedBackupFile && (
          <div className="restore-modal-overlay">
            <div className="restore-confirmation-modal">
              <div className="restore-confirmation-header">
                <h2>Final Confirmation</h2>
              </div>
              
              <div className="restore-confirmation-content">
                <div className="restore-confirmation-summary">
                  <h3>You are about to restore:</h3>
                  <div className="restore-confirmation-details">
                    <div className="restore-confirmation-item">
                      <strong>File:</strong> {selectedBackupFile.fileName}
                    </div>
                    <div className="restore-confirmation-item">
                      <strong>Mode:</strong> 
                      <span className={`restore-mode-badge ${restoreMode}`}>
                        {restoreMode === 'missing_only' && 'Missing Only'}
                        {restoreMode === 'overwrite' && 'Overwrite All'}
                      </span>
                    </div>
                    <div className="restore-confirmation-item">
                      <strong>Collections:</strong> {(selectedBackupFile.collections || []).length} collections
                    </div>
                    <div className="restore-confirmation-item">
                      <strong>Documents:</strong> ~{selectedBackupFile.totalDocuments || 'Unknown'} documents
                    </div>
                  </div>
                </div>

                <div className="restore-confirmation-warning">
                  <div className="restore-confirmation-warning-box">
                    <span className="restore-warning-icon"><IoWarning size={20}/></span>
                    <div>
                      <strong>This action cannot be undone!</strong>
                      <p>Type "RESTORE" to confirm you want to proceed:</p>
                    </div>
                  </div>
                  <input
                    type="text"
                    className="restore-confirmation-input"
                    placeholder="Type RESTORE to confirm"
                    value={restoreConfirmationText}
                    onChange={(e) => setRestoreConfirmationText(e.target.value)}
                  />
                </div>
              </div>

              <div className="restore-confirmation-actions">
                <button 
                  onClick={() => {
                    setShowRestoreConfirmation(false);
                    setRestoreConfirmationText('');
                  }} 
                  className="restore-btn-cancel"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleRestoreExecute} 
                  className="restore-btn-execute"
                  disabled={restoreConfirmationText !== 'RESTORE'}
                >
                  Execute Restore
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Restore Progress Modal */}
        {isRestoring && restoreProgress && (
          <div className="restore-modal-overlay">
            <div className="restore-progress-modal">
              <div className="restore-progress-header">
                <h2>
                  {restoreProgress.phase === 'analyzing' && <><FaMagnifyingGlass /> Analyzing Backup Data</>}
                  {restoreProgress.phase === 'restoring' && <><FaDownload /> Restoring Data</>}
                  {restoreProgress.phase === 'completed' && <><FaCheckCircle /> Restore Completed</>}
                  {restoreProgress.phase === 'failed' && <><FaTimesCircle /> Restore Failed</>}
                  {restoreProgress.phase === 'initializing' && <><FaCog /> Initializing</>}
                </h2>
                {restoreProgress.phase === 'restoring' && (
                  <button onClick={handleRestoreCancelProgress} className="restore-cancel-btn">
                    Cancel
                  </button>
                )}
              </div>

              <div className="restore-progress-content">
                {/* Overall Progress */}
                <div className="restore-progress-section">
                  <div className="restore-progress-info">
                    <span>Overall Progress</span>
                    <span>{restoreProgress.phase === 'completed' ? 100 : (restoreProgress.totalDocuments > 0 ? Math.round((restoreProgress.processedDocuments / restoreProgress.totalDocuments) * 100) : 0)}%</span>
                  </div>
                  <div className="restore-progress-bar">
                    <div 
                      className="restore-progress-fill"
                      style={{ 
                        width: `${restoreProgress.phase === 'completed' ? 100 : (restoreProgress.totalDocuments > 0 ? (restoreProgress.processedDocuments / restoreProgress.totalDocuments) * 100 : 0)}%` 
                      }}
                    />
                  </div>
                </div>

                {/* Conductors Progress */}
                {restoreProgress.totalConductors > 0 && (
                  <div className="restore-progress-section">
                    <div className="restore-progress-info">
                      <span>Conductors</span>
                      <span>{restoreProgress.processedConductors}/{restoreProgress.totalConductors}</span>
                    </div>
                    <div className="restore-progress-bar">
                      <div 
                        className="restore-progress-fill conductor"
                        style={{ 
                          width: `${(restoreProgress.processedConductors / restoreProgress.totalConductors) * 100}%` 
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Subcollections Progress */}
                {restoreProgress.totalSubcollections > 0 && (
                  <div className="restore-progress-section">
                    <div className="restore-progress-info">
                      <span>Subcollections</span>
                      <span>{restoreProgress.processedSubcollections}/{restoreProgress.totalSubcollections}</span>
                    </div>
                    <div className="restore-progress-bar">
                      <div 
                        className="restore-progress-fill subcollection"
                        style={{ 
                          width: `${(restoreProgress.processedSubcollections / restoreProgress.totalSubcollections) * 100}%` 
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Current Status */}
                <div className="restore-status-section">
                {restoreProgress.currentConductor && (
                  <div className="restore-current-status">
                    <span className="restore-current-label">Current conductor:</span>
                    <span className="restore-current-value">
                      {safeRender(restoreProgress.currentConductor)}
                    </span>
                  </div>
                )}

                {restoreProgress.currentCollection && (
                  <div className="restore-current-status">
                    <span className="restore-current-label">Status:</span>
                    <span className="restore-current-value">
                      {safeRender(restoreProgress.currentCollection)}
                    </span>
                  </div>
                )}

                {restoreProgress.errors && restoreProgress.errors.length > 0 && (
                  <div className="restore-errors">
                    <h4><FaExclamationTriangle style={{ color: 'orange', marginRight: '8px' }} />Errors ({restoreProgress.errors.length}):</h4>
                    <ul>
                      {restoreProgress.errors.slice(-3).map((error, index) => (
                        <li key={index}>{safeRender(error)}</li>
                      ))}
                    </ul>
                  </div>
                )}


                {/* Completion Actions */}
                {(restoreProgress.phase === 'completed' || restoreProgress.phase === 'failed') && (
                  <div className="restore-completion-actions">
                    <button 
                      onClick={() => {
                        setIsRestoring(false);
                        setRestoreProgress(null);
                        setSelectedBackupFile(null);
                      }} 
                      className="restore-close-btn"
                    >
                      Close
                    </button>
                    {restoreProgress.errors && restoreProgress.errors.length > 0 && (
                      <button 
                        onClick={() => {
                          const errorLog = restoreProgress.errors.join('\n');
                          const blob = new Blob([errorLog], { type: 'text/plain' });
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `restore-errors-${new Date().toISOString().split('T')[0]}.txt`;
                          a.click();
                          window.URL.revokeObjectURL(url);
                        }} 
                        className="restore-export-errors-btn"
                      >
                        Export Error Log
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>
        )}

        {/* Register Admin Modal */}
        {showRegisterModal && (
          <div className="settings-modal-overlay" onClick={handleCloseRegisterModal}>
            <div className="settings-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="settings-modal-header register-admin-header">
                <h3>Register New Admin</h3>
                <button onClick={handleCloseRegisterModal} className="settings-modal-close">×</button>
              </div>

              <form onSubmit={handleRegisterSubmit} className="settings-register-form">
                <div className="settings-form-row">
                  <div className="settings-form-group">
                    <label>First Name</label>
                    <input
                      type="text"
                      value={registerFormData.firstName}
                      onChange={(e) => handleRegisterInputChange('firstName', e.target.value)}
                      required
                      placeholder="Enter first name"
                    />
                  </div>
                  <div className="settings-form-group">
                    <label>Last Name</label>
                    <input
                      type="text"
                      value={registerFormData.lastName}
                      onChange={(e) => handleRegisterInputChange('lastName', e.target.value)}
                      required
                      placeholder="Enter last name"
                    />
                  </div>
                </div>

                <div className="settings-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={registerFormData.email}
                    onChange={(e) => handleRegisterInputChange('email', e.target.value)}
                    required
                    placeholder="Enter email address"
                  />
                </div>

                <div className="settings-form-row">
                  <div className="settings-form-group">
                    <label>Password</label>
                    <div className="password-input-container">
                      <input
                        type={showRegisterPassword ? "text" : "password"}
                        value={registerFormData.password}
                        onChange={(e) => handleRegisterInputChange('password', e.target.value)}
                        required
                        placeholder="Minimum 6 characters"
                        minLength="6"
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                        aria-label={showRegisterPassword ? "Hide password" : "Show password"}
                      >
                        {showRegisterPassword ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  </div>
                  <div className="settings-form-group">
                    <label>Confirm Password</label>
                    <div className="password-input-container">
                      <input
                        type={showRegisterConfirmPassword ? "text" : "password"}
                        value={registerFormData.confirmPassword}
                        onChange={(e) => handleRegisterInputChange('confirmPassword', e.target.value)}
                        required
                        placeholder="Re-enter password"
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowRegisterConfirmPassword(!showRegisterConfirmPassword)}
                        aria-label={showRegisterConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showRegisterConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-form-group">
                  <label>Role</label>
                  <select
                    value={registerFormData.role}
                    onChange={(e) => handleRegisterInputChange('role', e.target.value)}
                    required
                  >
                    <option value="admin">Admin</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                </div>

                {registerError && (
                  <div className="settings-error-message">{registerError}</div>
                )}

                <div className="settings-modal-footer">
                  <button
                    type="button"
                    onClick={handleCloseRegisterModal}
                    className="settings-button-secondary"
                    disabled={registerLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="settings-button-primary"
                    disabled={registerLoading}
                  >
                    {registerLoading ? 'Registering...' : 'Register Admin'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default Settings;
