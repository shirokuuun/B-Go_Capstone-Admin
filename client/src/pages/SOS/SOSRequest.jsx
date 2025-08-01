import '/src/pages/SOS/SOSRequest.css';
import Nav from '/src/components/navigation/nav.jsx';
import Header from '/src/components/HeaderTemplate/header.jsx';
import { useState } from 'react';

function SOSRequest() {
  const [collapsed, setCollapsed] = useState(false);

    return (
      <div className="sos-request">
        <Nav collapsed={collapsed} setCollapsed={setCollapsed} />
        <div className="sos-request-main">
          {/* Add your main content here */}
        </div>
      </div>
    );
}

export default SOSRequest;

  