import '/src/pages/schedules/TripSchedules.css';
import Nav from '/src/components/navigation/nav.jsx';
import Header from '/src/components/HeaderTemplate/header.jsx';
import { useState } from 'react';

function TripSchedules() {
  const [collapsed, setCollapsed] = useState(false);

    return (
      <div className="trip-schedules">
        <Nav collapsed={collapsed} setCollapsed={setCollapsed} />
        <div className="trip-schedules-main">
          {/* Add your main content here */}
        </div>
      </div>
    );
}

export default TripSchedules;
