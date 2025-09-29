import './NotificationDropdown.css';
import { IoMdCheckmarkCircle, IoMdInformationCircle, IoMdWarning, IoMdAlert } from 'react-icons/io';
import { useNavigate } from 'react-router-dom';
import { handleNotificationClick, formatNotificationTime } from './notificationService.js';

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

  const handleNotificationClickLocal = (notification) => {
    // Use the enhanced notification handler from service
    handleNotificationClick(notification, navigate);

    // Close dropdown after navigation
    setTimeout(() => {
      onClose();
    }, 100);
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
                handleNotificationClickLocal(notification);
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
                  {formatNotificationTime(notification.timestamp)}
                </div>
              </div>
              {!notification.read && <div className="unread-indicator"></div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationDropdown;