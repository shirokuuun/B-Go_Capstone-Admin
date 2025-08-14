import React, { useState, useEffect } from 'react';
import { 
  getPreTicketingStats, 
  getConductorsWithPreTickets,
  getPreTicketsByConductor,
  getConductorById,
  deletePreTicket
} from './pre-booking.js';
import './pre-booking.css';
import { FaUsers, FaCheckCircle, FaTimesCircle, FaMapMarkerAlt } from 'react-icons/fa';

const PreBooking = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const [selectedConductor, setSelectedConductor] = useState(null);
  const [stats, setStats] = useState({
    totalTickets: 0,
    onlineTickets: 0,
    offlineTickets: 0,
    totalTrips: 0
  });
  const [conductors, setConductors] = useState([]);
  const [conductorTickets, setConductorTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const [statsData, conductorsData] = await Promise.all([
          getPreTicketingStats(),
          getConductorsWithPreTickets()
        ]);
        setStats(statsData);
        setConductors(conductorsData);
      } catch (error) {
        console.error('Error fetching initial data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  const handleConductorSelect = async (conductorId) => {
    try {
      setTicketsLoading(true);
      const [conductorData, tickets] = await Promise.all([
        getConductorById(conductorId),
        getPreTicketsByConductor(conductorId)
      ]);
      setSelectedConductor(conductorData);
      setConductorTickets(tickets);
    } catch (error) {
      console.error('Error fetching conductor tickets:', error);
    } finally {
      setTicketsLoading(false);
    }
  };

  const handleDeleteTicket = async (conductorId, ticketId) => {
    if (!window.confirm('Are you sure you want to delete this pre-booking? This action cannot be undone.')) {
      return;
    }

    try {
      await deletePreTicket(conductorId, ticketId);
      // Refresh the tickets list
      const updatedTickets = conductorTickets.filter(ticket => ticket.id !== ticketId);
      setConductorTickets(updatedTickets);
      
      // Update stats
      const statsData = await getPreTicketingStats();
      setStats(statsData);
      
      alert('Pre-booking deleted successfully');
    } catch (error) {
      console.error('Error deleting ticket:', error);
      alert('Failed to delete pre-booking. Please try again.');
    }
  };

  const handleBackToConductors = () => {
    setSelectedConductor(null);
    setConductorTickets([]);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    return (
      <span className={`pre-booking-status-badge pre-booking-status-${status}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const handleViewQRData = (qrData) => {
    try {
      const parsedData = JSON.parse(qrData);
      alert(`QR Data:\n${JSON.stringify(parsedData, null, 2)}`);
    } catch (error) {
      alert(`QR Data: ${qrData}`);
    }
  };

  const handleViewDetails = (ticket) => {
    const details = [
      `Booking ID: ${ticket.id}`,
      `Original Collection: ${ticket.originalCollection}`,
      `Original Document ID: ${ticket.originalDocumentId}`,
      `User ID: ${ticket.userId}`,
      `Route: ${ticket.route}`,
      `Direction: ${ticket.direction}`,
      `From: ${ticket.from} (${ticket.fromLatitude}, ${ticket.fromLongitude})`,
      `To: ${ticket.to} (${ticket.toLatitude}, ${ticket.toLongitude})`,
      `Distance: ${ticket.fromKm} km → ${ticket.toKm} km`,
      `Passenger Location: ${ticket.passengerLatitude}, ${ticket.passengerLongitude}`,
      `Quantity: ${ticket.quantity}`,
      `Amount: ₱${ticket.amount}`,
      `Status: ${ticket.status}`,
      `Boarding Status: ${ticket.boardingStatus}`,
      `Timestamp: ${new Date(ticket.timestamp).toLocaleString()}`,
      ticket.scannedAt ? `Scanned At: ${formatDate(ticket.scannedAt)}` : '',
      ticket.scannedBy ? `Scanned By: ${ticket.scannedBy}` : '',
      `QR Available: ${ticket.qr ? 'Yes' : 'No'}`
    ].filter(Boolean).join('\n');
    
    alert(`Pre-booking Details:\n\n${details}`);
  };

  const renderConductorsList = () => (
    <div className="pre-booking-users-section">
      <div className="pre-booking-section-header">
        <h3>Conductors with Pre-bookings</h3>
        <p className="pre-booking-section-subtitle">Click on a conductor to view their pre-bookings</p>
      </div>

      {loading ? (
        <div className="pre-booking-loading-state">Loading conductors...</div>
      ) : (
        <div className="pre-booking-users-grid">
          {conductors.length === 0 ? (
            <div className="pre-booking-empty-state">
              <p>No conductors with pre-bookings found</p>
            </div>
          ) : (
            conductors.map((conductor) => (
              <div 
                key={conductor.id} 
                className="pre-booking-user-card"
                onClick={() => handleConductorSelect(conductor.id)}
              >
                <div className="pre-booking-user-avatar">
                  {conductor.profileImageUrl ? (
                    <img 
                      src={conductor.profileImageUrl} 
                      alt={conductor.name}
                      className="pre-booking-avatar-image"
                    />
                  ) : (
                    <div className="pre-booking-avatar-placeholder">
                      {conductor.name?.charAt(0).toUpperCase() || 'C'}
                    </div>
                  )}
                </div>
                <div className="pre-booking-user-info">
                  <h4>{conductor.name}</h4>
                  <p className="pre-booking-user-email">{conductor.email}</p>
                  <p className="pre-booking-user-phone">{conductor.phone}</p>
                  <div className="pre-booking-user-stats">
                    <span className="pre-booking-ticket-count">{conductor.preTicketsCount} pre-booking{conductor.preTicketsCount > 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="pre-booking-user-action">
                  <svg className="pre-booking-action-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            ))
          )}
        </div>
      )}
       </div>
  );

  const renderConductorTickets = () => (
    <div className="pre-booking-user-tickets-section">
      <div className="pre-booking-section-header">
        <button 
          onClick={handleBackToConductors}
          className="pre-booking-back-button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Conductors
        </button>
        
        {selectedConductor && (
          <div className="pre-booking-selected-user-info">
            <div className="pre-booking-user-header">
              <div className="pre-booking-user-avatar-small">
                {selectedConductor.profileImageUrl ? (
                  <img 
                    src={selectedConductor.profileImageUrl} 
                    alt={selectedConductor.name}
                    className="pre-booking-avatar-image"
                  />
                ) : (
                  <div className="pre-booking-avatar-placeholder">
                    {selectedConductor.name?.charAt(0).toUpperCase() || 'C'}
                  </div>
                )}
              </div>
              <div>
                <h3>{selectedConductor.name}'s Pre-bookings</h3>
                <p className="pre-booking-user-details">{selectedConductor.email} • {selectedConductor.phone}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {ticketsLoading ? (
        <div className="pre-booking-loading-state">Loading bookings...</div>
      ) : (
        <div className="pre-booking-tickets-list">
          {conductorTickets.length === 0 ? (
            <div className="pre-booking-empty-state">
              <p>No pre-bookings found for this conductor</p>
            </div>
          ) : (
            conductorTickets.map((ticket) => (
              <div key={ticket.id} className="pre-booking-ticket-card">
                <div className="pre-booking-ticket-header">
                  <div className="pre-booking-ticket-info">
                    <div className="pre-booking-route-info">
                      <h4>{ticket.from} → {ticket.to}</h4>
                      {getStatusBadge(ticket.status)}
                      {ticket.boardingStatus && ticket.boardingStatus !== ticket.status && (
                        <span className={`pre-booking-status-badge pre-booking-status-${ticket.boardingStatus}`}>
                          {ticket.boardingStatus.charAt(0).toUpperCase() + ticket.boardingStatus.slice(1)}
                        </span>
                      )}
                    </div>
                    <p className="pre-booking-ticket-meta">Route: {ticket.route} • {ticket.direction}</p>
                    <p className="pre-booking-ticket-meta">Distance: {ticket.fromKm} km → {ticket.toKm} km</p>
                    <p className="pre-booking-ticket-meta">
                      Date: {ticket.date} at {ticket.time}
                      {ticket.scannedAt && ` • Scanned: ${formatDate(ticket.scannedAt)}`}
                    </p>
                    {ticket.scannedBy && (
                      <p className="pre-booking-ticket-meta">Scanned by: {ticket.scannedBy}</p>
                    )}
                    {ticket.userId && (
                      <p className="pre-booking-ticket-meta">User ID: {ticket.userId}</p>
                    )}
                    {ticket.qr && (
                      <p className="pre-booking-ticket-meta">✓ QR Code Available</p>
                    )}
                  </div>
                  <div className="pre-booking-ticket-summary">
                    <p className="pre-booking-fare-amount">₱{ticket.amount}</p>
                    <p className="pre-booking-passenger-count">{ticket.quantity} passenger{ticket.quantity > 1 ? 's' : ''}</p>
                  </div>
                </div>

                <div className="pre-booking-fare-breakdown">
                  <h5>Fare Breakdown:</h5>
                  <div className="pre-booking-breakdown-list">
                    {ticket.discountBreakdown.map((breakdown, index) => (
                      <p key={index}>{breakdown}</p>
                    ))}
                  </div>
                </div>

                <div className="pre-booking-ticket-actions">
                  <button 
                    className="pre-booking-btn pre-booking-btn-secondary"
                    onClick={() => handleViewDetails(ticket)}
                  >
                    View Details
                  </button>
                  {ticket.qr && ticket.qrData && (
                    <button 
                      className="pre-booking-btn pre-booking-btn-info"
                      onClick={() => handleViewQRData(ticket.qrData)}
                    >
                      View QR Data
                    </button>
                  )}
                  <button 
                    className="pre-booking-btn pre-booking-btn-danger"
                    onClick={() => handleDeleteTicket(selectedConductor.id, ticket.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  const renderOverview = () => {
    if (selectedConductor) {
      return renderConductorTickets();
    }
    return renderConductorsList();
  };

  return (
    <div className="pre-booking-container">
      {/* Header */}
    <div className="pre-booking-header-container">
      {/* Background Pattern */}
      <div className="pre-booking-header-pattern"></div>
      
      <div className="pre-booking-header-content">
        {/* Page Header */}
        <div className="pre-booking-page-header">
          <h1>Pre-booking Management</h1>
        </div>

        {/* Stats Cards */}
        <div className="pre-booking-stats-container">
          {/* Total Tickets */}
          <div className="pre-booking-stat-card pre-booking-total">
            <div className="pre-booking-stat-icon">
              <FaUsers className="pre-booking-stat-icon-fa" />
            </div>
            <div className="pre-booking-stat-content">
              <div className="pre-booking-stat-number">{stats.totalTickets}</div>
              <div className="pre-booking-stat-label">Total Pre-Bookings</div>
            </div>
            
          </div>

          {/* Online Tickets */}
          <div className="pre-booking-stat-card pre-booking-online">
            <div className="pre-booking-stat-icon">
              <FaCheckCircle className="pre-booking-stat-icon-fa" />
            </div>
            <div className="pre-booking-stat-content">
              <div className="pre-booking-stat-number">{stats.onlineTickets}</div>
              <div className="pre-booking-stat-label">Conductors with Pre-bookings</div>
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* Content Area */}
      <div className="pre-booking-content-card">
        {/* Navigation Tabs */}
        <div className="pre-booking-nav-tabs">
          {[
            { id: 'overview', name: 'Conductors & Bookings', icon: '👥' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveSection(tab.id);
                if (tab.id !== 'overview') {
                  setSelectedConductor(null);
                  setConductorTickets([]);
                }
              }}
              className={`pre-booking-nav-tab ${activeSection === tab.id ? 'active' : ''}`}
            >
              <span className="pre-booking-tab-icon">{tab.icon}</span>
              <span className="pre-booking-tab-name">{tab.name}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="pre-booking-tab-content">
          {renderOverview()}
        </div>
      </div>
    </div>
  );
};

export default PreBooking;