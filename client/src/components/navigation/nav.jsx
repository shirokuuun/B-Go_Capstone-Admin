// nav.jsx
import "./nav.css";
import BatrascoLogo from '/src/assets/batrasco-logo.png';
import NavIcon from '/src/components/NavIconTemplate/NavIcon.jsx';
import DropdownNavIcon from '/src/components/dropdownNav/dropdownNavIcon.jsx';

import { MdDashboard } from "react-icons/md";
import { MdDomainVerification } from "react-icons/md";
import { GrSchedules } from "react-icons/gr";
import { MdSos } from "react-icons/md";
import { MdPayment } from "react-icons/md";
import { IoMdSettings } from "react-icons/io";
import { FaAngleLeft, FaAngleRight } from "react-icons/fa";
import { IoTicket } from "react-icons/io5";
import { FaBusSimple } from "react-icons/fa6";
import { MdConfirmationNumber, MdEventSeat } from "react-icons/md";
import { TbReportSearch } from "react-icons/tb";
import { FaChartLine, FaBus, FaUserTie, FaCalendarAlt } from "react-icons/fa";
import { FaRoute } from "react-icons/fa";
import { FaRegUser } from "react-icons/fa";
import { BsFillTicketDetailedFill } from "react-icons/bs";
import { FaUserCog } from "react-icons/fa";

const Nav = ({ collapsed, setCollapsed }) => {

  // Reports dropdown items
  const reportsDropdownItems = [
    {
      title: "Revenue",
      Icon: FaChartLine,
      to: "/admin/reports/daily-revenue"
    },
    {
      title: "SOS Analytics",
      Icon: MdSos,
      to: "/admin/reports/sos-analytics"
    },
    {
      title: "Ticket Analytics",
      Icon: FaUserTie,
      to: "/admin/reports/ticket-report"
    },
    {
      title: "User Reports",
      Icon: FaUserCog,
      to: "/admin/reports/user-reports"
    },
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
        <NavIcon title="Conductor" Icon={IoTicket} to="/admin/conductor" collapsed={collapsed} />
        <NavIcon title="ID Verification" Icon={MdDomainVerification} to="/admin/verification" collapsed={collapsed} />
        <NavIcon title="Trip Schedules" Icon={GrSchedules} to="/admin/schedules" collapsed={collapsed} />
        <NavIcon title="User Management" Icon={FaRegUser} to="/admin/user" collapsed={collapsed} />
        <NavIcon title="Ticketing" Icon={BsFillTicketDetailedFill} to="/admin/ticketing" collapsed={collapsed} />

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