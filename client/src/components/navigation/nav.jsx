import "./nav.css";
import BatrascoLogo from '/src/assets/batrasco-logo.png';
import NavIcon from '/src/components/NavIconTemplate/NavIcon.jsx';

import { MdDashboard } from "react-icons/md";
import { FaUsers } from "react-icons/fa";
import { MdDomainVerification } from "react-icons/md";
import { GrSchedules } from "react-icons/gr";
import { MdBookmarkAdd } from "react-icons/md";
import { MdSos } from "react-icons/md";
import { MdPayment } from "react-icons/md";
import { IoMdSettings } from "react-icons/io";
import { FaAngleLeft, FaAngleRight } from "react-icons/fa";

const Nav = ({ collapsed, setCollapsed }) => {
  return (
    <div className={`Navigation ${collapsed ? 'collapsed' : ''}`}>
      {/* Toggle button at top-right */}
      <div className="menu-top-right" onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? <FaAngleRight className="menu-icon" /> : <FaAngleLeft className="menu-icon" />}
      </div>

      {/* Centered Batrasco logo */}
      <div className="nav-header-logo">
        <img
          src={BatrascoLogo}
          alt="BATRASCO Logo"
          className={`batrasco-logo ${collapsed ? 'collapsed-logo' : ''}`}
        />
      </div>

      {/* Sidebar Navigation Icons */}
      <NavIcon title="Dashboard" Icon={MdDashboard} to="/admin" collapsed={collapsed} />
      <NavIcon title="User Management" Icon={FaUsers} to="/admin/users" collapsed={collapsed} />
      <NavIcon title="ID Verification" Icon={MdDomainVerification} to="/admin/verification" collapsed={collapsed} />
      <NavIcon title="Trip Schedules" Icon={GrSchedules} to="/admin/schedules" collapsed={collapsed} />
      <NavIcon title="Pre-Bookings" Icon={MdBookmarkAdd} to="/admin/bookings" collapsed={collapsed} />
      <NavIcon title="SOS Requests" Icon={MdSos} to="/admin/sos" collapsed={collapsed} />
      <NavIcon title="Payment Transactions" Icon={MdPayment} to="/admin/payments" collapsed={collapsed} />
      <NavIcon title="Settings" Icon={IoMdSettings} to="/admin/settings" collapsed={collapsed} />
    </div>
  );
};

export default Nav;
