import { collection, query, orderBy, onSnapshot, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "/src/firebase/firebase.js";

// Cache for performance optimization
let cachedData = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Available routes cache
let cachedRoutes = null;

// Real-time listener reference
let unsubscribeListener = null;

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

      // Update cache
      cachedData = sosData;
      cacheTimestamp = Date.now();

      // Call callback with processed data
      callback(sosData);
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

// Get available routes from SOS data
export const getAvailableRoutes = async () => {
  if (cachedRoutes) {
    return cachedRoutes;
  }

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
    return cachedRoutes;
  } catch (error) {
    console.error("Error fetching available routes:", error);
    return [];
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
  const resolvedIncidents = sosData.filter(item => 
    item.status && item.status.toLowerCase() === 'resolved'
  ).length;
  
  const resolutionRate = totalIncidents > 0 ? (resolvedIncidents / totalIncidents) * 100 : 0;
  
  // Calculate average response time (time from pending to received status)
  let totalResponseTime = 0;
  let responseTimeCount = 0;
  
  sosData.forEach(item => {
    if (item.status && item.status.toLowerCase() === 'received' && item.timestamp) {
      // Simulate response time calculation (in real app, you'd have status change timestamps)
      // For now, we'll use a base calculation
      const responseTime = Math.random() * 15; // 0-15 minutes simulation
      totalResponseTime += responseTime;
      responseTimeCount++;
    }
  });
  
  const avgResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0;
  
  // Count critical incidents (you can define criteria)
  const criticalIncidents = sosData.filter(item => 
    item.severity === 'critical' || 
    item.emergencyType === 'Medical Emergency' ||
    item.emergencyType === 'Security Incident'
  ).length;

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
    if (item.status && (item.status.toLowerCase() === 'received' || item.status.toLowerCase() === 'resolved')) {
      // Simulate response time (in real app, calculate from timestamp differences)
      const responseTime = Math.random() * 20;
      
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
        resolved: 0,
        pending: 0,
        avgResponseTime: 0,
        responseTimesSum: 0,
        responseTimesCount: 0
      };
    }

    typeAnalysis[type].total++;
    
    if (item.status) {
      const status = item.status.toLowerCase();
      if (status === 'resolved') {
        typeAnalysis[type].resolved++;
      } else if (status === 'pending') {
        typeAnalysis[type].pending++;
      }
      
      if (status === 'received' || status === 'resolved') {
        // Simulate response time calculation
        const responseTime = Math.random() * 15;
        typeAnalysis[type].responseTimesSum += responseTime;
        typeAnalysis[type].responseTimesCount++;
      }
    }
  });

  // Calculate averages and return formatted data
  return Object.entries(typeAnalysis).map(([type, data]) => ({
    type,
    total: data.total,
    resolved: data.resolved,
    pending: data.pending,
    resolutionRate: data.total > 0 ? (data.resolved / data.total) * 100 : 0,
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
        resolved: 0,
        criticalCount: 0,
        emergencyTypes: {}
      };
    }

    routeAnalysis[route].total++;
    
    if (item.status && item.status.toLowerCase() === 'resolved') {
      routeAnalysis[route].resolved++;
    }
    
    // Count critical incidents
    if (item.severity === 'critical' || 
        item.emergencyType === 'Medical Emergency' ||
        item.emergencyType === 'Security Incident') {
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
    resolved: data.resolved,
    critical: data.criticalCount,
    resolutionRate: data.total > 0 ? (data.resolved / data.total) * 100 : 0,
    riskLevel: calculateRiskLevel(data.total, data.criticalCount, data.resolved),
    topEmergencyType: Object.entries(data.emergencyTypes)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'None'
  })).sort((a, b) => b.total - a.total);
};

// Calculate risk level for routes
const calculateRiskLevel = (total, critical, resolved) => {
  if (total === 0) return 'Low';
  
  const criticalRate = (critical / total) * 100;
  const resolutionRate = (resolved / total) * 100;
  
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
          resolved: 0,
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
      resolutionRate: data.total > 0 ? (data.resolved / data.total) * 100 : 0
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
};

// Generate performance insights
export const generateInsights = (sosData, metrics, routeHotspots) => {
  const insights = {
    strengths: [],
    improvements: [],
    recommendations: []
  };

  // Analyze strengths
  if (metrics.resolutionRate > 80) {
    insights.strengths.push("High resolution rate indicates effective incident management");
  }
  
  if (metrics.avgResponseTime < 5) {
    insights.strengths.push("Excellent average response time under 5 minutes");
  }

  // Identify improvement areas
  if (metrics.resolutionRate < 50) {
    insights.improvements.push("Low resolution rate needs immediate attention");
  }
  
  if (metrics.avgResponseTime > 10) {
    insights.improvements.push("Response time exceeds 10 minutes - review dispatch process");
  }
  
  const highRiskRoutes = routeHotspots.filter(r => r.riskLevel === 'High');
  if (highRiskRoutes.length > 0) {
    insights.improvements.push(`${highRiskRoutes.length} routes identified as high-risk`);
  }

  // Generate recommendations
  if (metrics.criticalIncidents > metrics.totalIncidents * 0.3) {
    insights.recommendations.push("Consider implementing preventive measures for critical incidents");
  }
  
  if (highRiskRoutes.length > 0) {
    insights.recommendations.push(`Focus additional resources on high-risk routes: ${highRiskRoutes.slice(0, 3).map(r => r.route).join(', ')}`);
  }
  
  if (metrics.avgResponseTime > 8) {
    insights.recommendations.push("Implement real-time tracking system to improve response times");
  }

  return insights;
};

// Cleanup function
export const cleanup = () => {
  if (unsubscribeListener) {
    unsubscribeListener();
    unsubscribeListener = null;
  }
  cachedData = null;
  cacheTimestamp = null;
  cachedRoutes = null;
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
      location: item.location ? `${item.location.lat}, ${item.location.lng}` : 'Unknown',
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