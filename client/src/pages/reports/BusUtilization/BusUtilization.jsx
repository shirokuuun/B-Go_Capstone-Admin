// BusUtilization.jsx - Fixed to use formatted reservation data
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar, ResponsiveContainer } from 'recharts';
import { 
  loadUtilizationData, 
  preparePieChartData, 
  prepareHourlyUtilizationData,
  prepareReservationStatusData,
  formatReservationData // Add this import
} from '/src/pages/reports/BusUtilization/BusUtilization.js';
import './BusUtilization.css';

const BusUtilization = () => {
  const [utilizationData, setUtilizationData] = useState({
    availableBuses: [],
    reservations: [],
    totalBuses: 0,
    reservedBuses: 0,
    utilizationRate: 0,
    pendingReservations: 0,
    confirmedReservations: 0,
    completedReservations: 0,
    cancelledReservations: 0
  });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  // Load data for selected date
  const handleLoadUtilizationData = async () => {
    setLoading(true);
    try {
      const data = await loadUtilizationData(selectedDate);
      setUtilizationData(data);
    } catch (error) {
      console.error('Error loading utilization data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleLoadUtilizationData();
  }, [selectedDate]);

  // Simple print functionality
  const handlePrint = () => {
    window.print();
  };

  // Prepare chart data
  const pieChartData = preparePieChartData(utilizationData.reservedBuses, utilizationData.totalBuses - utilizationData.reservedBuses);
  const hourlyData = prepareHourlyUtilizationData(utilizationData.reservations);
  const statusData = prepareReservationStatusData(
    utilizationData.pendingReservations,
    utilizationData.confirmedReservations,
    utilizationData.completedReservations,
    utilizationData.cancelledReservations
  );

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatTime = (timestamp) => {
    if (!timestamp || !timestamp.toDate) return 'N/A';
    return timestamp.toDate().toLocaleTimeString();
  };

  const formatPercentage = (value) => `${value.toFixed(1)}%`;

  // Format amount safely
  const formatAmount = (amount) => {
    const numAmount = parseFloat(amount) || 2000; // Default to 2000 if no amount
    return `₱${numAmount.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="bus-util-container">
        <div className="bus-util-loading-state">
          <p>Loading bus utilization data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bus-util-container">
      {/* Print Header - Only visible when printing */}
      <div className="bus-util-print-header">
        <div className="bus-util-company-info">
          <h1>B-Go Bus Transportation</h1>
          <p>Bus Utilization Report</p>
        </div>
        <div className="bus-util-report-info">
          <p><strong>Report Date:</strong> {formatDate(selectedDate)}</p>
          <p><strong>Generated:</strong> {new Date().toLocaleString()}</p>
        </div>
      </div>

      {/* Header */}
      <div className="bus-util-header">
        <div className="bus-util-date-controls">
          <label className="bus-util-date-label">Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bus-util-date-input"
          />
          <button
            onClick={handleLoadUtilizationData}
            disabled={loading}
            className="bus-util-refresh-btn"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={handlePrint}
            className="bus-util-print-btn"
            disabled={loading}
          >
            🖨️ Print Report
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="bus-util-summary-cards">
        <div className="bus-util-summary-card">
          <h3 className="bus-util-card-title">Total Buses</h3>
          <p className="bus-util-card-value bus-util-total-buses">
            {utilizationData.totalBuses}
          </p>
        </div>
        <div className="bus-util-summary-card">
          <h3 className="bus-util-card-title">Reserved Buses</h3>
          <p className="bus-util-card-value bus-util-reserved-buses">
            {utilizationData.reservedBuses}
          </p>
        </div>
        <div className="bus-util-summary-card">
          <h3 className="bus-util-card-title">Utilization Rate</h3>
          <p className="bus-util-card-value bus-util-utilization-rate">
            {formatPercentage(utilizationData.utilizationRate)}
          </p>
        </div>
        <div className="bus-util-summary-card">
          <h3 className="bus-util-card-title">Available Buses</h3>
          <p className="bus-util-card-value bus-util-available-buses">
            {utilizationData.totalBuses - utilizationData.reservedBuses}
          </p>
        </div>
      </div>

      {/* Utilization Summary for Print */}
      <div className="bus-util-print-summary">
        <h3>Fleet Utilization Summary</h3>
        <div className="bus-util-breakdown-summary">
          <div className="bus-util-breakdown-item">
            <span className="bus-util-breakdown-label">Total Fleet Size:</span>
            <span className="bus-util-breakdown-value">{utilizationData.totalBuses} buses</span>
          </div>
          <div className="bus-util-breakdown-item">
            <span className="bus-util-breakdown-label">Currently Reserved:</span>
            <span className="bus-util-breakdown-value">{utilizationData.reservedBuses} buses</span>
          </div>
          <div className="bus-util-breakdown-item">
            <span className="bus-util-breakdown-label">Available for Booking:</span>
            <span className="bus-util-breakdown-value">{utilizationData.totalBuses - utilizationData.reservedBuses} buses</span>
          </div>
          <div className="bus-util-breakdown-item bus-util-total">
            <span className="bus-util-breakdown-label">Utilization Rate:</span>
            <span className="bus-util-breakdown-value">{formatPercentage(utilizationData.utilizationRate)}</span>
          </div>
        </div>
      </div>

      {/* Reservation Status Summary for Print */}
      <div className="bus-util-print-summary">
        <h3>Reservation Status Breakdown</h3>
        <div className="bus-util-status-summary">
          <div className="bus-util-status-item bus-util-pending">
            <span className="bus-util-status-label">Pending:</span>
            <span className="bus-util-status-count">{utilizationData.pendingReservations}</span>
          </div>
          <div className="bus-util-status-item bus-util-confirmed">
            <span className="bus-util-status-label">Confirmed:</span>
            <span className="bus-util-status-count">{utilizationData.confirmedReservations}</span>
          </div>
          <div className="bus-util-status-item bus-util-completed">
            <span className="bus-util-status-label">Completed:</span>
            <span className="bus-util-status-count">{utilizationData.completedReservations}</span>
          </div>
          <div className="bus-util-status-item bus-util-cancelled">
            <span className="bus-util-status-label">Cancelled:</span>
            <span className="bus-util-status-count">{utilizationData.cancelledReservations}</span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="bus-util-charts-section">
        {/* Fleet Utilization Breakdown */}
        <div className="bus-util-chart-container">
          <h3 className="bus-util-chart-title">Fleet Utilization</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(1)}%)`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Reservation Status Distribution */}
        <div className="bus-util-chart-container">
          <h3 className="bus-util-chart-title">Reservation Status Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="status" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#82ca9d" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="bus-util-breakdown-section">
        <h3 className="bus-util-breakdown-title">Detailed Utilization Breakdown</h3>
        
        {/* Available Buses Section */}
        <div className="bus-util-section-container">
          <h4 className="bus-util-section-title bus-util-available">
            Available Buses ({utilizationData.totalBuses - utilizationData.reservedBuses} of {utilizationData.totalBuses})
          </h4>
          {utilizationData.availableBuses.length > 0 ? (
            <div className="bus-util-table-container">
              <table className="bus-util-table">
                <thead>
                  <tr>
                    <th>Bus ID</th>
                    <th>Bus Type</th>
                    <th>Capacity</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {utilizationData.availableBuses.map((bus, index) => (
                    <tr key={index}>
                      <td className="bus-util-bus-id">{bus.id || bus.busNumber || `Bus-${index + 1}`}</td>
                      <td>{bus.type || bus.busType || 'Standard'}</td>
                      <td>{bus.capacity || bus.seatCapacity || '27'}</td>
                      <td className="bus-util-status-available">Available</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bus-util-empty-state">
              <h3>All buses are currently reserved</h3>
              <p>No buses available for new reservations on the selected date.</p>
            </div>
          )}
        </div>

        {/* Reservations Section */}
        <div className="bus-util-section-container">
          <h4 className="bus-util-section-title bus-util-reserved">
            Current Reservations ({utilizationData.reservedBuses})
          </h4>
          {utilizationData.reservations.length > 0 ? (
            <div className="bus-util-table-container">
              <table className="bus-util-table">
                <thead>
                  <tr>
                    <th>Reservation ID</th>
                    <th>Bus ID</th>
                    <th>Customer</th>
                    <th>Date & Time</th>
                    <th>Destination</th>
                    <th>Status</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {utilizationData.reservations.map((reservation, index) => {
                    // Format each reservation using the helper function
                    const formattedReservation = formatReservationData(reservation);
                    
                    return (
                      <tr key={index}>
                        <td className="bus-util-reservation-id">{formattedReservation.id}</td>
                        <td className="bus-util-bus-id">{formattedReservation.busId}</td>
                        <td>{formattedReservation.customerName}</td>
                        <td>{formatTime(formattedReservation.reservationDate)}</td>
                        <td className="bus-util-destination">{formattedReservation.destination}</td>
                        <td className={`bus-util-status-${formattedReservation.status.toLowerCase()}`}>
                          {formattedReservation.status}
                        </td>
                        <td className="bus-util-amount">{formatAmount(formattedReservation.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bus-util-empty-state">
              <h3>No reservations found</h3>
              <p>No bus reservations available for the selected date.</p>
            </div>
          )}
        </div>
      </div>

      {/* Print Footer */}
      <div className="bus-util-print-footer">
        <div className="bus-util-footer-left">
          <p>This report was generated automatically by the B-Go Bus Transportation System</p>
        </div>
        <div className="bus-util-footer-right">
          <p>Page 1 of 1</p>
        </div>
      </div>
    </div>
  );
};

export default BusUtilization;