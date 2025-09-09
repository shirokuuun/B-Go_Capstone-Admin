import React, { useState } from 'react';
import { IoMdClose } from 'react-icons/io';
import { addNewBus, validateBusData } from './BusReservation.js';

const AddBusModal = ({ isOpen, onClose, onBusAdded }) => {
  const [formData, setFormData] = useState({
    name: '',
    plateNumber: '',
    codingDays: []
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleCodingDayChange = (day) => {
    setFormData(prev => ({
      ...prev,
      codingDays: prev.codingDays.includes(day)
        ? prev.codingDays.filter(d => d !== day)
        : [...prev.codingDays, day]
    }));
    
    // Clear coding days error when user makes selection
    if (errors.codingDays) {
      setErrors(prev => ({
        ...prev,
        codingDays: ''
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate form data
      const validation = validateBusData(formData);
      
      if (!validation.isValid) {
        setErrors(validation.errors);
        setIsSubmitting(false);
        return;
      }

      // Add the bus to Firestore
      const newBus = await addNewBus(formData);
      
      // Notify parent component
      if (onBusAdded) {
        onBusAdded(newBus);
      }

      // Reset form and close modal
      setFormData({
        name: '',
        plateNumber: '',
        codingDays: []
      });
      setErrors({});
      onClose();

      alert('Bus added successfully!');
    } catch (error) {
      console.error('Error adding bus:', error);
      setErrors({ submit: error.message || 'Failed to add bus. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: '',
      plateNumber: '',
      codingDays: []
    });
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="bus-reservation-modal-overlay">
      <div className="bus-reservation-add-modal-content">
        <div className="bus-reservation-modal-header">
          <h3 className="bus-reservation-modal-title">Add New Bus</h3>
          <button 
            onClick={handleClose}
            className="bus-reservation-modal-close-btn"
            disabled={isSubmitting}
          >
            <IoMdClose />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bus-reservation-add-form">
          {errors.submit && (
            <div className="bus-reservation-error-message">
              {errors.submit}
            </div>
          )}

          {/* Bus Name */}
          <div className="bus-reservation-form-group">
            <label htmlFor="name" className="bus-reservation-form-label">
              Bus Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className={`bus-reservation-form-input ${errors.name ? 'error' : ''}`}
              placeholder="Enter bus name (e.g., BUS-001)"
              disabled={isSubmitting}
            />
            {errors.name && (
              <span className="bus-reservation-field-error">{errors.name}</span>
            )}
          </div>

          {/* Plate Number */}
          <div className="bus-reservation-form-group">
            <label htmlFor="plateNumber" className="bus-reservation-form-label">
              Plate Number *
            </label>
            <input
              type="text"
              id="plateNumber"
              name="plateNumber"
              value={formData.plateNumber}
              onChange={handleInputChange}
              className={`bus-reservation-form-input ${errors.plateNumber ? 'error' : ''}`}
              placeholder="Enter plate number (e.g., ABC-1234)"
              disabled={isSubmitting}
            />
            {errors.plateNumber && (
              <span className="bus-reservation-field-error">{errors.plateNumber}</span>
            )}
          </div>

          {/* Coding Days */}
          <div className="bus-reservation-form-group">
            <label className="bus-reservation-form-label">
              Coding Days * <span className="bus-reservation-label-note">(Select applicable days)</span>
            </label>
            <div className="bus-reservation-coding-days-grid">
              {weekdays.map(day => (
                <label key={day} className="bus-reservation-checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.codingDays.includes(day)}
                    onChange={() => handleCodingDayChange(day)}
                    className="bus-reservation-checkbox"
                    disabled={isSubmitting}
                  />
                  <span className="bus-reservation-checkbox-text">{day}</span>
                </label>
              ))}
            </div>
            {errors.codingDays && (
              <span className="bus-reservation-field-error">{errors.codingDays}</span>
            )}
          </div>

          {/* Fixed Price Display */}
          <div className="bus-reservation-form-group">
            <label className="bus-reservation-form-label">Price</label>
            <div className="bus-reservation-price-display">
              ₱2,000.00 <span className="bus-reservation-price-note">(Fixed)</span>
            </div>
          </div>

          {/* Form Actions */}
          <div className="bus-reservation-form-actions">
            <button
              type="button"
              onClick={handleClose}
              className="bus-reservation-cancel-btn"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bus-reservation-submit-btn"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <div className="bus-reservation-loading-spinner"></div>
                  Adding Bus...
                </>
              ) : (
                'Add Bus'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddBusModal;