import './NotificationDropdown.css';
import { IoMdCheckmarkCircle, IoMdInformationCircle, IoMdWarning, IoMdAlert } from 'react-icons/io';
import { useNavigate } from 'react-router-dom';

const NotificationDropdown = ({ notifications, isOpen, onClose }) => {
  const navigate = useNavigate();
  
  if (!isOpen) return null;

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'success':
        return <IoMdCheckmarkCircle className="notification-type-icon success" />;
      case 'info':
        return <IoMdInformationCircle className="notification-type-icon info" />;
      case 'warning':
        return <IoMdWarning className="notification-type-icon warning" />;
      case 'error':
        return <IoMdAlert className="notification-type-icon error" />;
      default:
        return <IoMdInformationCircle className="notification-type-icon info" />;
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const handleNotificationClick = (notification) => {
    // Check if it's an SOS request notification
    const isSOS = notification.type === 'error' || 
                  notification.title?.toLowerCase().includes('sos') || 
                  notification.message?.toLowerCase().includes('sos') ||
                  notification.category === 'sos' ||
                  notification.title?.toLowerCase().includes('emergency') ||
                  notification.message?.toLowerCase().includes('emergency');
    
    if (isSOS) {
      // Navigate to SOS request page
      navigate('/admin/sos');
      setTimeout(() => {
        onClose();
      }, 100);
    } else {
      // For non-SOS notifications, just close the dropdown
      onClose();
    }
  };

  return (
    <div className="notification-dropdown">
      <div className="notification-header">
        <h3>Notifications</h3>
        {notifications.length > 0 && (
          <span className="notification-count">{notifications.length}</span>
        )}
      </div>
      
      <div className="notification-list">
        {notifications.length === 0 ? (
          <div className="no-notifications">
            <IoMdInformationCircle className="no-notifications-icon" />
            <p>No new notifications</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <div 
              key={notification.id} 
              className={`notification-item ${notification.read ? 'read' : 'unread'}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleNotificationClick(notification);
              }}
              style={{ cursor: 'pointer' }}
            >
              <div className="notification-content">
                <div className="notification-main">
                  {getNotificationIcon(notification.type)}
                  <div className="notification-text">
                    <h4>{notification.title}</h4>
                    <p>{notification.message}</p>
                  </div>
                </div>
                <div className="notification-time">
                  {formatTime(notification.timestamp)}
                </div>
              </div>
              {!notification.read && <div className="unread-indicator"></div>}
            </div>
          ))
        )}
      </div>
      
      {notifications.length > 0 && (
        <div className="notification-footer">
          <button className="view-all-btn">View All Notifications</button>
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;