import { collection, addDoc, query, orderBy, limit, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '/src/firebase/firebase.js';
import { getCurrentAdminData } from '/src/pages/auth/authService.js';

// audit
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
  TICKET_SCAN: 'TICKET_SCAN',
  TICKET_DELETE: 'TICKET_DELETE',
  BOOKING_STATUS_UPDATE: 'BOOKING_STATUS_UPDATE',
  ID_VERIFICATION_APPROVE: 'ID_VERIFICATION_APPROVE',
  ID_VERIFICATION_REJECT: 'ID_VERIFICATION_REJECT',
  SCHEDULE_CREATE: 'SCHEDULE_CREATE',
  SCHEDULE_UPDATE: 'SCHEDULE_UPDATE',
  SCHEDULE_DELETE: 'SCHEDULE_DELETE',
  SOS_MARK_RECEIVED: 'SOS_MARK_RECEIVED',
  SOS_DELETE: 'SOS_DELETE',
  PAYMENT_UPDATE: 'PAYMENT_UPDATE',
  PAYMENT_DELETE: 'PAYMENT_DELETE',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  DATA_EXPORT: 'DATA_EXPORT',
  SYSTEM_BACKUP: 'SYSTEM_BACKUP',
  SYSTEM_MAINTENANCE: 'SYSTEM_MAINTENANCE'
};


const removeUndefinedValues = (obj) => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefinedValues);
  
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      const cleanedValue = removeUndefinedValues(value);
      if (cleanedValue !== null || (typeof cleanedValue === 'object' && Object.keys(cleanedValue).length > 0)) {
        cleaned[key] = cleanedValue;
      }
    }
  }
  return cleaned;
};

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

    // Clean metadata to remove undefined values
    const cleanMetadata = removeUndefinedValues(metadata);

    const auditLogData = {
      userId: auth.currentUser.uid,
      userEmail: auth.currentUser.email,
      userName: adminData?.name || 'Unknown',
      userRole: adminData?.role || 'unknown',
      activityType,
      description,
      metadata: cleanMetadata,
      severity,
      timestamp: serverTimestamp(),
      userAgent: navigator.userAgent,
    };

    const docRef = await addDoc(collection(db, 'AuditLogs'), auditLogData);
    return docRef.id;
  } catch (error) {
    console.error('Failed to log activity:', error);
    // Don't throw error to avoid disrupting main application flow
    return null;
  }
};

// logs system errors for crash reporting
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

// fetches activity logs
export const getActivityLogs = async (filters = {}) => {
  try {
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

    const q = query(collection(db, 'AuditLogs'), ...constraints);
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

// fetches error logs
export const getErrorLogs = async (filters = {}) => {
  try {
    const constraints = [orderBy('timestamp', 'desc')];

    if (filters.startDate) {
      constraints.push(where('timestamp', '>=', filters.startDate));
    }
    if (filters.endDate) {
      constraints.push(where('timestamp', '<=', filters.endDate));
    }

    constraints.push(limit(filters.limit || 50));

    const q = query(collection(db, 'ErrorLogs'), ...constraints);
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

// exports logs to Excel file
export const exportLogsToCSV = (logs, filename, type = 'activity') => {
  try {
    // Import xlsx library dynamically
    import('xlsx').then(XLSX => {
      let headers, rows;

      if (type === 'activity') {
        headers = ['Date/Time', 'User', 'Email', 'Role', 'Activity Type', 'Description', 'Severity'];
        rows = logs.map(log => [
          log.timestamp.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }),
          log.userName || 'Unknown',
          log.userEmail || 'Unknown',
          log.userRole || 'unknown',
          log.activityType?.replace(/_/g, ' ') || 'UNKNOWN',
          log.description || '',
          log.severity || 'info'
        ]);
      } else {
        headers = ['Date/Time', 'Email', 'Error', 'Context', 'URL'];
        rows = logs.map(log => [
          log.timestamp.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }),
          log.userEmail || 'anonymous',
          log.errorMessage || '',
          log.context || '',
          log.url || ''
        ]);
      }

      // Create worksheet data
      const worksheetData = [headers, ...rows];
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

      // Auto-adjust column widths based on content
      const columnWidths = headers.map((header, colIndex) => {
        // Calculate the maximum width for each column
        const headerWidth = header.length;
        const maxDataWidth = Math.max(...rows.map(row => 
          String(row[colIndex] || '').length
        ), 0);
        
        // Set minimum width of 10 and maximum of 50 characters
        const width = Math.min(Math.max(headerWidth, maxDataWidth, 10), 50);
        return { wch: width };
      });

      worksheet['!cols'] = columnWidths;

      // Style the header row
      const range = XLSX.utils.decode_range(worksheet['!ref']);
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        if (!worksheet[cellAddress]) continue;
        
        worksheet[cellAddress].s = {
          font: { bold: true, sz: 12 },
          fill: { fgColor: { rgb: "E6E6FA" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thin" },
            bottom: { style: "thin" },
            left: { style: "thin" },
            right: { style: "thin" }
          }
        };
      }

      // Style data rows with alternating colors
      for (let row = 1; row <= range.e.r; row++) {
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          if (!worksheet[cellAddress]) continue;
          
          worksheet[cellAddress].s = {
            alignment: { vertical: "top", wrapText: true },
            fill: { fgColor: { rgb: row % 2 === 0 ? "F9F9F9" : "FFFFFF" } },
            border: {
              top: { style: "thin" },
              bottom: { style: "thin" },
              left: { style: "thin" },
              right: { style: "thin" }
            }
          };
        }
      }

      // Create workbook and add worksheet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, type === 'activity' ? 'Activity Logs' : 'Error Logs');

      // Generate Excel file and download
      XLSX.writeFile(workbook, `${filename}.xlsx`);

      // Log the export activity
      logActivity(
        ACTIVITY_TYPES.DATA_EXPORT,
        `Exported ${logs.length} ${type} logs to Excel`,
        { filename: `${filename}.xlsx`, recordCount: logs.length }
      );

    }).catch(error => {
      console.error('Error loading xlsx library:', error);
      // Fallback to CSV export
      exportLogsToCSVFallback(logs, filename, type);
    });

  } catch (error) {
    console.error('Error exporting logs to Excel:', error);
    // Fallback to CSV export
    exportLogsToCSVFallback(logs, filename, type);
  }
};

// Fallback CSV export function
const exportLogsToCSVFallback = (logs, filename, type) => {
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
      headers = ['Date/Time', 'Email', 'Error', 'Context', 'URL'];
      rows = logs.map(log => [
        log.timestamp.toLocaleString(),
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
      `Exported ${logs.length} ${type} logs to CSV (fallback)`,
      { filename: `${filename}.csv`, recordCount: logs.length }
    );

  } catch (error) {
    console.error('Error exporting logs to CSV:', error);
    throw error;
  }
};

// Get total counts of logs
export const getTotalLogCounts = async () => {
  try {
    // Get total activity logs count
    const activityQuery = query(collection(db, 'AuditLogs'));
    const activitySnapshot = await getDocs(activityQuery);

    // Get total error logs count
    const errorQuery = query(collection(db, 'ErrorLogs'));
    const errorSnapshot = await getDocs(errorQuery);

    // Count activities by severity from all logs
    let totalErrors = 0;
    activitySnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.severity === 'error') {
        totalErrors++;
      }
    });

    return {
      totalActivities: activitySnapshot.size,
      totalErrorLogs: errorSnapshot.size,
      totalActivityErrors: totalErrors
    };
  } catch (error) {
    console.error('Error getting total log counts:', error);
    throw error;
  }
};

// Get log statistics within a date range
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