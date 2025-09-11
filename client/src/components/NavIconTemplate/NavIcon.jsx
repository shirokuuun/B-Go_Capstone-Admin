import { useLocation, useNavigate } from "react-router-dom";
import "/src/components/NavIconTemplate/NavIcon.css";

const NavIcon = ({ Icon, title, collapsed, to }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = location.pathname === to;

  const handleClick = () => {
    navigate(to);
  };

  return (
    <div
      className={`nav-icon ${isActive ? "active" : ""}`}
      onClick={handleClick}
      data-title={title}
    >
      {Icon && (
        <Icon
          className="icon"
          size={collapsed ? 28 : 20}
        />
      )}
      {!collapsed && <h2>{title || "Default Title"}</h2>}
    </div>
  );
};

export default NavIcon;
