import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Layout from "/src/components/layout/layout.jsx";
import Dashboard from "/src/pages/dashboard/dashboard.jsx";
import IDVerification from "/src/pages/verification/IDVerification.jsx";
import TripSchedules from "./pages/schedules/TripSchedules.jsx";
import Ticketing from "/src/pages/ticketing/ticketing.jsx";
import SOSRequest from "/src/pages/SOS/SOSRequest.jsx";
import PaymentTransactions from "/src/pages/payments/PaymentTransactions.jsx";
import Settings from "/src/pages/settings/settings.jsx";
import UserManagement from "/src/pages/UserManagement/UserManagement.jsx";
import PageTransitionWrapper from "/src/components/PageTransition/PageTransition.jsx";
import Login from "/src/pages/auth/login.jsx";
import Signup from "/src/pages/auth/signup.jsx";
import Conductor from "/src/pages/conductor/conductor.jsx";

// Reports components
import DailyRevenue from "./pages/reports/DailyRevenue/DailyRevenue.jsx";
import SOSReport from "./pages/reports/SOSReport/SOSReport.jsx";
import TicketReport from "./pages/reports/TicketReport/TicketReport.jsx";
import UserReports from "./pages/reports/UserReports/UserReports.jsx";


createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* 🔐 Default redirect to /login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* 🔐 Login and Signup routes */}
        <Route
          path="/login"
          element={
            <PageTransitionWrapper>
              <Login />
            </PageTransitionWrapper>
          }
        />
        <Route
          path="/signup"
          element={
            <PageTransitionWrapper>
              <Signup />
            </PageTransitionWrapper>
          }
        />


        {/* 🛡️ Protected Routes (inside Layout) */}
        <Route path="/admin" element={<Layout />}>
          <Route
            index
            element={
              <PageTransitionWrapper>
                <Dashboard />
              </PageTransitionWrapper>
            }
          />
          <Route
            path="conductor"
            element={
              <PageTransitionWrapper>
                <Conductor />
              </PageTransitionWrapper>
            }
          />
          <Route
            path="user"
            element={
              <PageTransitionWrapper>
                <UserManagement />
              </PageTransitionWrapper>
            }
          />
          <Route
            path="verification"
            element={
              <PageTransitionWrapper>
                <IDVerification />
              </PageTransitionWrapper>
            }
          />
          <Route
            path="schedules"
            element={
              <PageTransitionWrapper>
                <TripSchedules />
              </PageTransitionWrapper>
            }
          />

          {/* Ticketing route */}
          <Route
            path="ticketing"
            element={
              <PageTransitionWrapper>
                <Ticketing />
              </PageTransitionWrapper>
            }
          />

          {/* Handle legacy ticketing routes */}
          <Route
            path="ticketing/pre-booking"
            element={<Navigate to="/admin/ticketing" replace />}
          />
          <Route
            path="ticketing/pre-ticketing"
            element={<Navigate to="/admin/ticketing" replace />}
          />

          {/* Handle legacy bookings route */}
          <Route
            path="bookings"
            element={<Navigate to="/admin/ticketing" replace />}
          />

          <Route
            path="sos"
            element={
              <PageTransitionWrapper>
                <SOSRequest />
              </PageTransitionWrapper>
            }
          />

          {/* Reports routes */}
          <Route
            path="reports"
            element={<Navigate to="/admin/reports/daily-revenue" replace />}
          />
          <Route
            path="reports/daily-revenue"
            element={
              <PageTransitionWrapper>
                <DailyRevenue />
              </PageTransitionWrapper>
            }
          />
          <Route
            path="reports/sos-analytics"
            element={
              <PageTransitionWrapper>
                <SOSReport />
              </PageTransitionWrapper>
            }
          />
          <Route
            path="reports/ticket-report"
            element={
              <PageTransitionWrapper>
                <TicketReport />
              </PageTransitionWrapper>
            }
          />
          <Route
            path="reports/user-reports"
            element={
              <PageTransitionWrapper>
                <UserReports />
              </PageTransitionWrapper>
            }
          />

          <Route
            path="payments"
            element={
              <PageTransitionWrapper>
                <PaymentTransactions />
              </PageTransitionWrapper>
            }
          />
          <Route
            path="settings"
            element={
              <PageTransitionWrapper>
                <Settings />
              </PageTransitionWrapper>
            }
          />

        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
