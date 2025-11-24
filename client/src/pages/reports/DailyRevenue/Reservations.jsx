// src/pages/reports/DailyRevenue/ReservationsReport.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { PiMicrosoftExcelLogoFill } from "react-icons/pi";
import { loadReservationsData } from './Reservations.js';
import * as XLSX from 'xlsx';
import './DailyRevenue.css';

const ReservationsReport = () => {
  const [reservations, setReservations] = useState([]);
  const [filteredReservations, setFilteredReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- FILTER STATES ---
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [routeFilter, setRouteFilter] = useState('all'); // "Trip Direction"
  const [typeFilter, setTypeFilter] = useState('all');   // "Ticket Type"

  const [stats, setStats] = useState({
    total: 0, confirmed: 0, pending: 0, cancelled: 0, completed: 0
  });
  const [totalRevenue, setTotalRevenue] = useState(0);

  useEffect(() => { fetchData(); }, []);

  // --- COMPUTE UNIQUE OPTIONS FOR DROPDOWNS ---
  const uniqueDates = useMemo(() => {
    return [...new Set(reservations.map(r => r.departureDate))].sort();
  }, [reservations]);

  const uniqueRoutes = useMemo(() => {
    return [...new Set(reservations.map(r => r.route))].sort();
  }, [reservations]);

  const uniqueTypes = useMemo(() => {
    return [...new Set(reservations.map(r => r.type))].sort();
  }, [reservations]);

  // --- MAIN FILTERING LOGIC ---
  useEffect(() => {
    let result = reservations;

    // 1. Filter by Status
    if (statusFilter !== 'all') {
      result = result.filter(r => r.status === statusFilter);
    }
    // 2. Filter by Date
    if (dateFilter !== 'all') {
      result = result.filter(r => r.departureDate === dateFilter);
    }
    // 3. Filter by Route (Direction)
    if (routeFilter !== 'all') {
      result = result.filter(r => r.route === routeFilter);
    }
    // 4. Filter by Type
    if (typeFilter !== 'all') {
      result = result.filter(r => r.type === typeFilter);
    }

    setFilteredReservations(result);
  }, [reservations, statusFilter, dateFilter, routeFilter, typeFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await loadReservationsData();
      setReservations(data.reservations);
      setStats(data.stats);
      setTotalRevenue(data.totalRevenue);
    } catch (error) {
      console.error("Failed to fetch reservations", error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate the total revenue for the CURRENTLY displayed list
  const currentViewTotalRevenue = filteredReservations.reduce((sum, item) => {
    return sum + (Number(item.revenue) || 0);
  }, 0);

  // Reset all filters
  const handleClearFilters = () => {
    setStatusFilter('all');
    setDateFilter('all');
    setRouteFilter('all');
    setTypeFilter('all');
  };

  const handleExport = () => {
    const exportData = filteredReservations.map(r => ({
      'Customer Name': r.fullName,
      'Route': r.route,
      'Departure Date': r.departureDate,
      'Departure Time': r.departureTime,
      'Bus ID': r.busId,
      'Type': r.type,
      'Status': r.status.toUpperCase(),
      'Revenue': r.revenue
    }));
    
    exportData.push({
      'Customer Name': `TOTAL (${filteredReservations.length} items)`,
      'Route': '', 'Departure Date': '', 'Departure Time': '', 'Bus ID': '', 'Type': '', 'Status': '',
      'Revenue': currentViewTotalRevenue
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reservations");
    XLSX.writeFile(wb, `Reservations_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const getStatusClass = (status) => {
    switch(status) {
      case 'confirmed': return 'status-confirmed';
      case 'completed': return 'status-completed';
      case 'cancelled': return 'status-cancelled';
      default: return 'status-pending';
    }
  };

  if (loading) {
    return (
      <div className="revenue-daily-container">
        <div className="revenue-loading-state"><p>Loading reservations...</p></div>
      </div>
    );
  }

  return (
    <div className="revenue-daily-container">

          {/* --- UNIQUE SORT/FILTER BAR --- */}
      {/* Changed classes here to 'res-sort-' prefix to match your request */}
      <div className="res-sort-container">
        
        {/* 1. Status Filter */}
        <div className="res-sort-group">
          <label className="res-sort-label">Status</label>
          <select className="res-sort-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* 2. Available Dates */}
        <div className="res-sort-group">
          <label className="res-sort-label">Available Dates</label>
          <select className="res-sort-select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
            <option value="all">All Dates</option>
            {uniqueDates.map(date => (
              <option key={date} value={date}>{date}</option>
            ))}
          </select>
        </div>

        {/* 3. Trip Direction */}
        <div className="res-sort-group">
          <label className="res-sort-label">Trip Direction</label>
          <select className="res-sort-select" value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)}>
            <option value="all">All Trip Directions</option>
            {uniqueRoutes.map(route => (
              <option key={route} value={route}>{route}</option>
            ))}
          </select>
        </div>

        {/* 4. Ticket Type */}
        <div className="res-sort-group">
          <label className="res-sort-label">Type</label>
          <select className="res-sort-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            {uniqueTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* 5. Clear Filters Button */}
        <div className="res-sort-group">
           <button className="res-sort-clear-btn" onClick={handleClearFilters}>
              Clear Filters
           </button>
        </div>

        {/* 6. Stats Pill */}
        <div className="res-sort-group">
          <div className="res-sort-stats-pill">
            {filteredReservations.length} Reservations
          </div>
        </div>

      </div>

      
      {/* --- SUMMARY CARDS (Kept original classes) --- */}
      <div className="revenue-daily-summary-card-container">
        <div className="revenue-daily-header-pattern"></div>
        <div className="revenue-reservations-grid">
          <div className="revenue-summary-card">
            <h3 className="revenue-card-title">Total Reservations</h3>
            <div className="revenue-card-stat-row"><p className="revenue-card-value">{stats.total}</p></div>
          </div>
          <div className="revenue-summary-card">
            <h3 className="revenue-card-title">Confirmed</h3>
            <div className="revenue-card-stat-row"><p className="revenue-card-value">{stats.confirmed}</p></div>
          </div>
          <div className="revenue-summary-card">
            <h3 className="revenue-card-title">Completed</h3>
            <div className="revenue-card-stat-row"><p className="revenue-card-value">{stats.completed}</p></div>
          </div>
          <div className="revenue-summary-card">
            <h3 className="revenue-card-title">Pending</h3>
            <div className="revenue-card-stat-row"><p className="revenue-card-value">{stats.pending}</p></div>
          </div>
          <div className="revenue-summary-card">
            <h3 className="revenue-card-title">Cancelled</h3>
            <div className="revenue-card-stat-row"><p className="revenue-card-value">{stats.cancelled}</p></div>
          </div>
          <div className="revenue-summary-card">
            <h3 className="revenue-card-title">Total Revenue</h3>
            <div className="revenue-card-stat-row"><p className="revenue-card-value">₱{totalRevenue.toLocaleString()}</p></div>
          </div>
        </div>
      </div>

      {/* Export Button (Pushed to the right) */}
        <div className="res-sort-group res-sort-push-right">
          <button className="res-sort-export-btn" onClick={handleExport}>
            <PiMicrosoftExcelLogoFill size={20} /> Export to Excel
          </button>
        </div>

      {/* --- DATA TABLE (Kept original classes) --- */}
      <div className="revenue-section-container">
        <h4 className="revenue-section-title" style={{color: '#007c91'}}>
          Reservation List ({filteredReservations.length})
        </h4>
        
        {filteredReservations.length > 0 ? (
          <div className="revenue-table-container">
            <table className="revenue-revenue-table daily-revenue-table">
              <thead>
                <tr>
                  <th className="res-col-name">Customer Name</th>
                  <th className="res-col-route">Route</th>
                  <th className="res-col-date">Departure Date</th>
                  <th className="res-col-time">Time</th>
                  <th className="res-col-bus">Assigned Bus</th>
                  <th className="res-col-type">Type</th>
                  <th className="res-col-status">Status</th>
                  <th className="res-col-amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredReservations.map((res) => (
                  <tr key={res.id}>
                    <td className="res-col-name" style={{fontWeight: '600', color: '#2c3e50'}}>{res.fullName}</td>
                    <td className="res-col-route revenue-route-text">{res.route}</td>
                    <td className="res-col-date" style={{color: '#17a2b8', fontStyle: 'italic'}}>{res.departureDate}</td>
                    <td className="res-col-time">{res.departureTime}</td>
                    <td className="res-col-bus" style={{fontSize: '11px'}}>{res.busId}</td>
                    <td className="res-col-type">{res.type}</td>
                    <td className="res-col-status">
                      <span className={`revenue-status-badge ${getStatusClass(res.status)}`}>{res.status}</span>
                    </td>
                    <td className="res-col-amount revenue-fare-amount">₱{res.revenue.toLocaleString()}</td>
                  </tr>
                ))}
                
                {/* Total Row */}
                <tr className="revenue-total-row">
                    <td colSpan="7" style={{textAlign: 'right', fontWeight: '700', color: '#2c3e50', paddingRight: '20px', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                      Total List ({filteredReservations.length}):
                    </td>
                    <td className="res-col-amount revenue-fare-amount" style={{fontSize: '14px', fontWeight: '800'}}>
                      ₱{currentViewTotalRevenue.toLocaleString()}
                    </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="revenue-empty-state">
            <h3>No Reservations Found</h3>
            <p>Try adjusting your filters.</p>
          </div>
        )}
      </div>

    </div>
  );
};

export default ReservationsReport;