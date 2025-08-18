import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar, ResponsiveContainer } from 'recharts';
import { 
  loadRevenueData, 
  preparePieChartData, 
  prepareRouteRevenueData,
  getAvailableDates,
  getAvailableRoutes,
  calculateRevenueMetrics 
} from '/src/pages/reports/DailyRevenue/DailyRevenue.js';
import MonthlyRevenue from './MonthlyRevenue.jsx';
import { 
  initializeMonthlyData, 
  getCurrentMonth, 
  loadMonthlyData, 
  loadAvailableMonths 
} from './MonthlyRevenue.js';
import './DailyRevenue.css';
import RemittanceReport from './Remittance.jsx';


const Revenue = () => {
  const [currentView, setCurrentView] = useState('');
  const [isMenuExpanded, setIsMenuExpanded] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTicketType, setSelectedTicketType] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [loading, setLoading] = useState(false);
  const [availableDates, setAvailableDates] = useState([]);
  const [availableRoutes, setAvailableRoutes] = useState([]);

    //Monthly Revenue
  const [monthlyData, setMonthlyData] = useState(initializeMonthlyData());
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [availableMonths, setAvailableMonths] = useState([]);
  // Monthly-specific filter states
  const [monthlySelectedTicketType, setMonthlySelectedTicketType] = useState('');
  const [monthlySelectedRoute, setMonthlySelectedRoute] = useState('');
  
  // Daily Revenue Data
  const [revenueData, setRevenueData] = useState({
    conductorTrips: [],
    preBookingTrips: [],
    preTicketing: [],
    totalRevenue: 0,
    totalPassengers: 0,
    averageFare: 0,
    conductorRevenue: 0,
    preBookingRevenue: 0,
    preTicketingRevenue: 0
  });

  // Load revenue data for summary cards (always load) and detailed view
  const handleLoadRevenueData = async () => {
    setLoading(true);
    try {
      const data = await loadRevenueData(selectedDate, selectedRoute);
      
      // Apply ticket type filtering
      const filteredData = applyTicketTypeFilter(data, selectedTicketType);
      setRevenueData(filteredData);
    } catch (error) {
      console.error('Error loading revenue data:', error);
    } finally {
      setLoading(false);
    }
  };

  //Monthly Revenue Data load
  const handleMonthlyDataLoad = async () => {
    await loadMonthlyData(selectedMonth, monthlySelectedRoute, setMonthlyData, setMonthlyLoading, monthlySelectedTicketType);
  };

  const handleMonthChange = (newMonth) => {
    setSelectedMonth(newMonth);
  };

  const handleMonthlyRefresh = () => {
    handleMonthlyDataLoad();
  };

  const handleMonthlyTicketTypeChange = (ticketType) => {
    setMonthlySelectedTicketType(ticketType);
  };

  const handleMonthlyRouteChange = (route) => {
    setMonthlySelectedRoute(route);
  };

  useEffect(() => {
    if (currentView === 'monthly-revenue') {
      handleMonthlyDataLoad();
    }
  }, [selectedMonth, monthlySelectedRoute, monthlySelectedTicketType, currentView]);

  useEffect(() => {
    loadAvailableMonths(setAvailableMonths, setSelectedMonth, selectedMonth);
  }, []);

  // Filter revenue data based on selected ticket type
  const applyTicketTypeFilter = (data, ticketType) => {
    if (!ticketType || ticketType === '') {
      // Return all data if no filter is selected
      return data;
    }

    let filteredConductorTrips = [];
    let filteredPreBookingTrips = [];
    let filteredPreTicketing = [];

    switch (ticketType) {
      case 'conductor':
        filteredConductorTrips = data.conductorTrips || [];
        break;
      case 'pre-book':
        filteredPreBookingTrips = data.preBookingTrips || [];
        break;
      case 'pre-ticket':
        filteredPreTicketing = data.preTicketing || [];
        break;
      default:
        // Return all data for unknown filter
        return data;
    }

    // Recalculate metrics with filtered data
    const metrics = calculateRevenueMetrics(filteredConductorTrips, filteredPreBookingTrips, filteredPreTicketing);

    return {
      ...data,
      conductorTrips: filteredConductorTrips,
      preBookingTrips: filteredPreBookingTrips,
      preTicketing: filteredPreTicketing,
      ...metrics
    };
  };

  // Load available dates when component mounts
  const loadAvailableDates = async () => {
    try {
      const dates = await getAvailableDates();
      setAvailableDates(dates);
      // Set the most recent date as default if available
      if (dates.length > 0 && !selectedDate) {
        setSelectedDate(dates[0]);
      }
    } catch (error) {
      console.error('Error loading available dates:', error);
    }
  };

  // Load available routes when component mounts
  const loadAvailableRoutes = async () => {
    try {
      const routes = await getAvailableRoutes();
      setAvailableRoutes(routes);
    } catch (error) {
      console.error('Error loading available routes:', error);
    }
  };

  useEffect(() => {
    loadAvailableDates();
    loadAvailableRoutes();
  }, []);

  useEffect(() => {
    handleLoadRevenueData();
  }, [selectedDate, selectedTicketType, selectedRoute]);

  // Enhanced print functionality for daily revenue
  const handlePrint = async () => {
    if (loading || revenueData.totalRevenue === 0) {
      await handleLoadRevenueData();
    }
    
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const toggleMenu = () => {
    setIsMenuExpanded(!isMenuExpanded);
  };

  const selectMenuItem = (viewType) => {
    setCurrentView(viewType);
  };

  const formatTime = (timestamp) => {
    if (!timestamp || !timestamp.toDate) return 'N/A';
    return timestamp.toDate().toLocaleTimeString();
  };

  const formatCurrency = (amount) => {
    const numAmount = Number(amount) || 0;
    return `₱${numAmount.toFixed(2)}`;
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

  // Prepare chart data for daily revenue
  const pieChartData = preparePieChartData(revenueData.conductorRevenue, revenueData.preBookingRevenue, revenueData.preTicketingRevenue);
  const routeChartData = prepareRouteRevenueData(revenueData.conductorTrips, revenueData.preBookingTrips, revenueData.preTicketing);

  // Prepare data for summary tables
  const revenueBreakdownData = [
    {
      source: 'Conductor Trips',
      amount: revenueData.conductorRevenue,
      trips: revenueData.conductorTrips.length
    },
    {
      source: 'Pre-booking',
      amount: revenueData.preBookingRevenue,
      trips: revenueData.preBookingTrips?.length || 0
    },
    {
      source: 'Pre-ticketing',
      amount: revenueData.preTicketingRevenue,
      trips: revenueData.preTicketing.length
    }
  ].filter(item => !selectedTicketType || 
    (selectedTicketType === 'conductor' && item.source === 'Conductor Trips') ||
    (selectedTicketType === 'pre-book' && item.source === 'Pre-booking') ||
    (selectedTicketType === 'pre-ticket' && item.source === 'Pre-ticketing')
  );

  const topRoutesData = routeChartData.slice(0, 5);

  const renderViewContent = () => {
    switch(currentView) {
      case 'daily-revenue':
        return renderDailyRevenue();
      case 'monthly-revenue':
        return renderMonthlyRevenue();
      case 'daily-trips':
        return renderDailyTripsRemittance();
      default:
        return renderDefaultView();
    }
  };

  const renderDefaultView = () => (
    <div className="revenue-default-view">
      <div className="revenue-welcome-card">
        <h3 className="revenue-welcome-title">Revenue Management Dashboard</h3>
        <p className="revenue-welcome-description">
          Select a revenue report from the menu above to view detailed information with filtering options.
        </p>
        <div className="revenue-quick-stats">
          <div className="revenue-stat-item">
            <span className="revenue-stat-label">Available Reports</span>
            <span className="revenue-stat-value">3</span>
          </div>
          <div className="revenue-stat-item">
            <span className="revenue-stat-label">Last Updated</span>
            <span className="revenue-stat-value">Today</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderMonthlyRevenue = () => {
    return (
      <MonthlyRevenue
        monthlyData={monthlyData}
        monthlyLoading={monthlyLoading}
        selectedMonth={selectedMonth}
        selectedRoute={monthlySelectedRoute}
        selectedTicketType={monthlySelectedTicketType}
        availableMonths={availableMonths}
        availableRoutes={availableRoutes}
        formatCurrency={formatCurrency}
        handlePrint={handlePrint}
        onMonthChange={handleMonthChange}
        onRouteChange={handleMonthlyRouteChange}
        onTicketTypeChange={handleMonthlyTicketTypeChange}
        onRefresh={handleMonthlyRefresh}
      />
    );
  };

  const renderDailyTripsRemittance = () => {
    return <RemittanceReport />;
  };

  const renderDailyRevenue = () => {
    if (loading) {
      return (
        <div className="revenue-daily-container">
          <div className="revenue-loading-state">
            <p>Loading revenue data...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="revenue-daily-container">
        {/* Print Header - Only visible when printing */}
        <div className="revenue-print-header">
          <div className="revenue-company-info">
            <h1>B-Go Bus Transportation</h1>
            <p>Daily Revenue Report</p>
          </div>
          <div className="revenue-report-info">
            <p><strong>Report Date:</strong> {formatDate(selectedDate)}</p>
            {selectedRoute && <p><strong>Trip Direction:</strong> {selectedRoute}</p>}
            <p><strong>Generated:</strong> {new Date().toLocaleString()}</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="revenue-daily-summary-card-container">
          <div className="revenue-daily-header-pattern"></div>
          <div className="revenue-summary-cards">
            <div className="revenue-summary-card">
              <h3 className="revenue-card-title">Total Revenue</h3>
              <p className="revenue-card-value revenue-card-revenue">
                {formatCurrency(revenueData.totalRevenue)}
              </p>
            </div>
            <div className="revenue-summary-card">
              <h3 className="revenue-card-title">Total Passengers</h3>
              <p className="revenue-card-value revenue-card-passengers">
                {revenueData.totalPassengers}
              </p>
            </div>
            <div className="revenue-summary-card">
              <h3 className="revenue-card-title">Average Fare</h3>
              <p className="revenue-card-value revenue-card-average">
                {formatCurrency(revenueData.averageFare)}
              </p>
            </div>
            <div className="revenue-summary-card">
              <h3 className="revenue-card-title">Total Trips</h3>
              <p className="revenue-card-value revenue-card-trips">
                {revenueData.conductorTrips.length + (revenueData.preBookingTrips?.length || 0) + revenueData.preTicketing.length}
              </p>
            </div>
          </div>
        </div>

        {/* Controls - Only show for daily revenue */}
        <div className="revenue-daily-controls">
          <button
            onClick={handleLoadRevenueData}
            disabled={loading}
            className="revenue-refresh-btn"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={handlePrint}
            className="revenue-print-btn"
            disabled={loading}
          >
            🖨️ Print Report
          </button>
        </div>

        {/* Summary Tables Section - Only visible when printing daily revenue */}
        <div className="revenue-summary-tables-section revenue-daily-print-only revenue-daily-print-tables">
          {/* Revenue Breakdown Summary Table */}
          <div className="revenue-summary-table-container">
            <h3 className="revenue-summary-table-title">Revenue Breakdown Summary</h3>
            <table className="revenue-summary-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Trips</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {revenueBreakdownData.map((item, index) => (
                  <tr key={index}>
                    <td>{item.source}</td>
                    <td className="revenue-count">{item.trips}</td>
                    <td className="revenue-amount">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #dee2e6', fontWeight: 'bold' }}>
                  <td><strong>Total</strong></td>
                  <td className="revenue-count">
                    <strong>
                      {revenueBreakdownData.reduce((sum, item) => sum + item.trips, 0)}
                    </strong>
                  </td>
                  <td className="revenue-amount">
                    <strong>{formatCurrency(revenueData.totalRevenue)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Top 5 Routes Table */}
          <div className="revenue-summary-table-container">
            <h3 className="revenue-summary-table-title">Top 5 Routes by Revenue</h3>
            <table className="revenue-summary-table">
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Passengers</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topRoutesData.map((route, index) => (
                  <tr key={index}>
                    <td>{route.route}</td>
                    <td className="revenue-count">{route.passengers}</td>
                    <td className="revenue-amount">{formatCurrency(route.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>



        {/* Charts Section - Hidden when printing */}
        <div className="revenue-charts-section">
          {/* Revenue Source Breakdown */}
          <div className="revenue-chart-container">
            <h3 className="revenue-chart-title">Revenue by Source</h3>
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
          <div className="revenue-chart-container">
            <h3 className="revenue-chart-title">Top Routes by Revenue</h3>
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

        {/* Detailed Breakdown - Now positioned in the main content area */}
        <div className="revenue-breakdown-section">
          <h3 className="revenue-breakdown-title">Detailed Revenue Breakdown</h3>
          
          {/* Conductor Trips Section - Show only if no filter or conductor filter is selected */}
          {(!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'conductor') && (
            <div className="revenue-section-container">
              <h4 className="revenue-section-title revenue-section-conductor">
                Conductor Trips ({formatCurrency(revenueData.conductorRevenue || 0)})
              </h4>
              {revenueData.conductorTrips.length > 0 ? (
                <div className="revenue-table-container">
                  <table className="revenue-revenue-table">
                    <thead>
                      <tr>
                        <th>Trip ID</th>
                        <th>Route</th>
                        <th>Trip Direction</th>
                        <th>Passengers</th>
                        <th>Fare</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueData.conductorTrips.map((trip, index) => (
                        <tr key={index}>
                          <td className="revenue-trip-id">
                            {trip.tripId || 'N/A'}
                          </td>
                          <td className="revenue-route-text">
                            {trip.from} → {trip.to}
                          </td>
                          <td className="revenue-trip-direction">
                            {trip.tripDirection || 'N/A'}
                          </td>
                          <td>{trip.quantity}</td>
                          <td className="revenue-fare-amount">{formatCurrency(trip.totalFare)}</td>
                          <td>{formatTime(trip.timestamp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="revenue-empty-state">
                  <h3>No conductor trips found</h3>
                  <p>No conductor trip data available for the selected date{selectedRoute ? ` and trip direction: ${selectedRoute}` : ''}.</p>
                </div>
              )}
            </div>
          )}

          {/* Pre-booking Section - Show only if no filter or pre-book filter is selected */}
          {(!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'pre-book') && (
            <div className="revenue-section-container">
              <h4 className="revenue-section-title revenue-section-pre-booking">
                Pre-booking ({formatCurrency(revenueData.preBookingRevenue || 0)})
              </h4>
              {revenueData.preBookingTrips && revenueData.preBookingTrips.length > 0 ? (
                <div className="revenue-table-container">
                  <table className="revenue-revenue-table">
                    <thead>
                      <tr>
                        <th>Trip ID</th>
                        <th>Route</th>
                        <th>Trip Direction</th>
                        <th>Passengers</th>
                        <th>Fare</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueData.preBookingTrips.map((trip, index) => (
                        <tr key={index}>
                          <td className="revenue-trip-id">
                            {trip.tripId || 'N/A'}
                          </td>
                          <td className="revenue-route-text">
                            {trip.from} → {trip.to}
                          </td>
                          <td className="revenue-trip-direction">
                            {trip.tripDirection || 'N/A'}
                          </td>
                          <td>{trip.quantity}</td>
                          <td className="revenue-fare-amount">{formatCurrency(trip.totalFare)}</td>
                          <td>{formatTime(trip.timestamp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="revenue-empty-state">
                  <h3>No pre-booking data found</h3>
                  <p>No pre-booking data available for the selected date{selectedRoute ? ` and trip direction: ${selectedRoute}` : ''}.</p>
                </div>
              )}
            </div>
          )}

          {/* Pre-ticketing Section - Show only if no filter or pre-ticket filter is selected */}
          {(!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'pre-ticket') && (
            <div className="revenue-section-container">
              <h4 className="revenue-section-title revenue-section-pre-ticketing">
                Pre-ticketing ({formatCurrency(revenueData.preTicketingRevenue || 0)})
              </h4>
              {revenueData.preTicketing.length > 0 ? (
                <div className="revenue-table-container">
                  <table className="revenue-revenue-table">
                    <thead>
                      <tr>
                        <th>Trip ID</th>
                        <th>Route</th>
                        <th>Trip Direction</th>
                        <th>Passengers</th>
                        <th>Fare</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueData.preTicketing.map((trip, index) => (
                        <tr key={index}>
                          <td className="revenue-trip-id">
                            {trip.tripId || 'N/A'}
                          </td>
                          <td className="revenue-route-text">
                            {trip.from} → {trip.to}
                          </td>
                          <td className="revenue-trip-direction">
                            {trip.tripDirection || 'N/A'}
                          </td>
                          <td>{trip.quantity}</td>
                          <td className="revenue-fare-amount">{formatCurrency(trip.totalFare)}</td>
                          <td>{formatTime(trip.timestamp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="revenue-empty-state">
                  <h3>No pre-ticketing data found</h3>
                  <p>No pre-ticketing data available for the selected date{selectedRoute ? ` and route: ${selectedRoute}` : ''}.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Print Footer */}
        <div className="revenue-print-footer">
          <div className="revenue-footer-left">
            <p>This report was generated automatically by the B-Go Bus Transportation System</p>
          </div>
          <div className="revenue-footer-right">
            <p>Page 1 of 1</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="revenue-container">
      {/* Revenue Menu */}
      <div className="revenue-menu-container">
        <div className="revenue-menu-item">
          <div 
            className={`revenue-menu-header ${isMenuExpanded ? 'revenue-menu-active' : ''}`}
            onClick={toggleMenu}
          >
            <span><span className="revenue-menu-icon">📊</span>Revenue</span>
            <span className={`revenue-chevron ${isMenuExpanded ? 'revenue-chevron-rotated' : ''}`}>▼</span>
          </div>
          <div className={`revenue-submenu ${isMenuExpanded ? 'revenue-submenu-open' : ''}`}>
            <div 
              className={`revenue-submenu-item ${currentView === 'daily-revenue' ? 'revenue-submenu-selected' : ''}`}
              onClick={() => selectMenuItem('daily-revenue')}
            >
              <span className="revenue-menu-icon">📅</span>Daily Revenue
            </div>
            <div 
              className={`revenue-submenu-item ${currentView === 'monthly-revenue' ? 'revenue-submenu-selected' : ''}`}
              onClick={() => selectMenuItem('monthly-revenue')}
            >
              <span className="revenue-menu-icon">📆</span>Monthly Revenue
            </div>
            <div 
              className={`revenue-submenu-item ${currentView === 'daily-trips' ? 'revenue-submenu-selected' : ''}`}
              onClick={() => selectMenuItem('daily-trips')}
            >
              <span className="revenue-menu-icon">🚌</span>Daily Trips Remittance
            </div>
          </div>
        </div>
      </div>

    {/* Filters - Only show for daily revenue view */}
    {currentView === 'daily-revenue' && (
      <div className="revenue-filters">
        <div className="revenue-filter-group">
          <label className="revenue-filter-label">Available Dates</label>
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="revenue-filter-select"
          >
            <option value="">Select a date...</option>
            {availableDates.map((date) => (
              <option key={date} value={date}>
                {new Date(date).toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </option>
            ))}
          </select>
        </div>
        
        <div className="revenue-filter-group">
          <label className="revenue-filter-label">Trip Direction</label>
          <select 
            value={selectedRoute}
            onChange={(e) => setSelectedRoute(e.target.value)}
            className="revenue-filter-select"
          >
            <option value="">All Trip Directions</option>
            {availableRoutes.map((route) => (
              <option key={route} value={route}>
                {route}
              </option>
            ))}
          </select>
        </div>
        
        <div className="revenue-filter-group">
          <label className="revenue-filter-label">Ticket Type</label>
          <select 
            value={selectedTicketType}
            onChange={(e) => setSelectedTicketType(e.target.value)}
            className="revenue-filter-select"
          >
            <option value="">All Tickets</option>
            <option value="pre-ticket">Pre Ticket</option>
            <option value="pre-book">Pre Book</option>
            <option value="conductor">Conductor Ticket</option>
          </select>
        </div>
      </div>
    )}

      {/* Content Area */}
      <div className="revenue-content-area">
        {renderViewContent()}
      </div>
    </div>
  );
};

export default Revenue;