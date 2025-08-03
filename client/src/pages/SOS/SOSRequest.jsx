import '/src/pages/SOS/SOSRequest.css';
import { useState, useEffect } from 'react';
import { fetchSOSRequests, updateSOSStatus } from '/src/pages/SOS/FetchSOS.js';
import { RiArrowDropDownLine } from "react-icons/ri";

function SOSRequest() {
  const [collapsed, setCollapsed] = useState(false);
  const [sosData, setSosData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [timeFilter, setTimeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPendingId, setSelectedPendingId] = useState(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const getData = async () => {
      const data = await fetchSOSRequests();
      setSosData(data);
      setFilteredData(data);
    };
    getData();
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

  // Function to get status-based CSS class
  const getStatusClass = (status) => {
    if (!status) return '';
    
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'pending':
        return 'status-pending';
      case 'received':
        return 'status-received';
      case 'cancelled':
        return 'status-cancelled';
      // Legacy support
      case 'active':
        return 'status-active';
      case 'resolved':
        return 'status-resolved';
      default:
        return '';
    }
  };

  // Get status counts
  const getStatusCounts = () => {
    const counts = {
      all: sosData.length,
      pending: sosData.filter(sos => sos.status?.toLowerCase() === 'pending').length,
      received: sosData.filter(sos => sos.status?.toLowerCase() === 'received').length,
      cancelled: sosData.filter(sos => sos.status?.toLowerCase() === 'cancelled').length,
    };
    return counts;
  };

  // Get pending SOS requests for left panel
  const getPendingRequests = () => {
    return sosData.filter(sos => sos.status?.toLowerCase() === 'pending');
  };

  // Update SOS status to "received" 
  const handleUpdateSOSStatus = async (sosId) => {
    if (!sosId || updating) return;
    
    setUpdating(true);
    try {
      const result = await updateSOSStatus(sosId, 'Received');
      
      if (result.success) {
        // Update local state
        const updatedSosData = sosData.map(sos => 
          sos.id === sosId 
            ? { ...sos, status: 'Received', updatedAt: new Date() }
            : sos
        );
        setSosData(updatedSosData);
        
        // Clear selection
        setSelectedPendingId(null);
        
        console.log('SOS status updated successfully');
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

  const statusCounts = getStatusCounts();
  const pendingRequests = getPendingRequests();

  return (
    <div className="sos-request-container">
      <div className="left-panel">
        <div className="left-panel-header">
          <h2>Pending Requests</h2>
          <div className="pending-count">
            <span className="count-badge">
              {pendingRequests.length} pending
            </span>
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
                <p className="pending-description">
                  <strong>Route:</strong> {sos.route}
                </p>
                <p className="pending-description">
                  <strong>Location:</strong> {sos.location?.lat}, {sos.location?.lng}
                </p>
                <p className="pending-time">
                  {new Date(sos.timestamp?.seconds * 1000).toLocaleString()}
                </p>
                
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
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="right-panel">
        <div className="right-panel-scroll">
          {/* Scrollable content */}
          <div className="header">
            <div className="header-left">
              <h2>SOS Requests</h2>
              <div className="items-count">
                <span className="count-badge">
                  {filteredData.length} of {sosData.length} items
                </span>
              </div>
            </div>
            
            <div className="filters-container">
              {/* Status Filter */}
             <div className="custom-select">
                <label className="filter-label">Status:</label>
                <div className="relative w-full">
                  <select 
                    value={statusFilter} 
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All ({statusCounts.all})</option>
                    <option value="pending">Pending ({statusCounts.pending})</option>
                    <option value="received">Received ({statusCounts.received})</option>
                    <option value="cancelled">Cancelled ({statusCounts.cancelled})</option>
                  </select>
                  <RiArrowDropDownLine className="select-icon" />
                </div>
              </div>


              {/* Time Filter */}
              <div className="custom-select">
                <label className="filter-label">Time:</label>
                <div className="relative w-full">
                  <select 
                    value={timeFilter} 
                    onChange={(e) => setTimeFilter(e.target.value)}
                    className="time-filter"
                  >
                    <option value="all">All Time</option>
                    <option value="3days">Last 3 Days</option>
                    <option value="1week">Last 1 Week</option>
                    <option value="1month">Last 1 Month</option>
                  </select>
                  <RiArrowDropDownLine className="select-icon" />
                </div>
              </div>
            </div>
          </div>

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
                <div key={sos.id} className={`sos-card ${getStatusClass(sos.status)}`}>
                  <h3>{sos.emergencyType}</h3>
                  <p><strong>Description:</strong> {sos.description}</p>
                  <p><strong>Status:</strong> {sos.status}</p>
                  <p><strong>Route:</strong> {sos.route}</p>
                  <p><strong>Location:</strong> {sos.location?.lat}, {sos.location?.lng}</p>
                  <p><strong>Submitted:</strong> {new Date(sos.timestamp?.seconds * 1000).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SOSRequest;