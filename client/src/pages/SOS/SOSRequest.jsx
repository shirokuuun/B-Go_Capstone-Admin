import '/src/pages/SOS/SOSRequest.css';
import { useState, useEffect } from 'react';
import { fetchSOSRequests } from '/src/pages/SOS/FetchSOS.js';

function SOSRequest() {
  const [collapsed, setCollapsed] = useState(false);
  const [sosData, setSosData] = useState([]);

  useEffect(() => {
    const getData = async () => {
      const data = await fetchSOSRequests();
      setSosData(data);
    };
    getData();
  }, []);

  return (
        <div className="sos-request-list">
          {sosData.length === 0 ? (
            <p>No SOS requests found.</p>
          ) : (
            sosData.map((sos) => (
              <div key={sos.id} className="sos-card">
                <h3>{sos.emergencyType}</h3>
                <p><strong>Description:</strong> {sos.description}</p>
                <p><strong>Status:</strong> {sos.status}</p>
                <p><strong>Route:</strong> {sos.route}</p>
                <p><strong>Location:</strong> {sos.location?.lat}, {sos.location?.lng}</p>
                <p><strong>Submitted:</strong> {new Date(sos.timestamp?.seconds * 1000).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
  );
}

export default SOSRequest;
