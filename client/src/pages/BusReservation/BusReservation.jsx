import React, { useState, useEffect } from 'react';
import './BusReservation.css';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '/src/firebase/firebase.js';
import { isSuperAdmin } from '/src/pages/auth/authService.js';
import { IoMdAdd } from 'react-icons/io';
import { FaBusSimple } from "react-icons/fa6";
import { FaRegClock } from "react-icons/fa";
import { FaCheckCircle } from "react-icons/fa";
import { IoAlertCircleSharp } from "react-icons/io5";
import { FaListAlt } from 'react-icons/fa';
import { FaTrashAlt } from 'react-icons/fa';
import { RiEdit2Fill } from "react-icons/ri";

import { subscribeToBuses, initializeBusStatusChecker, deleteBus, updateBus } from "./BusReservation.js";
import AddBusModal from '/src/pages/BusReservation/BusReservationModal.jsx';

function BusReservation() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBus, setEditingBus] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [buses, setBuses] = useState([]);
  const [stats, setStats] = useState({
    available: 0,
    reserved: 0,
    inTransit: 0
  });
  const [user] = useAuthState(auth);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);
  const [deletingBusId, setDeletingBusId] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeToBuses((liveBuses) => {
      setBuses(liveBuses);

      const available = liveBuses.filter(bus => bus.status === 'active').length;
      const reserved = liveBuses.filter(bus => bus.status === 'reserved').length;
      const inTransit = liveBuses.filter(bus => bus.status === 'inTransit').length;

      setStats({ available, reserved, inTransit });
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    console.log('Initializing bus status checker...');
    const cleanup = initializeBusStatusChecker();
    
    return () => {
      console.log('Cleaning up bus status checker...');
      cleanup();
    };
  }, []);

  // Check if user is superadmin
  useEffect(() => {
    if (user?.uid) {
      isSuperAdmin(user.uid).then(setIsSuperAdminUser);
    }
  }, [user]);

  // Delete bus handler
  const handleDeleteBus = async (busId, busName) => {
    if (!isSuperAdminUser) {
      alert('Access denied. Only superadmins can delete buses.');
      return;
    }

    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${busName}"?\n\nThis will also delete all related reservations and cannot be undone.`
    );

    if (!confirmDelete) return;

    setDeletingBusId(busId);
    try {
      const result = await deleteBus(busId);
      alert(result.message);
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setDeletingBusId(null);
    }
  };

  // Edit bus handler
  const handleEditBus = (bus) => {
    setEditingBus(bus);
    setShowEditModal(true);
  };

  // Update bus handler
  const handleUpdateBus = async (busData) => {
    try {
      setActionLoading(true);
      await updateBus(editingBus.id, busData);
      setShowEditModal(false);
      setEditingBus(null);
      alert('Bus updated successfully!');
    } catch (error) {
      alert(`Error updating bus: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const renderDetailsContent = () => {
    switch (activeAction) {
      case 'viewAll':
        return (
          <div className="bus-reservation-bus-list">
            {buses.map((bus) => {
              const isAvailable = bus.status === "active";

              return (
                <div key={bus.id} className="bus-reservation-bus-card">
                  <div className="bus-reservation-bus-header">
                    <h4 className="bus-reservation-bus-name">{bus.name}</h4>
                    <div className="bus-reservation-bus-header-actions">
                      <span className={`bus-reservation-status-tag ${isAvailable ? "available" : "not-available"}`}>
                        {isAvailable ? "Available" : "Not Available"}
                      </span>
                      <button
                        onClick={() => handleEditBus(bus)}
                        disabled={actionLoading}
                        className="bus-reservation-edit-btn"
                        title="Edit Bus"
                      >
                        <RiEdit2Fill />
                      </button>
                      {isSuperAdminUser && (
                        <button 
                          onClick={() => handleDeleteBus(bus.id, bus.name)}
                          disabled={deletingBusId === bus.id}
                          className="bus-reservation-delete-btn"
                          title="Delete Bus (Superadmin only)"
                        >
                          {deletingBusId === bus.id ? '...' : <FaTrashAlt />}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="bus-reservation-bus-info">
                    <p><strong>Plate:</strong> {bus.plateNumber}</p>
                    <p><strong>Price:</strong> ₱{bus.Price}</p>
                    <p><strong>Coding Days:</strong> {bus.codingDays?.join(', ') || 'None'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        );

      case 'Reservation':
        const reservedBuses = buses.filter((bus) => bus.status !== "active");

        if (reservedBuses.length === 0) {
          return (
            <div className="bus-reservation-empty-message">
              <p>No Reservation yet</p>
            </div>
          );
        }

        return (
          <div className="bus-reservation-bus-list">
            {reservedBuses.map((bus) => (
              <div key={bus.id} className="bus-reservation-bus-card">
                <div className="bus-reservation-bus-header">
                  <h4 className="bus-reservation-bus-name">{bus.name}</h4>
                  <div className="bus-reservation-bus-header-actions">
                    <span className="bus-reservation-status-tag not-available">
                      Not Available
                    </span>
                    <button
                      onClick={() => handleEditBus(bus)}
                      disabled={actionLoading}
                      className="bus-reservation-edit-btn"
                      title="Edit Bus"
                    >
                      <RiEdit2Fill />
                    </button>
                    {isSuperAdminUser && (
                      <button 
                        onClick={() => handleDeleteBus(bus.id, bus.name)}
                        disabled={deletingBusId === bus.id}
                        className="bus-reservation-delete-btn"
                        title="Delete Bus (Superadmin only)"
                      >
                        {deletingBusId === bus.id ? '...' : <FaTrashAlt />}
                      </button>
                    )}
                  </div>
                </div>
                <div className="bus-reservation-bus-info">
                  <p><strong>Plate:</strong> {bus.plateNumber}</p>
                  <p><strong>Price:</strong> ₱{bus.Price}</p>
                  <p><strong>Coding Days:</strong> {bus.codingDays?.join(', ') || 'None'}</p>
                </div>
              </div>
            ))}
          </div>
        );

      case 'available':
        return (
          <div className="bus-reservation-bus-list">
            {buses
              .filter((bus) => bus.status === "active")
              .map((bus) => (
                <div key={bus.id} className="bus-reservation-bus-card">
                  <div className="bus-reservation-bus-header">
                    <h4 className="bus-reservation-bus-name">{bus.name}</h4>
                    <div className="bus-reservation-bus-header-actions">
                      <span className="bus-reservation-status-tag available">
                        Available
                      </span>
                      <button
                        onClick={() => handleEditBus(bus)}
                        disabled={actionLoading}
                        className="bus-reservation-edit-btn"
                        title="Edit Bus"
                      >
                        <RiEdit2Fill />
                      </button>
                      {isSuperAdminUser && (
                        <button 
                          onClick={() => handleDeleteBus(bus.id, bus.name)}
                          disabled={deletingBusId === bus.id}
                          className="bus-reservation-delete-btn"
                          title="Delete Bus (Superadmin only)"
                        >
                          {deletingBusId === bus.id ? '...' : <FaTrashAlt />}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="bus-reservation-bus-info">
                    <p><strong>Plate:</strong> {bus.plateNumber}</p>
                    <p><strong>Price:</strong> ₱{bus.Price}</p>
                    <p><strong>Coding Days:</strong> {bus.codingDays?.join(', ') || 'None'}</p>
                  </div>
                </div>
              ))}
          </div>
        );

      default:
        return <p>Click the Actions for Details</p>;
    }
  };

  return (
    <div className="bus-reservation-container">
      <div className="bus-reservation-wrapper">
        <div className="bus-reservation-header">
          <div className="bus-reservation-header-pattern"></div>

          <div className="bus-reservation-header-content">
            <div className="bus-reservation-header-top">
              <div className="bus-reservation-title-section">
                <div className="bus-reservation-title-text">
                  <h1 className="bus-reservation-main-title">Bus Reservation</h1>
                </div>
              </div>

              <button 
                onClick={() => setShowAddModal(true)}
                className="bus-reservation-add-bus-btn"
              >
                <IoMdAdd className="bus-reservation-add-icon" />
                Add New Bus
              </button>
            </div>

            <div className="bus-reservation-stats-container">
              <div className="bus-reservation-stat-card bus-reservation-reservable">
                <div className="bus-reservation-stat-icon-wrapper">
                  <FaCheckCircle className="bus-reservation-stat-icon" />
                </div>
                <div className="bus-reservation-stat-content">
                  <div className="bus-reservation-stat-number">{stats.available}</div>
                  <div className="bus-reservation-stat-label">Available</div>
                </div>
              </div>

              <div className="bus-reservation-stat-card bus-reservation-reserved">
                <div className="bus-reservation-stat-icon-wrapper">
                  <FaBusSimple className="bus-reservation-stat-icon" />
                </div>
                <div className="bus-reservation-stat-content">
                  <div className="bus-reservation-stat-number">{stats.reserved}</div>
                  <div className="bus-reservation-stat-label">Reserved</div>
                </div>
              </div>

              <div className="bus-reservation-stat-card bus-reservation-transit">
                <div className="bus-reservation-stat-icon-wrapper">
                  <FaRegClock className="bus-reservation-stat-icon" />
                </div>
                <div className="bus-reservation-stat-content">
                  <div className="bus-reservation-stat-number">{stats.inTransit}</div>
                  <div className="bus-reservation-stat-label">In Transit</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bus-reservation-quick-actions-section">
          <h3 className="bus-reservation-section-title">
            <IoAlertCircleSharp className="bus-reservation-section-icon" />
            Actions
          </h3>
          <div className="bus-reservation-quick-actions-grid">
            <button 
              className={`bus-reservation-quick-action-btn ${activeAction === 'viewAll' ? 'active' : ''}`} 
              onClick={() => setActiveAction('viewAll')}
            >
              <FaBusSimple className="bus-reservation-action-icon" />
              <span className="bus-reservation-action-text">View All Buses</span>
            </button>
            <button 
              className={`bus-reservation-quick-action-btn ${activeAction === 'Reservation' ? 'active' : ''}`} 
              onClick={() => setActiveAction('Reservation')}
            >
              <FaCheckCircle className="bus-reservation-action-icon" />
              <span className="bus-reservation-action-text">Reservation</span>
            </button>

            <button 
              className={`bus-reservation-quick-action-btn ${activeAction === 'available' ? 'active' : ''}`} 
              onClick={() => setActiveAction('available')}
            >
              <FaListAlt className="bus-reservation-action-icon" />
              <span className="bus-reservation-action-text">Available Buses</span>
            </button>
          </div>
        </div>

        <div className="bus-reservation-details-section">
          <h3 className="bus-reservation-details-title">{renderDetailsContent()}</h3>
        </div>

        {/* Modal Components */}
        <AddBusModal 
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
        />
        
        {showEditModal && (
          <EditBusModal
            onClose={() => {
              setShowEditModal(false);
              setEditingBus(null);
            }}
            onUpdate={handleUpdateBus}
            loading={actionLoading}
            initialData={editingBus}
          />
        )}
      </div>
    </div>
  );
}

// Edit Bus Modal Component
function EditBusModal({ onClose, onUpdate, loading, initialData }) {
  const [formData, setFormData] = useState({
    name: '',
    plateNumber: '',
    codingDays: [],
    Price: 0
  });

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        plateNumber: initialData.plateNumber || '',
        codingDays: initialData.codingDays || [],
        Price: initialData.Price || 0
      });
    }
  }, [initialData]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      alert('Please enter a bus name');
      return;
    }
    
    if (!formData.plateNumber.trim()) {
      alert('Please enter a plate number');
      return;
    }
    
    onUpdate(formData);
  };

  const handleCodingDayChange = (day) => {
    setFormData(prev => ({
      ...prev,
      codingDays: prev.codingDays.includes(day)
        ? prev.codingDays.filter(d => d !== day)
        : [...prev.codingDays, day]
    }));
  };

  return (
    <div className="bus-reservation-modal-overlay" onClick={onClose}>
      <div className="bus-reservation-add-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="bus-reservation-modal-header">
          <h3 className="bus-reservation-modal-title">Edit Bus</h3>
          <button className="bus-reservation-modal-close-btn" onClick={onClose}>&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} className="bus-reservation-add-form">
          <div className="bus-reservation-form-group">
            <label className="bus-reservation-form-label">Bus Name</label>
            <input
              type="text"
              className="bus-reservation-form-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Bus 001"
              required
            />
          </div>
          
          <div className="bus-reservation-form-group">
            <label className="bus-reservation-form-label">Plate Number</label>
            <input
              type="text"
              className="bus-reservation-form-input"
              value={formData.plateNumber}
              onChange={(e) => setFormData({ ...formData, plateNumber: e.target.value.toUpperCase() })}
              placeholder="e.g., ABC-1234"
              required
            />
          </div>
          
          <div className="bus-reservation-form-group">
            <label className="bus-reservation-form-label">Price (₱)</label>
            <input
              type="number"
              className="bus-reservation-form-input"
              value={formData.Price}
              onChange={(e) => setFormData({ ...formData, Price: parseInt(e.target.value) || 0 })}
              min="1"
              required
            />
          </div>
          
          <div className="bus-reservation-form-group">
            <label className="bus-reservation-form-label">Coding Days</label>
            <div className="bus-reservation-coding-days-grid">
              {daysOfWeek.map(day => (
                <label key={day} className="bus-reservation-checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.codingDays.includes(day)}
                    onChange={() => handleCodingDayChange(day)}
                    className="bus-reservation-checkbox"
                  />
                  <span className="bus-reservation-checkbox-text">{day}</span>
                </label>
              ))}
            </div>
          </div>
          
          <div className="bus-reservation-form-actions">
            <button 
              type="button" 
              className="bus-reservation-cancel-btn" 
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="bus-reservation-submit-btn"
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Update Bus'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default BusReservation;
