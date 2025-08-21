import React, { useState, useEffect } from 'react';
import { 
  getPreTicketingStats, 
  getConductorsWithPreTickets,
  getPreTicketsByConductor,
  getConductorById,
  deletePreTicket
} from './ticketing.js';
import './ticketing.css';
import { FaUsers, FaCheckCircle, FaTimesCircle, FaMapMarkerAlt } from 'react-icons/fa';

const Ticketing = () => {
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
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  
  // Filter states
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTicketType, setSelectedTicketType] = useState('');
  const [selectedTripDirection, setSelectedTripDirection] = useState('');

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

  // Filter tickets whenever conductorTickets or filter values change
  useEffect(() => {
    let filtered = [...conductorTickets];

    // Filter by date
    if (selectedDate) {
      filtered = filtered.filter(ticket => ticket.date === selectedDate);
    }

    // Filter by ticket type
    if (selectedTicketType) {
      if (selectedTicketType === 'conductor') {
        filtered = filtered.filter(ticket => !ticket.ticketType || ticket.ticketType === '');
      } else {
        filtered = filtered.filter(ticket => ticket.ticketType === selectedTicketType);
      }
    }

    // Filter by trip direction
    if (selectedTripDirection) {
      filtered = filtered.filter(ticket => ticket.direction === selectedTripDirection);
    }

    setFilteredTickets(filtered);
  }, [conductorTickets, selectedDate, selectedTicketType, selectedTripDirection]);

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
    if (!window.confirm('Are you sure you want to delete this pre-ticket? This action cannot be undone.')) {
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
      
      alert('Ticket deleted successfully');
    } catch (error) {
      console.error('Error in handleDeleteTicket:', error);
      alert('Failed to delete pre-ticket. Please try again.');
    }
  };

  const handleBackToConductors = () => {
    // Force state updates
    setSelectedConductor(null);
    setConductorTickets([]);
    setFilteredTickets([]);
    
    // Clear filters
    setSelectedDate('');
    setSelectedTicketType('');
    setSelectedTripDirection('');
    
    // Force component re-render by updating loading state briefly
    setTicketsLoading(false);
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
      <span className={`ticketing-status-badge ticketing-status-${status}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getTicketTypeLabel = (ticketType) => {
    if (ticketType === 'preBooking') {
      return 'Pre-Booking';
    } else if (ticketType === 'preTicket') {
      return 'Pre-Ticketing';
    } else {
      return 'Conductor Ticket';
    }
  };

  // Get unique filter options from current tickets
  const getUniqueOptions = (tickets, field) => {
    const uniqueValues = [...new Set(tickets.map(ticket => ticket[field]).filter(Boolean))];
    return uniqueValues.sort();
  };

  const getAvailableDates = () => getUniqueOptions(conductorTickets, 'date');
  
  const getTicketTypes = () => {
    const types = [...new Set(conductorTickets.map(ticket => ticket.ticketType || 'conductor'))];
    return types.sort();
  };
  
  const getTripDirections = () => getUniqueOptions(conductorTickets, 'direction');

  const renderConductorsList = () => (
    <div className="ticketing-users-section">
      <div className="ticketing-section-header">
        <h3>Conductors with Tickets</h3>
      </div>

      {loading ? (
        <div className="ticketing-loading-state">Loading conductors...</div>
      ) : (
        <div className="ticketing-users-grid">
          {conductors.length === 0 ? (
            <div className="ticketing-empty-state">
              <p>No conductors with Tickets found</p>
            </div>
          ) : (
            conductors.map((conductor) => (
              <div 
                key={conductor.id} 
                className="ticketing-user-card"
                onClick={() => handleConductorSelect(conductor.id)}
              >
                <div className="ticketing-user-avatar">
                  {conductor.profileImageUrl ? (
                    <img 
                      src={conductor.profileImageUrl} 
                      alt={conductor.name}
                      className="ticketing-avatar-image"
                    />
                  ) : (
                    <div className="ticketing-avatar-placeholder">
                      {conductor.name?.charAt(0).toUpperCase() || 'C'}
                    </div>
                  )}
                </div>
                <div className="ticketing-user-info">
                  <h4>{conductor.name}</h4>
                  <p className="ticketing-user-email">{conductor.email}</p>
                  <p className="ticketing-user-phone">{conductor.phone}</p>
                  <div className="ticketing-user-stats">
                    <span className="ticketing-ticket-count">{conductor.preTicketsCount} Ticket{conductor.preTicketsCount > 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="ticketing-user-action">
                  <svg className="ticketing-action-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor">
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
    <div className="ticketing-user-tickets-section">
      <div className="ticketing-section-header">
        <button 
          onClick={handleBackToConductors}
          className="ticketing-back-button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Conductors
        </button>
        
        {selectedConductor && (
          <div className="ticketing-selected-user-info">
            <div className="ticketing-user-header">
              <div className="ticketing-user-avatar-small">
                {selectedConductor.profileImageUrl ? (
                  <img 
                    src={selectedConductor.profileImageUrl} 
                    alt={selectedConductor.name}
                    className="ticketing-avatar-image"
                  />
                ) : (
                  <div className="ticketing-avatar-placeholder">
                    {selectedConductor.name?.charAt(0).toUpperCase() || 'C'}
                  </div>
                )}
              </div>
              <div>
                <h3>{selectedConductor.name}'s Tickets</h3>
                <p className="ticketing-user-details">{selectedConductor.email} • {selectedConductor.phone}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filters Section */}
      <div className="revenue-filters">
        {/* Date Filter */}
        <div className="revenue-filter-group">
          <label className="revenue-filter-label">Available Dates</label>
          <select 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)}
            className="revenue-filter-select"
          >
            <option value="">All Dates</option>
            {getAvailableDates().map(date => (
              <option key={date} value={date}>{date}</option>
            ))}
          </select>
        </div>

        {/* Ticket Type Filter */}
        <div className="revenue-filter-group">
          <label className="revenue-filter-label">Ticket Type</label>
          <select 
            value={selectedTicketType} 
            onChange={(e) => setSelectedTicketType(e.target.value)}
            className="revenue-filter-select"
          >
            <option value="">All Types</option>
            {getTicketTypes().map(type => (
              <option key={type} value={type}>
                {getTicketTypeLabel(type)}
              </option>
            ))}
          </select>
        </div>

        {/* Trip Direction Filter */}
        <div className="revenue-filter-group">
          <label className="revenue-filter-label">Trip Direction</label>
          <select 
            value={selectedTripDirection} 
            onChange={(e) => setSelectedTripDirection(e.target.value)}
            className="revenue-filter-select"
          >
            <option value="">All Directions</option>
            {getTripDirections().map(direction => (
              <option key={direction} value={direction}>{direction}</option>
            ))}
          </select>
        </div>

        {/* Clear Filters Button */}
        <div className="revenue-filter-group">
          <label className="revenue-filter-label">&nbsp;</label>
          <button 
            onClick={() => {
              setSelectedDate('');
              setSelectedTicketType('');
              setSelectedTripDirection('');
            }}
            className="ticketing-btn ticketing-btn-secondary"
            style={{ height: '42px' }}
          >
            Clear Filters
          </button>
        </div>
        
        {/* Results Count */}
        <div className="revenue-filter-group">
          <label className="revenue-filter-label">&nbsp;</label>
          <div className="ticketing-results-count" style={{ 
            background: '#f8f9fa', 
            padding: '10px 12px', 
            borderRadius: '8px', 
            border: '2px solid #e1e8ed',
            fontSize: '14px',
            color: '#2c3e50',
            fontWeight: '600'
          }}>
            {filteredTickets.length} of {conductorTickets.length} tickets
          </div>
        </div>
      </div>

      {ticketsLoading ? (
        <div className="ticketing-loading-state">Loading tickets...</div>
      ) : (
        <div className="ticketing-tickets-list">
          {filteredTickets.length === 0 ? (
            <div className="ticketing-empty-state">
              <p>{conductorTickets.length === 0 ? 'No Tickets found for this conductor' : 'No tickets match the selected filters'}</p>
            </div>
          ) : (
            filteredTickets.map((ticket) => (
              <div key={`${ticket.conductorId}-${ticket.date}-${ticket.tripId}-${ticket.id}`} className="ticketing-ticket-card">
                <div className="ticketing-ticket-header">
                  <div className="ticketing-ticket-info">
                    <div className="ticketing-route-info">
                      <h4>{ticket.from} → {ticket.to}</h4>
                      {getStatusBadge(ticket.status)}
                    </div>
                    <p className="ticketing-ticket-meta">
                      <strong>Type:</strong> <span className={`ticketing-ticket-type ticketing-type-${ticket.ticketType || 'conductor'}`}>
                        {getTicketTypeLabel(ticket.ticketType)}
                      </span>
                    </p>
                    <p className="ticketing-ticket-meta">Direction: {ticket.direction}</p>
                    <p className="ticketing-ticket-meta">Distance: {ticket.fromKm} km → {ticket.toKm} km</p>
                    <p className="ticketing-ticket-meta">
                      Date: {ticket.date} at {ticket.time}
                      {(ticket.ticketType === 'preTicket' || ticket.ticketType === 'preBooking') && ticket.scannedAt && 
                        ` • Scanned: ${formatDate(ticket.scannedAt)}`
                      }
                    </p>
                    {(ticket.ticketType === 'preTicket' || ticket.ticketType === 'preBooking') && ticket.scannedBy && (
                      <p className="ticketing-ticket-meta">Scanned by: {ticket.scannedBy}</p>
                    )}
                  </div>
                  <div className="ticketing-ticket-summary">
                    <p className="ticketing-fare-amount">₱{ticket.amount}</p>
                    <p className="ticketing-passenger-count">{ticket.quantity} passenger{ticket.quantity > 1 ? 's' : ''}</p>
                  </div>
                </div>

                <div className="ticketing-fare-breakdown">
                  <h5>Fare Breakdown:</h5>
                  <div className="ticketing-breakdown-list">
                    {ticket.discountBreakdown.map((breakdown, index) => (
                      <p key={index}>{breakdown}</p>
                    ))}
                  </div>
                </div>

                <div className="ticketing-ticket-actions">
                  <button 
                    className="ticketing-btn ticketing-btn-danger"
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
    <div className="ticketing-container">
      {/* Header */}
    <div className="ticketing-header-container">
      {/* Background Pattern */}
      <div className="ticketing-header-pattern"></div>
      
      <div className="ticketing-header-content">
        {/* Page Header */}
        <div className="ticketing-page-header">
          <h1>Ticketing Management</h1>
        </div>

        {/* Stats Cards */}
        <div className="ticketing-stats-container">
          {/* Total Conductor Tickets */}
          <div className="ticketing-stat-card ticketing-total">
            <div className="ticketing-stat-icon">
              <FaUsers className="ticketing-stat-icon-fa" />
            </div>
            <div className="ticketing-stat-content">
              <div className="ticketing-stat-number">{stats.conductorTickets || 0}</div>
              <div className="ticketing-stat-label">Total Conductor Tickets</div>
            </div>
          </div>

          {/* Total Pre-Tickets*/}
          <div className="ticketing-stat-card ticketing-online">
            <div className="ticketing-stat-icon">
              <FaCheckCircle className="ticketing-stat-icon-fa" />
            </div>
            <div className="ticketing-stat-content">
              <div className="ticketing-stat-number">{stats.preTickets || 0}</div>
              <div className="ticketing-stat-label">Total Pre-tickets</div>
            </div>
          </div>

          {/* Total Pre-bookings */}
          <div className="ticketing-stat-card ticketing-online">
            <div className="ticketing-stat-icon">
              <FaCheckCircle className="ticketing-stat-icon-fa" />
            </div>
            <div className="ticketing-stat-content">
              <div className="ticketing-stat-number">{stats.preBookings || 0}</div>
              <div className="ticketing-stat-label">Total Pre-bookings</div>
            </div>
          </div>

          {/*Total Tickets*/}
          <div className="ticketing-stat-card ticketing-online">
            <div className="ticketing-stat-icon">
              <FaCheckCircle className="ticketing-stat-icon-fa" />
            </div>
            <div className="ticketing-stat-content">
              <div className="ticketing-stat-number">{stats.totalTickets || 0}</div>
              <div className="ticketing-stat-label">Total Tickets</div>
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* Content Area */}
      <div className="ticketing-content-card">
        {/* Navigation Tabs */}
        <div className="ticketing-nav-tabs">
          {[
            { id: 'overview', name: 'Conductors & Tickets', icon: '👥' }
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
              className={`ticketing-nav-tab ${activeSection === tab.id ? 'active' : ''}`}
            >
              <span className="ticketing-tab-icon">{tab.icon}</span>
              <span className="ticketing-tab-name">{tab.name}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="ticketing-tab-content">
          {renderOverview()}
        </div>
      </div>
    </div>
  );
};

export default Ticketing;