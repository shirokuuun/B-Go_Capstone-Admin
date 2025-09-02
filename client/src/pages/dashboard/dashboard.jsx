import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '/src/firebase/firebase.js';
import { fetchCurrentUserData } from '/src/pages/settings/settings.js';
import DashboardService from './dashboard.js';
import AdminTest from '/src/pages/dashboard/AdminTest.jsx';
import './dashboard.css';

function Dashboard() {
  const [dashboardData, setDashboardData] = useState(null);
  const [filter, setFilter] = useState('today');
  const [customDate, setCustomDate] = useState('');
  const [userData, setUserData] = useState(null);

  // Authentication useEffect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const adminData = await fetchCurrentUserData();
          setUserData(adminData);
        } catch (err) {
          console.error('Error fetching user data:', err);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let isSubscribed = true;
    
    const setupRealTimeData = async () => {
      try {
        setDashboardData(null); // Reset data while loading
        
        const service = new DashboardService();
        const data = await service.getDashboardData(filter, customDate);
        
        // Only update state if component is still mounted
        if (isSubscribed) {
          setDashboardData(data);
        }
        
      } catch (error) {
        console.error('Error setting up dashboard data:', error);
        if (isSubscribed) {
          // Set empty data structure on error to prevent crashes
          setDashboardData({
            trips: {
              totalTrips: 0,
              totalFare: 0,
              avgPassengers: 0,
              mostCommonRoute: 'Error loading data'
            },
            sos: {
              totalRequests: 0,
              pendingRequests: 0,
              receivedRequests: 0,
              cancelledRequests: 0,
              recentRequests: []
            },
            conductors: {
              totalConductors: 0,
              onlineConductors: 0,
              offlineConductors: 0,
              onlinePercentage: 0
            },
            idVerification: {
              totalUsers: 0,
              pendingVerifications: 0,
              verifiedUsers: 0,
              verificationRate: 0
            },
            revenueTrend: []
          });
        }
      }
    };

    setupRealTimeData();
    
    // Cleanup function
    return () => {
      isSubscribed = false;
    };
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
      {/* Stylish Admin Greeting */}
      {userData && (
        <div className="dashboard-greeting">
          <div className="greeting-content">
            <div className="greeting-text">
              <h1 className="greeting-title">
                Hello, <span className="admin-name">{userData.name}</span>
              </h1>
              <p className="greeting-subtitle">Welcome back to your dashboard</p>
            </div>
            <div className="greeting-decoration">
              <div className="greeting-pattern"></div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Test Component - Add this temporarily for testing */}
     {/* <AdminTest /> */}
      
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
          {/* Revenue Trend Card */}
          <div className="revenue-trend-card">
            <h3>7-Day Revenue Trend</h3>
            <div className="revenue-chart">
              <div className="chart-container">
                {dashboardData.revenueTrend.map((day, index) => {
                  const maxRevenue = Math.max(...dashboardData.revenueTrend.map(d => d.revenue));
                  const height = maxRevenue === 0 ? 0 : (day.revenue / maxRevenue) * 100;
                  
                  return (
                    <div key={index} className="chart-bar">
                      <div className="bar-container">
                        <div 
                          className="bar-fill"
                          style={{ height: `${height}%` }}
                          title={`${day.day}: ₱${day.revenue.toFixed(2)}`}
                        ></div>
                      </div>
                      <div className="bar-label">
                        <span className="day">{day.day}</span>
                        <span className="amount">₱{day.revenue.toFixed(0)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {dashboardData.revenueTrend.length === 0 && (
                <div className="no-data">No revenue data available</div>
              )}
            </div>
          </div>
          
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

          {/* Conductors Summary Card */}
          <div className="conductors-summary-card">
            <h3>Conductors Status</h3>
            <div className="summary-grid">
              <div className="summary-item">
                <h4>Total Conductors</h4>
                <p>{dashboardData.conductors.totalConductors}</p>
              </div>
              <div className="summary-item online">
                <h4>Online</h4>
                <p>{dashboardData.conductors.onlineConductors}</p>
              </div>
              <div className="summary-item offline">
                <h4>Offline</h4>
                <p>{dashboardData.conductors.offlineConductors}</p>
              </div>
              <div className="summary-item percentage">
                <h4>Online Rate</h4>
                <p>{dashboardData.conductors.onlinePercentage}%</p>
              </div>
            </div>
          </div>

          {/* ID Verification Summary Card */}
          <div className="id-verification-summary-card">
            <h3>ID Verification Status</h3>
            <div className="summary-grid">
              <div className="summary-item">
                <h4>Total Users</h4>
                <p>{dashboardData.idVerification.totalUsers}</p>
              </div>
              <div className="summary-item pending-verification">
                <h4>Pending</h4>
                <p>{dashboardData.idVerification.pendingVerifications}</p>
              </div>
              <div className="summary-item verified">
                <h4>Verified</h4>
                <p>{dashboardData.idVerification.verifiedUsers}</p>
              </div>
              <div className="summary-item verification-rate">
                <h4>Verification Rate</h4>
                <p>{dashboardData.idVerification.verificationRate}%</p>
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