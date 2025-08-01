import '/src/pages/settings/settings.css';
import Header from '/src/components/HeaderTemplate/header.jsx';
import { useState } from 'react';

function Settings() {
  const [collapsed, setCollapsed] = useState(false); // Lifted state here

    return (
        <div className="settings-main">
          {/* Add your main content here */}
        </div>
    );
}

export default Settings;
