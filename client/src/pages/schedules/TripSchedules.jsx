import React, { useState, useEffect } from 'react';
import './TripSchedules.css';
import { IoMdAdd } from 'react-icons/io';
import { FaBus, FaClock, FaEdit, FaTrash, FaRoute } from 'react-icons/fa';
import { MdSchedule } from 'react-icons/md';
import { auth } from '/src/firebase/firebase.js';
import { useAuthState } from 'react-firebase-hooks/auth';
import { 
  subscribeToTripSchedules, 
  deleteTripSchedule, 
  addTripSchedule,
  formatDisplayTime 
} from './TripSchedules.js';
import { hasPermission } from '/src/pages/auth/authService.js';

function TripSchedules() {
  const [user] = useAuthState(auth);
  const [tripSchedules, setTripSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [permissions, setPermissions] = useState({ canDelete: false, canAdd: false });
  const [stats, setStats] = useState({ total: 0, active: 0 });
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Load permissions on component mount
  useEffect(() => {
    const loadPermissions = async () => {
      if (user) {
        console.log('Loading permissions for user:', user.uid); // Debug log
        const canDelete = await hasPermission(user.uid, 'delete_any_data');
        const canAdd = await hasPermission(user.uid, 'manage_trips');
        console.log('Permissions loaded:', { canDelete, canAdd }); // Debug log
        setPermissions({ canDelete, canAdd });
      }
    };
    loadPermissions();
  }, [user]);

  // Subscribe to trip schedules
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToTripSchedules((schedules) => {
      console.log('Received schedules:', schedules); // Debug log
      setTripSchedules(schedules);
      setStats({
        total: schedules.length,
        active: schedules.filter(s => s.status === 'active').length
      });
      setLoading(false);
    }, (errorMsg) => {
      console.error('Error in schedules subscription:', errorMsg); // Debug log
      setError(errorMsg);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddSchedule = async (scheduleData) => {
    try {
      setActionLoading(true);
      await addTripSchedule(scheduleData);
      setShowAddModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId, scheduleName) => {
    const confirmMessage = `Are you sure you want to delete this trip schedule?\n\nRoute: ${scheduleName}\nThis action cannot be undone.`;
    
    if (window.confirm(confirmMessage)) {
      try {
        setActionLoading(true);
        await deleteTripSchedule(scheduleId);
      } catch (err) {
        setError(err.message);
      } finally {
        setActionLoading(false);
      }
    }
  };

  // Use the formatDisplayTime function from the JS file
  const formatTime = formatDisplayTime;

  if (loading) {
    return (
      <div className="tripsch-container">
        <div className="tripsch-loading">Loading trip schedules...</div>
      </div>
    );
  }

  return (
    <div className="tripsch-container">
      <div className="tripsch-wrapper">
        {/* Header Section */}
        <div className="tripsch-header">
          <div className="tripsch-header-pattern"></div>
          <div className="tripsch-header-content">
            <div className="tripsch-header-top">
              <div className="tripsch-title-section">
                <div className="tripsch-title-text">
                  <h1 className="tripsch-main-title">Trip Schedules</h1>
                </div>
              </div>
              
              {permissions.canAdd && (
                <button 
                  className="tripsch-add-schedule-btn"
                  onClick={() => setShowAddModal(true)}
                  disabled={actionLoading}
                >
                  <IoMdAdd className="tripsch-add-icon" />
                  <span>Add Schedule</span>
                </button>
              )}
            </div>

            {/* Stats Card */}
            <div className="tripsch-stats-single">
              <div className="tripsch-stat-card">
                <div className="tripsch-stat-icon tripsch-stat-total">
                  <FaRoute />
                </div>
                <div className="tripsch-stat-content">
                  <div className="tripsch-stat-number">{stats.total}</div>
                  <div className="tripsch-stat-label">Total Schedules</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="tripsch-error">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Main Content */}
        <div className="tripsch-main-content">
          {tripSchedules.length === 0 ? (
            <div className="tripsch-empty-state">
              <div className="tripsch-empty-icon">
                <MdSchedule />
              </div>
              <h3 className="tripsch-empty-title">No Trip Schedules</h3>
              <p className="tripsch-empty-text">
                There are no trip schedules configured yet.
                {permissions.canAdd && " Click 'Add Schedule' to create your first one."}
              </p>
            </div>
          ) : (
            <div className="tripsch-schedules-grid">
              {tripSchedules.map((schedule) => (
                <div key={schedule.id} className="tripsch-schedule-card">
                  <div className="tripsch-card-header">
                    <div className="tripsch-card-title-section">
                      <h3 className="tripsch-card-title">{schedule.route}</h3>
                      <p className="tripsch-card-conductor">Conductor: {schedule.conductorId || schedule.id}</p>
                    </div>
                    <div className="tripsch-card-actions">
                      {permissions.canDelete && (
                        <button
                          className="tripsch-action-btn tripsch-delete-btn"
                          onClick={() => handleDeleteSchedule(schedule.id, schedule.route)}
                          disabled={actionLoading}
                          title="Delete schedule"
                        >
                          <FaTrash />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="tripsch-card-content">
                    <div className="tripsch-schedule-info">
                      <div className="tripsch-info-item">
                        <FaClock className="tripsch-info-icon" />
                        <span className="tripsch-info-label">Departure Times</span>
                      </div>
                      
                      <div className="tripsch-times-grid">
                        {(() => {
                          // Parse schedules - handle both string and array formats
                          let schedulesArray = [];
                          if (typeof schedule.schedules === 'string') {
                            schedulesArray = schedule.schedules.split(',').map(s => s.trim()).filter(s => s);
                          } else if (Array.isArray(schedule.schedules)) {
                            schedulesArray = schedule.schedules;
                          } else if (schedule.schedulesArray && Array.isArray(schedule.schedulesArray)) {
                            schedulesArray = schedule.schedulesArray;
                          }

                          return schedulesArray.length > 0 ? (
                            schedulesArray.map((time, index) => (
                              <div key={index} className="tripsch-time-chip">
                                {formatTime(time)}
                              </div>
                            ))
                          ) : (
                            <div className="tripsch-no-times">No schedules set</div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Schedule Modal */}
      {showAddModal && (
        <AddScheduleModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddSchedule}
          loading={actionLoading}
        />
      )}
    </div>
  );
}

// Add Schedule Modal Component
function AddScheduleModal({ onClose, onAdd, loading }) {
  const [formData, setFormData] = useState({
    conductorId: '',
    route: '',
    schedules: [''],
    status: 'active'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.conductorId.trim()) {
      alert('Please enter a conductor ID');
      return;
    }
    
    if (!formData.route.trim()) {
      alert('Please enter a route name');
      return;
    }
    
    const validTimes = formData.schedules.filter(time => time.trim());
    if (validTimes.length === 0) {
      alert('Please add at least one schedule time');
      return;
    }
    
    onAdd({
      ...formData,
      schedules: validTimes,
      createdAt: new Date()
    });
  };

  const addTimeSlot = () => {
    setFormData({
      ...formData,
      schedules: [...formData.schedules, '']
    });
  };

  const removeTimeSlot = (index) => {
    const newSchedules = formData.schedules.filter((_, i) => i !== index);
    setFormData({ ...formData, schedules: newSchedules });
  };

  const updateTimeSlot = (index, value) => {
    const newSchedules = [...formData.schedules];
    newSchedules[index] = value;
    setFormData({ ...formData, schedules: newSchedules });
  };

  return (
    <div className="tripsch-modal-overlay" onClick={onClose}>
      <div className="tripsch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tripsch-modal-header">
          <h2 className="tripsch-modal-title">Add New Trip Schedule</h2>
          <button className="tripsch-modal-close" onClick={onClose}>&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} className="tripsch-modal-form">
          <div className="tripsch-form-group">
            <label className="tripsch-form-label">Conductor ID</label>
            <input
              type="text"
              className="tripsch-form-input"
              value={formData.conductorId}
              onChange={(e) => setFormData({ ...formData, conductorId: e.target.value })}
              placeholder="e.g., batangas, kahoy, rosario"
              required
            />
          </div>
          
          <div className="tripsch-form-group">
            <label className="tripsch-form-label">Route Name</label>
            <input
              type="text"
              className="tripsch-form-input"
              value={formData.route}
              onChange={(e) => setFormData({ ...formData, route: e.target.value })}
              placeholder="e.g., Rosario - SM City Lipa"
              required
            />
          </div>
          
          <div className="tripsch-form-group">
            <div className="tripsch-schedules-header">
              <label className="tripsch-form-label">Departure Times</label>
              <button 
                type="button" 
                className="tripsch-add-time-btn"
                onClick={addTimeSlot}
              >
                <IoMdAdd /> Add Time
              </button>
            </div>
            
            <div className="tripsch-time-slots">
              {formData.schedules.map((time, index) => (
                <div key={index} className="tripsch-time-slot">
                  <input
                    type="time"
                    className="tripsch-time-input"
                    value={time}
                    onChange={(e) => updateTimeSlot(index, e.target.value)}
                  />
                  {formData.schedules.length > 1 && (
                    <button
                      type="button"
                      className="tripsch-remove-time-btn"
                      onClick={() => removeTimeSlot(index)}
                    >
                      <FaTrash />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          <div className="tripsch-modal-actions">
            <button 
              type="button" 
              className="tripsch-btn tripsch-btn-secondary" 
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="tripsch-btn tripsch-btn-primary"
              disabled={loading}
            >
              {loading ? 'Adding...' : 'Add Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TripSchedules;
