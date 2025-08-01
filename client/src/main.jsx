import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Layout from '/src/components/layout/layout.jsx'; 
import Dashboard from '/src/pages/dashboard/dashboard.jsx';
import UserManagement from '/src/pages/user/UserManagement.jsx';
import IDVerification from '/src/pages/verification/IDverification.jsx';
import TripSchedules from './pages/schedules/TripSchedules';
import Bookings from '/src/pages/bookings/pre-booking.jsx';
import SOSRequest from '/src/pages/SOS/SOSRequest.jsx';
import PaymentTransactions from '/src/pages/payments/PaymentTransactions.jsx';
import Settings from '/src/pages/settings/settings';
import PageTransitionWrapper from '/src/components/PageTransition/PageTransition.jsx';
import Login from '/src/pages/auth/login.jsx'; 
import Signup from '/src/pages/auth/signup.jsx'; // Assuming you have a Signup component

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* 🔐 Login route outside of layout */}
        
        <Route path="/login" element={
          <PageTransitionWrapper><Login /></PageTransitionWrapper>
        } />

        <Route path="/signup" element={
          <PageTransitionWrapper><Signup /></PageTransitionWrapper>
        } />

        {/* 👇 Protected routes wrapped in Layout */}
        <Route path="/" element={<Layout />}>
          <Route index element={<PageTransitionWrapper><Dashboard /></PageTransitionWrapper>} />
          <Route path="users" element={<PageTransitionWrapper><UserManagement /></PageTransitionWrapper>} />
          <Route path="verification" element={<PageTransitionWrapper><IDVerification /></PageTransitionWrapper>} />
          <Route path="schedules" element={<PageTransitionWrapper><TripSchedules /></PageTransitionWrapper>} />
          <Route path="bookings" element={<PageTransitionWrapper><Bookings /></PageTransitionWrapper>} />
          <Route path="sos" element={<PageTransitionWrapper><SOSRequest /></PageTransitionWrapper>} />
          <Route path="payments" element={<PageTransitionWrapper><PaymentTransactions /></PageTransitionWrapper>} />
          <Route path="settings" element={<PageTransitionWrapper><Settings /></PageTransitionWrapper>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
