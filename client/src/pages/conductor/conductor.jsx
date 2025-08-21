import React, { useState, useEffect } from 'react';
import conductorService from '/src/pages/conductor/conductor.js';
import './conductor.css';
import { IoMdAdd } from "react-icons/io";
import { FaSync } from "react-icons/fa";
import { FaUsers, FaCheckCircle, FaTimesCircle, FaMapMarkerAlt, FaTrash } from 'react-icons/fa';
import { auth } from '/src/firebase/firebase';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const Conductor = () => {
  const [conductors, setConductors] = useState([]);
  const [selectedConductor, setSelectedConductor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Clean up any existing listeners first
    conductorService.removeAllListeners();
    
    // Use simple fetch instead of real-time listeners to avoid connection issues
    const fetchConductors = async () => {
      try {
        const conductorsList = await conductorService.getAllConductors();
        setConductors(conductorsList);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching conductors:', error);
        setLoading(false);
      }
    };

    fetchConductors();

    // Set up interval for periodic updates instead of real-time
    const interval = setInterval(fetchConductors, 10000); // Update every 10 seconds

    return () => {
      clearInterval(interval);
      conductorService.removeAllListeners();
    };
  }, []);

  // Fetch conductor details without real-time listeners
  useEffect(() => {
    if (!selectedConductor?.id) return;

    const fetchConductorDetails = async () => {
      setDetailsLoading(true);
      try {
        const details = await conductorService.getConductorDetails(selectedConductor.id);
        setSelectedConductor(details);
        setDetailsLoading(false);
      } catch (error) {
        console.error('Error fetching conductor details:', error);
        setDetailsLoading(false);
      }
    };

    fetchConductorDetails();
  }, [selectedConductor?.id]);

  const handleConductorSelect = async (conductorId) => {
    // Don't fetch manually anymore - let the real-time listener handle it
    setDetailsLoading(true);
    
    // Just set the selected conductor ID to trigger the useEffect
    setSelectedConductor({ id: conductorId });
  };

  const handleDeleteConductor = async (id) => {
    if (!window.confirm("Are you sure you want to delete this conductor?")) return;
    try {
      await conductorService.deleteConductor(id);
      // No need to fetch manually - real-time listener will update
      
      // Clear selected conductor if it was deleted
      if (selectedConductor?.id === id) {
        setSelectedConductor(null);
      }
    } catch (error) {
      console.error("Error deleting conductor:", error);
    }
  };



  // NEW: Handle sync all trip counts
  const handleSyncTripCounts = async () => {
    if (!window.confirm("This will update trip counts for all conductors. Continue?")) {
      return;
    }

    try {
      setIsSyncing(true);
      const result = await conductorService.syncAllConductorTripCounts();
      
      if (result.success) {
        alert(`${result.message}`);
      } else {
        alert(`Error syncing trip counts: ${result.error}`);
      }
    } catch (error) {
      console.error('Error syncing trip counts:', error);
      alert('Failed to sync trip counts. Please try again.');
    } finally {
      setIsSyncing(false);
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
        {/* Background Pattern */}
        <div className="conductor-header-pattern"></div>
        
        <div className="conductor-header-content">
          <div className="conductor-header-top">
            {/* Title Section */}
            <div className="conductor-title-section">
              <div className="conductor-title-text">
                <h1 className="conductor-main-title">Conductor Management</h1>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="conductor-action-buttons">
              <button 
                onClick={handleSyncTripCounts}
                className="conductor-sync-btn"
                disabled={isSyncing}
                title="Sync trip counts for all conductors"
              >
                <FaSync className={`mr-2 ${isSyncing ? 'animate-spin': ''}`}/>
                {isSyncing ? 'Syncing...' : 'Sync Trips'}
              </button>
              <button 
                onClick={() => setShowAddModal(true)}
                className="conductor-add-btn"
              >
                <IoMdAdd className="conductor-add-icon" />
                Add Conductor
              </button>
            </div>
          </div>

          {/* Real-time Stats Cards */}
          <div className="conductor-stats-container">
            {/* Total Conductors */}
            <div className="conductor-stat-card conductor-total">
              <div className="conductor-stat-icon-wrapper">
                <FaUsers className="conductor-stat-icon" />
              </div>
              <div className="conductor-stat-content">
                <div className="conductor-stat-number">{conductors.length}</div>
                <div className="conductor-stat-label">Total</div>
              </div>
            </div>

            {/* Online Conductors - Updates in real-time */}
            <div className="conductor-stat-card conductor-online">
              <div className="conductor-stat-icon-wrapper">
                <FaCheckCircle className="conductor-stat-icon" />
              </div>
              <div className="conductor-stat-content">
                <div className="conductor-stat-number">{onlineConductors}</div>
                <div className="conductor-stat-label">Online</div>
              </div>
            </div>

            {/* Offline Conductors - Updates in real-time */}
            <div className="conductor-stat-card conductor-offline">
              <div className="conductor-stat-icon-wrapper">
                <FaTimesCircle className="conductor-stat-icon" />
              </div>
              <div className="conductor-stat-content">
                <div className="conductor-stat-number">{offlineConductors}</div>
                <div className="conductor-stat-label">Offline</div>
              </div>
            </div>

            {/* Total Trips */}
            <div className="conductor-stat-card conductor-trips">
              <div className="conductor-stat-icon-wrapper">
                <FaMapMarkerAlt className="conductor-stat-icon" />
              </div>
              <div className="conductor-stat-content">
                <div className="conductor-stat-number">{totalTrips}</div>
                <div className="conductor-stat-label">Total Trips</div>
              </div>
            </div>
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
                    {/* Real-time status indicator */}
                    {conductor.isOnline && (
                      <span className="live-indicator">●</span>
                    )}
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
                    className="action-btn delete-conductor"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConductor(conductor.id);
                    }}
                  >
                    Delete
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
              <p>Choose a conductor from the list to see their real-time information and recent trips.</p>
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
            // No need to fetch manually - real-time listener will update
          }}
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

      console.log('Creating conductor with separate Firebase instance...');

      // Use the same Firebase config as the main app
      const firebaseConfig = {
        apiKey: "AIzaSyDjqLNklma1gr3IOwPxiMO5S38hu8UQ2Fc",
        authDomain: "it-capstone-6fe19.firebaseapp.com",
        projectId: "it-capstone-6fe19",
        storageBucket: "it-capstone-6fe19.firebasestorage.app",
        messagingSenderId: "183068104612",
        appId: "1:183068104612:web:26109c8ebb28585e265331",
        measurementId: "G-0MW2KZMGR2"
      };

      // Initialize separate Firebase app for conductor creation
      const conductorApp = initializeApp(firebaseConfig, 'conductor-creation-' + Date.now());
      const conductorAuth = getAuth(conductorApp);
      const conductorDb = getFirestore(conductorApp);

      // Create Firebase Auth user in separate instance
      const userCredential = await createUserWithEmailAndPassword(conductorAuth, formData.email, formData.password);
      const conductorUser = userCredential.user;

      // Extract document ID from email
      const documentId = extractDocumentId(formData.email);

      // Create conductor document in Firestore using separate instance
      const conductorData = {
        busNumber: parseInt(formData.busNumber),
        email: formData.email,
        name: formData.name,
        route: formData.route,
        isOnline: false,
        createdAt: new Date(),
        lastSeen: null,
        currentLocation: null,
        uid: conductorUser.uid,
        totalTrips: 0,
        todayTrips: 0,
        status: 'offline'
      };

      await setDoc(doc(conductorDb, 'conductors', documentId), conductorData);

      console.log('Conductor created successfully without affecting admin session:', documentId);
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

// ENHANCED: Real-time Conductor Details Component
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
          {/* Real-time live indicator */}
          {conductor.isOnline && (
            <span className="live-pulse">●</span>
          )}
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


export default Conductor;