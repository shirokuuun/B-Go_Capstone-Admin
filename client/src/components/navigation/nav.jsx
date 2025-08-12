// nav.jsx
import "./nav.css";
import BatrascoLogo from '/src/assets/batrasco-logo.png';
import NavIcon from '/src/components/NavIconTemplate/NavIcon.jsx';
import DropdownNavIcon from '/src/components/dropdownNav/dropdownNavIcon.jsx';

import { MdDashboard } from "react-icons/md";
import { MdDomainVerification } from "react-icons/md";
import { GrSchedules } from "react-icons/gr";
import { MdBookmarkAdd } from "react-icons/md";
import { MdSos } from "react-icons/md";
import { MdPayment } from "react-icons/md";
import { IoMdSettings } from "react-icons/io";
import { FaAngleLeft, FaAngleRight } from "react-icons/fa";
import { IoTicket } from "react-icons/io5";
import { FaBusSimple } from "react-icons/fa6";
import { MdConfirmationNumber, MdEventSeat } from "react-icons/md";
import { TbReportSearch } from "react-icons/tb";
import { FaChartLine, FaBus, FaUserTie, FaCalendarAlt } from "react-icons/fa";

const Nav = ({ collapsed, setCollapsed }) => {
  // Ticketing dropdown items
  const ticketingDropdownItems = [
    {
      title: "Pre-ticketing",
      Icon: MdConfirmationNumber,
      to: "/admin/ticketing/pre-ticketing"
    },
    {
      title: "Pre-booking",
      Icon: MdEventSeat,
      to: "/admin/ticketing/pre-booking"
    }
  ];

  // Reports dropdown items
  const reportsDropdownItems = [
    {
      title: "Daily Revenue",
      Icon: FaChartLine,
      to: "/admin/reports/daily-revenue"
    },
    {
      title: "Bus Utilization",
      Icon: FaBus,
      to: "/admin/reports/bus-utilization"
    },
    {
      title: "Conductor Performance",
      Icon: FaUserTie,
      to: "/admin/reports/conductor-performance"
    },
    {
      title: "Summary Dashboard",
      Icon: FaCalendarAlt,
      to: "/admin/reports/summary-dashboard"
    }
  ];

  return (
    <div className={`Navigation ${collapsed ? 'collapsed' : ''}`}>
      {/* Toggle button */}
      <div className="menu-top-right" onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? <FaAngleRight className="menu-icon" /> : <FaAngleLeft className="menu-icon" />}
      </div>

      {/* Logo */}
      <div className="nav-header-logo">
        <img
          src={BatrascoLogo}
          alt="BATRASCO Logo"
          className={`batrasco-logo ${collapsed ? 'collapsed-logo' : ''}`}
        />
      </div>

      {/* Scrollable nav container */}
      <div className="nav-scroll">
        <NavIcon title="Dashboard" Icon={MdDashboard} to="/admin" collapsed={collapsed} />
        <NavIcon title="Bus Reservation" Icon={FaBusSimple} to="/admin/reservation" collapsed={collapsed} />
        <NavIcon title="Conductor" Icon={IoTicket} to="/admin/conductor" collapsed={collapsed} />
        <NavIcon title="ID Verification" Icon={MdDomainVerification} to="/admin/verification" collapsed={collapsed} />
        <NavIcon title="Trip Schedules" Icon={GrSchedules} to="/admin/schedules" collapsed={collapsed} />

        {/* Ticketing Dropdown */}
        <DropdownNavIcon
          title="Ticketing"
          Icon={MdBookmarkAdd}
          dropdownItems={ticketingDropdownItems}
          collapsed={collapsed}
        />

        <NavIcon title="SOS Requests" Icon={MdSos} to="/admin/sos" collapsed={collapsed} />
        
        {/* Reports Dropdown */}
        <DropdownNavIcon
          title="Reports"
          Icon={TbReportSearch}
          dropdownItems={reportsDropdownItems}
          collapsed={collapsed}
        />

        <NavIcon title="Payment Transactions" Icon={MdPayment} to="/admin/payments" collapsed={collapsed} />
        <NavIcon title="Settings" Icon={IoMdSettings} to="/admin/settings" collapsed={collapsed} />
      </div>
    </div>
  );
};

export default Nav;