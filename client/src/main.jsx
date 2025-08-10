import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Layout from '/src/components/layout/layout.jsx'; 
import Dashboard from '/src/pages/dashboard/dashboard.jsx';
import BusReservation from '/src/pages/BusReservation/BusReservation.jsx';
import IDVerification from '/src/pages/verification/IDverification.jsx';
import TripSchedules from './pages/schedules/TripSchedules';
import Bookings from '/src/pages/ticketing/pre-booking.jsx';
import PreTicketing from '/src/pages/ticketing/pre-ticketing.jsx'; // New component
import SOSRequest from '/src/pages/SOS/SOSRequest.jsx';
import PaymentTransactions from '/src/pages/payments/PaymentTransactions.jsx';
import Settings from '/src/pages/settings/settings';
import PageTransitionWrapper from '/src/components/PageTransition/PageTransition.jsx';
import Login from '/src/pages/auth/login.jsx'; 
import Signup from '/src/pages/auth/signup.jsx'; 
import Conductor from '/src/pages/conductor/conductor.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* 🔐 Default redirect to /login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* 🔐 Login and Signup routes */}
        <Route path="/login" element={
          <PageTransitionWrapper><Login /></PageTransitionWrapper>
        } />
        <Route path="/signup" element={
          <PageTransitionWrapper><Signup /></PageTransitionWrapper>
        } />

        {/* 🛡️ Protected Routes (inside Layout) */}
        <Route path="/admin" element={<Layout />}>
          <Route index element={<PageTransitionWrapper><Dashboard /></PageTransitionWrapper>} />
          <Route path="reservation" element={<PageTransitionWrapper><BusReservation /></PageTransitionWrapper>} />
          <Route path="conductor" element={<PageTransitionWrapper><Conductor /></PageTransitionWrapper>} />
          <Route path="verification" element={<PageTransitionWrapper><IDVerification /></PageTransitionWrapper>} />
          <Route path="schedules" element={<PageTransitionWrapper><TripSchedules /></PageTransitionWrapper>} />
          
          {/* Updated Ticketing routes */}
          <Route path="ticketing" element={<Navigate to="/admin/ticketing/pre-booking" replace />} />
          <Route path="ticketing/pre-booking" element={<PageTransitionWrapper><Bookings /></PageTransitionWrapper>} />
          <Route path="ticketing/pre-ticketing" element={<PageTransitionWrapper><PreTicketing /></PageTransitionWrapper>} />
          
          {/* Handle legacy bookings route */}
          <Route path="bookings" element={<Navigate to="/admin/ticketing/pre-booking" replace />} />
          
          <Route path="sos" element={<PageTransitionWrapper><SOSRequest /></PageTransitionWrapper>} />
          <Route path="payments" element={<PageTransitionWrapper><PaymentTransactions /></PageTransitionWrapper>} />
          <Route path="settings" element={<PageTransitionWrapper><Settings /></PageTransitionWrapper>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);