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
      case '/admin':
        return 'Dashboard';
      case '/admin/reservation':
        return 'Bus Reservation';
      case '/admin/conductor':
        return 'Conductor';
      case '/admin/verification':
        return 'ID Verification';
      case '/admin/schedules':
        return 'Trip Schedules';
      case '/admin/ticketing':
        return 'Ticketing';
      case '/admin/ticketing/pre-booking':
        return 'Pre-booking';
      case '/admin/ticketing/pre-ticketing':
        return 'Pre-ticketing';
      case '/admin/sos':
        return 'SOS Requests';
      case '/admin/payments':
        return 'Payment Transactions';
      case '/admin/settings':
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