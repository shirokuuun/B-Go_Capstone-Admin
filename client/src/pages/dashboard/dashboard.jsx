import { useEffect, useState } from 'react';
import DashboardService from './dashboard.js';
import './dashboard.css';

function Dashboard() {
  const [dashboardData, setDashboardData] = useState(null);
  const [filter, setFilter] = useState('today');
  const [customDate, setCustomDate] = useState('');

  useEffect(() => {
    const fetchDashboardData = async () => {
      const service = new DashboardService();  
      const data = await service.getDashboardData(filter, customDate);
      setDashboardData(data);
    };
    fetchDashboardData();
  }, [filter, customDate]);

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Unknown time';
    const date = timestamp.toDate ? timestamp.toDate() : timestamp;
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'pending':
      case 'waiting':
        return 'status-pending';
      case 'received':
      case 'acknowledged':
      case 'in_progress':
        return 'status-received';
      case 'cancelled':
      case 'canceled':
        return 'status-cancelled';
      case 'completed':
      case 'resolved':
      case 'closed':
        return 'status-completed';
      default:
        return 'status-unknown';
    }
  };

  return (
    <div className="dashboard-container">
      {/* Filter Section */}
      <div className="filter-section">
        <label htmlFor="filter">Filter:</label>
        <select id="filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="today">Today Only</option>
          <option value="all">All Time</option>
          <option value="custom">Custom Date</option>
        </select>

        {filter === 'custom' && (
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
          />
        )}
      </div>

      {!dashboardData ? (
        <p className="loading-text">Loading dashboard data...</p>
      ) : (
        <div className="dashboard-grid">
          {/* Trip Summary Card */}
          <div className="trip-summary-card">
            <h3>Trip Summary</h3>
            <div className="summary-grid">
              <div className="summary-item">
                <h4>Total Trips</h4>
                <p>{dashboardData.trips.totalTrips}</p>
              </div>
              <div className="summary-item">
                <h4>Total Fare</h4>
                <p>₱{dashboardData.trips.totalFare.toFixed(2)}</p>
              </div>
              <div className="summary-item">
                <h4>Avg. Passengers/Trip</h4>
                <p>{dashboardData.trips.avgPassengers}</p>
              </div>
              <div className="summary-item">
                <h4>Most Common Route</h4>
                <p>{dashboardData.trips.mostCommonRoute}</p>
              </div>
            </div>
          </div>

          {/* SOS Requests Summary Card */}
          <div className="sos-summary-card">
            <h3>SOS Requests</h3>
            <div className="summary-grid">
              <div className="summary-item">
                <h4>Total Requests</h4>
                <p>{dashboardData.sos.totalRequests}</p>
              </div>
              <div className="summary-item pending">
                <h4>Pending</h4>
                <p>{dashboardData.sos.pendingRequests}</p>
              </div>
              <div className="summary-item received">
                <h4>Received</h4>
                <p>{dashboardData.sos.receivedRequests}</p>
              </div>
              <div className="summary-item cancelled">
                <h4>Cancelled</h4>
                <p>{dashboardData.sos.cancelledRequests}</p>
              </div>
            </div>
          </div>

          {/* Recent SOS Requests */}
          {dashboardData.sos.recentRequests.length > 0 && (
            <div className="recent-sos-card">
              <h3>Recent SOS Requests (Today)</h3>
              <div className="recent-sos-list">
                {dashboardData.sos.recentRequests.map((request, index) => (
                  <div key={request.id || index} className="sos-request-item">
                    <div className="sos-header">
                      <span className={`sos-status ${getStatusColor(request.status)}`}>
                        {request.status.toUpperCase()}
                      </span>
                      <span className="sos-time">{formatTime(request.timestamp)}</span>
                    </div>
                    <div className="sos-details">
                      <p className="sos-passenger">
                        <strong>Passenger:</strong> {request.passengerName}
                      </p>
                      <p className="sos-location">
                        <strong>Location:</strong> {request.location}
                      </p>
                      {request.message && (
                        <p className="sos-message">
                          <strong>Message:</strong> {request.message}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Dashboard;