import React, { useState, useEffect } from 'react';
import { 
  getPreTicketingStats, 
  getUsersWithPreTickets,
  getPreTicketsByUser,
  getUserById,
  deletePreTicket
} from './pre-ticketing.js';
import './pre-ticketing.css';
import { FaUsers, FaCheckCircle, FaTimesCircle, FaMapMarkerAlt } from 'react-icons/fa';

const PreTicketing = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const [selectedUser, setSelectedUser] = useState(null);
  const [stats, setStats] = useState({
    totalTickets: 0,
    onlineTickets: 0,
    offlineTickets: 0,
    totalTrips: 0
  });
  const [users, setUsers] = useState([]);
  const [userTickets, setUserTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const [statsData, usersData] = await Promise.all([
          getPreTicketingStats(),
          getUsersWithPreTickets()
        ]);
        setStats(statsData);
        setUsers(usersData);
      } catch (error) {
        console.error('Error fetching initial data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  const handleUserSelect = async (userId) => {
    try {
      setTicketsLoading(true);
      const [userData, tickets] = await Promise.all([
        getUserById(userId),
        getPreTicketsByUser(userId)
      ]);
      setSelectedUser(userData);
      setUserTickets(tickets);
    } catch (error) {
      console.error('Error fetching user tickets:', error);
    } finally {
      setTicketsLoading(false);
    }
  };

  const handleDeleteTicket = async (userId, ticketId) => {
    if (!window.confirm('Are you sure you want to delete this pre-ticket? This action cannot be undone.')) {
      return;
    }

    try {
      await deletePreTicket(userId, ticketId);
      // Refresh the tickets list
      const updatedTickets = userTickets.filter(ticket => ticket.id !== ticketId);
      setUserTickets(updatedTickets);
      
      // Update stats
      const statsData = await getPreTicketingStats();
      setStats(statsData);
      
      alert('Pre-ticket deleted successfully');
    } catch (error) {
      console.error('Error deleting ticket:', error);
      alert('Failed to delete pre-ticket. Please try again.');
    }
  };

  const handleBackToUsers = () => {
    setSelectedUser(null);
    setUserTickets([]);
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
      <span className={`preticket-status-badge preticket-status-${status}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const renderUsersList = () => (
    <div className="preticket-users-section">
      <div className="preticket-section-header">
        <h3>Users with Pre-tickets</h3>
        <p className="preticket-section-subtitle">Click on a user to view their pre-tickets</p>
      </div>

      {loading ? (
        <div className="preticket-loading-state">Loading users...</div>
      ) : (
        <div className="preticket-users-grid">
          {users.length === 0 ? (
            <div className="preticket-empty-state">
              <p>No users with pre-tickets found</p>
            </div>
          ) : (
            users.map((user) => (
              <div 
                key={user.id} 
                className="preticket-user-card"
                onClick={() => handleUserSelect(user.id)}
              >
                <div className="preticket-user-avatar">
                  {user.profileImageUrl ? (
                    <img 
                      src={user.profileImageUrl} 
                      alt={user.name}
                      className="preticket-avatar-image"
                    />
                  ) : (
                    <div className="preticket-avatar-placeholder">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="preticket-user-info">
                  <h4>{user.name}</h4>
                  <p className="preticket-user-email">{user.email}</p>
                  <p className="preticket-user-phone">{user.phone}</p>
                  <div className="preticket-user-stats">
                    <span className="preticket-ticket-count">{user.preTicketsCount} pre-ticket{user.preTicketsCount > 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="preticket-user-action">
                  <svg className="preticket-action-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor">
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

  const renderUserTickets = () => (
    <div className="preticket-user-tickets-section">
      <div className="preticket-section-header">
        <button 
          onClick={handleBackToUsers}
          className="preticket-back-button"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Users
        </button>
        
        {selectedUser && (
          <div className="preticket-selected-user-info">
            <div className="preticket-user-header">
              <div className="preticket-user-avatar-small">
                {selectedUser.profileImageUrl ? (
                  <img 
                    src={selectedUser.profileImageUrl} 
                    alt={selectedUser.name}
                    className="preticket-avatar-image"
                  />
                ) : (
                  <div className="preticket-avatar-placeholder">
                    {selectedUser.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <h3>{selectedUser.name}'s Pre-tickets</h3>
                <p className="preticket-user-details">{selectedUser.email} • {selectedUser.phone}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {ticketsLoading ? (
        <div className="preticket-loading-state">Loading tickets...</div>
      ) : (
        <div className="preticket-tickets-list">
          {userTickets.length === 0 ? (
            <div className="preticket-empty-state">
              <p>No pre-tickets found for this user</p>
            </div>
          ) : (
            userTickets.map((ticket) => (
              <div key={ticket.id} className="preticket-ticket-card">
                <div className="preticket-ticket-header">
                  <div className="preticket-ticket-info">
                    <div className="preticket-route-info">
                      <h4>{ticket.from} → {ticket.to}</h4>
                      {getStatusBadge(ticket.status)}
                    </div>
                    <p className="preticket-ticket-meta">Distance: {ticket.km} km</p>
                    <p className="preticket-ticket-meta">
                      Created: {formatDate(ticket.createdAt)}
                      {ticket.boardedAt && ` • Boarded: ${formatDate(ticket.boardedAt)}`}
                    </p>
                    {ticket.scannedBy && (
                      <p className="preticket-ticket-meta">Scanned by: {ticket.scannedBy}</p>
                    )}
                  </div>
                  <div className="preticket-ticket-summary">
                    <p className="preticket-fare-amount">₱{ticket.totalFare}</p>
                    <p className="preticket-passenger-count">{ticket.quantity} passenger{ticket.quantity > 1 ? 's' : ''}</p>
                  </div>
                </div>

                <div className="preticket-fare-breakdown">
                  <h5>Fare Breakdown:</h5>
                  <div className="preticket-breakdown-list">
                    {ticket.discountBreakdown.map((breakdown, index) => (
                      <p key={index}>{breakdown}</p>
                    ))}
                  </div>
                </div>

                <div className="preticket-ticket-actions">
                  <button className="preticket-btn preticket-btn-secondary">View Details</button>
                  <button 
                    className="preticket-btn preticket-btn-danger"
                    onClick={() => handleDeleteTicket(selectedUser.id, ticket.id)}
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
    if (selectedUser) {
      return renderUserTickets();
    }
    return renderUsersList();
  };

  return (
    <div className="preticket-container">
      {/* Header */}
    <div className="pre-ticket-header-container">
      {/* Background Pattern */}
      <div className="pre-ticket-header-pattern"></div>
      
      <div className="preticket-header-content">
        {/* Page Header */}
        <div className="preticket-page-header">
          <h1>Pre-ticketing Management</h1>
        </div>

        {/* Stats Cards */}
        <div className="pre-ticket-stats-container">
          {/* Total Tickets */}
          <div className="preticket-stat-card preticket-total">
            <div className="preticket-stat-icon">
              <FaUsers className="preticket-stat-icon-fa" />
            </div>
            <div className="preticket-stat-content">
              <div className="preticket-stat-number">{stats.totalTickets}</div>
              <div className="preticket-stat-label">Total Pre-Tickets</div>
            </div>
            
          </div>

          {/* Online Tickets */}
          <div className="preticket-stat-card preticket-online">
            <div className="preticket-stat-icon">
              <FaCheckCircle className="preticket-stat-icon-fa" />
            </div>
            <div className="preticket-stat-content">
              <div className="preticket-stat-number">{stats.onlineTickets}</div>
              <div className="preticket-stat-label">Users with Pre-tickets</div>
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* Content Area */}
      <div className="preticket-content-card">
        {/* Navigation Tabs */}
        <div className="preticket-nav-tabs">
          {[
            { id: 'overview', name: 'Users & Tickets', icon: '👥' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveSection(tab.id);
                if (tab.id !== 'overview') {
                  setSelectedUser(null);
                  setUserTickets([]);
                }
              }}
              className={`preticket-nav-tab ${activeSection === tab.id ? 'active' : ''}`}
            >
              <span className="preticket-tab-icon">{tab.icon}</span>
              <span className="preticket-tab-name">{tab.name}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="preticket-tab-content">
          {renderOverview()}
        </div>
      </div>
    </div>
  );
};

export default PreTicketing;