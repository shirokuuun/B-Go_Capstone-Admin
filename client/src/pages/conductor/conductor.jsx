import React, { useState, useEffect } from 'react';
import conductorService from '/src/pages/conductor/conductor.js';
import './conductor.css';
import { IoMdAdd } from "react-icons/io";
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '/src/firebase/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '/src/firebase/firebase';

const Conductor = () => {
  const [conductors, setConductors] = useState([]);
  const [selectedConductor, setSelectedConductor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all, online, offline
  const [sortBy, setSortBy] = useState('name'); // name, route, lastSeen, trips
  const [showTripsModal, setShowTripsModal] = useState(false);
  const [selectedConductorTrips, setSelectedConductorTrips] = useState(null);
  const [selectedDate, setSelectedDate] = useState('all');
  const [trips, setTrips] = useState([]);
  const [availableDates, setAvailableDates] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    fetchConductors();
    
    // Setup real-time listener
    const unsubscribe = conductorService.setupConductorsListener((updatedConductors) => {
      setConductors(updatedConductors);
      setLoading(false);
    });

    return () => {
      unsubscribe();
      conductorService.removeAllListeners();
    };
  }, []);

  const fetchConductors = async () => {
    try {
      setLoading(true);
      const conductorsData = await conductorService.getAllConductors();
      setConductors(conductorsData);
    } catch (error) {
      console.error('Error fetching conductors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConductorSelect = async (conductorId) => {
    try {
      setDetailsLoading(true);
      const conductorDetails = await conductorService.getConductorDetails(conductorId);
      setSelectedConductor(conductorDetails);
    } catch (error) {
      console.error('Error fetching conductor details:', error);
    } finally {
      setDetailsLoading(false);
    }
  };

 const handleViewTrips = async (conductor) => {
  try {
    setDetailsLoading(true);
    const { allTrips, availableDates } = await conductorService.getConductorTrips(conductor.id);
    setTrips(allTrips);
    setAvailableDates(availableDates);
    setSelectedDate('all');

    setSelectedConductorTrips({
      ...conductor,
      trips: allTrips,
    });

    setShowTripsModal(true);
  } catch (error) {
    console.error('Error fetching trips:', error);
  } finally {
    setDetailsLoading(false);
  }
};

  const filteredAndSortedConductors = () => {
    let filtered = conductors.filter(conductor => {
      const matchesSearch = 
        conductor.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conductor.route?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conductor.busNumber?.toString().includes(searchTerm.toLowerCase()) ||
        conductor.email?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = 
        filterStatus === 'all' ||
        (filterStatus === 'online' && conductor.isOnline) ||
        (filterStatus === 'offline' && !conductor.isOnline);

      return matchesSearch && matchesStatus;
    });

    // Sort conductors
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        case 'route':
          return (a.route || '').localeCompare(b.route || '');
        case 'lastSeen':
          if (!a.lastSeen && !b.lastSeen) return 0;
          if (!a.lastSeen) return 1;
          if (!b.lastSeen) return -1;
          return new Date(b.lastSeen.toDate()) - new Date(a.lastSeen.toDate());
        case 'trips':
          return (b.tripsCount || 0) - (a.tripsCount || 0);
        default:
          return 0;
      }
    });

    return filtered;
  };

  const onlineConductors = conductors.filter(c => c.isOnline).length;
  const offlineConductors = conductors.filter(c => !c.isOnline).length;
  const totalTrips = conductors.reduce((sum, c) => sum + (c.tripsCount || 0), 0);

  if (loading) {
    return (
      <div className="conductor-container">
        <div className="conductor-loading">
          <div className="loading-spinner"></div>
          <p>Loading conductors...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="conductor-container">
      <div className="conductor-header">
        <div className='header-add'>
          <h1>Conductor Management</h1>

          <div className="conductor-add">
            <button className="add-btn" onClick={() => setShowAddModal(true)}>
              <IoMdAdd className="add-icon" />
              Add Conductor
            </button>
          </div>
        </div>
        <div className="conductor-stats">
          <div className="stat-card">
            <div className="stat-number">{conductors.length}</div>
            <div className="stat-label">Total Conductors</div>
          </div>
          <div className="stat-card online">
            <div className="stat-number">{onlineConductors}</div>
            <div className="stat-label">Online</div>
          </div>
          <div className="stat-card offline">
            <div className="stat-number">{offlineConductors}</div>
            <div className="stat-label">Offline</div>
          </div>
          <div className="stat-card trips">
            <div className="stat-number">{totalTrips}</div>
            <div className="stat-label">Total Trips</div>
          </div>
        </div>
      </div>

      <div className="conductor-content">
        <div className="conductor-sidebar">
          <div className="conductor-controls">
            <div className="search-container">
              <input
                type="text"
                placeholder="Search conductors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>

            <div className="filter-container">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Status</option>
                <option value="online">Online Only</option>
                <option value="offline">Offline Only</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="sort-select"
              >
                <option value="name">Sort by Name</option>
                <option value="route">Sort by Route</option>
                <option value="lastSeen">Sort by Last Seen</option>
                <option value="trips">Sort by Trips Count</option>
              </select>
            </div>
          </div>

          <div className="conductor-list">
            {filteredAndSortedConductors().map((conductor) => (
              <div
                key={conductor.id}
                className={`conductor-item ${selectedConductor?.id === conductor.id ? 'selected' : ''}`}
                onClick={() => handleConductorSelect(conductor.id)}
              >
                <div className="conductor-item-header">
                  <div className="conductor-name">{conductor.name || 'Unknown'}</div>
                  <div 
                    className="conductor-status"
                    style={{ 
                      backgroundColor: conductorService.getStatusColor(conductor.isOnline, conductor.lastSeen)
                    }}
                  >
                    {conductorService.getStatusText(conductor.isOnline, conductor.lastSeen)}
                  </div>
                </div>
                
                <div className="conductor-item-details">
                  <div className="detail-row">
                    <span className="detail-label">Route:</span>
                    <span className="detail-value">{conductor.route || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Bus:</span>
                    <span className="detail-value">#{conductor.busNumber || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Trips:</span>
                    <span className="detail-value">{conductor.tripsCount || 0}</span>
                  </div>
                </div>

                <div className="conductor-actions">
                  <button
                    className="action-btn view-trips"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewTrips(conductor);
                    }}
                  >
                    View Trips
                  </button>
                </div>
              </div>
            ))}

            {filteredAndSortedConductors().length === 0 && (
              <div className="no-conductors">
                <p>No conductors found matching your criteria.</p>
              </div>
            )}
          </div>
        </div>

        <div className="conductor-details">
          {detailsLoading ? (
            <div className="details-loading">
              <div className="loading-spinner"></div>
              <p>Loading details...</p>
            </div>
          ) : selectedConductor ? (
            <ConductorDetails conductor={selectedConductor} />
          ) : (
            <div className="no-selection">
              <h3>Select a conductor to view details</h3>
              <p>Choose a conductor from the list to see their information and recent trips.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Conductor Modal */}
      {showAddModal && (
        <AddConductorModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchConductors(); // Refresh the list
          }}
        />
      )}

      {/* Trips Modal */}
      {showTripsModal && selectedConductorTrips && (
        <TripsModal
        conductor={selectedConductorTrips}
        onClose={() => {
          setShowTripsModal(false);
          setSelectedConductorTrips(null);
        }}
        trips={trips}
        availableDates={availableDates}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
      />
      )}
    </div>
  );
};

