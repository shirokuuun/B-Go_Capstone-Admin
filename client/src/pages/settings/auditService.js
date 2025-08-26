import { collection, addDoc, query, orderBy, limit, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '/src/firebase/firebase.js';
import { getCurrentAdminData } from '/src/pages/auth/authService.js';

/**
 * Activity types for audit logging
 */
export const ACTIVITY_TYPES = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PROFILE_UPDATE: 'PROFILE_UPDATE',
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DELETE: 'USER_DELETE',
  CONDUCTOR_CREATE: 'CONDUCTOR_CREATE',
  CONDUCTOR_UPDATE: 'CONDUCTOR_UPDATE',
  CONDUCTOR_DELETE: 'CONDUCTOR_DELETE',
  BUS_CREATE: 'BUS_CREATE',
  BUS_UPDATE: 'BUS_UPDATE',
  BUS_DELETE: 'BUS_DELETE',
  ROUTE_CREATE: 'ROUTE_CREATE',
  ROUTE_UPDATE: 'ROUTE_UPDATE',
  ROUTE_DELETE: 'ROUTE_DELETE',
  TICKET_SCAN: 'TICKET_SCAN',
  BOOKING_STATUS_UPDATE: 'BOOKING_STATUS_UPDATE',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  DATA_EXPORT: 'DATA_EXPORT'
};

/**
 * Logs an activity to the audit trail
 * @param {string} activityType - Type of activity (from ACTIVITY_TYPES)
 * @param {string} description - Detailed description of the activity
 * @param {Object} metadata - Additional metadata for the activity
 * @param {string} severity - Severity level: 'info', 'warning', 'error'
 * @returns {Promise<string>} Document ID of the created audit log
 */
export const logActivity = async (activityType, description, metadata = {}, severity = 'info') => {
  try {
    if (!auth.currentUser) {
      console.warn('No authenticated user for audit logging');
      return null;
    }

    // Get current admin data for role information
    let adminData = null;
    try {
      adminData = await getCurrentAdminData(auth.currentUser.uid);
    } catch (error) {
      console.warn('Could not fetch admin data for audit log:', error);
    }

    const auditLogData = {
      userId: auth.currentUser.uid,
      userEmail: auth.currentUser.email,
      userName: adminData?.name || 'Unknown',
      userRole: adminData?.role || 'unknown',
      activityType,
      description,
      metadata,
      severity,
      timestamp: serverTimestamp(),
      userAgent: navigator.userAgent,
      ipAddress: null // Would need backend service to get real IP
    };

    const docRef = await addDoc(collection(db, 'AuditLogs'), auditLogData);
    return docRef.id;
  } catch (error) {
    console.error('Failed to log activity:', error);
    // Don't throw error to avoid disrupting main application flow
    return null;
  }
};

/**
 * Logs system errors for crash reporting
 * @param {Error} error - The error object
 * @param {string} context - Context where the error occurred
 * @param {Object} additionalData - Additional error context
 * @returns {Promise<string>} Document ID of the created error log
 */
export const logSystemError = async (error, context, additionalData = {}) => {
  try {
    const errorLogData = {
      userId: auth.currentUser?.uid || 'anonymous',
      userEmail: auth.currentUser?.email || 'anonymous',
      errorMessage: error.message,
      errorStack: error.stack,
      errorName: error.name,
      context,
      additionalData,
      timestamp: serverTimestamp(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      severity: 'error'
    };

    const docRef = await addDoc(collection(db, 'ErrorLogs'), errorLogData);
    
    // Also log to audit trail
    await logActivity(
      ACTIVITY_TYPES.SYSTEM_ERROR,
      `System error in ${context}: ${error.message}`,
      { errorId: docRef.id, ...additionalData },
      'error'
    );

    return docRef.id;
  } catch (logError) {
    console.error('Failed to log system error:', logError);
    return null;
  }
};

/**
 * Fetches activity logs with optional filtering
 * @param {Object} filters - Filter options
 * @param {string} filters.activityType - Filter by activity type
 * @param {string} filters.userId - Filter by user ID
 * @param {string} filters.severity - Filter by severity level
 * @param {Date} filters.startDate - Filter from this date
 * @param {Date} filters.endDate - Filter to this date
 * @param {number} filters.limit - Limit number of results (default: 100)
 * @returns {Promise<Array>} Array of audit log documents
 */
export const getActivityLogs = async (filters = {}) => {
  try {
    let q = collection(db, 'AuditLogs');
    const constraints = [orderBy('timestamp', 'desc')];

    // Apply filters
    if (filters.activityType) {
      constraints.push(where('activityType', '==', filters.activityType));
    }
    if (filters.userId) {
      constraints.push(where('userId', '==', filters.userId));
    }
    if (filters.severity) {
      constraints.push(where('severity', '==', filters.severity));
    }
    if (filters.startDate) {
      constraints.push(where('timestamp', '>=', filters.startDate));
    }
    if (filters.endDate) {
      constraints.push(where('timestamp', '<=', filters.endDate));
    }

    constraints.push(limit(filters.limit || 100));

    q = query(q, ...constraints);
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate() || new Date()
    }));
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    throw error;
  }
};

