import "./nav.css";
import BatrascoLogo from '/src/assets/batrasco-logo.png';
import NavIcon from '/src/pages/components/NavIconTemplate/NavIcon.jsx';

import { useState } from "react";
import { MdDashboard } from "react-icons/md";
import { FaUsers } from "react-icons/fa";
import { MdDomainVerification } from "react-icons/md";
import { GrSchedules } from "react-icons/gr";
import { MdBookmarkAdd } from "react-icons/md";
import { MdSos } from "react-icons/md";
import { MdPayment } from "react-icons/md";
import { IoMdSettings } from "react-icons/io";
import { FaAngleLeft, FaAngleRight } from "react-icons/fa";

const Nav = () => {
  const [collapsed, setCollapsed] = useState(false);

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
      <NavIcon title="Dashboard" Icon={MdDashboard} collapsed={collapsed} />
      <NavIcon title="User Management" Icon={FaUsers} collapsed={collapsed} />
      <NavIcon title="ID Verification" Icon={MdDomainVerification} collapsed={collapsed} />
      <NavIcon title="Trip Schedules" Icon={GrSchedules} collapsed={collapsed} />
      <NavIcon title="Pre-Bookings" Icon={MdBookmarkAdd} collapsed={collapsed} />
      <NavIcon title="SOS Requests" Icon={MdSos} collapsed={collapsed} />
      <NavIcon title="Payment Transactions" Icon={MdPayment} collapsed={collapsed} />
      <NavIcon title="Settings" Icon={IoMdSettings} collapsed={collapsed} />
    </div>
  );
};

export default Nav;
