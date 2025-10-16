import React, { useState, useEffect } from 'react';
import { 
  getPreTicketingStats, 
  getConductorsWithPreTickets,
  getPreTicketsByConductor,
  getConductorById,
  deleteTicket,
  subscribeToConductorsWithTickets,
  subscribeToTicketsByConductor,
  invalidateAllTicketCache
} from './ticketing.js';
import { IoMdPeople } from "react-icons/io";
import './ticketing.css';
import { FaUsers, FaCheckCircle, FaTimesCircle, FaMapMarkerAlt } from 'react-icons/fa';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '/src/firebase/firebase.js';
import { fetchCurrentUserData } from '/src/pages/settings/settings.js';

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
  
  // User authentication state
  const [userData, setUserData] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Bulk selection states
  const [selectedTickets, setSelectedTickets] = useState(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [deletingStatus, setDeletingStatus] = useState(null);

  // State for managing ticket subscriptions
  const [ticketUnsubscribe, setTicketUnsubscribe] = useState(null);

  // Set up authentication listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const adminData = await fetchCurrentUserData();
          setUserData(adminData);
        } catch (err) {
          console.error('Error fetching user data:', err);
        }
      } else {
        setUserData(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Set up real-time listeners for conductors and stats
  useEffect(() => {
    let unsubscribeConductors = null;
    
    const setupRealTimeData = async () => {
      try {
        setLoading(true);

        // Get initial stats
        const statsData = await getPreTicketingStats();
        setStats(statsData);
        
        // Set up real-time conductor listener
        unsubscribeConductors = subscribeToConductorsWithTickets((updatedConductors, error) => {
          if (error) {
            console.error('Real-time conductors error:', error);
            setLoading(false);
            return;
          }
          
          if (updatedConductors) {
            setConductors(updatedConductors);
            console.log(`📊 Real-time update: ${updatedConductors.length} conductors loaded`);
          }
          setLoading(false);
        });
        
      } catch (error) {
        console.error('Error setting up real-time data:', error);
        setLoading(false);
      }
    };

    setupRealTimeData();
    
    return () => {
      if (unsubscribeConductors) {
        console.log('🔇 Unsubscribing from conductors real-time listener');
        unsubscribeConductors();
      }
    };
  }, []);

  // Cleanup ticket subscription when component unmounts
  useEffect(() => {
    return () => {
      if (ticketUnsubscribe) {
        console.log('🔇 Cleaning up ticket subscription on unmount');
        ticketUnsubscribe();
      }
    };
  }, [ticketUnsubscribe]);

  // Filter tickets whenever conductorTickets or filter values change
  useEffect(() => {
    let filtered = [...conductorTickets];

    if (selectedDate) {
      filtered = filtered.filter(ticket => ticket.date === selectedDate);
    }

    if (selectedTicketType) {
      if (selectedTicketType === 'conductor') {
        filtered = filtered.filter(ticket => {
          const effectiveType = getEffectiveTicketType(ticket);
          return effectiveType === 'conductor';
        });
      } else {
        filtered = filtered.filter(ticket => {
          const effectiveType = getEffectiveTicketType(ticket);
          return effectiveType === selectedTicketType;
        });
      }
    }

    if (selectedTripDirection) {
      filtered = filtered.filter(ticket => ticket.direction === selectedTripDirection);
    }

    setFilteredTickets(filtered);
  }, [conductorTickets, selectedDate, selectedTicketType, selectedTripDirection]);

  const handleConductorSelect = async (conductorId) => {
    try {
      setTicketsLoading(true);
      
      if (ticketUnsubscribe) {
        console.log('🔇 Unsubscribing from previous ticket listener');
        ticketUnsubscribe();
        setTicketUnsubscribe(null);
      }
      
      const conductorData = await getConductorById(conductorId);
      setSelectedConductor(conductorData);
      
      const unsubscribe = subscribeToTicketsByConductor(conductorId, (updatedTickets, error) => {
        if (error) {
          console.error(`Real-time tickets error for conductor ${conductorId}:`, error);
          setTicketsLoading(false);
          return;
        }
        
        if (updatedTickets) {
          setConductorTickets(updatedTickets);
          console.log(`🎫 Real-time update: ${updatedTickets.length} tickets for conductor ${conductorId}`);
        }
        setTicketsLoading(false);
      });
      
      setTicketUnsubscribe(() => unsubscribe);
      
    } catch (error) {
      console.error('Error setting up conductor tickets:', error);
      setTicketsLoading(false);
    }
  };

  const handleDeleteTicket = async (conductorId, ticketId) => {
    if (!userData || userData.role !== 'superadmin' || userData.isSuperAdmin !== true) {
      alert('Access denied: Only superadmin users can delete tickets.');
      return;
    }

    const confirmed = window.confirm('Delete this ticket?\n\nThis action cannot be undone.');
    if (!confirmed) return;

    try {
      setDeletingStatus('Deleting ticket...');
      await deleteTicket(conductorId, ticketId);

      // IMMEDIATE UPDATE: Remove ticket from local state instantly
      const updatedTickets = conductorTickets.filter(ticket => ticket.id !== ticketId);
      setConductorTickets(updatedTickets);

      // Invalidate all cache to force fresh data
      invalidateAllTicketCache();

      setDeletingStatus('✓ Ticket deleted');
      setTimeout(() => setDeletingStatus(null), 1500);

      // Update stats and conductors list in background to refresh counts
      Promise.all([
        getPreTicketingStats(),
        getConductorsWithPreTickets()
      ]).then(([statsData, conductorsData]) => {
        setStats(statsData);
        setConductors(conductorsData);
      });

    } catch (error) {
      console.error('Error in handleDeleteTicket:', error);
      setDeletingStatus(null);
      alert('Failed to delete ticket: ' + error.message);
    }
  };

  // Bulk selection handlers
  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    setSelectedTickets(new Set());
  };

  const toggleTicketSelection = (ticketId) => {
    const newSelection = new Set(selectedTickets);
    if (newSelection.has(ticketId)) {
      newSelection.delete(ticketId);
    } else {
      newSelection.add(ticketId);
    }
    setSelectedTickets(newSelection);
  };

  const selectAllTickets = () => {
    const allTicketIds = new Set(filteredTickets.map(ticket => ticket.id));
    setSelectedTickets(allTicketIds);
  };

  const deselectAllTickets = () => {
    setSelectedTickets(new Set());
  };

  const handleBulkDelete = async () => {
    if (!userData || userData.role !== 'superadmin' || userData.isSuperAdmin !== true) {
      alert('Access denied: Only superadmin users can delete tickets.');
      return;
    }

    if (selectedTickets.size === 0) {
      alert('Please select tickets to delete.');
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedTickets.size} selected ticket${selectedTickets.size > 1 ? 's' : ''}?\n\nThis action cannot be undone.`);
    if (!confirmed) return;

    try {
      setTicketsLoading(true);
      setDeletingStatus(`Deleting ${selectedTickets.size} ticket${selectedTickets.size > 1 ? 's' : ''}...`);

      const ticketIds = Array.from(selectedTickets);
      const batchSize = 10;
      const batches = [];
      
      for (let i = 0; i < ticketIds.length; i += batchSize) {
        batches.push(ticketIds.slice(i, i + batchSize));
      }

      let deletedCount = 0;
      const successfulDeletes = [];
      
      for (const batch of batches) {
        const results = await Promise.allSettled(
          batch.map(async ticketId => {
            await deleteTicket(selectedConductor.id, ticketId);
            return ticketId;
          })
        );
        
        // Track successful deletes
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            successfulDeletes.push(result.value);
            deletedCount++;
          }
        });
        
        setDeletingStatus(`Deleting tickets... ${deletedCount}/${ticketIds.length}`);
      }

      // IMMEDIATE UPDATE: Remove deleted tickets from local state instantly
      const updatedTickets = conductorTickets.filter(ticket => !successfulDeletes.includes(ticket.id));
      setConductorTickets(updatedTickets);

      // Invalidate all cache to force fresh data
      invalidateAllTicketCache();

      setSelectedTickets(new Set());
      setIsSelectMode(false);
      setDeletingStatus(`✓ Successfully deleted ${deletedCount} ticket${deletedCount > 1 ? 's' : ''}`);
      setTimeout(() => setDeletingStatus(null), 2000);

      // Update stats and conductors list in background to refresh counts
      Promise.all([
        getPreTicketingStats(),
        getConductorsWithPreTickets()
      ]).then(([statsData, conductorsData]) => {
        setStats(statsData);
        setConductors(conductorsData);
      });

    } catch (error) {
      console.error('Error in bulk delete:', error);
      setDeletingStatus(null);
      alert('Failed to delete tickets: ' + error.message);
    } finally {
      setTicketsLoading(false);
    }
  };

  const handleBackToConductors = async () => {
    // Cleanup ticket subscription
    if (ticketUnsubscribe) {
      console.log('🔇 Unsubscribing from ticket listener on back');
      ticketUnsubscribe();
      setTicketUnsubscribe(null);
    }

    // Clear selected conductor state
    setSelectedConductor(null);
    setConductorTickets([]);
    setFilteredTickets([]);
    setSelectedDate('');
    setSelectedTicketType('');
    setSelectedTripDirection('');
    setSelectedTickets(new Set());
    setIsSelectMode(false);
    setTicketsLoading(false);

    // Force refresh conductors list to show updated counts
    setLoading(true);
    try {
      const [statsData, conductorsData] = await Promise.all([
        getPreTicketingStats(),
        getConductorsWithPreTickets()
      ]);
      setStats(statsData);
      setConductors(conductorsData);
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTime = (timeString) => {
    try {
      let date;
      if (timeString.includes('AM') || timeString.includes('PM')) {
        const cleanTime = timeString.replace(/:\d{2}(AM|PM)/, '$1');
        date = new Date(`1/1/2000 ${cleanTime}`);
      } else {
        date = new Date(`1/1/2000 ${timeString}`);
      }
      return date.toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      console.warn('Error formatting time:', timeString, error);
      return timeString;
    }
  };

  const formatScannedAt = (scannedAt) => {
    if (!scannedAt) return 'Not scanned';
    try {
      const timestamp = scannedAt.seconds ? new Date(scannedAt.seconds * 1000) : new Date(scannedAt);
      return timestamp.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (error) {
      console.error('Error formatting scannedAt:', error, scannedAt);
      return 'Invalid date';
    }
  };

  const getTicketTypeLabel = (ticket) => {
    const effectiveType = ticket.documentType || ticket.ticketType;
    if (effectiveType === 'preBooking') {
      return 'Pre-Booking';
    } else if (effectiveType === 'preTicket') {
      return 'Pre-Ticketing';
    } else {
      return 'Conductor Ticket';
    }
  };

  const getEffectiveTicketType = (ticket) => {
    // Check source field first (most reliable)
    if (ticket.source === 'preBookings') return 'preBooking';
    if (ticket.source === 'preTickets') return 'preTicket';
    if (ticket.source === 'regular') return 'conductor';

    // Fallback to documentType or ticketType
    const type = ticket.documentType || ticket.ticketType;
    if (type === 'preBooking') return 'preBooking';
    if (type === 'preTicket') return 'preTicket';

    // Default to conductor for any other case
    return 'conductor';
  };

  const getUniqueOptions = (tickets, field) => {
    const uniqueValues = [...new Set(tickets.map(ticket => ticket[field]).filter(Boolean))];
    return uniqueValues.sort();
  };

  const getAvailableDates = () => getUniqueOptions(conductorTickets, 'date');
  
  const getTicketTypes = () => {
    const types = [...new Set(conductorTickets.map(ticket => {
      const effectiveType = getEffectiveTicketType(ticket);
      if (effectiveType === 'preBooking') return 'preBooking';
      if (effectiveType === 'preTicket') return 'preTicket';
      return 'conductor';
    }))];
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
                {type === 'preBooking' ? 'Pre-Booking' :
                 type === 'preTicket' ? 'Pre-Ticket' :
                 'Conductor Ticket'}
              </option>
            ))}
          </select>
        </div>

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

        {userData && userData.role === 'superadmin' && userData.isSuperAdmin === true && filteredTickets.length > 0 && (
          <div className="revenue-filter-group">
            <label className="revenue-filter-label">&nbsp;</label>
            <button
              onClick={toggleSelectMode}
              className={`ticketing-btn ${isSelectMode ? 'ticketing-btn-secondary' : 'ticketing-btn-primary'}`}
              style={{ height: '42px' }}
            >
              {isSelectMode ? 'Cancel Select' : 'Select Tickets'}
            </button>
          </div>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {isSelectMode && (
        <div className="ticketing-bulk-actions-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: '600', color: '#2c3e50' }}>
              {selectedTickets.size} of {filteredTickets.length} selected
            </span>
            <button
              onClick={selectAllTickets}
              className="ticketing-btn ticketing-btn-secondary"
              style={{ padding: '6px 12px', fontSize: '14px' }}
            >
              Select All
            </button>
            <button
              onClick={deselectAllTickets}
              className="ticketing-btn ticketing-btn-secondary"
              style={{ padding: '6px 12px', fontSize: '14px' }}
            >
              Deselect All
            </button>
          </div>
          <button
            onClick={handleBulkDelete}
            className="ticketing-btn ticketing-btn-danger"
            disabled={selectedTickets.size === 0 || ticketsLoading}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              opacity: (selectedTickets.size === 0 || ticketsLoading) ? 0.6 : 1,
              cursor: (selectedTickets.size === 0 || ticketsLoading) ? 'not-allowed' : 'pointer'
            }}
          >
            Delete Selected ({selectedTickets.size})
          </button>
        </div>
      )}

      {/* Deleting Status Message */}
      {deletingStatus && (
        <div className={`ticketing-deleting-status ${deletingStatus.includes('✓') ? 'success' : ''}`}>
          {!deletingStatus.includes('✓') && <div className="ticketing-spinner"></div>}
          <span>{deletingStatus}</span>
        </div>
      )}

      {ticketsLoading && !deletingStatus ? (
        <div className="ticketing-loading-state">Loading tickets...</div>
      ) : (
        <div className="ticketing-tickets-list">
          {filteredTickets.length === 0 ? (
            <div className="ticketing-empty-state">
              <p>{conductorTickets.length === 0 ? 'No Tickets found for this conductor' : 'No tickets match the selected filters'}</p>
            </div>
          ) : (
            filteredTickets.map((ticket) => (
              <div
                key={`${ticket.conductorId}-${ticket.date}-${ticket.tripId}-${ticket.id}`}
                className={`ticketing-ticket-card ${isSelectMode ? 'selectable' : ''} ${selectedTickets.has(ticket.id) ? 'selected' : ''}`}
                onClick={isSelectMode ? () => toggleTicketSelection(ticket.id) : undefined}
              >
                {isSelectMode && (
                  <div className="ticketing-ticket-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedTickets.has(ticket.id)}
                      onChange={() => toggleTicketSelection(ticket.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}

                <div className="ticketing-ticket-header">
                  <div className="ticketing-ticket-info">
                    <div className="ticketing-route-info">
                      <h4>{ticket.from} → {ticket.to}</h4>
                    </div>
                    <p className="ticketing-ticket-meta">
                      <strong>Type:</strong> <span className={`ticketing-ticket-type ticketing-type-${getEffectiveTicketType(ticket)}`}>
                        {getTicketTypeLabel(ticket)}
                      </span>
                    </p>
                    <p className="ticketing-ticket-meta">Direction: {ticket.direction}</p>
                    <p className="ticketing-ticket-meta">Distance: {ticket.fromKm} km → {ticket.toKm} km</p>
                    <p className="ticketing-ticket-meta">
                      Date: {ticket.date} at {formatTime(ticket.time)}
                    </p>
                    {ticket.scannedAt && getEffectiveTicketType(ticket) === 'preBooking' && (
                      <p className="ticketing-ticket-meta">
                        <strong>Scanned at:</strong> {formatScannedAt(ticket.scannedAt)}
                      </p>
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
                  {!isSelectMode && (
                    <button
                      className="ticketing-btn ticketing-btn-danger"
                      onClick={() => handleDeleteTicket(selectedConductor.id, ticket.id)}
                      disabled={!userData || (userData.role === 'admin' && userData.isSuperAdmin !== true)}
                      title={userData && userData.role === 'admin' && userData.isSuperAdmin !== true ? "Delete not allowed for admin users" : "Delete ticket"}
                      style={{
                        color: userData && userData.role === 'admin' && userData.isSuperAdmin !== true ? '#999' : '',
                        backgroundColor: userData && userData.role === 'admin' && userData.isSuperAdmin !== true ? '#f5f5f5' : '',
                        borderColor: userData && userData.role === 'admin' && userData.isSuperAdmin !== true ? '#ccc' : '',
                        cursor: userData && userData.role === 'admin' && userData.isSuperAdmin !== true ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  )}
                  {isSelectMode && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '8px 16px',
                      color: '#6c757d',
                      fontStyle: 'italic',
                      fontSize: '14px'
                    }}>
                      Click card or checkbox to select
                    </div>
                  )}
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

  if (authLoading || !userData) {
    return (
      <div className="ticketing-container">
        <div className="ticketing-loading-state">Loading...</div>
      </div>
    );
  }

  return (
    <div className="ticketing-container">
      <div className="ticketing-header-container">
        <div className="ticketing-header-pattern"></div>
        
        <div className="ticketing-header-content">
          <div className="ticketing-page-header">
            <h1>Ticketing Management</h1>
          </div>

          <div className="ticketing-stats-container">
            <div className="ticketing-stat-card ticketing-total">
              <div className="ticketing-stat-icon">
                <FaUsers className="ticketing-stat-icon-fa" />
              </div>
              <div className="ticketing-stat-content">
                <div className="ticketing-stat-number">{stats.conductorTickets || 0}</div>
                <div className="ticketing-stat-label">Total Conductor Tickets</div>
              </div>
            </div>

            <div className="ticketing-stat-card ticketing-online">
              <div className="ticketing-stat-icon">
                <FaCheckCircle className="ticketing-stat-icon-fa" />
              </div>
              <div className="ticketing-stat-content">
                <div className="ticketing-stat-number">{stats.preTickets || 0}</div>
                <div className="ticketing-stat-label">Total Pre-tickets</div>
              </div>
            </div>

            <div className="ticketing-stat-card ticketing-online">
              <div className="ticketing-stat-icon">
                <FaCheckCircle className="ticketing-stat-icon-fa" />
              </div>
              <div className="ticketing-stat-content">
                <div className="ticketing-stat-number">{stats.preBookings || 0}</div>
                <div className="ticketing-stat-label">Total Pre-bookings</div>
              </div>
            </div>

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

      <div className="ticketing-content-card">
        <div className="ticketing-nav-tabs">
          {[
            { id: 'overview', name: 'Conductors & Tickets', icon: <IoMdPeople size={30} /> }
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

        <div className="ticketing-tab-content">
          {renderOverview()}
        </div>
      </div>
    </div>
  );
};

export default Ticketing;