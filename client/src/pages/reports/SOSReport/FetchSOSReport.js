import { collection, query, orderBy, onSnapshot, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "/src/firebase/firebase.js";


// Available routes cache with TTL
let cachedRoutes = null;
let routesCacheTime = null;
const ROUTES_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Real-time listener reference
let unsubscribeListener = null;

// Helper function to convert Firestore timestamp to Date
const convertTimestampToDate = (timestamp) => {
  if (!timestamp) return null;

  if (timestamp.toDate) {
    return timestamp.toDate();
  }
  return new Date(timestamp);
};

// Helper function to calculate response time in minutes
const calculateResponseTime = (item) => {
  if (!item.timestamp || !item.updatedAt) return null;

  const createdTime = convertTimestampToDate(item.timestamp);
  const updatedTime = convertTimestampToDate(item.updatedAt);

  if (!createdTime || !updatedTime) return null;

  return (updatedTime - createdTime) / (1000 * 60);
};

// Helper function to check if incident is critical
const isCriticalIncident = (item) => {
  return item.severity === 'critical' ||
         item.emergencyType === 'Medical Emergency' ||
         item.emergencyType === 'Brake Failure' ||
         item.emergencyType === 'Accident' ||
         item.emergencyType === 'Security Incident';
};

// Fetch SOS data with date range filtering and real-time updates
export const fetchSOSData = (dateRange, routeFilter, emergencyTypeFilter, callback) => {
  try {
    // Cleanup previous listener
    if (unsubscribeListener) {
      unsubscribeListener();
    }

    // Build query
    let q = collection(db, "sosRequests");
    
    // Apply date range filter
    if (dateRange && dateRange.start && dateRange.end) {
      const startDate = Timestamp.fromDate(new Date(dateRange.start));
      const endDate = Timestamp.fromDate(new Date(dateRange.end + "T23:59:59"));
      
      q = query(
        collection(db, "sosRequests"),
        where("timestamp", ">=", startDate),
        where("timestamp", "<=", endDate),
        orderBy("timestamp", "desc")
      );
    } else {
      q = query(collection(db, "sosRequests"), orderBy("timestamp", "desc"));
    }

    // Set up real-time listener
    unsubscribeListener = onSnapshot(q, (querySnapshot) => {
      let sosData = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        sosData.push({
          id: doc.id,
          ...data,
          timestamp: data.timestamp
        });
      });

      // Apply additional filters on client side for better performance
      if (routeFilter && routeFilter !== 'all') {
        sosData = sosData.filter(item => item.route === routeFilter);
      }

      if (emergencyTypeFilter && emergencyTypeFilter !== 'all') {
        sosData = sosData.filter(item => item.emergencyType === emergencyTypeFilter);
      }

      // Sanitize data to ensure no nested objects in strings
      const sanitizedData = sosData.map(item => {
        const sanitized = { ...item };
        
        // Recursively check for any object values that might be rendered
        const sanitizeValue = (value, key) => {
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            // Special handling for location objects
            if (key === 'location') {
              if (value.lat !== undefined && value.lng !== undefined) {
                if (value.lat === 0 && value.lng === 0) {
                  return 'No location';
                } else {
                  return `${value.lat}, ${value.lng}`;
                }
              }
              return 'Unknown';
            }
            // Skip sanitizing timestamp fields - they need to remain as Timestamp objects
            if (key === 'timestamp' || key === 'updatedAt' || key === 'createdAt') {
              return value;
            }
            // For other objects, convert to JSON string to prevent React errors
            console.warn(`Found object in ${key}:`, value);
            return JSON.stringify(value);
          }
          return value;
        };
        
        // Sanitize all properties
        Object.keys(sanitized).forEach(key => {
          sanitized[key] = sanitizeValue(sanitized[key], key);
        });
        
        return sanitized;
      });
      
      // Call callback with processed data
      callback(sanitizedData);
    }, (error) => {
      console.error("Error fetching SOS data:", error);
      callback([]);
    });

    return unsubscribeListener;
  } catch (error) {
    console.error("Error setting up SOS data listener:", error);
    callback([]);
    return null;
  }
};

