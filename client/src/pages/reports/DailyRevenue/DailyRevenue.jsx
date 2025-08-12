// DailyRevenue.jsx
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar, ResponsiveContainer } from 'recharts';
import { 
  loadRevenueData, 
  preparePieChartData, 
  prepareRouteRevenueData 
} from '/src/pages/reports/DailyRevenue/DailyRevenue.js';
import './DailyRevenue.css';

const DailyRevenue = () => {
  const [revenueData, setRevenueData] = useState({
    conductorTrips: [],
    preTicketing: [],
    totalRevenue: 0,
    totalPassengers: 0,
    averageFare: 0,
    conductorRevenue: 0,
    preTicketingRevenue: 0
  });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  // Load data for selected date
  const handleLoadRevenueData = async () => {
    setLoading(true);
    try {
      const data = await loadRevenueData(selectedDate);
      setRevenueData(data);
    } catch (error) {
      console.error('Error loading revenue data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleLoadRevenueData();
  }, [selectedDate]);

  // Simple print functionality - let CSS handle the hiding
  const handlePrint = () => {
    window.print();
  };

  // Prepare chart data
  const pieChartData = preparePieChartData(revenueData.conductorRevenue, revenueData.preTicketingRevenue);
  const routeChartData = prepareRouteRevenueData(revenueData.conductorTrips, revenueData.preTicketing);

  const formatTime = (timestamp) => {
    if (!timestamp || !timestamp.toDate) return 'N/A';
    return timestamp.toDate().toLocaleTimeString();
  };

  const formatCurrency = (amount) => `₱${amount.toFixed(2)}`;

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  if (loading) {
    return (
      <div className="daily-revenue-container">
        <div className="loading-state">
          <p>Loading revenue data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="daily-revenue-container">
      {/* Print Header - Only visible when printing */}
      <div className="print-header">
        <div className="company-info">
          <h1>B-Go Bus Transportation</h1>
          <p>Daily Revenue Report</p>
        </div>
        <div className="report-info">
          <p><strong>Report Date:</strong> {formatDate(selectedDate)}</p>
          <p><strong>Generated:</strong> {new Date().toLocaleString()}</p>
        </div>
      </div>

      {/* Header */}
      <div className="revenue-header">
        <div className="date-controls">
          <label className="date-label">Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="date-input"
          />
          <button
            onClick={handleLoadRevenueData}
            disabled={loading}
            className="refresh-btn"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={handlePrint}
            className="print-btn"
            disabled={loading}
          >
            🖨️ Print Report
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <h3 className="card-title">Total Revenue</h3>
          <p className="card-value revenue">
            {formatCurrency(revenueData.totalRevenue)}
          </p>
        </div>
        <div className="summary-card">
          <h3 className="card-title">Total Passengers</h3>
          <p className="card-value passengers">
            {revenueData.totalPassengers}
          </p>
        </div>
        <div className="summary-card">
          <h3 className="card-title">Average Fare</h3>
          <p className="card-value average">
            {formatCurrency(revenueData.averageFare)}
          </p>
        </div>
        <div className="summary-card">
          <h3 className="card-title">Total Trips</h3>
          <p className="card-value trips">
            {revenueData.conductorTrips.length + revenueData.preTicketing.length}
          </p>
        </div>
      </div>

      {/* Revenue Breakdown Summary for Print */}
      <div className="print-summary">
        <h3>Revenue Breakdown Summary</h3>
        <div className="breakdown-summary">
          <div className="breakdown-item">
            <span className="breakdown-label">Conductor Trips Revenue:</span>
            <span className="breakdown-value">{formatCurrency(revenueData.conductorRevenue)}</span>
          </div>
          <div className="breakdown-item">
            <span className="breakdown-label">Pre-ticketing Revenue:</span>
            <span className="breakdown-value">{formatCurrency(revenueData.preTicketingRevenue)}</span>
          </div>
          <div className="breakdown-item total">
            <span className="breakdown-label">Total Revenue:</span>
            <span className="breakdown-value">{formatCurrency(revenueData.totalRevenue)}</span>
          </div>
        </div>
      </div>

      {/* Top Routes Summary for Print */}
      <div className="print-summary">
        <h3>Top 5 Routes by Revenue</h3>
        <div className="top-routes-summary">
          {routeChartData.slice(0, 5).map((route, index) => (
            <div key={index} className="route-item">
              <span className="route-name">{route.route}</span>
              <span className="route-revenue">{formatCurrency(route.revenue)}</span>
              <span className="route-passengers">({route.passengers} passengers)</span>
            </div>
          ))}
        </div>
      </div>

      {/* Charts Section */}
      <div className="charts-section">
        {/* Revenue Source Breakdown */}
        <div className="chart-container">
          <h3 className="chart-title">Revenue by Source</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top Routes by Revenue */}
        <div className="chart-container">
          <h3 className="chart-title">Top Routes by Revenue</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={routeChartData.slice(0, 5)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="route" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="revenue" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="breakdown-section">
        <h3 className="breakdown-title">Detailed Revenue Breakdown</h3>
        
        {/* Conductor Trips Section */}
        <div className="section-container">
          <h4 className="section-title conductor">
            Conductor Trips ({formatCurrency(revenueData.conductorRevenue || 0)})
          </h4>
          {revenueData.conductorTrips.length > 0 ? (
            <div className="table-container">
              <table className="revenue-table">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Passengers</th>
                    <th>Fare</th>
                    <th>Discount</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueData.conductorTrips.map((trip, index) => (
                    <tr key={index}>
                      <td className="route-text">
                        {trip.from} → {trip.to}
                      </td>
                      <td>{trip.quantity}</td>
                      <td className="fare-amount">{formatCurrency(trip.totalFare)}</td>
                      <td className="discount-amount">{formatCurrency(trip.discountAmount)}</td>
                      <td>{formatTime(trip.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <h3>No conductor trips found</h3>
              <p>No conductor trip data available for the selected date.</p>
            </div>
          )}
        </div>

        {/* Pre-ticketing Section */}
        <div className="section-container">
          <h4 className="section-title pre-ticketing">
            Pre-ticketing ({formatCurrency(revenueData.preTicketingRevenue || 0)})
          </h4>
          {revenueData.preTicketing.length > 0 ? (
            <div className="table-container">
              <table className="revenue-table">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Passengers</th>
                    <th>Fare</th>
                    <th>Discount</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueData.preTicketing.map((trip, index) => (
                    <tr key={index}>
                      <td className="route-text">
                        {trip.from} → {trip.to}
                      </td>
                      <td>{trip.quantity}</td>
                      <td className="fare-amount">{formatCurrency(trip.totalFare)}</td>
                      <td className="discount-amount">{formatCurrency(trip.discountAmount)}</td>
                      <td>{formatTime(trip.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <h3>No pre-ticketing data found</h3>
              <p>No pre-ticketing data available for the selected date.</p>
            </div>
          )}
        </div>
      </div>

      {/* Print Footer */}
      <div className="print-footer">
        <div className="footer-left">
          <p>This report was generated automatically by the B-Go Bus Transportation System</p>
        </div>
        <div className="footer-right">
          <p>Page 1 of 1</p>
        </div>
      </div>
    </div>
  );
};

export default DailyRevenue;