import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
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
  const [selectedDate, setSelectedDate] = useState('');
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

  // Function to load revenue data with provided dates array
  const handleLoadRevenueDataWithDates = async (dates, selectedDateValue) => {
    setLoading(true);
    try {
      let data;
      if (selectedDateValue) {
        // Load data for specific date
        data = await loadRevenueData(selectedDateValue, selectedRoute);
      } else {
        // Load data for all available dates
        const allData = {
          conductorTrips: [],
          preBookingTrips: [],
          preTicketing: [],
          totalRevenue: 0,
          totalPassengers: 0,
          averageFare: 0,
          conductorRevenue: 0,
          preBookingRevenue: 0,
          preTicketingRevenue: 0
        };
        
        for (const date of dates) {
          const dateData = await loadRevenueData(date, selectedRoute);
          allData.conductorTrips.push(...(dateData.conductorTrips || []));
          allData.preBookingTrips.push(...(dateData.preBookingTrips || []));
          allData.preTicketing.push(...(dateData.preTicketing || []));
          allData.totalRevenue += dateData.totalRevenue || 0;
          allData.totalPassengers += dateData.totalPassengers || 0;
          allData.conductorRevenue += dateData.conductorRevenue || 0;
          allData.preBookingRevenue += dateData.preBookingRevenue || 0;
          allData.preTicketingRevenue += dateData.preTicketingRevenue || 0;
        }
        
        // Recalculate average fare
        allData.averageFare = allData.totalPassengers > 0 ? allData.totalRevenue / allData.totalPassengers : 0;
        
        data = allData;
      }
      
      // Apply ticket type filtering
      const filteredData = applyTicketTypeFilter(data, selectedTicketType);
      setRevenueData(filteredData);
    } catch (error) {
      console.error('Error loading revenue data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load revenue data for summary cards (always load) and detailed view
  const handleLoadRevenueData = async () => {
    return handleLoadRevenueDataWithDates(availableDates, selectedDate);
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
      
      // Load revenue data for all dates on initial load (when selectedDate is empty)
      if (dates.length > 0) {
        await handleLoadRevenueDataWithDates(dates, selectedDate);
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
    if (availableDates.length > 0) {
      handleLoadRevenueData();
    }
  }, [selectedDate, selectedTicketType, selectedRoute]);


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

  // Excel export function
  const handleExportToExcel = () => {
    try {
      // Create a new workbook
      const workbook = XLSX.utils.book_new();

      // Calculate unique trips count
      const uniqueTrips = new Set();
      revenueData.conductorTrips?.forEach(trip => {
        if (trip.conductorId && trip.tripId) {
          uniqueTrips.add(`${trip.conductorId}-${trip.tripId}`);
        }
      });
      revenueData.preBookingTrips?.forEach(trip => {
        if (trip.conductorId && trip.tripId) {
          uniqueTrips.add(`${trip.conductorId}-${trip.tripId}`);
        }
      });
      revenueData.preTicketing?.forEach(trip => {
        if (trip.conductorId && trip.tripId) {
          uniqueTrips.add(`${trip.conductorId}-${trip.tripId}`);
        }
      });

      // Create summary data
      const summaryData = [
        ['B-Go Bus Transportation - Daily Revenue Report'],
        [''],
        ['Report Date:', selectedDate ? formatDate(selectedDate) : 'All Dates'],
        ['Route Filter:', selectedRoute || 'All Routes'],
        ['Ticket Type Filter:', selectedTicketType || 'All Types'],
        ['Generated:', new Date().toLocaleString()],
        [''],
        ['SUMMARY'],
        ['Metric', 'Value'],
        ['Total Revenue', `₱${revenueData.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ['Total Trips', uniqueTrips.size],
        ['Total Passengers', revenueData.totalPassengers],
        ['Total Tickets', (revenueData.conductorTrips?.length || 0) + (revenueData.preBookingTrips?.length || 0) + (revenueData.preTicketing?.length || 0)],
        ['Average Fare', `₱${revenueData.averageFare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ['Conductor Revenue', `₱${revenueData.conductorRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ['Pre-booking Revenue', `₱${revenueData.preBookingRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ['Pre-ticketing Revenue', `₱${revenueData.preTicketingRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ['']
      ];

      // Create the summary worksheet with formatting
      const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
      
      // Apply basic formatting to summary sheet
      summaryWS['A1'] = { 
        v: 'B-Go Bus Transportation - Daily Revenue Report', 
        t: 's'
      };

      // Set column widths
      summaryWS['!cols'] = [
        { wch: 25 }, // Column A
        { wch: 25 }  // Column B
      ];

      // Merge cells for title
      summaryWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 1, r: 0 } }];

      XLSX.utils.book_append_sheet(workbook, summaryWS, 'Summary');

      // Create conductor trips sheet
      if (revenueData.conductorTrips && revenueData.conductorTrips.length > 0) {
        const conductorData = [
          ['Conductor Trips - Detailed Breakdown'],
          [''],
          ['Trip ID', 'Date & Time', 'Route', 'Trip Direction', 'Passengers', 'Revenue']
        ];

        revenueData.conductorTrips.forEach(trip => {
          const dateTime = (() => {
            try {
              const dateStr = trip.date ? new Date(trip.date).toLocaleDateString() : new Date().toLocaleDateString();
              const timeStr = trip.timestamp ? formatTime(trip.timestamp) : 'N/A';
              return `${dateStr} ${timeStr}`;
            } catch (error) {
              return `${trip.date || 'N/A'} ${formatTime(trip.timestamp)}`;
            }
          })();

          conductorData.push([
            trip.tripId || 'N/A',
            dateTime,
            `${trip.from} → ${trip.to}`,
            trip.tripDirection || 'N/A',
            trip.quantity,
            `₱${trip.totalFare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          ]);
        });

        // Add total row
        conductorData.push([
          '', '', '', `Conductor Total (${revenueData.conductorTrips.length} tickets):`,
          revenueData.conductorTrips.reduce((sum, trip) => sum + (trip.quantity || 0), 0),
          `₱${revenueData.conductorRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        ]);

        const conductorWS = XLSX.utils.aoa_to_sheet(conductorData);

        // Set column widths
        conductorWS['!cols'] = [
          { wch: 12 }, // Trip ID
          { wch: 20 }, // Date & Time
          { wch: 25 }, // Route
          { wch: 25 }, // Trip Direction
          { wch: 12 }, // Passengers
          { wch: 15 }  // Revenue
        ];

        // Merge title
        conductorWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 5, r: 0 } }];

        XLSX.utils.book_append_sheet(workbook, conductorWS, 'Conductor Trips');
      }

      // Create pre-booking sheet
      if (revenueData.preBookingTrips && revenueData.preBookingTrips.length > 0) {
        const preBookingData = [
          ['Pre-booking - Detailed Breakdown'],
          [''],
          ['Trip ID', 'Date & Time', 'Route', 'Trip Direction', 'Passengers', 'Revenue']
        ];

        revenueData.preBookingTrips.forEach(trip => {
          const dateTime = (() => {
            try {
              const dateStr = trip.date ? new Date(trip.date).toLocaleDateString() : new Date().toLocaleDateString();
              const timeStr = trip.timestamp ? formatTime(trip.timestamp) : 'N/A';
              return `${dateStr} ${timeStr}`;
            } catch (error) {
              return `${trip.date || 'N/A'} ${formatTime(trip.timestamp)}`;
            }
          })();

          preBookingData.push([
            trip.tripId || 'N/A',
            dateTime,
            `${trip.from} → ${trip.to}`,
            trip.tripDirection || 'N/A',
            trip.quantity,
            `₱${trip.totalFare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          ]);
        });

        // Add total row
        preBookingData.push([
          '', '', '', `Pre-booking Total (${revenueData.preBookingTrips.length} tickets):`,
          revenueData.preBookingTrips.reduce((sum, trip) => sum + (trip.quantity || 0), 0),
          `₱${revenueData.preBookingRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        ]);

        const preBookingWS = XLSX.utils.aoa_to_sheet(preBookingData);

        preBookingWS['!cols'] = [
          { wch: 12 }, { wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 15 }
        ];

        preBookingWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 5, r: 0 } }];

        XLSX.utils.book_append_sheet(workbook, preBookingWS, 'Pre-booking');
      }

      // Create pre-ticketing sheet
      if (revenueData.preTicketing && revenueData.preTicketing.length > 0) {
        const preTicketingData = [
          ['Pre-ticketing - Detailed Breakdown'],
          [''],
          ['Trip ID', 'Date & Time', 'Route', 'Trip Direction', 'Passengers', 'Revenue']
        ];

        revenueData.preTicketing.forEach(trip => {
          const dateTime = (() => {
            try {
              const dateStr = trip.date ? new Date(trip.date).toLocaleDateString() : new Date().toLocaleDateString();
              const timeStr = trip.timestamp ? formatTime(trip.timestamp) : 'N/A';
              return `${dateStr} ${timeStr}`;
            } catch (error) {
              return `${trip.date || 'N/A'} ${formatTime(trip.timestamp)}`;
            }
          })();

          preTicketingData.push([
            trip.tripId || 'N/A',
            dateTime,
            `${trip.from} → ${trip.to}`,
            trip.tripDirection || 'N/A',
            trip.quantity,
            `₱${trip.totalFare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          ]);
        });

        // Add total row
        preTicketingData.push([
          '', '', '', `Pre-ticketing Total (${revenueData.preTicketing.length} tickets):`,
          revenueData.preTicketing.reduce((sum, trip) => sum + (trip.quantity || 0), 0),
          `₱${revenueData.preTicketingRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        ]);

        const preTicketingWS = XLSX.utils.aoa_to_sheet(preTicketingData);

        preTicketingWS['!cols'] = [
          { wch: 12 }, { wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 15 }
        ];

        preTicketingWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 5, r: 0 } }];

        XLSX.utils.book_append_sheet(workbook, preTicketingWS, 'Pre-ticketing');
      }

      // Generate filename
      const dateStr = selectedDate ? formatDate(selectedDate) : 'All_Dates';
      const filename = `Daily_Revenue_Report_${dateStr.replace(/\s+/g, '_').replace(/,/g, '')}_${new Date().toISOString().split('T')[0]}.xlsx`;

      // Save the file
      XLSX.writeFile(workbook, filename);

      console.log('Excel file exported successfully');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export to Excel. Please try again.');
    }
  };

  // Prepare chart data for daily revenue
  const pieChartData = preparePieChartData(revenueData.conductorRevenue, revenueData.preBookingRevenue, revenueData.preTicketingRevenue);
  const routeChartData = prepareRouteRevenueData(revenueData.conductorTrips, revenueData.preBookingTrips, revenueData.preTicketing);


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
              <h3 className="revenue-card-title">Total Trips</h3>
              <p className="revenue-card-value revenue-card-trips">
                {(() => {
                  // Count unique trips by combining conductorId and tripId
                  const uniqueTrips = new Set();
                  
                  // Add trips from conductor trips
                  revenueData.conductorTrips?.forEach(trip => {
                    if (trip.conductorId && trip.tripId) {
                      uniqueTrips.add(`${trip.conductorId}-${trip.tripId}`);
                    }
                  });
                  
                  // Add trips from pre-booking trips
                  revenueData.preBookingTrips?.forEach(trip => {
                    if (trip.conductorId && trip.tripId) {
                      uniqueTrips.add(`${trip.conductorId}-${trip.tripId}`);
                    }
                  });
                  
                  // Add trips from pre-ticketing
                  revenueData.preTicketing?.forEach(trip => {
                    if (trip.conductorId && trip.tripId) {
                      uniqueTrips.add(`${trip.conductorId}-${trip.tripId}`);
                    }
                  });
                  
                  return uniqueTrips.size;
                })()}
              </p>
            </div>
            <div className="revenue-summary-card">
              <h3 className="revenue-card-title">Total Passengers</h3>
              <p className="revenue-card-value revenue-card-passengers">
                {revenueData.totalPassengers}
              </p>
            </div>
            <div className="revenue-summary-card">
              <h3 className="revenue-card-title">Total Tickets</h3>
              <p className="revenue-card-value revenue-card-tickets">
                {(() => {
                  // Count total tickets from all trip types
                  let totalTickets = 0;
                  
                  // Count tickets from conductor trips
                  totalTickets += revenueData.conductorTrips?.length || 0;
                  
                  // Count tickets from pre-booking trips  
                  totalTickets += revenueData.preBookingTrips?.length || 0;
                  
                  // Count tickets from pre-ticketing
                  totalTickets += revenueData.preTicketing?.length || 0;
                  
                  return totalTickets;
                })()}
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
            onClick={handleExportToExcel}
            className="revenue-export-btn"
            disabled={loading || revenueData.totalRevenue === 0}
          >
            📊 Export to Excel
          </button>
        </div>




        {/* Charts Section */}
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
                  <table className="revenue-revenue-table revenue-detailed-breakdown-table">
                    <thead>
                      <tr>
                        <th>Trip ID</th>
                        <th>Date & Time</th>
                        <th>Route</th>
                        <th>Trip Direction</th>
                        <th>Passengers</th>
                        <th>Fare</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueData.conductorTrips.map((trip, index) => (
                        <tr key={index}>
                          <td className="revenue-trip-id">
                            {trip.tripId || 'N/A'}
                          </td>
                          <td>
                            {(() => {
                              try {
                                const dateStr = trip.date ? new Date(trip.date).toLocaleDateString() : new Date().toLocaleDateString();
                                const timeStr = trip.timestamp ? formatTime(trip.timestamp) : 'N/A';
                                return `${dateStr} ${timeStr}`;
                              } catch (error) {
                                return `${trip.date || 'N/A'} ${formatTime(trip.timestamp)}`;
                              }
                            })()}
                          </td>
                          <td className="revenue-route-text">
                            {trip.from} → {trip.to}
                          </td>
                          <td className="revenue-trip-direction">
                            {trip.tripDirection || 'N/A'}
                          </td>
                          <td>{trip.quantity}</td>
                          <td className="revenue-fare-amount">{formatCurrency(trip.totalFare)}</td>
                        </tr>
                      ))}
                      {/* Conductor Total Row */}
                      <tr style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold', borderTop: '2px solid #dee2e6' }}>
                        <td colSpan="4" style={{ textAlign: 'right', padding: '12px', fontSize: '14px' }}>
                          <strong>Conductor Total ({revenueData.conductorTrips.length} tickets):</strong>
                        </td>
                        <td style={{ textAlign: 'center', padding: '12px' }}>
                          <strong>{revenueData.conductorTrips.reduce((sum, trip) => sum + (trip.quantity || 0), 0)}</strong>
                        </td>
                        <td className="revenue-fare-amount" style={{ padding: '12px', color: '#28a745', fontWeight: 'bold' }}>
                          <strong>{formatCurrency(revenueData.conductorRevenue || 0)}</strong>
                        </td>
                      </tr>
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
                  <table className="revenue-revenue-table revenue-detailed-breakdown-table">
                    <thead>
                      <tr>
                        <th>Trip ID</th>
                        <th>Date & Time</th>
                        <th>Route</th>
                        <th>Trip Direction</th>
                        <th>Passengers</th>
                        <th>Fare</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueData.preBookingTrips.map((trip, index) => (
                        <tr key={index}>
                          <td className="revenue-trip-id">
                            {trip.tripId || 'N/A'}
                          </td>
                          <td>
                            {(() => {
                              try {
                                const dateStr = trip.date ? new Date(trip.date).toLocaleDateString() : new Date().toLocaleDateString();
                                const timeStr = trip.timestamp ? formatTime(trip.timestamp) : 'N/A';
                                return `${dateStr} ${timeStr}`;
                              } catch (error) {
                                return `${trip.date || 'N/A'} ${formatTime(trip.timestamp)}`;
                              }
                            })()}
                          </td>
                          <td className="revenue-route-text">
                            {trip.from} → {trip.to}
                          </td>
                          <td className="revenue-trip-direction">
                            {trip.tripDirection || 'N/A'}
                          </td>
                          <td>{trip.quantity}</td>
                          <td className="revenue-fare-amount">{formatCurrency(trip.totalFare)}</td>
                        </tr>
                      ))}
                      {/* Pre-booking Total Row */}
                      <tr style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold', borderTop: '2px solid #dee2e6' }}>
                        <td colSpan="4" style={{ textAlign: 'right', padding: '12px', fontSize: '14px' }}>
                          <strong>Pre-booking Total ({revenueData.preBookingTrips?.length || 0} tickets):</strong>
                        </td>
                        <td style={{ textAlign: 'center', padding: '12px' }}>
                          <strong>{revenueData.preBookingTrips?.reduce((sum, trip) => sum + (trip.quantity || 0), 0) || 0}</strong>
                        </td>
                        <td className="revenue-fare-amount" style={{ padding: '12px', color: '#28a745', fontWeight: 'bold' }}>
                          <strong>{formatCurrency(revenueData.preBookingRevenue || 0)}</strong>
                        </td>
                      </tr>
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
                  <table className="revenue-revenue-table revenue-detailed-breakdown-table">
                    <thead>
                      <tr>
                        <th>Trip ID</th>
                        <th>Date & Time</th>
                        <th>Route</th>
                        <th>Trip Direction</th>
                        <th>Passengers</th>
                        <th>Fare</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueData.preTicketing.map((trip, index) => (
                        <tr key={index}>
                          <td className="revenue-trip-id">
                            {trip.tripId || 'N/A'}
                          </td>
                          <td>
                            {(() => {
                              try {
                                const dateStr = trip.date ? new Date(trip.date).toLocaleDateString() : new Date().toLocaleDateString();
                                const timeStr = trip.timestamp ? formatTime(trip.timestamp) : 'N/A';
                                return `${dateStr} ${timeStr}`;
                              } catch (error) {
                                return `${trip.date || 'N/A'} ${formatTime(trip.timestamp)}`;
                              }
                            })()}
                          </td>
                          <td className="revenue-route-text">
                            {trip.from} → {trip.to}
                          </td>
                          <td className="revenue-trip-direction">
                            {trip.tripDirection || 'N/A'}
                          </td>
                          <td>{trip.quantity}</td>
                          <td className="revenue-fare-amount">{formatCurrency(trip.totalFare)}</td>
                        </tr>
                      ))}
                      {/* Pre-ticketing Total Row */}
                      <tr style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold', borderTop: '2px solid #dee2e6' }}>
                        <td colSpan="4" style={{ textAlign: 'right', padding: '12px', fontSize: '14px' }}>
                          <strong>Pre-ticketing Total ({revenueData.preTicketing.length} tickets):</strong>
                        </td>
                        <td style={{ textAlign: 'center', padding: '12px' }}>
                          <strong>{revenueData.preTicketing.reduce((sum, trip) => sum + (trip.quantity || 0), 0)}</strong>
                        </td>
                        <td className="revenue-fare-amount" style={{ padding: '12px', color: '#28a745', fontWeight: 'bold' }}>
                          <strong>{formatCurrency(revenueData.preTicketingRevenue || 0)}</strong>
                        </td>
                      </tr>
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
            <option value="">All Dates</option>
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