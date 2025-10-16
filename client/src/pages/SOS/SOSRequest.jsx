import '/src/pages/SOS/SOSRequest.css';
import { useState, useEffect } from 'react';
import { listenToSOSRequests, updateSOSStatus, deleteSOSRequest } from '/src/pages/SOS/FetchSOS.js';
import { RiArrowDropDownLine } from "react-icons/ri";
import { MdDelete, MdImage, MdClose, MdChevronLeft, MdChevronRight } from "react-icons/md";
import { logActivity, ACTIVITY_TYPES } from '/src/pages/settings/auditService.js';

function SOSRequest() {
  const [collapsed, setCollapsed] = useState(false);
  const [sosData, setSosData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [timeFilter, setTimeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPendingId, setSelectedPendingId] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Bulk selection states
  const [selectedSOS, setSelectedSOS] = useState(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);

  useEffect(() => {
    const unsubscribe = listenToSOSRequests((data) => {
      setSosData(data);
      setFilteredData(data);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const now = new Date();
    let filtered = sosData;

    // Apply time filter
    if (timeFilter !== 'all') {
      filtered = filtered.filter((sos) => {
        const date = new Date(sos.timestamp?.seconds * 1000);
        const daysAgo = (now - date) / (1000 * 60 * 60 * 24);

        if (timeFilter === '3days') return daysAgo <= 3;
        if (timeFilter === '1week') return daysAgo <= 7;
        if (timeFilter === '1month') return daysAgo <= 30;
        return true;
      });
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((sos) => {
        return sos.status?.toLowerCase() === statusFilter.toLowerCase();
      });
    }

    setFilteredData(filtered);
  }, [timeFilter, statusFilter, sosData]);

  const getStatusClass = (status) => {
    if (!status) return '';
    switch (status.toLowerCase()) {
      case 'pending': return 'status-pending';
      case 'received': return 'status-received';
      case 'cancelled': return 'status-cancelled';
      case 'active': return 'status-active';
      case 'resolved': return 'status-resolved';
      default: return '';
    }
  };

  const getStatusCounts = () => ({
    all: sosData.length,
    pending: sosData.filter(sos => sos.status?.toLowerCase() === 'pending').length,
    received: sosData.filter(sos => sos.status?.toLowerCase() === 'received').length,
    cancelled: sosData.filter(sos => sos.status?.toLowerCase() === 'cancelled').length,
  });

  const getPendingRequests = () => sosData.filter(sos => sos.status?.toLowerCase() === 'pending');

  const handleUpdateSOSStatus = async (sosId) => {
    if (!sosId || updating) return;

    // Find the SOS data before update for logging
    const sosToUpdate = sosData.find(sos => sos.id === sosId);

    setUpdating(true);
    try {
      const result = await updateSOSStatus(sosId, 'Received');
      if (result.success) {
        const updatedSosData = sosData.map(sos =>
          sos.id === sosId ? { ...sos, status: 'Received', updatedAt: new Date() } : sos
        );
        setSosData(updatedSosData);
        setSelectedPendingId(null);
        console.log('SOS status updated successfully');

        // Log the status update activity
        try {
          await logActivity(
            ACTIVITY_TYPES.SOS_MANAGEMENT,
            `Marked SOS request as Received`,
            {
              sosId: sosId,
              emergencyType: sosToUpdate?.emergencyType || 'Unknown',
              previousStatus: sosToUpdate?.status || 'Unknown',
              newStatus: 'Received',
              route: sosToUpdate?.route || 'Unknown',
              description: sosToUpdate?.description || 'No description',
              updatedAt: new Date().toISOString(),
              action: 'status_update'
            },
            'info'
          );
        } catch (logError) {
          console.warn('Failed to log SOS status update activity:', logError);
        }
      } else {
        alert(`Failed to update SOS status: ${result.error}`);
      }
    } catch (error) {
      console.error('Error updating SOS status:', error);
      alert('Failed to update SOS status. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteSOS = async (sosId) => {
    if (!sosId || updating) return;
    const confirmDelete = window.confirm("Are you sure you want to delete this SOS request?");
    if (!confirmDelete) return;

    // Find the SOS data before deletion for logging
    const sosToDelete = sosData.find(sos => sos.id === sosId);

    setUpdating(true);
    try {
      const result = await deleteSOSRequest(sosId);
      if (result.success) {
        const updatedSosData = sosData.filter(sos => sos.id !== sosId);
        setSosData(updatedSosData);
        setSelectedPendingId(null);
        console.log("SOS request deleted successfully");

        // Log the deletion activity
        try {
          await logActivity(
            ACTIVITY_TYPES.SOS_MANAGEMENT,
            `Deleted SOS request`,
            {
              sosId: sosId,
              emergencyType: sosToDelete?.emergencyType || 'Unknown',
              status: sosToDelete?.status || 'Unknown',
              route: sosToDelete?.route || 'Unknown',
              description: sosToDelete?.description || 'No description',
              deletedAt: new Date().toISOString(),
              action: 'delete'
            },
            'warning'
          );
        } catch (logError) {
          console.warn('Failed to log SOS deletion activity:', logError);
        }
      } else {
        alert(`Failed to delete SOS request: ${result.error}`);
      }
    } catch (error) {
      console.error("Error deleting SOS request:", error);
      alert("Failed to delete SOS request. Please try again.");
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenImageModal = (imageUrls) => {
    if (imageUrls && imageUrls.length > 0) {
      setSelectedImages(imageUrls);
      setCurrentImageIndex(0);
      setImageModalOpen(true);
    }
  };

  const handleCloseImageModal = () => {
    setImageModalOpen(false);
    setSelectedImages([]);
    setCurrentImageIndex(0);
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % selectedImages.length);
  };

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + selectedImages.length) % selectedImages.length);
  };

  // Bulk selection handlers
  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    setSelectedSOS(new Set());
  };

  const toggleSOSSelection = (sosId) => {
    const newSelection = new Set(selectedSOS);
    if (newSelection.has(sosId)) {
      newSelection.delete(sosId);
    } else {
      newSelection.add(sosId);
    }
    setSelectedSOS(newSelection);
  };

  const selectAllSOS = () => {
    const allSOSIds = new Set(filteredData.map(sos => sos.id));
    setSelectedSOS(allSOSIds);
  };

  const deselectAllSOS = () => {
    setSelectedSOS(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedSOS.size === 0) {
      alert('Please select SOS requests to delete.');
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedSOS.size} selected SOS request${selectedSOS.size > 1 ? 's' : ''}?\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    setUpdating(true);
    try {
      const sosIds = Array.from(selectedSOS);
      let deletedCount = 0;

      for (const sosId of sosIds) {
        const result = await deleteSOSRequest(sosId);
        if (result.success) {
          deletedCount++;
        }
      }

      // Update the local state
      const updatedSosData = sosData.filter(sos => !selectedSOS.has(sos.id));
      setSosData(updatedSosData);
      setSelectedSOS(new Set());
      setIsSelectMode(false);

      alert(`Successfully deleted ${deletedCount} of ${sosIds.length} SOS request(s).`);
    } catch (error) {
      console.error('Error deleting SOS requests:', error);
      alert('Failed to delete SOS requests. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const statusCounts = getStatusCounts();
  const pendingRequests = getPendingRequests();

  return (
    <div className="sos-request-container">
      <div className="left-panel">
        <div className="left-panel-header">
          <h2>Pending Requests</h2>
          <div className="pending-count">
            <span className="count-badge">{pendingRequests.length} pending</span>
          </div>
        </div>

        <div className="pending-list">
          {pendingRequests.length === 0 ? (
            <div className="empty-state-left">
              <p>No pending requests</p>
            </div>
          ) : (
            pendingRequests.map((sos) => (
              <div
                key={sos.id}
                className={`pending-card ${selectedPendingId === sos.id ? 'selected' : ''}`}
                onClick={() => setSelectedPendingId(sos.id)}
              >
                <div className="pending-card-header">
                  <h4>{sos.emergencyType}</h4>
                  <span className="pending-status">PENDING</span>
                </div>
                <p className="pending-description"><strong>Route:</strong> {sos.route}</p>
                <p className="pending-description"><strong>Location:</strong> {sos.location?.lat}, {sos.location?.lng}</p>
                {sos.imageUrls && sos.imageUrls.length > 0 && (
                  <p className="pending-description">
                    <strong>Images:</strong>
                    <button
                      className="view-images-btn-small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenImageModal(sos.imageUrls);
                      }}
                    >
                      <MdImage /> View {sos.imageUrls.length} {sos.imageUrls.length === 1 ? 'Image' : 'Images'}
                    </button>
                  </p>
                )}
                <p className="pending-time">{new Date(sos.timestamp?.seconds * 1000).toLocaleString()}</p>

                {selectedPendingId === sos.id && (
                  <div className="pending-actions">
                    <button
                      className="receive-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateSOSStatus(sos.id);
                      }}
                      disabled={updating}
                    >
                      {updating ? 'Updating...' : 'Mark as Received'}
                    </button>
                    <MdDelete
                      className="sos-delete-icon-r"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSOS(sos.id);
                      }}
                      title="Delete SOS request"
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="right-panel">
        <div className="right-panel-scroll">
          <div className="header">
            <div className="header-left">
              <h2>SOS Requests</h2>
              <div className="items-count">
                <span className="count-badge">{filteredData.length} of {sosData.length} items</span>
              </div>
            </div>

            <div className="filters-container">
              <div className="custom-select">
                <label className="filter-label">Status:</label>
                <div className="relative w-full">
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">All ({statusCounts.all})</option>
                    <option value="pending">Pending ({statusCounts.pending})</option>
                    <option value="received">Received ({statusCounts.received})</option>
                    <option value="cancelled">Cancelled ({statusCounts.cancelled})</option>
                  </select>
                  <RiArrowDropDownLine className="select-icon" />
                </div>
              </div>

              <div className="custom-select">
                <label className="filter-label">Time:</label>
                <div className="relative w-full">
                  <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
                    <option value="all">All Time</option>
                    <option value="3days">Last 3 Days</option>
                    <option value="1week">Last 1 Week</option>
                    <option value="1month">Last 1 Month</option>
                  </select>
                  <RiArrowDropDownLine className="select-icon" />
                </div>
              </div>

              {filteredData.length > 0 && (
                <div className="custom-select">
                  <label className="filter-label">&nbsp;</label>
                  <button
                    onClick={toggleSelectMode}
                    className={`sos-select-mode-btn ${isSelectMode ? 'active' : ''}`}
                  >
                    {isSelectMode ? 'Cancel Select' : 'Select Requests'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bulk Actions Bar */}
          {isSelectMode && (
            <div className="sos-bulk-actions-bar">
              <div className="sos-bulk-actions-left">
                <span className="sos-bulk-selected-count">
                  {selectedSOS.size} of {filteredData.length} selected
                </span>
                <button onClick={selectAllSOS} className="sos-bulk-btn">
                  Select All
                </button>
                <button onClick={deselectAllSOS} className="sos-bulk-btn">
                  Deselect All
                </button>
              </div>
              <button
                onClick={handleBulkDelete}
                className="sos-bulk-delete-btn"
                disabled={selectedSOS.size === 0 || updating}
              >
                Delete Selected ({selectedSOS.size})
              </button>
            </div>
          )}

          <div className="sos-request-list">
            {filteredData.length === 0 ? (
              <div className="empty-state">
                <p>No SOS requests found for the selected filters.</p>
                {sosData.length > 0 && (
                  <p>Try adjusting your filters to see more results.</p>
                )}
              </div>
            ) : (
              filteredData.map((sos) => (
                <div
                  key={sos.id}
                  className={`sos-card ${getStatusClass(sos.status)} ${isSelectMode ? 'selectable' : ''} ${selectedSOS.has(sos.id) ? 'selected' : ''}`}
                  onClick={isSelectMode ? () => toggleSOSSelection(sos.id) : undefined}
                >
                  {isSelectMode && (
                    <div className="sos-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedSOS.has(sos.id)}
                        onChange={() => toggleSOSSelection(sos.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}

                  <div className="sos-card-header">
                    <h3>{sos.emergencyType}</h3>
                    {!isSelectMode && (
                      <MdDelete
                        className="sos-delete-icon"
                        onClick={() => handleDeleteSOS(sos.id)}
                        title="Delete SOS request"
                      />
                    )}
                  </div>
                  <p><strong>Description:</strong> {sos.description}</p>
                  <p><strong>Status:</strong> {sos.status}</p>
                  <p><strong>Route:</strong> {sos.route}</p>
                  <p><strong>Location:</strong> {sos.location?.lat}, {sos.location?.lng}</p>
                  <p><strong>Submitted:</strong> {new Date(sos.timestamp?.seconds * 1000).toLocaleString()}</p>
                  {sos.imageUrls && sos.imageUrls.length > 0 && (
                    <div className="sos-images-section">
                      <button
                        className="view-images-btn"
                        onClick={(e) => {
                          if (isSelectMode) e.stopPropagation();
                          handleOpenImageModal(sos.imageUrls);
                        }}
                      >
                        <MdImage /> View {sos.imageUrls.length} {sos.imageUrls.length === 1 ? 'Image' : 'Images'}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Image Modal */}
      {imageModalOpen && (
        <div className="image-modal-overlay" onClick={handleCloseImageModal}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="image-modal-close" onClick={handleCloseImageModal}>
              <MdClose />
            </button>

            <div className="image-modal-body">
              {selectedImages.length > 1 && (
                <button className="image-nav-btn prev" onClick={handlePrevImage}>
                  <MdChevronLeft />
                </button>
              )}

              <div className="image-container">
                <img
                  src={selectedImages[currentImageIndex]}
                  alt={`SOS Image ${currentImageIndex + 1}`}
                  className="modal-image"
                />
                {selectedImages.length > 1 && (
                  <div className="image-counter">
                    {currentImageIndex + 1} / {selectedImages.length}
                  </div>
                )}
              </div>

              {selectedImages.length > 1 && (
                <button className="image-nav-btn next" onClick={handleNextImage}>
                  <MdChevronRight />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SOSRequest;
