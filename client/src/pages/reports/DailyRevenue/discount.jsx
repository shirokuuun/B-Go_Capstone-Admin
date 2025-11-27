import React, { useState, useEffect } from 'react';
import { fetchDiscountReportData, calculateDiscountStats } from './discount.js'; 
import { getAvailableRoutes } from '/src/pages/reports/DailyRevenue/DailyRevenue.js';
import { FaPrint } from "react-icons/fa6";
import './discount.css';
import { generateLandscapePDF } from '/src/utils/pdfGenerator.js';

const DiscountPage = () => {

const handlePrintPDF = () => {
    // 1. Prepare Summary Data
    const summaryData = [
        { label: "Total Discounts", value: `PHP ${stats.totalDiscount.toLocaleString()}` },
        { label: "Senior Disc.", value: `PHP ${stats.seniorDiscount.toLocaleString()}` },
        { label: "PWD Disc.", value: `PHP ${stats.pwdDiscount.toLocaleString()}` },
        { label: "Student Disc.", value: `PHP ${stats.studentDiscount.toLocaleString()}` }
    ];

    // 2. Prepare Trips Table Body
    const tripsBody = filteredTrips.map(trip => [
        trip.tripId,
        `${new Date(trip.date).toLocaleDateString()} ${trip.time}`,
        trip.route.replace(/→/g, '->'),
        trip.totalDiscountedPax,
        trip.breakdown.senior.toFixed(2),
        trip.breakdown.pwd.toFixed(2),
        trip.breakdown.student.toFixed(2),
        trip.totalDiscount.toFixed(2),
        trip.totalRevenue.toFixed(2),
        (trip.totalRevenue + trip.totalDiscount).toFixed(2)
    ]);

    // 3. Prepare Tickets Table Body
    const ticketsBody = filteredTickets.map(t => [
        `${new Date(t.date).toLocaleDateString()} ${t.time}`,
        t.ticketCategory,
        // --- FIX IS HERE: Change 'trip.route' to 't.route' ---
        t.route.replace(/→/g, '->'), 
        t.typeString,
        t.discount.toFixed(2),
        t.paid.toFixed(2),
        t.gross.toFixed(2)
    ]);

    // 4. Call the Utility
    generateLandscapePDF({
        title: "Discount & Revenue Report",
        subtitle: `Period: ${startDate || 'Start'} to ${endDate || 'Present'} | Route: ${selectedRoute || 'All'}`,
        fileName: `Discount_Report_${new Date().toISOString().split('T')[0]}.pdf`,
        summary: summaryData,
        tables: [
            {
                title: "Detailed Breakdown by Trip",
                head: ["Trip #", "Date/Time", "Route", "Pax", "Senior", "PWD", "Student", "Total Disc", "Paid", "Gross"],
                body: tripsBody,
                columnStyles: {
                    4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
                    7: { halign: 'right', fontStyle: 'bold', textColor: [220, 53, 69] }, 
                    8: { halign: 'right', fontStyle: 'bold', textColor: [25, 135, 84] },
                    9: { halign: 'right' }
                }
            },
            {
                title: "Detailed Breakdown by Ticket",
                head: ["Issued", "Category", "Route", "Type", "Discount", "Paid", "Gross"],
                body: ticketsBody,
                columnStyles: {
                    4: { halign: 'right', textColor: [220, 53, 69] },
                    5: { halign: 'right', textColor: [25, 135, 84] },
                    6: { halign: 'right' }
                }
            }
        ]
    });
  };

  const [startDate, setStartDate] = useState(''); 
  const [endDate, setEndDate] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');     
  
  // --- STATE FOR DATA ---
  const [tripsData, setTripsData] = useState([]); 
  const [ticketsData, setTicketsData] = useState([]);
  
  // --- STATE FOR FILTERED DATA ---
  const [filteredTrips, setFilteredTrips] = useState([]);
  const [filteredTickets, setFilteredTickets] = useState([]);
  
  const [stats, setStats] = useState({ 
    totalDiscount: 0, totalPaid: 0,
    seniorDiscount: 0, seniorPaid: 0,
    pwdDiscount: 0, pwdPaid: 0,
    studentDiscount: 0, studentPaid: 0,
    tripCount: 0 
  });
  
  const [availableRoutesList, setAvailableRoutesList] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadRoutes = async () => {
      try {
        const routes = await getAvailableRoutes();
        setAvailableRoutesList(routes);
      } catch (e) { console.warn(e); }
    };
    loadRoutes();
  }, []);

  // --- FETCH DATA ---
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const { trips, tickets } = await fetchDiscountReportData(startDate, endDate);
      setTripsData(trips || []);
      setTicketsData(tickets || []);
      setLoading(false);
    };
    loadData();
  }, [startDate, endDate]);

  // --- FILTER DATA ---
  useEffect(() => {
    // 1. Filter Trips
    let fTrips = tripsData;
    if (selectedRoute) {
      fTrips = fTrips.filter(item => item.route === selectedRoute);
    }
    setFilteredTrips(fTrips);

    // 2. Filter Tickets
    let fTickets = ticketsData;
    if (selectedRoute) {
      fTickets = fTickets.filter(item => item.route === selectedRoute);
    }
    setFilteredTickets(fTickets);

    // 3. Calculate Stats
    setStats(calculateDiscountStats(fTrips));

  }, [tripsData, ticketsData, selectedRoute]);

  const applyDatePreset = (range) => {
    const end = new Date();
    const start = new Date();
    if (range === 'all') {
        setStartDate('');
        setEndDate('');
        return;
    }
    if (range === 'year') start.setFullYear(end.getFullYear() - 1);
    else start.setDate(end.getDate() - range);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const formatCurrency = (val) => `₱${(val || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

  return (
    <div className="discount-main-container">
      
      {/* FILTER BAR */}
      <div className="discount-sort-container">
        <div className="discount-sort-group">
          <label className="discount-sort-label">From</label>
          <input type="date" className="discount-sort-select" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="discount-sort-group">
          <label className="discount-sort-label">To</label>
          <input type="date" className="discount-sort-select" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="discount-sort-group">
          <label className="discount-sort-label">Quick Select</label>
          <div className="discount-qs-container">
            <button className="discount-qs-btn" onClick={() => applyDatePreset(7)}>7 Days</button>
            <button className="discount-qs-btn" onClick={() => applyDatePreset(30)}>30 Days</button>
            <button className="discount-qs-btn" onClick={() => applyDatePreset('all')}>All Dates</button>
          </div>
        </div>
        <div className="discount-sort-group">
          <label className="discount-sort-label">Route</label>
          <select className="discount-sort-select" value={selectedRoute} onChange={(e) => setSelectedRoute(e.target.value)}>
            <option value="">All Routes</option>
            {availableRoutesList.map(route => <option key={route} value={route}>{route}</option>)}
          </select>
        </div>
        <div className="discount-sort-group">
          <label className="discount-sort-label">&nbsp;</label>
          <button className="discount-clear-btn" onClick={() => {
            setStartDate('');
            setEndDate('');
            setSelectedRoute('');
          }}>Clear Filters</button>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="discount-summary-wrapper">
        <div className="discount-header-pattern"></div>
        <div className="discount-summary-grid">
          
          {/* CARD 1: TOTAL DISCOUNTS */}
          <div className="discount-summary-card">
            <h3 className="discount-card-title">Total Discounts Given</h3>
            <p className="discount-card-value">{loading ? '-' : formatCurrency(stats.totalDiscount)}</p>
          </div>

          {/* CARD 2: SENIOR DISCOUNTS */}
          <div className="discount-summary-card">
            <h3 className="discount-card-title">Senior Discount</h3>
            <p className="discount-card-value">{loading ? '-' : formatCurrency(stats.seniorDiscount)}</p>
          </div>

          {/* CARD 3: PWD DISCOUNTS */}
          <div className="discount-summary-card">
            <h3 className="discount-card-title">PWD Discount</h3>
            <p className="discount-card-value">{loading ? '-' : formatCurrency(stats.pwdDiscount)}</p>
          </div>

          {/* CARD 4: STUDENT DISCOUNTS */}
          <div className="discount-summary-card">
            <h3 className="discount-card-title">Student Discount</h3>
            <p className="discount-card-value">{loading ? '-' : formatCurrency(stats.studentDiscount)}</p>
          </div>

        </div>
      </div>

      <div className="discount-action-bar">
         <button className="discount-btn-download discount-btn-pdf" onClick={handlePrintPDF}>
            <FaPrint size={16} /> 
            <span>Print to PDF</span>
         </button>
      </div>

      {/* TABLE 1: DETAILED BREAKDOWN BY TRIP */}
   <h3 className="discount-section-title">Detailed Breakdown by Trip</h3>
      <div className="discount-table-container">
        <table className="discount-data-table">
          <thead>
            <tr>
              <th rowSpan={2} style={{width: '7%'}}>Trip #</th>
              <th rowSpan={2} style={{width: '10%'}}>Date & Time</th>
              <th rowSpan={2} style={{width: '16%'}}>Route / Direction</th>
              <th rowSpan={2} className="discount-text-center" style={{width: '8%', color: '#666'}}>Passengers</th>
              <th colSpan={3} className="discount-text-center" style={{width: '21%'}}>Discount Breakdown</th>
              <th rowSpan={2} className="discount-text-right" style={{width: '13%', color: '#dc3545'}}>Total Discount</th>
              <th rowSpan={2} className="discount-text-right" style={{width: '14%', color: '#198754'}}>Paid Amount</th>
              <th rowSpan={2} className="discount-text-right" style={{width: '13%', color: '#6c757d'}}>Gross Fare</th>
            </tr>
            <tr>
              <th className="header-senior">SNR</th>
              <th className="header-pwd">PWD</th>
              <th className="header-student">STD</th>
            </tr>
        </thead>
          <tbody>
            {loading ? (
              <tr className="discount-empty-row"><td colSpan="10">Loading discount data...</td></tr>
            ) : filteredTrips.length === 0 ? (
              <tr className="discount-empty-row"><td colSpan="10">No trips with discounts found.</td></tr>
            ) : (
              filteredTrips.map((trip) => {
                const grossFare = trip.totalRevenue + trip.totalDiscount;
                
                return (
                  <tr key={trip.id}>
                    <td className="discount-text-id">
                      {trip.tripId}
                      <span className="discount-text-bus">Bus: {trip.busNumber}</span>
                    </td>
                    <td className="discount-text-date">
                      {new Date(trip.date).toLocaleDateString()} <br/>
                      <span style={{fontSize: '10px', color: '#999'}}>{trip.time}</span>
                    </td>
                    <td>
                      <div className="discount-text-route">{trip.route}</div>
                      <div className="discount-text-direction">{trip.direction}</div>
                    </td>
                    <td className="discount-text-center">
                      <span className="discount-pax-badge">{trip.totalDiscountedPax}</span>
                    </td>
                    
                    <td className={trip.breakdown.senior > 0 ? 'discount-text-bold' : 'discount-text-muted'}>{formatCurrency(trip.breakdown.senior)}</td>
                    <td className={trip.breakdown.pwd > 0 ? 'discount-text-bold' : 'discount-text-muted'}>{formatCurrency(trip.breakdown.pwd)}</td>
                    <td className={trip.breakdown.student > 0 ? 'discount-text-bold' : 'discount-text-muted'}>{formatCurrency(trip.breakdown.student)}</td>
                    
                    <td className="discount-text-right discount-text-bold" style={{color: '#dc3545'}}>
                        {formatCurrency(trip.totalDiscount)}
                    </td>
                    <td className="discount-text-right discount-text-bold" style={{color: '#198754', backgroundColor: '#f9fffb'}}>
                        {formatCurrency(trip.totalRevenue)}
                    </td>
                       <td className="discount-text-right" style={{color: '#6c757d'}}>
                        {formatCurrency(grossFare)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* TABLE 2: DETAILED BREAKDOWN BY TICKET */}
      <h3 className="discount-section-title" style={{marginTop: '40px'}}>Detailed Breakdown by Ticket</h3>
      <div className="discount-table-container">
        <table className="discount-data-table">
          <thead>
            <tr>
              <th style={{width: '12%'}}>Date Issued</th>
              <th style={{width: '12%'}}>Ticket Type</th>
              <th style={{width: '25%'}}>Route</th>
              <th style={{width: '15%'}}>Discount Type</th>
              <th className="discount-text-right" style={{width: '12%', color: '#dc3545'}}>Discount</th>
              <th className="discount-text-right" style={{width: '12%', color: '#198754'}}>Paid Amount</th>
              <th className="discount-text-right" style={{width: '12%', color:'#6c757d'}}>Gross Fare</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="discount-empty-row"><td colSpan="7">Loading...</td></tr>
            ) : filteredTickets.length === 0 ? (
              <tr className="discount-empty-row"><td colSpan="7">No tickets found.</td></tr>
            ) : (
              filteredTickets.map((t) => (
                <tr key={t.uniqueKey || t.id}> 
                  <td className="discount-text-date">
                    {new Date(t.date).toLocaleDateString()} <br/>
                    <span style={{fontSize: '10px', color: '#999'}}>{t.time}</span>
                  </td>
                  <td className="discount-text-id">
                    {/* Displays: Pre-Ticket, Pre-Booking, or Conductor Ticket */}
                    <div style={{fontWeight: '700', color: '#2c3e50'}}>{t.ticketCategory}</div>
                  </td>
                  <td><div className="discount-text-route">{t.route}</div></td>
                  <td>
                    <span className="discount-type-tag">{t.typeString}</span>
                  </td>
                  <td className="discount-text-right discount-text-bold" style={{color:'#dc3545'}}>{formatCurrency(t.discount)}</td>
                  <td className="discount-text-right discount-text-bold" style={{color:'#198754'}}>{formatCurrency(t.paid)}</td>
                  <td className="discount-text-right" style={{color:'#6c757d'}}>{formatCurrency(t.gross)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
};

export default DiscountPage;