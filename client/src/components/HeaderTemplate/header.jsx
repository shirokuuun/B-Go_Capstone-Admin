import '/src/components/HeaderTemplate/header.css';
import { IoMdNotificationsOutline } from 'react-icons/io';
import { FiLogOut } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { logoutUser } from '/src/pages/auth/authService.js'; 

const Header = ({ collapsed, pageTitle }) => {
  const leftOffset = collapsed ? '100px' : '250px';
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logoutUser(); 
      navigate('/login'); 
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <header
      className="top-header"
    >
      <div className={`header-title ${collapsed ? 'collapsed-spacing' : ''}`}>
        {pageTitle}
      </div>
      <div className="right-section">
        <IoMdNotificationsOutline className="notification-icon" />
        <FiLogOut className="logout-icon" onClick={handleLogout} />
      </div>
    </header>

  );
};

export default Header;
