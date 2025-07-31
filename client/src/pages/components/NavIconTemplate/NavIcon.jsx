import "/src/pages/components/NavIconTemplate/NavIcon.css";

const NavIcon = ({ Icon, title, collapsed }) => {
  return (
    <div className="nav-icon">
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
