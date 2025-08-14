// RoutePerformance.jsx - Real-time Route Performance Analytics
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar, ResponsiveContainer } from 'recharts';
import { 
  loadRoutePerformanceData, 
  prepareRouteProfitabilityData, 
  prepareRouteRevenueData,
  prepareSafetyIncidentData,
  prepareRouteEfficiencyData,
  formatRouteData,
  formatSOSData,
  cleanupListeners,
  debugTicketFetching
} from './RoutePerformance.js';
import './RoutePerformance.css';

const RoutePerformance = () => {
  const [routeData, setRouteData] = useState({
    tickets: [],
    sosRequests: [],
    routes: [],
    totalRevenue: 0,
    totalPassengers: 0,
    totalTrips: 0,
    avgFarePerKm: 0,
    totalIncidents: 0,
    avgResponseTime: 0,
    routeProfitability: [],
    safetyMetrics: [],
    routeEfficiency: []
  });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [showAllTickets, setShowAllTickets] = useState(false);
  const [ticketSortMode, setTicketSortMode] = useState('mixed'); // 'mixed', 'pre-tickets', 'conductor-tickets'
  const [showAllSOS, setShowAllSOS] = useState(false);
  const [sosSortMode, setSOSSortMode] = useState('newest'); // 'newest', 'oldest', 'received', 'pending', 'cancelled', 'route', 'emergency-type'

  // Load data for selected date with real-time updates (always enabled)
  const handleLoadRouteData = async () => {
    setLoading(true);
    try {
      const data = await loadRoutePerformanceData(selectedDate, true, setRouteData);
      setRouteData(data);
    } catch (error) {
      console.error('Error loading route performance data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Add debug function
  const handleDebugTickets = async () => {
    console.log('\n🔍 === MANUAL DEBUG TRIGGERED ===');
    console.log('Current selected date:', selectedDate);
    console.log('Selected date type:', typeof selectedDate);
    console.log('Selected date length:', selectedDate?.length);
    console.log('Is date empty?', !selectedDate || selectedDate === '');
    console.log('Current routeData.tickets length:', routeData.tickets.length);
    
    // Log current tickets breakdown
    const currentTypeBreakdown = routeData.tickets.reduce((acc, ticket) => {
      acc[ticket.type || 'unknown'] = (acc[ticket.type || 'unknown'] || 0) + 1;
      return acc;
    }, {});
    console.log('Current ticket type breakdown:', currentTypeBreakdown);
    
    // Run debug fetching
    const debugResult = await debugTicketFetching(selectedDate);
    
    if (debugResult) {
      console.log('\n📊 Debug vs Current comparison:');
      console.log('Debug found:', {
        pre: debugResult.preTickets.length,
        conductor: debugResult.conductorTickets.length,
        total: debugResult.allTickets.length
      });
      console.log('Current state:', {
        total: routeData.tickets.length,
        breakdown: currentTypeBreakdown
      });
      
      // Check if there's a mismatch
      if (debugResult.allTickets.length !== routeData.tickets.length) {
        console.warn('⚠️ MISMATCH DETECTED!');
        console.warn('Debug function found different results than current state');
        console.warn('This suggests an issue with the main data loading process');
      }
    }
  };

  useEffect(() => {
    handleLoadRouteData();
  }, [selectedDate]);

  // Cleanup listeners when component unmounts
  useEffect(() => {
    return () => {
      cleanupListeners();
    };
  }, []);

  // Simple print functionality
  const handlePrint = () => {
    window.print();
  };

  // Prepare chart data
  const profitabilityData = prepareRouteProfitabilityData(routeData.routeProfitability);
  const revenueData = prepareRouteRevenueData(routeData.tickets);
  const safetyData = prepareSafetyIncidentData(routeData.sosRequests);
  const efficiencyData = prepareRouteEfficiencyData(routeData.routeEfficiency);

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

  const formatCurrency = (amount) => {
    const numAmount = parseFloat(amount) || 0;
    return `₱${numAmount.toFixed(2)}`;
  };

  const formatPercentage = (value) => `${value.toFixed(1)}%`;

  // Function to sort and prepare tickets for display
  const prepareTicketsForDisplay = () => {
    let ticketsToShow = [...routeData.tickets];
    
    // Sort based on selected mode
    switch (ticketSortMode) {
      case 'pre-tickets':
        // Show only pre-tickets
        ticketsToShow = ticketsToShow.filter(t => t.type === 'pre-ticket');
        break;
      case 'conductor-tickets':
        // Show only conductor tickets
        ticketsToShow = ticketsToShow.filter(t => t.type === 'conductor-ticket');
        break;
      case 'mixed':
      default:
        // Interleave ticket types for better representation
        const preTickets = ticketsToShow.filter(t => t.type === 'pre-ticket');
        const conductorTickets = ticketsToShow.filter(t => t.type === 'conductor-ticket');
        const mixed = [];
        const maxLength = Math.max(preTickets.length, conductorTickets.length);
        
        for (let i = 0; i < maxLength; i++) {
          if (i < preTickets.length) mixed.push(preTickets[i]);
          if (i < conductorTickets.length) mixed.push(conductorTickets[i]);
        }
        ticketsToShow = mixed;
        break;
    }
    
    // Return either all tickets or just the first batch
    return showAllTickets ? ticketsToShow : ticketsToShow.slice(0, 20);
  };

  // Function to sort and prepare SOS requests for display
  const prepareSOSForDisplay = () => {
    let sosToShow = [...routeData.sosRequests];
    
    // Sort based on selected mode
    switch (sosSortMode) {
      case 'oldest':
        // Sort by timestamp (oldest first)
        sosToShow.sort((a, b) => {
          const timeA = a.timestamp && a.timestamp.toDate ? a.timestamp.toDate().getTime() : 0;
          const timeB = b.timestamp && b.timestamp.toDate ? b.timestamp.toDate().getTime() : 0;
          return timeA - timeB;
        });
        break;
      case 'received':
        // Show only received status
        sosToShow = sosToShow.filter(sos => sos.status && sos.status.toLowerCase() === 'received');
        break;
      case 'pending':
        // Show only pending status
        sosToShow = sosToShow.filter(sos => sos.status && sos.status.toLowerCase() === 'pending');
        break;
      case 'cancelled':
        // Show only cancelled status
        sosToShow = sosToShow.filter(sos => sos.status && sos.status.toLowerCase() === 'cancelled');
        break;
      case 'route':
        // Sort by route name alphabetically
        sosToShow.sort((a, b) => {
          const routeA = (a.route || 'Unknown').toLowerCase();
          const routeB = (b.route || 'Unknown').toLowerCase();
          return routeA.localeCompare(routeB);
        });
        break;
      case 'emergency-type':
        // Sort by emergency type alphabetically
        sosToShow.sort((a, b) => {
          const typeA = (a.emergencyType || 'Unknown').toLowerCase();
          const typeB = (b.emergencyType || 'Unknown').toLowerCase();
          return typeA.localeCompare(typeB);
        });
        break;
      case 'newest':
      default:
        // Sort by timestamp (newest first)
        sosToShow.sort((a, b) => {
          const timeA = a.timestamp && a.timestamp.toDate ? a.timestamp.toDate().getTime() : 0;
          const timeB = b.timestamp && b.timestamp.toDate ? b.timestamp.toDate().getTime() : 0;
          return timeB - timeA;
        });
        break;
    }
    
    // Return either all SOS requests or just the first batch
    return showAllSOS ? sosToShow : sosToShow.slice(0, 10);
  };

  if (loading) {
    return (
      <div className="route-perf-container">
        <div className="route-perf-loading-state">
          <p>Loading route performance data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="route-perf-container">
      {/* Print Header - Only visible when printing */}
      <div className="route-perf-print-header">
        <div className="route-perf-company-info">
          <h1>B-Go Bus Transportation</h1>
          <p>Route Performance Analytics Report</p>
        </div>
        <div className="route-perf-report-info">
          <p><strong>Report Date:</strong> {formatDate(selectedDate)}</p>
          <p><strong>Generated:</strong> {new Date().toLocaleString()}</p>
          <p><strong>Real-time:</strong> Enabled</p>
        </div>
      </div>

      {/* Header */}
      <div className="route-perf-header">
        <div className="route-perf-date-controls">
          <label className="route-perf-date-label">Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="route-perf-date-input"
          />
          <button
            onClick={handleLoadRouteData}
            disabled={loading}
            className="route-perf-refresh-btn"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={handlePrint}
            className="route-perf-print-btn"
            disabled={loading}
          >
            🖨️ Print Report
          </button>
        </div>
      </div>

      {/* Summary Cards - Enhanced with type breakdown */}
      <div className="route-perf-summary-card-comtainer">
        <div className="route-perf-header-pattern"></div>
        <div className="route-perf-summary-cards">
          <div className="route-perf-summary-card">
            <h3 className="route-perf-card-title">Total Revenue</h3>
            <p className="route-perf-card-value route-perf-revenue">
              {formatCurrency(routeData.totalRevenue)}
            </p>
          </div>
          <div className="route-perf-summary-card">
            <h3 className="route-perf-card-title">Total Passengers</h3>
            <p className="route-perf-card-value route-perf-passengers">
              {routeData.totalPassengers}
            </p>
          </div>
          <div className="route-perf-summary-card">
            <h3 className="route-perf-card-title">Total Trips</h3>
            <p className="route-perf-card-value route-perf-trips">
              {routeData.totalTrips}
            </p>
          </div>
          <div className="route-perf-summary-card">
            <h3 className="route-perf-card-title">SOS Incidents</h3>
            <p className="route-perf-card-value route-perf-incidents">
              {routeData.totalIncidents}
            </p>
          </div>
        </div>
      </div>

      {/* Performance Summary for Print */}
      <div className="route-perf-print-summary">
        <h3>Route Performance Overview</h3>
        <div className="route-perf-breakdown-summary">
          <div className="route-perf-breakdown-item">
            <span className="route-perf-breakdown-label">Total Revenue:</span>
            <span className="route-perf-breakdown-value">{formatCurrency(routeData.totalRevenue)}</span>
          </div>
          <div className="route-perf-breakdown-item">
            <span className="route-perf-breakdown-label">Total Passengers:</span>
            <span className="route-perf-breakdown-value">{routeData.totalPassengers} passengers</span>
          </div>
          <div className="route-perf-breakdown-item">
            <span className="route-perf-breakdown-label">Average Fare per KM:</span>
            <span className="route-perf-breakdown-value">{formatCurrency(routeData.avgFarePerKm)}</span>
          </div>
          <div className="route-perf-breakdown-item route-perf-total">
            <span className="route-perf-breakdown-label">Safety Incidents:</span>
            <span className="route-perf-breakdown-value">{routeData.totalIncidents} incidents</span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="route-perf-charts-section">
        {/* Route Profitability Chart */}
        <div className="route-perf-chart-container">
          <h3 className="route-perf-chart-title">Route Profitability</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={profitabilityData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="route" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="revenue" fill="#28a745" name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Safety Incidents by Route */}
        <div className="route-perf-chart-container">
          <h3 className="route-perf-chart-title">Safety Incidents by Route</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={safetyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="route" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="incidents" fill="#dc3545" name="Incidents" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Route Efficiency */}
        <div className="route-perf-chart-container">
          <h3 className="route-perf-chart-title">Route Efficiency (Revenue per KM)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={efficiencyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="route" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Line type="monotone" dataKey="efficiency" stroke="#007bff" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Passenger Demand */}
        <div className="route-perf-chart-container">
          <h3 className="route-perf-chart-title">Passenger Demand by Route</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={revenueData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(1)}%)`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="passengers"
              >
                {revenueData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Route Analysis */}
      <div className="route-perf-breakdown-section">
        <h3 className="route-perf-breakdown-title">Detailed Route Analysis</h3>
        
        {/* Ticket Data Section - Enhanced with sorting and display options */}
        <div className="route-perf-section-container">
          <h4 className="route-perf-section-title route-perf-tickets">
            Recent Tickets ({routeData.tickets.length} total)
            <span className="route-perf-ticket-breakdown">
              Pre-tickets: {routeData.tickets.filter(t => t.type === 'pre-ticket').length} | 
              Conductor: {routeData.tickets.filter(t => t.type === 'conductor-ticket').length}
            </span>
          </h4>
          
          {/* Ticket Display Controls */}
          <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label>
              Sort by:
              <select 
                value={ticketSortMode} 
                onChange={(e) => setTicketSortMode(e.target.value)}
                style={{ marginLeft: '5px', padding: '4px 8px' }}
              >
                <option value="mixed">Mixed (All tickets)</option>
                <option value="pre-tickets">Pre-tickets only</option>
                <option value="conductor-tickets">Conductor tickets only</option>
              </select>
            </label>
            <button
              onClick={() => setShowAllTickets(!showAllTickets)}
              style={{
                padding: '6px 12px',
                backgroundColor: showAllTickets ? '#dc3545' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              {showAllTickets ? `Hide (showing all ${routeData.tickets.length})` : `Show All (showing 20/${routeData.tickets.length})`}
            </button>
          </div>

          {routeData.tickets.length > 0 ? (
            <div className="route-perf-table-container">
              <table className="route-perf-table">
                <thead>
                  <tr>
                    <th>Ticket ID</th>
                    <th>Route</th>
                    <th>Type</th>
                    <th>Passengers</th>
                    <th>Distance (KM)</th>
                    <th>Fare</th>
                    <th>Timestamp</th>
                    <th>Conductor/Source</th>
                    <th>Discount</th>
                  </tr>
                </thead>
                <tbody>
                  {prepareTicketsForDisplay().map((ticket, index) => {
                    const formattedTicket = formatRouteData(ticket);
                    
                    // Debug log for each ticket being displayed
                    if (index < 5) { // Only log first 5 to avoid spam
                      console.log(`🎫 Displaying ticket ${index + 1}:`, {
                        id: formattedTicket.id,
                        type: formattedTicket.type,
                        route: formattedTicket.route,
                        originalTicket: ticket
                      });
                    }
                    
                    return (
                      <tr key={`${formattedTicket.type}-${formattedTicket.id}-${index}`} className={`route-perf-ticket-row route-perf-${formattedTicket.type}`}>
                        <td className="route-perf-ticket-id">{formattedTicket.id}</td>
                        <td className="route-perf-route">{formattedTicket.route}</td>
                        <td className={`route-perf-ticket-type route-perf-${formattedTicket.type}`}>
                          {formattedTicket.type === 'pre-ticket' ? 'Pre-Ticket' : 
                           formattedTicket.type === 'conductor-ticket' ? 'Manual' : 'Unknown'}
                        </td>
                        <td>{formattedTicket.passengers}</td>
                        <td>{formattedTicket.distance}</td>
                        <td className="route-perf-fare">{formatCurrency(formattedTicket.fare)}</td>
                        <td>{formatTime(formattedTicket.timestamp)}</td>
                        <td className="route-perf-source">
                          {formattedTicket.type === 'conductor-ticket' 
                            ? `${formattedTicket.conductorId} (${formattedTicket.tripDate})`
                            : formattedTicket.sourceRoute
                          }
                        </td>
                        <td className="route-perf-discount">{formatCurrency(formattedTicket.discount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="route-perf-empty-state">
              <h3>No ticket data found</h3>
              <p>No tickets available for the selected date.</p>
            </div>
          )}
        </div>

        {/* SOS Incidents Section - Enhanced with sorting and display options */}
        <div className="route-perf-section-container">
          <h4 className="route-perf-section-title route-perf-incidents">
            SOS Incidents ({routeData.sosRequests.length} total)
            <span className="route-perf-ticket-breakdown">
              Received: {routeData.sosRequests.filter(s => s.status && s.status.toLowerCase() === 'received').length} | 
              Pending: {routeData.sosRequests.filter(s => s.status && s.status.toLowerCase() === 'pending').length} |  
              Cancelled: {routeData.sosRequests.filter(s => s.status && s.status.toLowerCase() === 'cancelled').length}
            </span>
          </h4>
          
          {/* SOS Display Controls */}
          <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label>
              Sort/Filter by:
              <select 
                value={sosSortMode} 
                onChange={(e) => setSOSSortMode(e.target.value)}
                style={{ marginLeft: '5px', padding: '4px 8px' }}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="received">Received only</option>
                <option value="pending">Pending only</option>
                <option value="cancelled">Cancelled only</option>
                <option value="route">Sort by Route</option>
                <option value="emergency-type">Sort by Emergency Type</option>
              </select>
            </label>
            <button
              onClick={() => setShowAllSOS(!showAllSOS)}
              style={{
                padding: '6px 12px',
                backgroundColor: showAllSOS ? '#dc3545' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              {showAllSOS ? `Hide (showing all ${routeData.sosRequests.length})` : `Show All (showing 10/${routeData.sosRequests.length})`}
            </button>
          </div>

          {routeData.sosRequests.length > 0 ? (
            <div className="route-perf-table-container">
              <table className="route-perf-table">
                <thead>
                  <tr>
                    <th>SOS ID</th>
                    <th>Route</th>
                    <th>Emergency Type</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {prepareSOSForDisplay().map((sos, index) => {
                    const formattedSOS = formatSOSData(sos);
                    
                    return (
                      <tr key={`${formattedSOS.id}-${index}`}>
                        <td className="route-perf-sos-id">{formattedSOS.id}</td>
                        <td className="route-perf-route">{formattedSOS.route}</td>
                        <td className="route-perf-emergency-type">{formattedSOS.emergencyType}</td>
                        <td className={`route-perf-status-${formattedSOS.status.toLowerCase()}`}>
                          {formattedSOS.status}
                        </td>
                        <td>{formattedSOS.location}</td>
                        <td>{formatTime(formattedSOS.timestamp)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="route-perf-empty-state">
              <h3>No SOS incidents found</h3>
              <p>No emergency incidents recorded for the selected date.</p>
            </div>
          )}
        </div>
      </div>

      {/* Print Footer */}
      <div className="route-perf-print-footer">
        <div className="route-perf-footer-left">
          <p>This report was generated automatically by the B-Go Bus Transportation System</p>
        </div>
        <div className="route-perf-footer-right">
          <p>Page 1 of 1</p>
        </div>
      </div>
    </div>
  );
};

export default RoutePerformance;