import '/src/components/HeaderTemplate/header.css';
import { IoMdNotificationsOutline } from 'react-icons/io';
import { FiLogOut } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { logoutUser } from '/src/pages/auth/authService.js';
import NotificationDropdown from '/src/components/NotificationDropdown/NotificationDropdown.jsx';
import { listenToAllNotifications, markNotificationAsRead, getUnreadCount } from '/src/components/NotificationDropdown/notificationService.js'; 

const Header = ({ collapsed, pageTitle }) => {
  const leftOffset = collapsed ? '100px' : '250px';
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [readNotifications, setReadNotifications] = useState(new Set());
  const notificationRef = useRef(null);

  // Listen to real-time notifications
  useEffect(() => {
    const unsubscribe = listenToAllNotifications((notificationData) => {
      // Map notifications and check read status
      const mappedNotifications = notificationData.map(notification => ({
        ...notification,
        read: readNotifications.has(notification.id) || notification.read
      }));
      
      setNotifications(mappedNotifications);
    });

    return () => unsubscribe();
  }, [readNotifications]);

  const handleLogout = async () => {
    try {
      await logoutUser(); 
      navigate('/login'); 
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
    
    // Mark visible notifications as read when opening
    if (!showNotifications) {
      const unreadIds = notifications
        .filter(n => !n.read)
        .map(n => n.id);
      
      if (unreadIds.length > 0) {
        setReadNotifications(prev => {
          const newReadSet = new Set(prev);
          unreadIds.forEach(id => newReadSet.add(id));
          return newReadSet;
        });
      }
    }
  };

  // Close notifications when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const unreadCount = getUnreadCount(notifications.map(n => ({
    ...n,
    read: readNotifications.has(n.id) || n.read
  })));

  return (
    <header
      className={`top-header ${collapsed ? 'collapsed' : ''}`}
    >
      <div className={`header-title ${collapsed ? 'collapsed-spacing' : ''}`}>
        {pageTitle}
      </div>
      <div className="right-section" ref={notificationRef}>
        <div className="notification-container">
          <IoMdNotificationsOutline 
            className="notification-icon" 
            onClick={toggleNotifications}
          />
          {unreadCount > 0 && (
            <span className="notification-badge">{unreadCount}</span>
          )}
          <NotificationDropdown
            notifications={notifications.map(n => ({
              ...n,
              read: readNotifications.has(n.id) || n.read
            }))}
            isOpen={showNotifications}
            onClose={() => setShowNotifications(false)}
          />
        </div>
        <FiLogOut className="logout-icon" onClick={handleLogout} />
      </div>
    </header>


  );
};

export default Header;
