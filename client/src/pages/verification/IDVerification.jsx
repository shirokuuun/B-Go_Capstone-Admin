import '/src/pages/verification/IDVerification.css';
import Header from '/src/components/HeaderTemplate/header.jsx';
import { useState } from 'react';

function IDVerification() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="id-verification-main">
      {/* Your content here, no duplicate sidebar */}
    </div>
  );
}

export default IDVerification;
