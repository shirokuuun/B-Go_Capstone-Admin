import "./nav.css";
import UserIcon from '/src/assets/user.png';
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
    <div className="menu" onClick={() => setCollapsed(!collapsed)}>
      {collapsed ? <FaAngleRight className="menu-icon" /> : <FaAngleLeft className="menu-icon" />}
    </div>

    <div className="top-spacing" />

    {collapsed ? (
      <div className="collapsed-header">
        <img src={UserIcon} alt="user-img" className="profile-img collapsed-img" title="creative_ambition" />
      </div>
    ) : (
      <header>
        <div className="profile">
          <img src={UserIcon} alt="user-img" className="profile-img" />
        </div>
        <span>creative_ambition</span>
      </header>
    )}

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
