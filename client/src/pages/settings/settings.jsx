import '/src/pages/settings/settings.css';
import Nav from '/src/components/navigation/nav.jsx';
import Header from '/src/components/HeaderTemplate/header.jsx';
import { useState } from 'react';

function Settings() {
  const [collapsed, setCollapsed] = useState(false); // Lifted state here

    return (
      <div className="settings">
        <Nav collapsed={collapsed} setCollapsed={setCollapsed} />
        <div className="settings-main">
          {/* Add your main content here */}
        </div>
      </div>
    );
}

export default Settings;
