import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '/src/firebase/firebase.js';
import { fetchCurrentUserData } from '/src/pages/settings/settings.js';
import DashboardService from './dashboard.js';
import './dashboard.css';

function Dashboard() {
  const [dashboardData, setDashboardData] = useState(null);
  const [filter, setFilter] = useState('today');
  const [customDate, setCustomDate] = useState('');
  const [userData, setUserData] = useState(null);
  const [isScrolling, setIsScrolling] = useState(false);

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
            busReservations: {
              totalReserved: 0,
              completedCount: 0,
              reservedCount: 0,
              cancelledCount: 0,
              pendingCount: 0,
              noReservationCount: 0,
              totalBuses: 0
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

  // Scroll performance optimization
  useEffect(() => {
    let scrollTimer = null;
    
    const handleScroll = () => {
      setIsScrolling(true);
      
      // Clear existing timer
      if (scrollTimer) {
        clearTimeout(scrollTimer);
      }
      
      // Set timer to re-enable animations after scrolling stops
      scrollTimer = setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimer) {
        clearTimeout(scrollTimer);
      }
    };
  }, []);

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
    <div className={`dashboard-container ${isScrolling ? 'scrolling' : ''}`}>
      {/* Dashboard Header */}
      <div className="dashboard-header">
        <div className="dashboard-title">
          <h1>Dashboard User</h1>
          {userData && (
            <p className="admin-greeting">Welcome back, <span>{userData.name}</span></p>
          )}
        </div>
        <div className="dashboard-controls">
          <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="today">Today Only</option>
            <option value="all">All Time</option>
            <option value="custom">Custom Date</option>
          </select>
          {filter === 'custom' && (
            <input
              className="date-input"
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
            />
          )}
        </div>
      </div>

      {!dashboardData ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading dashboard data...</p>
        </div>
      ) : (
        <>
          {/* Metric Cards Row */}
          <div className="metrics-grid">
            <div className="metric-card earning-card">
              <div className="metric-icon">
                <i className="fas fa-dollar-sign"></i>
              </div>
              <div className="metric-content">
                <span className="metric-label">Earning</span>
                <span className="metric-value">₱ {dashboardData.trips.totalFare.toFixed(0)}</span>
              </div>
            </div>

            <div className="metric-card share-card">
              <div className="metric-icon">
                <i className="fas fa-route"></i>
              </div>
              <div className="metric-content">
                <span className="metric-label">Trips</span>
                <span className="metric-value">{dashboardData.trips.totalTrips}</span>
              </div>
            </div>

            <div className="metric-card likes-card">
              <div className="metric-icon">
                <i className="fas fa-exclamation-triangle"></i>
              </div>
              <div className="metric-content">
                <span className="metric-label">SOS Requests</span>
                <span className="metric-value">{dashboardData.sos.totalRequests}</span>
              </div>
            </div>

            <div className="metric-card rating-card">
              <div className="metric-icon">
                <i className="fas fa-users"></i>
              </div>
              <div className="metric-content">
                <span className="metric-label">Avg Passengers</span>
                <span className="metric-value">{dashboardData.trips.avgPassengers}</span>
              </div>
            </div>

            <div className="metric-card reservation-card">
              <div className="metric-icon">
                <i className="fas fa-bus"></i>
              </div>
              <div className="metric-content">
                <span className="metric-label">Bus Reservations</span>
                <span className="metric-value">{dashboardData.busReservations.totalReserved}</span>
              </div>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="dashboard-content">
            {/* Left Column - Charts */}
            <div className="charts-column">
              {/* Bar Chart Card */}
              <div className="chart-card bar-chart-card">
                <h3>Revenue Trends</h3>
                <div className="chart-content">
                  <div className="bar-chart-container">
                    {dashboardData.revenueTrend.map((day, index) => {
                      const maxRevenue = Math.max(...dashboardData.revenueTrend.map(d => d.revenue));
                      const height = maxRevenue === 0 ? 0 : (day.revenue / maxRevenue) * 100;

                      return (
                        <div key={index} className="chart-bar-modern">
                          <div
                            className="bar-fill-modern"
                            style={{ height: `${height}%` }}
                            title={`${day.day}: ₱${day.revenue.toFixed(2)}`}
                          ></div>
                          <span className="bar-label-modern">{day.day.substring(0, 3)}</span>
                        </div>
                      );
                    })}
                  </div>
                  {dashboardData.revenueTrend.length === 0 && (
                    <div className="no-data-modern">No revenue data available</div>
                  )}
                </div>
              </div>

              {/* SOS Status Chart */}
              <div className="chart-card sos-status-chart-card">
                <h3>SOS Request Status</h3>
                <div className="chart-content">
                  <div className="sos-status-chart-container">
                    {dashboardData.sos.totalRequests > 0 ? (
                      <div className="status-breakdown-chart">
                        <div className="status-bars-horizontal">
                          <div className="status-bar-item">
                            <div className="status-info">
                              <span className="status-label">Pending</span>
                              <span className="status-count">{dashboardData.sos.pendingRequests}</span>
                            </div>
                            <div className="status-progress-bar">
                              <div
                                className="status-progress-fill pending-fill"
                                style={{
                                  width: `${dashboardData.sos.totalRequests === 0 ? 0 : (dashboardData.sos.pendingRequests / dashboardData.sos.totalRequests) * 100}%`
                                }}
                              ></div>
                            </div>
                          </div>

                          <div className="status-bar-item">
                            <div className="status-info">
                              <span className="status-label">Received</span>
                              <span className="status-count">{dashboardData.sos.receivedRequests}</span>
                            </div>
                            <div className="status-progress-bar">
                              <div
                                className="status-progress-fill received-fill"
                                style={{
                                  width: `${dashboardData.sos.totalRequests === 0 ? 0 : (dashboardData.sos.receivedRequests / dashboardData.sos.totalRequests) * 100}%`
                                }}
                              ></div>
                            </div>
                          </div>


                          <div className="status-bar-item">
                            <div className="status-info">
                              <span className="status-label">Cancelled</span>
                              <span className="status-count">{dashboardData.sos.cancelledRequests}</span>
                            </div>
                            <div className="status-progress-bar">
                              <div
                                className="status-progress-fill cancelled-fill"
                                style={{
                                  width: `${dashboardData.sos.totalRequests === 0 ? 0 : (dashboardData.sos.cancelledRequests / dashboardData.sos.totalRequests) * 100}%`
                                }}
                              ></div>
                            </div>
                          </div>
                        </div>

                        <div className="total-sos-summary">
                          <span className="total-label">Total SOS Requests:</span>
                          <span className="total-value">{dashboardData.sos.totalRequests}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="no-sos-data">
                        <div className="no-sos-icon">
                          <i className="fas fa-shield-check"></i>
                        </div>
                        <div className="no-sos-content">
                          <h4>All Clear!</h4>
                          <p>No SOS requests for the selected time period.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bus Reservation Status Chart */}
              <div className="chart-card bus-reservation-status-card">
                <h3>Bus Reservation Status <span style={{ fontSize: '0.9rem', fontWeight: '500', color: '#718096' }}>({dashboardData.busReservations.totalBuses} Total Buses)</span></h3>
                <div className="chart-content">
                  <div className="bus-status-chart-container">
                    <div className="status-breakdown-chart">
                      <div className="status-bars-horizontal">
                        <div className="status-bar-item">
                          <div className="status-info">
                            <span className="status-label">Reserved</span>
                            <span className="status-count">{dashboardData.busReservations.reservedCount}</span>
                          </div>
                          <div className="status-progress-bar">
                            <div
                              className="status-progress-fill reserved-fill"
                              style={{
                                width: `${dashboardData.busReservations.totalBuses === 0 ? 0 : (dashboardData.busReservations.reservedCount / dashboardData.busReservations.totalBuses) * 100}%`
                              }}
                            ></div>
                          </div>
                        </div>

                        <div className="status-bar-item">
                          <div className="status-info">
                            <span className="status-label">Pending</span>
                            <span className="status-count">{dashboardData.busReservations.pendingCount}</span>
                          </div>
                          <div className="status-progress-bar">
                            <div
                              className="status-progress-fill pending-fill"
                              style={{
                                width: `${dashboardData.busReservations.totalBuses === 0 ? 0 : (dashboardData.busReservations.pendingCount / dashboardData.busReservations.totalBuses) * 100}%`
                              }}
                            ></div>
                          </div>
                        </div>

                        <div className="status-bar-item">
                          <div className="status-info">
                            <span className="status-label">Cancelled</span>
                            <span className="status-count">{dashboardData.busReservations.cancelledCount}</span>
                          </div>
                          <div className="status-progress-bar">
                            <div
                              className="status-progress-fill cancelled-fill"
                              style={{
                                width: `${dashboardData.busReservations.totalBuses === 0 ? 0 : (dashboardData.busReservations.cancelledCount / dashboardData.busReservations.totalBuses) * 100}%`
                              }}
                            ></div>
                          </div>
                        </div>

                        <div className="status-bar-item">
                          <div className="status-info">
                            <span className="status-label">Available</span>
                            <span className="status-count">{dashboardData.busReservations.noReservationCount}</span>
                          </div>
                          <div className="status-progress-bar">
                            <div
                              className="status-progress-fill available-fill"
                              style={{
                                width: `${dashboardData.busReservations.totalBuses === 0 ? 0 : (dashboardData.busReservations.noReservationCount / dashboardData.busReservations.totalBuses) * 100}%`
                              }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Right Column - Progress and Details */}
            <div className="details-column">
              {/* Progress Circle Card */}
              <div className="progress-card">
                <div className="progress-circle-container">
                  <div className="progress-circle-modern">
                    <svg className="progress-svg-modern" viewBox="0 0 120 120">
                      <circle
                        cx="60"
                        cy="60"
                        r="45"
                        fill="none"
                        stroke="#e0e0e0"
                        strokeWidth="8"
                      />
                      <circle
                        cx="60"
                        cy="60"
                        r="45"
                        fill="none"
                        stroke="url(#progressGradient)"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 45}`}
                        strokeDashoffset={`${2 * Math.PI * 45 * (1 - dashboardData.conductors.onlinePercentage / 100)}`}
                        transform="rotate(-90 60 60)"
                        className="progress-circle-fill"
                      />
                      <defs>
                        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#007c91" />
                          <stop offset="100%" stopColor="#4fd1c7" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="progress-center-modern">
                      <span className="progress-percentage-modern">{dashboardData.conductors.onlinePercentage}%</span>
                      <span className="progress-label-modern">Online</span>
                    </div>
                  </div>
                </div>
                <div className="progress-details">
                  <div className="progress-detail-item">
                    <span className="detail-label">Total Conductors</span>
                    <span className="detail-value">{dashboardData.conductors.totalConductors}</span>
                  </div>
                  <div className="progress-detail-item">
                    <span className="detail-label">Online Now</span>
                    <span className="detail-value online-count">{dashboardData.conductors.onlineConductors}</span>
                  </div>
                </div>
              </div>

              {/* Stats Summary Card */}
              <div className="stats-summary-card">
                <h3>Quick Stats</h3>
                <div className="stats-list">
                  <div className="stat-item">
                    <span className="stat-label">Most Common Route</span>
                    <span className="stat-value">{dashboardData.trips.mostCommonRoute}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Pending SOS</span>
                    <span className="stat-value pending-sos">{dashboardData.sos.pendingRequests}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">ID Verifications</span>
                    <span className="stat-value">{dashboardData.idVerification.verificationRate}% verified</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Revenue Today</span>
                    <span className="stat-value">₱{dashboardData.trips.totalFare.toFixed(2)}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Dashboard;