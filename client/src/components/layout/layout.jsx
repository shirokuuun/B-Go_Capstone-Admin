// layout.jsx
import { useLocation, Outlet } from "react-router-dom";
import { useState, useEffect } from "react";
import Nav from "/src/components/navigation/nav.jsx";
import Header from "/src/components/HeaderTemplate/header.jsx";
import "/src/components/layout/layout.css";

const Layout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [isResponsiveCollapsed, setIsResponsiveCollapsed] = useState(false);
  const location = useLocation();

  // Check if screen is small enough for auto-collapse
  useEffect(() => {
    const checkScreenSize = () => {
      const isSmallScreen = window.innerWidth <= 1024;
      setIsResponsiveCollapsed(isSmallScreen);
    };

    // Check on mount
    checkScreenSize();

    // Add event listener for window resize
    window.addEventListener('resize', checkScreenSize);

    // Cleanup event listener
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const getPageTitle = (path) => {
    switch (path) {
      case "/admin":
        return "Dashboard";
      case "/admin/reservation":
        return "Bus Reservation";
      case "/admin/conductor":
        return "Conductor";
      case "/admin/verification":
        return "ID Verification";
      case "/admin/schedules":
        return "Trip Schedules";
      case "/admin/user":
        return "User Management";
      case "/admin/ticketing":
        return "Ticketing";
      case "/admin/sos":
        return "SOS Requests";
      case "/admin/reports":
        return "Reports";
      case "/admin/reports/daily-revenue":
        return "Daily Revenue Report";
      case "/admin/reports/sos-analytics":
        return "SOS Analytics Report";
      case "/admin/reports/ticket-report":
        return "Ticket Report";
      case "/admin/reports/user-reports":
        return "User Reports";
      case "/admin/payments":
        return "Payment Transactions";
      case "/admin/settings":
        return "Settings";
      default:
        return "";
    }
  };

  const pageTitle = getPageTitle(location.pathname);

  // Determine effective collapsed state (manual or responsive)
  const effectiveCollapsed = collapsed || isResponsiveCollapsed;

  return (
    <div className="layout-container">
      <Nav collapsed={effectiveCollapsed} setCollapsed={setCollapsed} />
      <div className={`main-section ${effectiveCollapsed ? 'collapsed' : ''}`}>
        <Header collapsed={effectiveCollapsed} pageTitle={pageTitle} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
