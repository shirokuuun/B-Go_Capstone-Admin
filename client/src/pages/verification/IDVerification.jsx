import '/src/pages/verification/IDVerification.css';
import Nav from '/src/components/navigation/nav.jsx';
import Header from '/src/components/HeaderTemplate/header.jsx';
import { useState } from 'react';

function IDVerification() {
  const [collapsed, setCollapsed] = useState(false);

    return (
      <div className="id-verification">
        <Nav collapsed={collapsed} setCollapsed={setCollapsed} />
        <div className="id-verification-main">
          {/* Add your main content here */}
        </div>
      </div>
    );
}

export default IDVerification;
