import { useLocation, Outlet } from 'react-router-dom';
import { useState } from 'react';
import Nav from '/src/components/navigation/nav.jsx';
import Header from '/src/components/HeaderTemplate/Header.jsx';
import '/src/components/layout/layout.css';

const Layout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

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
      <div className="main-section">
        <Header collapsed={collapsed} pageTitle={pageTitle} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
