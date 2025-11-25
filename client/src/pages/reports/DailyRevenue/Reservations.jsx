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
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [routeFilter, setRouteFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const [stats, setStats] = useState({
    total: 0, confirmed: 0, pending: 0, cancelled: 0, completed: 0
  });
  const [totalRevenue, setTotalRevenue] = useState(0);

  useEffect(() => { fetchData(); }, []);

  // --- COMPUTE UNIQUE OPTIONS ---
  const uniqueRoutes = useMemo(() => {
    return [...new Set(reservations.map(r => r.route))].sort();
  }, [reservations]);

  const uniqueTypes = useMemo(() => {
    return [...new Set(reservations.map(r => r.type))].sort();
  }, [reservations]);

  // --- HELPER: MOVED THIS UP (It belongs here, not in the JSX) ---
  const applyDatePreset = (range) => {
    const end = new Date();
    const start = new Date();
    
    if (range === 'all') {
      setStartDate('');
      setEndDate('');
      return;
    }

    if (range === 'year') {
      start.setFullYear(end.getFullYear() - 1);
    } else {
      start.setDate(end.getDate() - range);
    }
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  // --- MAIN FILTERING LOGIC ---
  useEffect(() => {
    let result = reservations;

    // 1. Filter by Date Range
    if (startDate) {
      // Compare YYYY-MM-DD vs YYYY-MM-DD (Works perfectly)
      result = result.filter(r => r.filedDateISO >= startDate);
    }
    if (endDate) {
      result = result.filter(r => r.filedDateISO <= endDate);
    }

    // 2. Filter by Status
    if (statusFilter !== 'all') {
      result = result.filter(r => r.status === statusFilter);
    }
    // 3. Filter by Route
    if (routeFilter !== 'all') {
      result = result.filter(r => r.route === routeFilter);
    }
    // 4. Filter by Type
    if (typeFilter !== 'all') {
      result = result.filter(r => r.type === typeFilter);
    }

    setFilteredReservations(result);
  }, [reservations, statusFilter, startDate, endDate, routeFilter, typeFilter]);

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

  const currentViewTotalRevenue = filteredReservations.reduce((sum, item) => {
    return sum + (Number(item.revenue) || 0);
  }, 0);

  const computedStats = useMemo(() => {
    const initialStats = { 
      total: 0, 
      confirmed: 0, 
      pending: 0, 
      cancelled: 0, 
      completed: 0 
    };

    return filteredReservations.reduce((acc, curr) => {
      // Increment Total
      acc.total++;

    if (acc[curr.status] !== undefined) {
        acc[curr.status]++;
      }
      return acc;
    }, initialStats);
  }, [filteredReservations]);

  const handleClearFilters = () => {
    setStatusFilter('all');
    setStartDate('');
    setEndDate('');
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
      <div className="res-sort-container">

        {/* 1. Date: FROM */}
        <div className="res-sort-group">
          <label className="res-sort-label">From</label>
          <input 
            type="date" 
            className="res-sort-select" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)} 
            style={{ paddingRight: '0' }}
          />
        </div>

        {/* 2. Date: TO */}
        <div className="res-sort-group">
          <label className="res-sort-label">To</label>
          <input 
            type="date" 
            className="res-sort-select" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)} 
            style={{ paddingRight: '0' }}
          />
        </div>
        
        {/* 3. Quick Presets */}
        <div className="res-sort-group">
          <label className="res-sort-label">Quick Select</label>
          <div className="res-qs-container">
            <button className="res-qs-btn" onClick={() => applyDatePreset(7)}>7 Days</button>
            <button className="res-qs-btn" onClick={() => applyDatePreset(30)}>30 Days</button>
            <button className="res-qs-btn" onClick={() => applyDatePreset('year')}>1 Year</button>
          </div>
        </div>  
        
        {/* 4. Status Filter */}
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

        {/* 5. Trip Direction */}
        <div className="res-sort-group">
          <label className="res-sort-label">Trip Direction</label>
          <select className="res-sort-select" value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)}>
            <option value="all">All Trip Directions</option>
            {uniqueRoutes.map(route => (
              <option key={route} value={route}>{route}</option>
            ))}
          </select>
        </div>

        {/* 6. Ticket Type */}
        <div className="res-sort-group">
          <label className="res-sort-label">Type</label>
          <select className="res-sort-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            {uniqueTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        {/* 7. Clear Filters Button */}
        <div className="res-sort-group">
           <button className="res-sort-clear-btn" onClick={handleClearFilters}>
             Clear Filters
           </button>
        </div>

        {/* 8. Stats Pill */}
        <div className="res-sort-group">
          <div className="res-sort-stats-pill">
            {filteredReservations.length} Reservations
          </div>
        </div>

      </div>

      
      {/* --- SUMMARY CARDS --- */}
      <div className="revenue-daily-summary-card-container">
        <div className="revenue-daily-header-pattern"></div>
        <div className="revenue-reservations-grid">
          <div className="revenue-summary-card">
            <h3 className="revenue-card-title">Total Reservations</h3>
            <div className="revenue-card-stat-row"><p className="revenue-card-value">{computedStats.total}</p></div>
          </div>
          <div className="revenue-summary-card">
            <h3 className="revenue-card-title">Confirmed</h3>
            <div className="revenue-card-stat-row"><p className="revenue-card-value">{computedStats.confirmed}</p></div>
          </div>
          <div className="revenue-summary-card">
            <h3 className="revenue-card-title">Completed</h3>
            <div className="revenue-card-stat-row"><p className="revenue-card-value">{computedStats.completed}</p></div>
          </div>
          <div className="revenue-summary-card">
            <h3 className="revenue-card-title">Pending</h3>
            <div className="revenue-card-stat-row"><p className="revenue-card-value">{computedStats.pending}</p></div>
          </div>
          <div className="revenue-summary-card">
            <h3 className="revenue-card-title">Cancelled</h3>
            <div className="revenue-card-stat-row"><p className="revenue-card-value">{computedStats.cancelled}</p></div>
          </div>
          <div className="revenue-summary-card">
            <h3 className="revenue-card-title">Total Revenue</h3>
            <div className="revenue-card-stat-row"><p className="revenue-card-value">₱{currentViewTotalRevenue.toLocaleString()}</p></div>
          </div>
        </div>
      </div>

      {/* Export Button */}
        <div className="res-sort-group res-sort-push-right">
          <button className="res-sort-export-btn" onClick={handleExport}>
            <PiMicrosoftExcelLogoFill size={20} /> Export to Excel
          </button>
        </div>

      {/* --- DATA TABLE --- */}
      {/* --- DATA TABLE --- */}
      <div className="revenue-section-container">
        <h4 className="revenue-section-title" style={{color: '#007c91'}}>
          Reservation List ({filteredReservations.length})
        </h4>
        
        {filteredReservations.length > 0 ? (
          <div className="revenue-table-container">
            <table className="revenue-revenue-table daily-revenue-table">
              <thead>
                <tr>
                  {/* NEW COLUMN HEADER */}
                  <th className="res-col-timestamp">Date Filed</th> 
                  <th className="res-col-name">Customer Name</th>
                  <th className="res-col-route">Route</th>
                  <th className="res-col-date">Departure</th>
                  <th className="res-col-time">Time</th>
                  <th className="res-col-bus">Bus</th>
                  <th className="res-col-type">Type</th>
                  <th className="res-col-status">Status</th>
                  <th className="res-col-amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredReservations.map((res) => (
                  <tr key={res.id}>
                    {/* NEW COLUMN DATA */}
                    <td className="res-col-timestamp">{res.dateFiled}</td>

                    <td className="res-col-name" style={{fontWeight: '600', color: '#2c3e50'}}>{res.fullName}</td>
                    <td className="res-col-route revenue-route-text">{res.route}</td>
                    <td className="res-col-date" style={{color: '#17a2b8', fontStyle: 'italic'}}>{res.departureDate}</td>
                    <td className="res-col-time">{res.departureTime}</td>
                    <td className="res-col-bus" style={{fontSize: '11px'}}>{res.busId}</td>
                    <td className="res-col-type">{res.type}</td>
                    
                    {/* UPDATED STATUS COLUMN */}
                    <td className="res-col-status">
                      <span className={`revenue-status-badge ${getStatusClass(res.status)}`}>
                        {res.status}
                      </span>
                      
                      {/* LOGIC: Show who cancelled it if status is cancelled */}
                      {res.status === 'cancelled' && res.cancelledBy && (
                        <div className="res-cancelled-subtext">
                          by {res.cancelledBy === 'user' ? 'User' : 'Admin'}
                        </div>
                      )}
                    </td>

                    <td className="res-col-amount revenue-fare-amount">₱{res.revenue.toLocaleString()}</td>
                  </tr>
                ))}
                
                {/* Total Row (Update colSpan to 8 because we added a column) */}
                <tr className="revenue-total-row">
                    <td colSpan="8" style={{textAlign: 'right', fontWeight: '700', color: '#2c3e50', paddingRight: '20px', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
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