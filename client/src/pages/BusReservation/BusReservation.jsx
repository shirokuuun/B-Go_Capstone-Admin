import React, { useState, useEffect } from 'react';
import './BusReservation.css';
import { IoMdAdd } from 'react-icons/io';
import { FaBusSimple } from "react-icons/fa6";
import { FaRegClock } from "react-icons/fa";
import { FaCheckCircle } from "react-icons/fa";
import { IoAlertCircleSharp } from "react-icons/io5";
import { FaListAlt } from 'react-icons/fa';

import { subscribeToBuses, initializeBusStatusChecker } from "./BusReservation.js";
import AddBusModal from '/src/pages/BusReservation/BusReservationModal.jsx';

function BusReservation() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [buses, setBuses] = useState([]);
  const [stats, setStats] = useState({
    available: 0,
    reserved: 0,
    inTransit: 0
  });

  // ✅ Real-time listener with count updates
  useEffect(() => {
    const unsubscribe = subscribeToBuses((liveBuses) => {
      setBuses(liveBuses);

      // 🔁 Live stats update
      const available = liveBuses.filter(bus => bus.status === 'active').length;
      const reserved = liveBuses.filter(bus => bus.status === 'reserved').length;
      const inTransit = liveBuses.filter(bus => bus.status === 'inTransit').length;

      setStats({ available, reserved, inTransit });
    });

    return () => unsubscribe();
  }, []);

  // ✅ Initialize bus status checker
  useEffect(() => {
    console.log('Initializing bus status checker...');
    const cleanup = initializeBusStatusChecker();
    
    return () => {
      console.log('Cleaning up bus status checker...');
      cleanup();
    };
  }, []);

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
                    <span className={`bus-reservation-status-tag ${isAvailable ? "available" : "not-available"}`}>
                      {isAvailable ? "Available" : "Not Available"}
                    </span>
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
                  <span className="bus-reservation-status-tag not-available">
                    Not Available
                  </span>
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
                    <span className="bus-reservation-status-tag available">
                      Available
                    </span>
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

        {/* Modal Component */}
        <AddBusModal 
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
        />
      </div>
    </div>
  );
}

export default BusReservation;
