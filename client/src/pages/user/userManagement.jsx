import '/src/pages/user/UserManagement.css';
import Nav from '/src/components/navigation/nav.jsx';
import Header from '/src/components/HeaderTemplate/header.jsx';
import { useState } from 'react';

function UserManagement() {
  const [collapsed, setCollapsed] = useState(false); // Lifted state here
  
    return (
      <div className="user-management">
        <Nav collapsed={collapsed} setCollapsed={setCollapsed} />
        <div className="user-management-main">
          {/* Add your main content here */}
        </div>
      </div>
    );
}

export default UserManagement;
