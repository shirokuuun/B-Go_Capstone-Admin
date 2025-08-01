import { useLocation } from 'react-router-dom';
import { useState } from 'react';
import Nav from '/src/components/navigation/nav.jsx';
import Header from '/src/components/HeaderTemplate/Header.jsx';
import { Outlet } from 'react-router-dom';

const Layout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  // Map each path to a title
  const getPageTitle = (path) => {
    switch (path) {
      case '/':
        return 'Dashboard';
      case '/users':
        return 'User Management';
      case '/verification':
        return 'ID Verification';
      case '/schedules':
        return 'Trip Schedules';
      case '/bookings':
        return 'Pre-Bookings';
      case '/sos':
        return 'SOS Requests';
      case '/payments':
        return 'Payment Transactions';
      case '/settings':
        return 'Settings';
      default:
        return '';
    }
  };

  const pageTitle = getPageTitle(location.pathname);

  return (
    <div className="layout-container">
      <Nav collapsed={collapsed} setCollapsed={setCollapsed} />
      <div
        className="main-section"
        style={{
          marginLeft: collapsed ? '80px' : '250px',
          transition: 'margin-left 0.3s ease',
        }}
      >
        <Header collapsed={collapsed} pageTitle={pageTitle} />
        <div className="page-content" style={{ marginTop: '60px', padding: '24px' }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout;
