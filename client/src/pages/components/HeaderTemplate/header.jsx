import '/src/pages/components/HeaderTemplate/header.css';
import { IoMdNotificationsOutline } from 'react-icons/io';

const Header = () => {
  return (
    <header className='top-header'>
      <div className="header-title">Dashboard</div>
      <div className="right-section">
        <IoMdNotificationsOutline className="notification-icon" />
      </div>
    </header>
  );
};

export default Header;
