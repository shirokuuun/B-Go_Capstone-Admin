import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { IoChevronDown, IoChevronUp } from 'react-icons/io5';
import '/src/components/Navigation/nav.css';
import '/src/components/dropdownNav/dropdownNavIcon.css';

const DropdownNavIcon = ({ title, Icon, dropdownItems, collapsed }) => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navRef = useRef(null);
  const tooltipRef = useRef(null);

  const isAnyChildActive =
    dropdownItems && dropdownItems.some(item => location.pathname === item.to);

  const toggleDropdown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(prev => !prev);
  };

  const handleMouseEnter = () => {
    if (collapsed) {
      setIsOpen(true);
    }
  };

  const handleMouseLeave = () => {
    if (collapsed) {
      setIsOpen(false);
    }
  };

  // Calculate tooltip position to align with the nav icon
  const getTooltipStyle = () => {
    if (!collapsed || !isOpen) return {};
    
    // This will be calculated dynamically when the tooltip opens
    return {};
  };

  // Function to position tooltip relative to the nav icon
  const positionTooltip = (tooltipElement, navElement) => {
    if (!tooltipElement || !navElement) return;
    
    const navRect = navElement.getBoundingClientRect();
    const tooltipHeight = tooltipElement.offsetHeight;
    const windowHeight = window.innerHeight;
    
    // Calculate ideal top position (center of nav icon)
    let idealTop = navRect.top + (navRect.height / 2) - (tooltipHeight / 2);
    
    // Adjust if tooltip goes off screen
    const minTop = 10;
    const maxTop = windowHeight - tooltipHeight - 10;
    const finalTop = Math.min(Math.max(minTop, idealTop), maxTop);
    
    tooltipElement.style.position = 'fixed';
    tooltipElement.style.left = '105px'; // Just after the 99px sidebar + smaller margin
    tooltipElement.style.top = `${finalTop}px`;
    tooltipElement.style.transform = 'none';
  };

  const handleClick = (e) => {
    if (collapsed) {
      // In collapsed mode, toggle on click as well as hover
      toggleDropdown(e);
    } else {
      // In expanded mode, only toggle on click
      toggleDropdown(e);
    }
  };

  useEffect(() => {
    if (collapsed) {
      // Don't auto-close when collapsed, let hover/click handle it
    } else if (isAnyChildActive) {
      setIsOpen(true);
    }
  }, [collapsed, isAnyChildActive]);

  // Position tooltip when it opens in collapsed mode
  useEffect(() => {
    if (collapsed && isOpen && tooltipRef.current && navRef.current) {
      // Use setTimeout to ensure tooltip is rendered before positioning
      setTimeout(() => {
        positionTooltip(tooltipRef.current, navRef.current);
      }, 0);
    }
  }, [collapsed, isOpen]);

  if (!dropdownItems?.length) return null;

  return (
    <div
      className="dni-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Main clickable nav item */}
      <div
        ref={navRef}
        className={`nav-icon ${isAnyChildActive ? 'active' : ''}`}
        onClick={handleClick}
      >
        {Icon && <Icon className="icon" size={collapsed ? 28 : 20} />}
        {!collapsed && <h2>{title}</h2>}
        {!collapsed && (
          <div className="dni-arrow">
            {isOpen ? <IoChevronUp size={16} /> : <IoChevronDown size={16} />}
          </div>
        )}
      </div>

      {/* Uncollapsed mode dropdown below */}
      {!collapsed && isOpen && (
        <div className="dni-menu">
          {dropdownItems.map((item, index) => (
            <NavLink
              key={index}
              to={item.to}
              className={({ isActive }) => `dni-item ${isActive ? 'dni-active' : ''}`}
              onClick={() => setIsOpen(false)}
            >
              {item.Icon && <item.Icon className="dni-item-icon" size={18} />}
              <span className="dni-item-title">{item.title}</span>
            </NavLink>
          ))}
        </div>
      )}

      {/* Collapsed mode tooltip beside */}
      {collapsed && isOpen && (
        <div ref={tooltipRef} className="dni-tooltip" style={getTooltipStyle()}>
          <div className="dni-tooltip-content">
            <span className="dni-tooltip-title">{title}</span>
            <div className="dni-tooltip-dropdown">
              {dropdownItems.map((item, index) => (
                <NavLink
                  key={index}
                  to={item.to}
                  className={({ isActive }) => `dni-tooltip-item ${isActive ? 'dni-active' : ''}`}
                  onClick={() => setIsOpen(false)}
                >
                  {item.Icon && <item.Icon className="dni-tooltip-icon" />}
                  <span>{item.title}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DropdownNavIcon;