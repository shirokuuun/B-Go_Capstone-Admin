import React, { useState, useEffect } from 'react';
import conductorService from '/src/pages/conductor/conductor.js';
import './conductor.css';
import { IoMdAdd } from "react-icons/io";
import { FaUsers, FaCheckCircle, FaTimesCircle, FaMapMarkerAlt, FaTrash, FaEdit, FaCheck } from 'react-icons/fa';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '/src/firebase/firebase.js';
import { doc, getDoc } from 'firebase/firestore';

const Conductor = () => {
  const [conductors, setConductors] = useState([]);
  const [selectedConductor, setSelectedConductor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingConductor, setEditingConductor] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Fetch current user role and superadmin status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'Admin', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setCurrentUserRole(userData.role);
            setIsSuperAdmin(userData.isSuperAdmin === true);
          }
        } catch (error) {
          console.error('Error fetching user role:', error);
        }
      }
    });

    return () => unsubscribe();
  }, []);



  useEffect(() => {
    // Clean up any existing listeners first
    conductorService.removeAllListeners();

    // Set up real-time listener for conductors
    const unsubscribe = conductorService.setupConductorsListener((conductorsList) => {
      // Ensure we have unique conductors by ID to prevent duplicates
      const uniqueConductors = conductorsList.filter((conductor, index, arr) =>
        arr.findIndex(c => c.id === conductor.id) === index
      );

      setConductors(uniqueConductors);
      setLoading(false);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      conductorService.removeAllListeners();
    };
  }, []);

  // Set up real-time listener for conductor details
  useEffect(() => {
    if (!selectedConductor?.id) return;

    setDetailsLoading(true);
    
    // Set up real-time listener for conductor details
    const unsubscribe = conductorService.setupConductorDetailsListener(
      selectedConductor.id,
      (details) => {
        setSelectedConductor(details);
        setDetailsLoading(false);
      }
    );

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [selectedConductor?.id]);

  const handleConductorSelect = async (conductorId) => {
    // Don't fetch manually anymore - let the real-time listener handle it
    setDetailsLoading(true);
    
    // Just set the selected conductor ID to trigger the useEffect
    setSelectedConductor({ id: conductorId });
  };

  const handleDeleteConductor = async (id) => {
    const conductor = conductors.find(c => c.id === id);

    // Call service method that contains all the business logic
    const result = await conductorService.handleDeleteConductor(id, conductor, currentUserRole, isSuperAdmin);

    // Handle UI updates based on result
    if (result.success && selectedConductor?.id === id) {
      setSelectedConductor(null);
    }
  };

  const handleEditConductor = (conductor) => {
    setEditingConductor(conductor);
    setShowEditModal(true);
  };

  const handleMarkAsCompleted = async (conductorId) => {
    if (!window.confirm('Mark this reservation as completed? This will make the bus available for new reservations.')) {
      return;
    }

    try {
      const result = await conductorService.markReservationAsCompleted(conductorId);
      if (result.success) {
        alert('✅ Reservation marked as completed successfully!');
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error marking reservation as completed:', error);
      alert(`❌ Error: ${error.message}`);
    }
  };

  const filteredAndSortedConductors = () => {
    let filtered = conductors.filter(conductor => {
      const matchesSearch =
        conductor.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conductor.route?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conductor.busNumber?.toString().includes(searchTerm.toLowerCase()) ||
        conductor.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conductor.plateNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conductorService.extractBusNumber(conductor.name).toString().includes(searchTerm.toLowerCase());

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
            {filteredAndSortedConductors().map((conductor) => {
              // Pre-calculate status to avoid multiple calls
              const busStatus = conductorService.getBusAvailabilityStatus(conductor);
              const statusInfo = conductorService.getStatusDisplayInfo(busStatus);

              return (
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
                    <span className="detail-value">#{conductorService.extractBusNumber(conductor.name)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Plate:</span>
                    <span className="detail-value">{conductor.plateNumber || 'N/A'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Reservation Status:</span>
                    <span
                      className={`detail-value ${statusInfo.class}`}
                      style={{
                        color: statusInfo.color,
                        fontWeight: 'bold'
                      }}
                    >
                      {statusInfo.text}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Trips:</span>
                    <span className="detail-value">{conductor.tripsCount || 0}</span>
                  </div>
                </div>

                <div className="conductor-actions">
                  {(conductor.busAvailabilityStatus === 'confirmed' || conductor.busAvailabilityStatus === 'reserved') && (
                    <button
                      className="action-btn mark-completed"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsCompleted(conductor.id);
                      }}
                      title="Mark as Completed"
                    >
                      <FaCheck />
                    </button>
                  )}
                  <button
                    className="action-btn edit-conductor"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditConductor(conductor);
                    }}
                    title="Edit Conductor"
                  >
                    <FaEdit />
                  </button>
                  <button
                    className={`action-btn delete-conductor ${(currentUserRole !== 'superadmin' || !isSuperAdmin) ? 'disabled' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConductor(conductor.id);
                    }}
                    disabled={currentUserRole !== 'superadmin' || !isSuperAdmin}
                    title={(currentUserRole !== 'superadmin' || !isSuperAdmin) ? 'Only superadmin can delete conductors' : 'Delete Conductor'}
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
              );
            })}

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
            // Force refresh after creation to ensure real-time update
            setTimeout(() => {
              conductorService.refreshConductorsList().then(result => {
                if (result.success) {
                  setConductors(result.conductors);
                }
              });
            }, 1000);
          }}
        />
      )}

      {showEditModal && editingConductor && (
        <EditConductorModal
          conductor={editingConductor}
          onClose={() => {
            setShowEditModal(false);
            setEditingConductor(null);
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setEditingConductor(null);
            // Real-time listener will automatically update the UI
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
    password: '',
    plateNumber: ''
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


  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Use the conductorService.createConductor method which includes activity logging
      const result = await conductorService.createConductor(formData);
      
      if (result.success) {
        console.log('Conductor created successfully:', result.data);
        onSuccess();
      } else {
        throw new Error(result.error || 'Failed to create conductor');
      }
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
              <label htmlFor="plateNumber">Plate Number</label>
              <input
                type="text"
                id="plateNumber"
                name="plateNumber"
                value={formData.plateNumber}
                onChange={handleChange}
                placeholder="Enter plate number (e.g., ABC-1234)"
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

const EditConductorModal = ({ conductor, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    busNumber: conductor?.busNumber || '',
    email: conductor?.email || '',
    name: conductor?.name || '',
    route: conductor?.route || '',
    plateNumber: conductor?.plateNumber || ''
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await conductorService.updateConductor(conductor.id, {
        busNumber: parseInt(formData.busNumber),
        name: formData.name,
        route: formData.route,
        plateNumber: formData.plateNumber
      });

      if (result.success) {
        console.log('Conductor updated successfully');
        onSuccess();
      } else {
        throw new Error(result.error || 'Failed to update conductor');
      }
    } catch (error) {
      console.error('Error updating conductor:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Conductor</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <form onSubmit={handleSubmit} className="edit-conductor-form">
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="edit-name">Full Name</label>
              <input
                type="text"
                id="edit-name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter conductor's full name"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="edit-email">Email Address</label>
              <input
                type="email"
                id="edit-email"
                name="email"
                value={formData.email}
                disabled
                title="Email cannot be changed"
                className="disabled-field"
              />
              <small className="field-note">Email cannot be changed</small>
            </div>

            <div className="form-group">
              <label htmlFor="edit-busNumber">Bus Number</label>
              <input
                type="number"
                id="edit-busNumber"
                name="busNumber"
                value={formData.busNumber}
                onChange={handleChange}
                placeholder="Enter bus number"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="edit-route">Route</label>
              <input
                type="text"
                id="edit-route"
                name="route"
                value={formData.route}
                onChange={handleChange}
                placeholder="Enter route (e.g., Batangas - Manila)"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="edit-plateNumber">Plate Number</label>
              <input
                type="text"
                id="edit-plateNumber"
                name="plateNumber"
                value={formData.plateNumber}
                onChange={handleChange}
                placeholder="Enter plate number (e.g., ABC-1234)"
                required
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
                    Updating...
                  </>
                ) : (
                  'Update Conductor'
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
  const handleMarkAsCompleted = async () => {
    if (!window.confirm('Mark this reservation as completed? This will make the bus available for new reservations.')) {
      return;
    }

    try {
      const result = await conductorService.markReservationAsCompleted(conductor.id);
      if (result.success) {
        alert('✅ Reservation marked as completed successfully!');
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error marking reservation as completed:', error);
      alert(`❌ Error: ${error.message}`);
    }
  };

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
            <span className="label">Plate Number:</span>
            <span className="value">{conductor.plateNumber || 'N/A'}</span>
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
          <h3>Bus Reservation Status</h3>
          <div className="detail-item">
            <span className="label">Bus Number:</span>
            <span className="value">#{conductorService.extractBusNumber(conductor.name)}</span>
          </div>
          <div className="detail-item">
            <span className="label">Plate Number:</span>
            <span className="value">{conductor.plateNumber || 'N/A'}</span>
          </div>
          <div className="detail-item">
            <span className="label">Coding Day:</span>
            <span className="value">{conductor.codingDay || 'Unknown'}</span>
          </div>
          <div className="detail-item">
            <span className="label">Reservation Status:</span>
            <span
              className={`value availability-status ${conductorService.getStatusDisplayInfo(conductorService.getBusAvailabilityStatus(conductor)).class}`}
              style={{
                color: conductorService.getStatusDisplayInfo(conductorService.getBusAvailabilityStatus(conductor)).color,
                fontWeight: 'bold',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                padding: '4px 8px',
                borderRadius: '4px',
                border: `2px solid ${conductorService.getStatusDisplayInfo(conductorService.getBusAvailabilityStatus(conductor)).color}`,
                display: 'inline-block',
                minHeight: '20px',
                textAlign: 'center'
              }}
            >
              {conductorService.getStatusDisplayInfo(conductorService.getBusAvailabilityStatus(conductor)).text}
            </span>
          </div>

          {/* Show reservation details if bus is reserved or confirmed */}
          {(conductor.busAvailabilityStatus === 'confirmed' || conductor.busAvailabilityStatus === 'reserved') && conductor.reservationDetails && (
            <>
              <div className="detail-item">
                <span className="label">Customer Name:</span>
                <span className="value">{conductor.reservationDetails.fullName || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <span className="label">Email:</span>
                <span className="value">{conductor.reservationDetails.email || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <span className="label">Route:</span>
                <span className="value">
                  {conductor.reservationDetails.from || 'N/A'} → {conductor.reservationDetails.to || 'N/A'}
                </span>
              </div>
              <div className="detail-item">
                <span className="label">Departure Date:</span>
                <span className="value">
                  {conductor.reservationDetails.departureDate
                    ? new Date(conductor.reservationDetails.departureDate.seconds * 1000).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })
                    : 'N/A'}
                </span>
              </div>
              <div className="detail-item">
                <span className="label">Departure Time:</span>
                <span className="value">{conductor.reservationDetails.departureTime || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <span className="label">Trip Type:</span>
                <span className="value">
                  {conductor.reservationDetails.isRoundTrip ? 'Round Trip' : 'One Way'}
                </span>
              </div>
              <div className="detail-item">
                <span className="label">Approved At:</span>
                <span className="value">
                  {conductor.reservationDetails.approvedAt
                    ? new Date(conductor.reservationDetails.approvedAt.seconds * 1000).toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'N/A'}
                </span>
              </div>
              {conductor.reservationDetails.approvedBy && (
                <div className="detail-item">
                  <span className="label">Approved By:</span>
                  <span className="value">{conductor.reservationDetails.approvedBy}</span>
                </div>
              )}
              {conductor.reservationDetails.receiptUrl && (
                <div className="detail-item">
                  <span className="label">Receipt:</span>
                  <a
                    href={conductor.reservationDetails.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="value"
                    style={{
                      color: '#007A8F',
                      textDecoration: 'underline',
                      cursor: 'pointer'
                    }}
                  >
                    View Receipt
                  </a>
                </div>
              )}
            </>
          )}

          {(conductor.busAvailabilityStatus === 'confirmed' || conductor.busAvailabilityStatus === 'reserved') && (
            <div className="detail-item" style={{ marginTop: '16px' }}>
              <button
                className="mark-completed-btn"
                onClick={handleMarkAsCompleted}
              >
                <FaCheck /> Mark as Completed
              </button>
            </div>
          )}
        </div>

        <div className="detail-section detail-section-compact">
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