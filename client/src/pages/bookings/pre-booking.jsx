import '/src/pages/bookings/pre-booking.css';
import Nav from '/src/components/navigation/nav.jsx';
import Header from '/src/components/HeaderTemplate/header.jsx';
import { useState } from 'react';

function Bookings() {
  const [collapsed, setCollapsed] = useState(false);

    return (
      <div className="pre-booking">
        <Nav collapsed={collapsed} setCollapsed={setCollapsed} />
        <div className="pre-booking-main">
          {/* Add your main content here */}
        </div>
      </div>
    );
}

export default Bookings;
