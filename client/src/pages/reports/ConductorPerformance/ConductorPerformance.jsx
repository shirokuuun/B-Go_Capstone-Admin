// ConductorPerformance.jsx
import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line } from 'recharts';
import { 
  setupConductorPerformanceListener, 
  prepareConductorChartData, 
  prepareRoutePopularityData 
} from '/src/pages/reports/ConductorPerformance/ConductorPerformance.js';
import './ConductorPerformance.css';

const ConductorPerformance = () => {
  const [performanceData, setPerformanceData] = useState({
    conductorData: [],
    overallMetrics: {
      totalRevenue: 0,
      totalRealTimePassengers: 0,
      totalTrips: 0,
      activeConductors: 0,
      totalConductors: 0,
      averageRevenue: 0,
      averagePassengers: 0,
      overallUtilization: 0
    }
  });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [selectedConductor, setSelectedConductor] = useState(null);

  // Set up real-time listener
  useEffect(() => {
    setLoading(true);
    
    const dateParam = selectedDate && selectedDate.trim() !== '' ? selectedDate : null;
    
    const unsubscribe = setupConductorPerformanceListener((data) => {
      setPerformanceData(data);
      setLoading(false);
    }, dateParam);

    // Cleanup function to unsubscribe when component unmounts or date changes
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [selectedDate]);

  // Manual refresh function (now just resets the listener)
  const handleLoadPerformanceData = () => {
    setLoading(true);
    const dateParam = selectedDate && selectedDate.trim() !== '' ? selectedDate : null;
    
    const unsubscribe = setupConductorPerformanceListener((data) => {
      setPerformanceData(data);
      setLoading(false);
    }, dateParam);

    return unsubscribe;
  };

  // Simple print functionality
  const handlePrint = () => {
    window.print();
  };

  // Prepare chart data
  const conductorChartData = prepareConductorChartData(performanceData.conductorData);
  const routePopularityData = prepareRoutePopularityData(performanceData.conductorData);

  const formatTime = (timestamp) => {
    if (!timestamp || !timestamp.toDate) return 'N/A';
    return timestamp.toDate().toLocaleTimeString();
  };

  const formatCurrency = (amount) => `₱${amount.toFixed(2)}`;

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Never';
    
    try {
      const lastSeenDate = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const now = new Date();
      const diffInMinutes = Math.floor((now - lastSeenDate) / (1000 * 60));
      
      if (diffInMinutes < 1) return 'Just now';
      if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
      
      const diffInHours = Math.floor(diffInMinutes / 60);
      if (diffInHours < 24) return `${diffInHours}h ago`;
      
      const diffInDays = Math.floor(diffInHours / 24);
      if (diffInDays < 7) return `${diffInDays}d ago`;
      
      return lastSeenDate.toLocaleDateString();
    } catch (error) {
      console.error('Error formatting last seen:', error);
      return 'Unknown';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getUtilizationColor = (utilization) => {
    if (utilization >= 80) return '#dc3545'; // Red - Over capacity
    if (utilization >= 60) return '#ffc107'; // Yellow - High
    if (utilization >= 40) return '#28a745'; // Green - Good
    return '#6c757d'; // Gray - Low
  };

  if (loading) {
    return (
      <div className="cp-container">
        <div className="cp-loading-state">
          <p>Loading conductor performance data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cp-container">
      {/* Print Header */}
      <div className="cp-print-header">
        <div className="cp-company-info">
          <h1>B-Go Bus Transportation</h1>
          <p>Conductor Performance Report</p>
        </div>
        <div className="cp-report-info">
          <p><strong>Report Date:</strong> {formatDate(selectedDate)}</p>
          <p><strong>Generated:</strong> {new Date().toLocaleString()}</p>
        </div>
      </div>

      {/* Header */}
      <div className="cp-header">
        <div className="cp-date-controls">
          <label className="cp-date-label">Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="cp-date-input"
          />
          <button
            onClick={handleLoadPerformanceData}
            disabled={loading}
            className="cp-refresh-btn"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={handlePrint}
            className="cp-print-btn"
            disabled={loading}
          >
            🖨️ Print Report
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="cp-summary-cards">
        <div className="cp-summary-card">
          <h3 className="cp-card-title">Total Revenue</h3>
          <p className="cp-card-value cp-revenue">
            {formatCurrency(performanceData.overallMetrics.totalRevenue)}
          </p>
        </div>
        <div className="cp-summary-card">
          <h3 className="cp-card-title">Active Conductors</h3>
          <p className="cp-card-value cp-conductors">
            {performanceData.overallMetrics.activeConductors} / {performanceData.overallMetrics.totalConductors}
          </p>
        </div>
        <div className="cp-summary-card">
          <h3 className="cp-card-title">Total Passengers</h3>
          <p className="cp-card-value cp-passengers">
            {performanceData.overallMetrics.totalRealTimePassengers}
          </p>
        </div>
        <div className="cp-summary-card">
          <h3 className="cp-card-title">Overall Utilization</h3>
          <p className="cp-card-value cp-utilization">
            {performanceData.overallMetrics.overallUtilization.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Performance Summary for Print */}
      <div className="cp-print-summary">
        <h3>Performance Summary</h3>
        <div className="cp-breakdown-summary">
          <div className="cp-breakdown-item">
            <span className="cp-breakdown-label">Average Revenue per Conductor:</span>
            <span className="cp-breakdown-value">{formatCurrency(performanceData.overallMetrics.averageRevenue)}</span>
          </div>
          <div className="cp-breakdown-item">
            <span className="cp-breakdown-label">Average Passengers per Conductor:</span>
            <span className="cp-breakdown-value">{performanceData.overallMetrics.averagePassengers.toFixed(1)}</span>
          </div>
          <div className="cp-breakdown-item">
            <span className="cp-breakdown-label">Total Trips:</span>
            <span className="cp-breakdown-value">{performanceData.overallMetrics.totalTrips}</span>
          </div>
        </div>
      </div>

      {/* Top Performers for Print */}
      <div className="cp-print-summary">
        <h3>Top 5 Performers by Revenue</h3>
        <div className="cp-top-performers-summary">
          {performanceData.conductorData.slice(0, 5).map((conductor, index) => (
            <div key={index} className="cp-performer-item">
              <span className="cp-performer-name">{conductor.conductorName}</span>
              <span className="cp-performer-revenue">{formatCurrency(conductor.totalRevenue)}</span>
              <span className="cp-performer-utilization">({conductor.utilizationRate.toFixed(1)}% capacity)</span>
            </div>
          ))}
        </div>
      </div>

      {/* Charts Section */}
      <div className="cp-charts-section">
        {/* Conductor Revenue Comparison */}
        <div className="cp-chart-container">
          <h3 className="cp-chart-title">Top Conductors by Revenue</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={conductorChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="revenue" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Conductor Utilization */}
        <div className="cp-chart-container">
          <h3 className="cp-chart-title">Conductor Capacity Utilization</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={conductorChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
              <Bar dataKey="utilization" fill="#82ca9d" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Conductor Performance Table */}
      <div className="cp-performance-section">
        <h3 className="cp-performance-title">Conductor Performance Details</h3>
        
        <div className="cp-table-container">
          <table className="cp-performance-table">
            <thead>
              <tr>
                <th>Conductor</th>
                <th>Bus #</th>
                <th>Capacity</th>
                <th>Total Passengers</th>
                <th>Total Revenue</th>
                <th>Trips</th>
                <th>Avg Fare</th>
                <th>Last Seen</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {performanceData.conductorData.map((conductor) => (
                <tr 
                  key={conductor.conductorId}
                  className={selectedConductor === conductor.conductorId ? 'cp-selected' : ''}
                  onClick={() => setSelectedConductor(
                    selectedConductor === conductor.conductorId ? null : conductor.conductorId
                  )}
                >
                  <td className="cp-conductor-name">{conductor.conductorName}</td>
                  <td>{conductor.busNumber}</td>
                  <td>{conductor.capacity}</td>
                  <td className="cp-total-passengers">{conductor.totalPassengersCount}</td>
                  <td className="cp-revenue-amount">{formatCurrency(conductor.totalRevenue)}</td>
                  <td>{conductor.totalTrips}</td>
                  <td>{formatCurrency(conductor.averageFare)}</td>
                  <td>
                    <span className="cp-last-seen">
                      {formatLastSeen(conductor.lastSeen)}
                    </span>
                  </td>
                  <td>
                    <span className={`cp-status-badge ${conductor.isOnline ? 'cp-active' : 'cp-inactive'}`}>
                      {conductor.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Selected Conductor Trip Details */}
        {selectedConductor && (
          <div className="cp-conductor-details">
            <h4>Trip Details for {performanceData.conductorData.find(c => c.conductorId === selectedConductor)?.conductorName}</h4>
            <div className="cp-trip-details-container">
              <table className="cp-trip-details-table">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Passengers</th>
                    <th>Fare</th>
                    <th>Discount</th>
                    <th>Time</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceData.conductorData
                    .find(c => c.conductorId === selectedConductor)
                    ?.trips.map((trip, index) => (
                    <tr key={index}>
                      <td className="cp-route-text">{trip.from} → {trip.to}</td>
                      <td>{trip.quantity}</td>
                      <td className="cp-fare-amount">{formatCurrency(trip.totalFare)}</td>
                      <td className="cp-discount-amount">{formatCurrency(trip.discountAmount)}</td>
                      <td>{formatTime(trip.timestamp)}</td>
                      <td>{trip.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Print Footer */}
      <div className="cp-print-footer">
        <div className="cp-footer-left">
          <p>This report was generated automatically by the B-Go Bus Transportation System</p>
        </div>
        <div className="cp-footer-right">
          <p>Page 1 of 1</p>
        </div>
      </div>
    </div>
  );
};

export default ConductorPerformance;