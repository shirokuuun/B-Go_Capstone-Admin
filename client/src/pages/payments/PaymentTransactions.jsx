import '/src/pages/payments/PaymentTransactions.css';
import Nav from '/src/components/navigation/nav.jsx';
import Header from '/src/components/HeaderTemplate/header.jsx';
import { useState } from 'react';

function PaymentTransactions() {
  const [collapsed, setCollapsed] = useState(false); // Lifted state here

    return (
      <div className="payment-transactions">
        <Nav collapsed={collapsed} setCollapsed={setCollapsed} />
        <div className="payment-transactions-main">
          {/* Add your main content here */}
        </div>
      </div>
    );
}

export default PaymentTransactions;
