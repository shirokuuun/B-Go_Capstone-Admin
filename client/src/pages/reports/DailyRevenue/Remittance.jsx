import React, { useState, useEffect } from 'react';
import {
  getAvailableRemittanceDates,
  loadRemittanceData,
  calculateRemittanceSummary,
  groupRemittanceByconductor,
  validateRemittanceData,
  formatCurrency,
  formatDate,
  formatTime
} from './Remittance.js';
import './DailyRevenue.css';

const RemittanceReport = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTicketType, setSelectedTicketType] = useState('');
  const [selectedTripDirection, setSelectedTripDirection] = useState('');
  const [loading, setLoading] = useState(false);
  const [remittanceData, setRemittanceData] = useState([]);
  const [filteredRemittanceData, setFilteredRemittanceData] = useState([]);
  const [availableDates, setAvailableDates] = useState([]);
  const [availableTripDirections, setAvailableTripDirections] = useState([]);
  const [summary, setSummary] = useState({
    totalTrips: 0,
    totalRevenue: 0,
    totalPassengers: 0,
    totalTickets: 0,
    averageFare: 0
  });
  const [groupedData, setGroupedData] = useState({});
  const [validationResults, setValidationResults] = useState({ isValid: true, errors: [], warnings: [] });
  const [showValidation, setShowValidation] = useState(false);

  // Load available dates on component mount
  useEffect(() => {
    const loadDates = async () => {
      try {
        const dates = await getAvailableRemittanceDates();
        setAvailableDates(dates);
        
        // Set the most recent date as default if available and no date selected
        if (dates.length > 0 && !selectedDate) {
          setSelectedDate(dates[0]);
        }
      } catch (error) {
        console.error('Error loading available dates:', error);
      }
    };
    
    loadDates();
  }, []);

  // Load remittance data when date changes
  useEffect(() => {
    handleLoadRemittanceData();
  }, [selectedDate]);

  // Apply filters when filter values or data changes
  useEffect(() => {
    applyFilters();
  }, [remittanceData, selectedTicketType, selectedTripDirection]);

  // Function to extract unique trip directions from data
  const extractTripDirections = (data) => {
    const directions = new Set();
    data.forEach(trip => {
      if (trip.tripDirection) {
        directions.add(trip.tripDirection);
      }
    });
    return Array.from(directions).sort();
  };

  // Function to apply filters to remittance data
  const applyFilters = () => {
    let filtered = [...remittanceData];

    // Apply ticket type filter
    if (selectedTicketType) {
      filtered = filtered.filter(trip => {
        // Assuming trip has a ticketType property or we need to determine it from the data structure
        // You may need to adjust this based on your actual data structure
        switch (selectedTicketType) {
          case 'conductor':
            return trip.ticketType === 'conductor' || trip.source === 'conductor';
          case 'pre-book':
            return trip.ticketType === 'pre-book' || trip.source === 'pre-booking';
          case 'pre-ticket':
            return trip.ticketType === 'pre-ticket' || trip.source === 'pre-ticketing';
          default:
            return true;
        }
      });
    }

    // Apply trip direction filter
    if (selectedTripDirection) {
      filtered = filtered.filter(trip => trip.tripDirection === selectedTripDirection);
    }

    setFilteredRemittanceData(filtered);
    
    // Recalculate summary and grouped data based on filtered data
    const filteredSummary = calculateRemittanceSummary(filtered);
    const filteredGrouped = groupRemittanceByconductor(filtered);
    
    setSummary(filteredSummary);
    setGroupedData(filteredGrouped);
  };

  // Function to load remittance data
  const handleLoadRemittanceData = async () => {
    setLoading(true);
    try {
      console.log('🚀 Loading remittance data for date:', selectedDate || 'All dates');
      
      let data;
      if (selectedDate) {
        // Load data for specific date
        data = await loadRemittanceData(selectedDate);
      } else {
        // Load data for all available dates
        const allData = [];
        for (const date of availableDates) {
          const dateData = await loadRemittanceData(date);
          allData.push(...dateData);
        }
        data = allData;
      }
      
      const summaryData = calculateRemittanceSummary(data);
      const grouped = groupRemittanceByconductor(data);
      const validation = validateRemittanceData(data);
      
      // Extract available trip directions from the loaded data
      const tripDirections = extractTripDirections(data);
      setAvailableTripDirections(tripDirections);
      
      setRemittanceData(data);
      setFilteredRemittanceData(data); // Initialize filtered data
      setSummary(summaryData);
      setGroupedData(grouped);
      setValidationResults(validation);
      
      console.log('📊 Remittance data loaded successfully');
    } catch (error) {
      console.error('Error loading remittance data:', error);
      // Reset data on error
      setRemittanceData([]);
      setFilteredRemittanceData([]);
      setSummary({
        totalTrips: 0,
        totalRevenue: 0,
        totalPassengers: 0,
        totalTickets: 0,
        averageFare: 0
      });
      setGroupedData({});
      setAvailableTripDirections([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
  };

  const handleTicketTypeChange = (e) => {
    setSelectedTicketType(e.target.value);
  };

  const handleTripDirectionChange = (e) => {
    setSelectedTripDirection(e.target.value);
  };

  const toggleValidationResults = () => {
    setShowValidation(!showValidation);
  };

  const handleRefresh = () => {
    handleLoadRemittanceData();
  };

  if (loading) {
    return (
      <div className="revenue-container">
        <div className="revenue-content-area">
          <div className="revenue-loading-state">
            <p>Loading remittance data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="revenue-container">
      {/* Print Header */}
      <div className="revenue-print-header">
        <div className="revenue-company-info">
          <h1>B-Go Bus Transportation</h1>
          <p>Daily Trips Remittance Report</p>
        </div>
        <div className="revenue-report-info">
          <p><strong>Report Date:</strong> {selectedDate ? formatDate(selectedDate) : 'All Dates'}</p>
          {selectedTripDirection && <p><strong>Trip Direction:</strong> {selectedTripDirection}</p>}
          {selectedTicketType && <p><strong>Ticket Type:</strong> {selectedTicketType}</p>}
          <p><strong>Generated:</strong> {new Date().toLocaleString()}</p>
          <p><strong>Total Trips:</strong> {summary.totalTrips}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="revenue-filters">
        <div className="revenue-filter-group">
          <label className="revenue-filter-label">Select Date</label>
          <select
            value={selectedDate}
            onChange={handleDateChange}
            className="revenue-filter-select"
          >
            <option value="">All Dates</option>
            {availableDates.map((date) => (
              <option key={date} value={date}>
                {formatDate(date)}
              </option>
            ))}
          </select>
        </div>

        <div className="revenue-filter-group">
          <label className="revenue-filter-label">Trip Direction</label>
          <select
            value={selectedTripDirection}
            onChange={handleTripDirectionChange}
            className="revenue-filter-select"
          >
            <option value="">All Trip Directions</option>
            {availableTripDirections.map((direction) => (
              <option key={direction} value={direction}>
                {direction}
              </option>
            ))}
          </select>
        </div>

        <div className="revenue-filter-group">
          <label className="revenue-filter-label">Ticket Type</label>
          <select
            value={selectedTicketType}
            onChange={handleTicketTypeChange}
            className="revenue-filter-select"
          >
            <option value="">All Ticket Types</option>
            <option value="conductor">Conductor Ticket</option>
            <option value="pre-book">Pre-Booking</option>
            <option value="pre-ticket">Pre-Ticketing</option>
          </select>
        </div>
      </div>

      {/* Content Area */}
      <div className="revenue-content-area">
        <div className="revenue-daily-container">
          {/* Summary Cards */}
          <div className="revenue-daily-summary-card-container">
            <div className="revenue-daily-header-pattern"></div>
            <div className="revenue-summary-cards">
              <div className="revenue-summary-card">
                <h3 className="revenue-card-title">Total Trips</h3>
                <p className="revenue-card-value">{summary.totalTrips}</p>
              </div>
              <div className="revenue-summary-card">
                <h3 className="revenue-card-title">Total Revenue</h3>
                <p className="revenue-card-value">{formatCurrency(summary.totalRevenue)}</p>
              </div>
              <div className="revenue-summary-card">
                <h3 className="revenue-card-title">Total Tickets</h3>
                <p className="revenue-card-value">{summary.totalPassengers}</p>
              </div>
              <div className="revenue-summary-card">
                <h3 className="revenue-card-title">Average Fare</h3>
                <p className="revenue-card-value">{formatCurrency(summary.averageFare)}</p>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="revenue-daily-controls">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="revenue-refresh-btn"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={handlePrint}
              className="revenue-print-btn"
              disabled={loading || filteredRemittanceData.length === 0}
            >
              🖨️ Print Report
            </button>
          </div>

          {/* Filter Summary */}
          {(selectedTicketType || selectedTripDirection) && (
            <div className="revenue-breakdown-section" style={{ marginBottom: '20px' }}>
              <h3 className="revenue-breakdown-title">Active Filters</h3>
              <div style={{ padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '8px' }}>
                {selectedTicketType && (
                  <p style={{ margin: '5px 0', color: '#1565c0' }}>
                    <strong>Ticket Type:</strong> {selectedTicketType}
                  </p>
                )}
                {selectedTripDirection && (
                  <p style={{ margin: '5px 0', color: '#1565c0' }}>
                    <strong>Trip Direction:</strong> {selectedTripDirection}
                  </p>
                )}
                <p style={{ margin: '5px 0', fontSize: '14px', color: '#666' }}>
                  Showing {filteredRemittanceData.length} of {remittanceData.length} total trips
                </p>
              </div>
            </div>
          )}

          {/* Main Remittance Table */}
          <div className="revenue-breakdown-section">
            <h3 className="revenue-breakdown-title">Daily Trips Remittance Summary</h3>
            
            {filteredRemittanceData.length > 0 ? (
              <div className="revenue-table-container">
                <table className="revenue-revenue-table">
                  <thead>
                    <tr>
                      <th>Conductor ID</th>
                      <th>Trip Number</th>
                      <th>Date & Time</th>
                      <th>Trip Direction</th>
                      <th>Ticket Type</th>
                      <th style={{ width: '40px', fontSize: '12px' }}>Tickets</th>
                      <th style={{ width: '70px', fontSize: '12px' }}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRemittanceData.map((trip, index) => (
                      <tr key={index}>
                        <td className="revenue-trip-id">{trip.conductorId}</td>
                        <td className="revenue-trip-id">{trip.tripNumber}</td>
                        <td>
                          {(() => {
                            try {
                              // Use trip.date for the date part and trip.startTime for the time part
                              const dateStr = trip.date ? formatDate(trip.date) : 'N/A';
                              const timeStr = trip.startTime ? formatTime(trip.startTime) : 'N/A';
                              return `${dateStr} ${timeStr}`;
                            } catch (error) {
                              console.error('Date formatting error:', error, 'Trip data:', trip);
                              return `${trip.date || 'N/A'} ${trip.startTime ? formatTime(trip.startTime) : 'N/A'}`;
                            }
                          })()}
                        </td>
                        <td className="revenue-trip-direction">{trip.tripDirection}</td>
                        <td>{trip.ticketType || trip.source || 'N/A'}</td>
                        <td style={{ textAlign: 'center', width: '40px', fontSize: '12px', padding: '8px 4px' }}>{trip.ticketCount}</td>
                        <td className="revenue-fare-amount" style={{ width: '70px', fontSize: '12px', padding: '8px 4px' }}>{formatCurrency(trip.totalRevenue)}</td>
                      </tr>
                    ))}
                    {/* Total Row */}
                    <tr style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold', borderTop: '2px solid #dee2e6' }}>
                      <td colSpan="5" style={{ textAlign: 'right', padding: '12px', fontSize: '14px' }}>
                        <strong>TOTAL ({filteredRemittanceData.length} trips):</strong>
                      </td>
                      <td style={{ textAlign: 'center', width: '40px', fontSize: '12px', padding: '12px 4px' }}>
                        <strong>{filteredRemittanceData.reduce((sum, trip) => sum + trip.ticketCount, 0)}</strong>
                      </td>
                      <td className="revenue-fare-amount" style={{ width: '70px', fontSize: '12px', padding: '12px 4px' }}>
                        <strong>{formatCurrency(filteredRemittanceData.reduce((sum, trip) => sum + trip.totalRevenue, 0))}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="revenue-empty-state">
                <h3>No remittance data found</h3>
                <p>
                  {selectedDate ? 
                    `No remittance data available for the selected filters.` :
                    'No remittance data available. Please check if there are any available dates or try refreshing.'
                  }
                </p>
                {(selectedTicketType || selectedTripDirection) && (
                  <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                    Try removing some filters to see more results.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Detailed Breakdown by Conductor */}
          {Object.keys(groupedData).length > 0 && (
            <div className="revenue-breakdown-section">
              <h3 className="revenue-breakdown-title">Detailed Breakdown by Conductor</h3>
              
              {Object.entries(groupedData).map(([conductorId, trips]) => {
                const conductorSummary = trips.conductorSummary || {
                  totalTrips: trips.length,
                  totalRevenue: trips.reduce((sum, trip) => sum + trip.totalRevenue, 0),
                  totalPassengers: trips.reduce((sum, trip) => sum + trip.totalPassengers, 0)
                };

                return (
                  <div key={conductorId} className="revenue-section-container">
                    <h4 className="revenue-section-title revenue-section-conductor">
                      Conductor: {conductorId} 
                      <span style={{ marginLeft: '10px', fontSize: '14px', fontWeight: 'normal' }}>
                        ({conductorSummary.totalTrips} trips, {formatCurrency(conductorSummary.totalRevenue)}, {conductorSummary.totalPassengers} tickets)
                      </span>
                    </h4>
                    
                    <div className="revenue-table-container">
                      <table className="revenue-revenue-table">
                        <thead>
                          <tr>
                            <th>Trip #</th>
                            <th>Date & Time</th>
                            <th>Direction</th>
                            <th>Ticket Type</th>
                            <th style={{ width: '100px' }}>Passengers</th>
                            <th style={{ width: '100px' }}>Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trips.filter(trip => trip.conductorId).map((trip, tripIndex) => (
                            <tr key={tripIndex}>
                              <td className="revenue-trip-id">
                                {trip.tripNumber}
                              </td>
                              <td>
                                {(() => {
                                  try {
                                    // Use trip.date for the date part and trip.startTime for the time part
                                    const dateStr = trip.date ? formatDate(trip.date) : 'N/A';
                                    const timeStr = trip.startTime ? formatTime(trip.startTime) : 'N/A';
                                    return `${dateStr} ${timeStr}`;
                                  } catch (error) {
                                    console.error('Date formatting error:', error, 'Trip data:', trip);
                                    return `${trip.date || 'N/A'} ${trip.startTime ? formatTime(trip.startTime) : 'N/A'}`;
                                  }
                                })()}
                              </td>
                              <td className="revenue-trip-direction">
                                {trip.tripDirection}
                              </td>
                              <td>
                                {trip.ticketType || trip.source || 'N/A'}
                              </td>
                              <td style={{ textAlign: 'center', width: '100px' }}>
                                {trip.totalPassengers || 0}
                              </td>
                              <td className="revenue-fare-amount" style={{ width: '100px' }}>
                                {formatCurrency(trip.totalRevenue)}
                              </td>
                            </tr>
                          ))}
                          {/* Conductor Total Row */}
                          <tr style={{ backgroundColor: '#e8f4f8', fontWeight: 'bold', borderTop: '2px solid #17a2b8' }}>
                            <td colSpan="4" style={{ textAlign: 'right', padding: '12px', fontSize: '14px' }}>
                              <strong>Conductor {conductorId} Total:</strong>
                            </td>
                            <td style={{ textAlign: 'center', width: '100px', padding: '12px' }}>
                              <strong>{conductorSummary.totalPassengers}</strong>
                            </td>
                            <td className="revenue-fare-amount" style={{ width: '100px', padding: '12px' }}>
                              <strong>{formatCurrency(conductorSummary.totalRevenue)}</strong>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Print Summary for detailed breakdown */}
          <div className="revenue-print-summary">
            <h3>Remittance Summary by Conductor</h3>
            <div className="revenue-breakdown-summary">
              {Object.entries(groupedData).map(([conductorId, trips]) => {
                const conductorSummary = trips.conductorSummary || {
                  totalTrips: trips.length,
                  totalRevenue: trips.reduce((sum, trip) => sum + trip.totalRevenue, 0),
                  totalPassengers: trips.reduce((sum, trip) => sum + trip.totalPassengers, 0)
                };

                return (
                  <div key={conductorId} className="revenue-breakdown-item">
                    <span className="revenue-breakdown-label">
                      {conductorId}: {conductorSummary.totalTrips} trips, {conductorSummary.totalPassengers} tickets
                    </span>
                    <span className="revenue-breakdown-value">
                      {formatCurrency(conductorSummary.totalRevenue)}
                    </span>
                  </div>
                );
              })}
              
              <div className="revenue-breakdown-item revenue-breakdown-total">
                <span className="revenue-breakdown-label">
                  Total: {summary.totalTrips} trips, {summary.totalPassengers} tickets
                </span>
                <span className="revenue-breakdown-value">
                  {formatCurrency(summary.totalRevenue)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Print Footer */}
      <div className="revenue-print-footer">
        <div className="revenue-footer-left">
          <p>This remittance report was generated automatically by the B-Go Bus Transportation System</p>
        </div>
        <div className="revenue-footer-right">
          <p>Page 1 of 1 | Generated on: {new Date().toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
};

export default RemittanceReport;