const AddConductorModal = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    busNumber: '',
    email: '',
    name: '',
    route: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const extractDocumentId = (email) => {
    // Extract everything before @ and replace dots with underscores
    return email.split('@')[0].replace(/\./g, '_');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Validate required fields
      if (!formData.busNumber || !formData.email || !formData.name || !formData.route || !formData.password) {
        throw new Error('All fields are required');
      }

      // Create user in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      // Extract document ID from email
      const documentId = extractDocumentId(formData.email);

      // Create conductor document in Firestore
      const conductorData = {
        busNumber: parseInt(formData.busNumber),
        email: formData.email,
        name: formData.name,
        route: formData.route,
        isOnline: false,
        createdAt: new Date(),
        lastSeen: null,
        currentLocation: null,
        uid: user.uid // Store the Firebase Auth UID for reference
      };

      await setDoc(doc(db, 'conductors', documentId), conductorData);

      console.log('Conductor created successfully:', documentId);
      onSuccess();
    } catch (error) {
      console.error('Error creating conductor:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add New Conductor</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <form onSubmit={handleSubmit} className="add-conductor-form">
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}
            
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter conductor's full name"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Enter email address"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="busNumber">Bus Number</label>
              <input
                type="number"
                id="busNumber"
                name="busNumber"
                value={formData.busNumber}
                onChange={handleChange}
                placeholder="Enter bus number"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="route">Route</label>
              <input
                type="text"
                id="route"
                name="route"
                value={formData.route}
                onChange={handleChange}
                placeholder="Enter route (e.g., Batangas - Manila)"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter password"
                required
                minLength="6"
              />
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="submit-btn"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="loading-spinner-small"></div>
                    Creating...
                  </>
                ) : (
                  'Add Conductor'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

const ConductorDetails = ({ conductor }) => {
  return (
    <div className="conductor-details-content">
      <div className="details-header">
        <h2>{conductor.name}</h2>
        <div 
          className="status-badge"
          style={{ 
            backgroundColor: conductorService.getStatusColor(conductor.isOnline, conductor.lastSeen)
          }}
        >
          {conductorService.getStatusText(conductor.isOnline, conductor.lastSeen)}
        </div>
      </div>

      <div className="details-grid">
        <div className="detail-section">
          <h3>Basic Information</h3>
          <div className="detail-item">
            <span className="label">Email:</span>
            <span className="value">{conductor.email || 'N/A'}</span>
          </div>
          <div className="detail-item">
            <span className="label">Route:</span>
            <span className="value">{conductor.route || 'N/A'}</span>
          </div>
          <div className="detail-item">
            <span className="label">Bus Number:</span>
            <span className="value">#{conductor.busNumber || 'N/A'}</span>
          </div>
          <div className="detail-item">
            <span className="label">Last Seen:</span>
            <span className="value">
              {conductorService.formatTimestamp(conductor.lastSeen)}
            </span>
          </div>
        </div>

        <div className="detail-section">
          <h3>Location Information</h3>
          {conductor.currentLocation ? (
            <>
              <div className="detail-item">
                <span className="label">Latitude:</span>
                <span className="value">{conductor.currentLocation.latitude?.toFixed(6) || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <span className="label">Longitude:</span>
                <span className="value">{conductor.currentLocation.longitude?.toFixed(6) || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <span className="label">Speed:</span>
                <span className="value">{conductor.currentLocation.speed || 0} km/h</span>
              </div>
              <div className="detail-item">
                <span className="label">Heading:</span>
                <span className="value">{conductor.currentLocation.heading || 0}°</span>
              </div>
              <div className="detail-item">
                <span className="label">Accuracy:</span>
                <span className="value">{conductor.currentLocation.accuracy || 0}m</span>
              </div>
              <div className="detail-item">
                <span className="label">Location Updated:</span>
                <span className="value">
                  {conductorService.formatTimestamp(conductor.currentLocation.timestamp)}
                </span>
              </div>
            </>
          ) : (
            <p>No location data available</p>
          )}
        </div>

        <div className="detail-section">
          <h3>Trip Statistics</h3>
          <div className="detail-item">
            <span className="label">Total Trips:</span>
            <span className="value">{conductor.totalTrips || 0}</span>
          </div>
          <div className="detail-item">
            <span className="label">Today's Trips:</span>
            <span className="value">{conductor.todayTrips || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const TripsModal = ({ conductor, onClose, trips, availableDates = [], selectedDate, setSelectedDate }) => {
  const [sortOrder, setSortOrder] = useState('desc'); 

  const filteredTrips = (
    selectedDate === 'all' 
      ? (conductor.trips || []) 
      : (conductor.trips || []).filter(trip => trip.date === selectedDate)
  ).sort((a, b) => {
    const dateA = new Date(a.timestamp?.seconds ? a.timestamp.seconds * 1000 : a.timestamp);
    const dateB = new Date(b.timestamp?.seconds ? b.timestamp.seconds * 1000 : b.timestamp);

    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>All Trips - {conductor.name}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">

        {availableDates.length > 0 && (
          <div className="date-filter">
            <label htmlFor="date-select">Filter by Date: </label>
            <select
              id="date-select"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            >
              <option value="all">All Dates</option>
              {availableDates.map((date) => (
                <option key={date} value={date}>{date}</option>
              ))}
            </select>
          </div>
        )}
        <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
        <button
          className="sort-toggle"
          onClick={() => setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
        >
          Sort: {sortOrder === 'asc' ? 'Oldest First' : 'Newest First'}
        </button>
      </div>


        {filteredTrips && filteredTrips.length > 0 ? (
          <div className="trips-grid">
            {filteredTrips.map((trip, index) => (
            <div key={`${trip.date}-${trip.ticketNumber}`} className="trip-card">
              <div className="trip-header">
                <span className="trip-number">#{index + 1}</span>
                <span className="trip-ticket">{trip.ticketNumber}</span>
                <span className="trip-date">{trip.date}</span>
              </div>
              <div className="trip-details">
                {[
                  'from',
                  'startKm',
                  'to',
                  'endKm',
                  'farePerPassenger',
                  'discountBreakdown',
                  'quantity',
                  'totalFare',
                  'timestamp',
                  'isActive'
                ].map((key) => {
                  const value = trip[key];
                  if (value === undefined) return null;

                  const formatLabel = (label) => {
                    return label
                      .replace(/([A-Z])/g, ' $1') // Insert space before capital letters
                      .replace(/^./, (s) => s.toUpperCase()); // Capitalize first letter
                  };

                  return (
                    <div key={key} className="trip-detail">
                      <span className="trip-label">{formatLabel(key)}:</span>
                      <span className="trip-value">
                        {key === 'timestamp'
                          ? conductorService.formatTimestamp(value)
                          : key === 'discountBreakdown' && typeof value === 'object'
                          ? (
                            <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                              {Object.entries(value).map(([passenger, discount], idx) => {
                                const amount = Number(discount);
                                return (
                                  <li key={idx}>
                                    {isNaN(amount)
                                      ? discount
                                      : `Passenger ${idx + 1}: ₱${amount.toFixed(2)} discount`}
                                  </li>
                                );
                              })}
                            </ul>
                          )
                          : String(value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          </div>
        ) : (
          <p>No trips found for this date.</p>
        )}
      </div>

      </div>
    </div>
  );
};

export default Conductor; 