/**
 * Fetches error logs for crash reporting
 * @param {Object} filters - Filter options
 * @param {Date} filters.startDate - Filter from this date
 * @param {Date} filters.endDate - Filter to this date
 * @param {number} filters.limit - Limit number of results (default: 50)
 * @returns {Promise<Array>} Array of error log documents
 */
export const getErrorLogs = async (filters = {}) => {
  try {
    let q = collection(db, 'ErrorLogs');
    const constraints = [orderBy('timestamp', 'desc')];

    if (filters.startDate) {
      constraints.push(where('timestamp', '>=', filters.startDate));
    }
    if (filters.endDate) {
      constraints.push(where('timestamp', '<=', filters.endDate));
    }

    constraints.push(limit(filters.limit || 50));

    q = query(q, ...constraints);
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate() || new Date()
    }));
  } catch (error) {
    console.error('Error fetching error logs:', error);
    throw error;
  }
};

/**
 * Exports logs to CSV format
 * @param {Array} logs - Array of log documents
 * @param {string} filename - Name of the exported file
 * @param {string} type - Type of logs ('activity' or 'error')
 */
export const exportLogsToCSV = (logs, filename, type = 'activity') => {
  try {
    let headers, rows;

    if (type === 'activity') {
      headers = ['Date/Time', 'User', 'Email', 'Role', 'Activity Type', 'Description', 'Severity'];
      rows = logs.map(log => [
        log.timestamp.toLocaleString(),
        log.userName || 'Unknown',
        log.userEmail || 'Unknown',
        log.userRole || 'unknown',
        log.activityType || 'UNKNOWN',
        log.description || '',
        log.severity || 'info'
      ]);
    } else {
      headers = ['Date/Time', 'User', 'Email', 'Error', 'Context', 'URL'];
      rows = logs.map(log => [
        log.timestamp.toLocaleString(),
        log.userEmail || 'anonymous',
        log.userEmail || 'anonymous',
        log.errorMessage || '',
        log.context || '',
        log.url || ''
      ]);
    }

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Log the export activity
    logActivity(
      ACTIVITY_TYPES.DATA_EXPORT,
      `Exported ${logs.length} ${type} logs to CSV`,
      { filename: `${filename}.csv`, recordCount: logs.length }
    );

  } catch (error) {
    console.error('Error exporting logs to CSV:', error);
    throw error;
  }
};

/**
 * Get summary statistics for logs
 * @param {Date} startDate - Start date for statistics
 * @param {Date} endDate - End date for statistics
 * @returns {Promise<Object>} Statistics object
 */
export const getLogStatistics = async (startDate, endDate) => {
  try {
    const activityLogs = await getActivityLogs({ startDate, endDate, limit: 1000 });
    const errorLogs = await getErrorLogs({ startDate, endDate, limit: 1000 });

    const activityByType = {};
    const activityByUser = {};
    const errorsByContext = {};

    activityLogs.forEach(log => {
      activityByType[log.activityType] = (activityByType[log.activityType] || 0) + 1;
      activityByUser[log.userName] = (activityByUser[log.userName] || 0) + 1;
    });

    errorLogs.forEach(log => {
      errorsByContext[log.context] = (errorsByContext[log.context] || 0) + 1;
    });

    return {
      totalActivities: activityLogs.length,
      totalErrors: errorLogs.length,
      activityByType,
      activityByUser,
      errorsByContext,
      dateRange: { startDate, endDate }
    };
  } catch (error) {
    console.error('Error getting log statistics:', error);
    throw error;
  }
};