import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer 
} from 'recharts';
import {
  fetchSOSData,
  getAvailableRoutes,
  calculateMetrics,
  analyzeResponseTimeDistribution,
  analyzeEmergencyTypes,
  identifyRouteHotspots,
  analyzeMonthlyTrends,
  generateInsights,
  prepareExcelData,
  cleanup
} from './FetchSOSReport.js';
import './SOSReport.css';

const SOSReport = () => {
  // Data states
  const [sosData, setSOSData] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [responseTimeDistribution, setResponseTimeDistribution] = useState([]);
  const [emergencyTypes, setEmergencyTypes] = useState([]);
  const [routeHotspots, setRouteHotspots] = useState([]);
  const [monthlyTrends, setMonthlyTrends] = useState([]);
  const [insights, setInsights] = useState({ strengths: [], improvements: [], recommendations: [] });
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filter states
  const [timeRange, setTimeRange] = useState('30'); // days
  const [routeFilter, setRouteFilter] = useState('all');
  const [emergencyTypeFilter, setEmergencyTypeFilter] = useState('all');
  const [availableRoutes, setAvailableRoutes] = useState([]);
  
  // Available emergency types
  const emergencyTypeOptions = [
    'Medical Emergency',
    'Vehicle Breakdown', 
    'Security Incident',
    'Route Obstruction',
    'Other'
  ];

  // Calculate date range based on selected time range
  const getDateRange = () => {
    const end = new Date();
    const start = new Date();
    
    switch(timeRange) {
      case '7':
        start.setDate(end.getDate() - 7);
        break;
      case '30':
        start.setDate(end.getDate() - 30);
        break;
      case '90':
        start.setDate(end.getDate() - 90);
        break;
      case '180':
        start.setDate(end.getDate() - 180);
        break;
      default:
        start.setDate(end.getDate() - 30);
    }
    
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  };

  // Load and process data
  const loadData = () => {
    setLoading(true);
    setError(null);
    
    const dateRange = getDateRange();
    
    const unsubscribe = fetchSOSData(
      dateRange,
      routeFilter,
      emergencyTypeFilter,
      (data) => {
        try {
          setSOSData(data);
          
          // Calculate all analytics
          const calculatedMetrics = calculateMetrics(data);
          const responseDistribution = analyzeResponseTimeDistribution(data);
          const emergencyAnalysis = analyzeEmergencyTypes(data);
          const hotspots = identifyRouteHotspots(data);
          const trends = analyzeMonthlyTrends(data);
          const performanceInsights = generateInsights(data, calculatedMetrics, hotspots);
          
          setMetrics(calculatedMetrics);
          setResponseTimeDistribution(responseDistribution);
          setEmergencyTypes(emergencyAnalysis);
          setRouteHotspots(hotspots);
          setMonthlyTrends(trends);
          setInsights(performanceInsights);
          
          setLoading(false);
        } catch (err) {
          console.error('Error processing SOS data:', err);
          setError('Failed to process SOS data');
          setLoading(false);
        }
      }
    );
    
    return unsubscribe;
  };

  // Load available routes
  const loadRoutes = async () => {
    try {
      const routes = await getAvailableRoutes();
      setAvailableRoutes(routes);
    } catch (err) {
      console.error('Error loading routes:', err);
    }
  };

  // Initialize data
  useEffect(() => {
    loadRoutes();
    const unsubscribe = loadData();
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      cleanup();
    };
  }, [timeRange, routeFilter, emergencyTypeFilter]);

  // Handle filter changes
  const handleTimeRangeChange = (newRange) => {
    setTimeRange(newRange);
  };

  const handleRouteFilterChange = (newRoute) => {
    setRouteFilter(newRoute);
  };

  const handleEmergencyTypeFilterChange = (newType) => {
    setEmergencyTypeFilter(newType);
  };

  // Export to Excel
  const handleExportExcel = () => {
    try {
      const excelData = prepareExcelData(sosData, metrics, routeHotspots, emergencyTypes, monthlyTrends);
      
      const workbook = XLSX.utils.book_new();
      
      // Summary sheet
      const summaryData = [
        ['SOS Analytics Report'],
        [''],
        ['Generated:', new Date().toLocaleString()],
        ['Time Range:', `Last ${timeRange} days`],
        ['Route Filter:', routeFilter === 'all' ? 'All Routes' : routeFilter],
        ['Emergency Type Filter:', emergencyTypeFilter === 'all' ? 'All Types' : emergencyTypeFilter],
        [''],
        ['SUMMARY METRICS'],
        ['Total Incidents', excelData.summary.totalIncidents],
        ['Resolution Rate', excelData.summary.resolutionRate],
        ['Average Response Time', excelData.summary.avgResponseTime],
        ['Critical Incidents', excelData.summary.criticalIncidents]
      ];
      
      const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summaryWS, 'Summary');
      
      // Response Times sheet
      const responseTimeData = [
        ['Response Time Distribution'],
        [''],
        ['Time Range', 'Count', 'Percentage']
      ];
      
      responseTimeDistribution.forEach(item => {
        responseTimeData.push([item.range, item.count, `${item.percentage.toFixed(1)}%`]);
      });
      
      const responseTimeWS = XLSX.utils.aoa_to_sheet(responseTimeData);
      XLSX.utils.book_append_sheet(workbook, responseTimeWS, 'Response Times');
      
      // Emergency Types sheet
      const emergencyTypeData = [
        ['Emergency Type Analysis'],
        [''],
        ['Emergency Type', 'Total', 'Resolved', 'Pending', 'Resolution Rate', 'Avg Response Time']
      ];
      
      emergencyTypes.forEach(item => {
        emergencyTypeData.push([
          item.type,
          item.total,
          item.resolved,
          item.pending,
          `${item.resolutionRate.toFixed(1)}%`,
          `${item.avgResponseTime.toFixed(1)} min`
        ]);
      });
      
      const emergencyTypeWS = XLSX.utils.aoa_to_sheet(emergencyTypeData);
      XLSX.utils.book_append_sheet(workbook, emergencyTypeWS, 'Emergency Types');
      
      // Route Analysis sheet
      const routeAnalysisData = [
        ['Route Hotspots Analysis'],
        [''],
        ['Route', 'Total Incidents', 'Resolved', 'Critical', 'Resolution Rate', 'Risk Level', 'Top Emergency Type']
      ];
      
      routeHotspots.forEach(item => {
        routeAnalysisData.push([
          item.route,
          item.total,
          item.resolved,
          item.critical,
          `${item.resolutionRate.toFixed(1)}%`,
          item.riskLevel,
          item.topEmergencyType
        ]);
      });
      
      const routeAnalysisWS = XLSX.utils.aoa_to_sheet(routeAnalysisData);
      XLSX.utils.book_append_sheet(workbook, routeAnalysisWS, 'Route Analysis');
      
      // Monthly Trends sheet
      const monthlyTrendsData = [
        ['Monthly Trends Analysis'],
        [''],
        ['Month', 'Total', 'Resolved', 'Pending', 'Cancelled', 'Resolution Rate']
      ];
      
      monthlyTrends.forEach(item => {
        monthlyTrendsData.push([
          item.month,
          item.total,
          item.resolved,
          item.pending,
          item.cancelled,
          `${item.resolutionRate.toFixed(1)}%`
        ]);
      });
      
      const monthlyTrendsWS = XLSX.utils.aoa_to_sheet(monthlyTrendsData);
      XLSX.utils.book_append_sheet(workbook, monthlyTrendsWS, 'Monthly Trends');
      
      // Generate filename
      const filename = `SOS_Analytics_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      // Save file
      XLSX.writeFile(workbook, filename);
      
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      alert('Failed to export to Excel. Please try again.');
    }
  };

  // Format helpers
  const formatCurrency = (amount) => `₱${Number(amount).toFixed(2)}`;
  const formatPercentage = (value) => `${Number(value).toFixed(1)}%`;
  const formatTime = (minutes) => `${Number(minutes).toFixed(1)} min`;

  // Chart colors
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  if (loading) {
    return (
      <div className="sos-report-container">
        <div className="sos-report-loading">
          <div className="loading-spinner"></div>
          <p>Loading SOS Analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sos-report-container">
        <div className="sos-report-error">
          <h3>Error Loading Data</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="sos-report-container">
      {/* Header */}
      <div className="sos-report-header">
        <h1>SOS Analytics Report</h1>
        <div className="sos-report-actions">
          <button
            onClick={loadData}
            className="sos-refresh-btn"
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={handleExportExcel}
            className="sos-export-btn"
            disabled={loading || sosData.length === 0}
          >
            📊 Export Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="sos-report-filters">
        <div className="filter-group">
          <label>Time Range:</label>
          <select value={timeRange} onChange={(e) => handleTimeRangeChange(e.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 3 months</option>
            <option value="180">Last 6 months</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label>Route:</label>
          <select value={routeFilter} onChange={(e) => handleRouteFilterChange(e.target.value)}>
            <option value="all">All Routes</option>
            {availableRoutes.map(route => (
              <option key={route} value={route}>{route}</option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <label>Emergency Type:</label>
          <select value={emergencyTypeFilter} onChange={(e) => handleEmergencyTypeFilterChange(e.target.value)}>
            <option value="all">All Types</option>
            {emergencyTypeOptions.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Performance Metrics Dashboard */}
      <div className="sos-metrics-dashboard-container">
      <div className="sos-metrics-pattern"></div>
      <div className="sos-metrics-dashboard">
        <div className="metric-card">
          <h3>Total Incidents</h3>
          <div className="metric-value">{metrics.totalIncidents || 0}</div>
        </div>
        <div className="metric-card">
          <h3>Resolution Rate</h3>
          <div className="metric-value">{formatPercentage(metrics.resolutionRate || 0)}</div>
        </div>
        <div className="metric-card">
          <h3>Avg Response Time</h3>
          <div className="metric-value">{formatTime(metrics.avgResponseTime || 0)}</div>
        </div>
        <div className="metric-card">
          <h3>Critical Incidents</h3>
          <div className="metric-value">{metrics.criticalIncidents || 0}</div>
        </div>
      </div>
      </div>

      {/* Charts Section */}
      <div className="sos-charts-section">
        {/* Response Time Distribution */}
        <div className="chart-container">
          <h3>Response Time Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={responseTimeDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Trends */}
        <div className="chart-container">
          <h3>Monthly Trends</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total" stroke="#8884d8" name="Total Incidents" />
              <Line type="monotone" dataKey="resolved" stroke="#82ca9d" name="Resolved" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Emergency Type Analysis */}
      <div className="sos-analysis-section">
        <h3>Emergency Type Analysis</h3>
        <div className="analysis-table-container">
          <table className="analysis-table">
            <thead>
              <tr>
                <th>Emergency Type</th>
                <th>Total</th>
                <th>Resolved</th>
                <th>Pending</th>
                <th>Resolution Rate</th>
                <th>Avg Response Time</th>
              </tr>
            </thead>
            <tbody>
              {emergencyTypes.map((item, index) => (
                <tr key={index}>
                  <td>{item.type}</td>
                  <td>{item.total}</td>
                  <td>{item.resolved}</td>
                  <td>{item.pending}</td>
                  <td>{formatPercentage(item.resolutionRate)}</td>
                  <td>{formatTime(item.avgResponseTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Route Hotspots */}
      <div className="sos-hotspots-section">
        <h3>Route Hotspots Analysis</h3>
        <div className="hotspots-grid">
          {routeHotspots.slice(0, 6).map((hotspot, index) => (
            <div key={index} className={`hotspot-card risk-${hotspot.riskLevel.toLowerCase()}`}>
              <h4>{hotspot.route}</h4>
              <div className="hotspot-stats">
                <div className="stat">
                  <span className="stat-label">Total Incidents:</span>
                  <span className="stat-value">{hotspot.total}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Critical:</span>
                  <span className="stat-value">{hotspot.critical}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Resolution Rate:</span>
                  <span className="stat-value">{formatPercentage(hotspot.resolutionRate)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Risk Level:</span>
                  <span className={`stat-value risk-${hotspot.riskLevel.toLowerCase()}`}>
                    {hotspot.riskLevel}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Top Emergency:</span>
                  <span className="stat-value">{hotspot.topEmergencyType}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Insights */}
      <div className="sos-insights-section">
        <h3>Performance Insights</h3>
        <div className="insights-grid">
          {insights.strengths.length > 0 && (
            <div className="insights-card strengths">
              <h4>✅ Strengths</h4>
              <ul>
                {insights.strengths.map((strength, index) => (
                  <li key={index}>{strength}</li>
                ))}
              </ul>
            </div>
          )}
          
          {insights.improvements.length > 0 && (
            <div className="insights-card improvements">
              <h4>⚠️ Areas for Improvement</h4>
              <ul>
                {insights.improvements.map((improvement, index) => (
                  <li key={index}>{improvement}</li>
                ))}
              </ul>
            </div>
          )}
          
          {insights.recommendations.length > 0 && (
            <div className="insights-card recommendations">
              <h4>💡 Recommendations</h4>
              <ul>
                {insights.recommendations.map((recommendation, index) => (
                  <li key={index}>{recommendation}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SOSReport;