// Get available routes from SOS data with TTL caching
export const getAvailableRoutes = async () => {
  // Check if cache exists and is still fresh
  if (cachedRoutes && routesCacheTime) {
    const cacheAge = Date.now() - routesCacheTime;
    if (cacheAge < ROUTES_CACHE_TTL) {
      return cachedRoutes; // Return cached routes (still fresh)
    }
  }

  // Cache expired or doesn't exist - fetch fresh data
  try {
    const q = query(collection(db, "sosRequests"));
    const querySnapshot = await getDocs(q);

    const routes = new Set();
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.route) {
        routes.add(data.route);
      }
    });

    cachedRoutes = Array.from(routes).sort();
    routesCacheTime = Date.now(); // Store cache timestamp
    return cachedRoutes;
  } catch (error) {
    console.error("Error fetching available routes:", error);
    return cachedRoutes || []; // Return stale cache if available, otherwise empty array
  }
};

// Calculate performance metrics from SOS data
export const calculateMetrics = (sosData) => {
  if (!sosData || sosData.length === 0) {
    return {
      totalIncidents: 0,
      resolutionRate: 0,
      avgResponseTime: 0,
      criticalIncidents: 0
    };
  }

  const totalIncidents = sosData.length;
  const receivedIncidents = sosData.filter(item => 
    item.status && item.status.toLowerCase() === 'received'
  ).length;
  
  const resolutionRate = totalIncidents > 0 ? (receivedIncidents / totalIncidents) * 100 : 0;
  
  // Calculate average response time using real timestamps
  let totalResponseTime = 0;
  let responseTimeCount = 0;
  
  sosData.forEach(item => {
    if (item.status && item.status.toLowerCase() === 'received') {
      try {
        const responseTime = calculateResponseTime(item);
        if (responseTime !== null) {
          totalResponseTime += responseTime;
          responseTimeCount++;
        }
      } catch (error) {
        console.warn('Error calculating response time for metrics:', item.id, error);
      }
    }
  });
  
  const avgResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0;
  
  // Count critical incidents
  const criticalIncidents = sosData.filter(item => isCriticalIncident(item)).length;

  return {
    totalIncidents,
    resolutionRate,
    avgResponseTime,
    criticalIncidents
  };
};

// Analyze response time distribution
export const analyzeResponseTimeDistribution = (sosData) => {
  const distribution = {
    '0-5min': 0,
    '5-10min': 0,
    '10-15min': 0,
    '15+min': 0
  };

  sosData.forEach(item => {
    if (item.status && item.status.toLowerCase() === 'received') {
      const responseTime = calculateResponseTime(item) || 0;

      if (responseTime <= 5) {
        distribution['0-5min']++;
      } else if (responseTime <= 10) {
        distribution['5-10min']++;
      } else if (responseTime <= 15) {
        distribution['10-15min']++;
      } else {
        distribution['15+min']++;
      }
    }
  });

  return Object.entries(distribution).map(([range, count]) => ({
    range,
    count,
    percentage: sosData.length > 0 ? (count / sosData.length) * 100 : 0
  }));
};

// Analyze emergency types with severity
export const analyzeEmergencyTypes = (sosData) => {
  const typeAnalysis = {};

  sosData.forEach(item => {
    const type = item.emergencyType || 'Unknown';
    
    if (!typeAnalysis[type]) {
      typeAnalysis[type] = {
        total: 0,
        received: 0,
        pending: 0,
        cancelled: 0,
        avgResponseTime: 0,
        responseTimesSum: 0,
        responseTimesCount: 0
      };
    }

    typeAnalysis[type].total++;
    
    if (item.status) {
      const status = item.status.toLowerCase();
      if (status === 'received') {
        typeAnalysis[type].received++;
      } else if (status === 'pending') {
        typeAnalysis[type].pending++;
      } else if (status === 'cancelled') {
        typeAnalysis[type].cancelled++;
      }
      
      if (status === 'received') {
        try {
          const responseTime = calculateResponseTime(item);
          if (responseTime !== null) {
            typeAnalysis[type].responseTimesSum += responseTime;
            typeAnalysis[type].responseTimesCount++;
          }
        } catch (error) {
          console.warn('Error calculating response time for emergency type:', type, error);
        }
      }
    }
  });

  // Calculate averages and return formatted data
  return Object.entries(typeAnalysis).map(([type, data]) => ({
    type,
    total: data.total,
    received: data.received,
    pending: data.pending,
    cancelled: data.cancelled,
    resolutionRate: data.total > 0 ? (data.received / data.total) * 100 : 0,
    avgResponseTime: data.responseTimesCount > 0 ? 
      data.responseTimesSum / data.responseTimesCount : 0
  })).sort((a, b) => b.total - a.total);
};

