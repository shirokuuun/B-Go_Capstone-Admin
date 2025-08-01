import { useEffect, useState } from 'react';
import '/src/components/PageTransition/PageTransition.css'; 

function PageTransitionWrapper({ children }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setTimeout(() => setShow(true), 10);
    return () => setShow(false); // Reset on unmount
  }, []);

  return (
    <div className={`page-transition ${show ? 'fade-in' : ''}`}>
      {children}
    </div>
  );
}

export default PageTransitionWrapper;