// Identify route hotspots
export const identifyRouteHotspots = (sosData) => {
  const routeAnalysis = {};

  sosData.forEach(item => {
    const route = item.route || 'Unknown Route';
    
    if (!routeAnalysis[route]) {
      routeAnalysis[route] = {
        total: 0,
        received: 0,
        criticalCount: 0,
        emergencyTypes: {}
      };
    }

    routeAnalysis[route].total++;
    
    if (item.status && item.status.toLowerCase() === 'received') {
      routeAnalysis[route].received++;
    }
    
    // Count critical incidents
    if (isCriticalIncident(item)) {
      routeAnalysis[route].criticalCount++;
    }
    
    // Track emergency types per route
    const emergencyType = item.emergencyType || 'Unknown';
    routeAnalysis[route].emergencyTypes[emergencyType] = 
      (routeAnalysis[route].emergencyTypes[emergencyType] || 0) + 1;
  });

  return Object.entries(routeAnalysis).map(([route, data]) => ({
    route,
    total: data.total,
    received: data.received,
    critical: data.criticalCount,
    resolutionRate: data.total > 0 ? (data.received / data.total) * 100 : 0,
    riskLevel: calculateRiskLevel(data.total, data.criticalCount, data.received),
    topEmergencyType: Object.entries(data.emergencyTypes)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'None'
  })).sort((a, b) => b.total - a.total);
};

// Calculate risk level for routes
const calculateRiskLevel = (total, critical, received) => {
  if (total === 0) return 'Low';
  
  const criticalRate = (critical / total) * 100;
  const resolutionRate = (received / total) * 100;
  
  if (criticalRate > 30 || resolutionRate < 50) return 'High';
  if (criticalRate > 15 || resolutionRate < 75) return 'Medium';
  return 'Low';
};

// Analyze monthly trends
export const analyzeMonthlyTrends = (sosData) => {
  const monthlyData = {};

  sosData.forEach(item => {
    if (item.timestamp) {
      let date;
      if (item.timestamp.toDate) {
        date = item.timestamp.toDate();
      } else {
        date = new Date(item.timestamp);
      }
      
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          total: 0,
          received: 0,
          pending: 0,
          cancelled: 0
        };
      }
      
      monthlyData[monthKey].total++;
      
      if (item.status) {
        const status = item.status.toLowerCase();
        if (monthlyData[monthKey][status] !== undefined) {
          monthlyData[monthKey][status]++;
        }
      }
    }
  });

  return Object.entries(monthlyData)
    .map(([month, data]) => ({
      month,
      ...data,
      resolutionRate: data.total > 0 ? (data.received / data.total) * 100 : 0
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
};


// Cleanup function
export const cleanup = () => {
  if (unsubscribeListener) {
    unsubscribeListener();
    unsubscribeListener = null;
  }
  cachedRoutes = null;
  routesCacheTime = null;
};

// Export for Excel generation
export const prepareExcelData = (sosData, metrics, routeHotspots, emergencyTypes, monthlyTrends) => {
  return {
    summary: {
      totalIncidents: metrics.totalIncidents,
      resolutionRate: `${metrics.resolutionRate.toFixed(1)}%`,
      avgResponseTime: `${metrics.avgResponseTime.toFixed(1)} minutes`,
      criticalIncidents: metrics.criticalIncidents
    },
    incidents: sosData.map(item => ({
      id: item.id,
      emergencyType: item.emergencyType || 'Unknown',
      status: item.status || 'Unknown',
      route: item.route || 'Unknown',
      location: item.location && item.location.lat !== undefined && item.location.lng !== undefined ? 
        (item.location.lat === 0 && item.location.lng === 0 ? 
          'No location' : `${item.location.lat}, ${item.location.lng}`) : 'Unknown',
      timestamp: item.timestamp ? 
        (item.timestamp.toDate ? item.timestamp.toDate() : new Date(item.timestamp)).toLocaleString() : 
        'Unknown',
      description: item.description || 'No description'
    })),
    routeHotspots,
    emergencyTypes,
    monthlyTrends
  };
};