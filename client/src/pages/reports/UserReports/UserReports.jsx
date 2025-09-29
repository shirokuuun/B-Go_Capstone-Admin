import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from 'xlsx';
import { fetchUsersForReports, formatUserForDisplay, getUserStats } from "./UserReports.js";
import { logActivity, ACTIVITY_TYPES } from '/src/pages/settings/auditService.js';
import "./UserReports.css";
import { PiMicrosoftExcelLogoFill } from "react-icons/pi";

const UserReports = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({});
  
  // Filter states
  const [emailVerifiedFilter, setEmailVerifiedFilter] = useState('');
  const [idVerificationFilter, setIdVerificationFilter] = useState('');
  const [authMethodFilter, setAuthMethodFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Filter and search users
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const formattedUser = formatUserForDisplay(user);
      
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          formattedUser.name.toLowerCase().includes(searchLower) ||
          formattedUser.email.toLowerCase().includes(searchLower) ||
          (formattedUser.phone !== 'N/A' && formattedUser.phone.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }
      
      // Email verified filter
      if (emailVerifiedFilter) {
        if (emailVerifiedFilter === 'verified' && formattedUser.emailVerified !== 'Yes') return false;
        if (emailVerifiedFilter === 'not-verified' && formattedUser.emailVerified !== 'No') return false;
      }
      
      // ID verification filter
      if (idVerificationFilter) {
        if (idVerificationFilter !== formattedUser.idVerificationStatus) return false;
      }
      
      // Auth method filter
      if (authMethodFilter) {
        if (authMethodFilter !== formattedUser.authMethod) return false;
      }
      
      return true;
    });
  }, [users, searchTerm, emailVerifiedFilter, idVerificationFilter, authMethodFilter]);

  // Get unique auth methods for filter dropdown
  const uniqueAuthMethods = useMemo(() => {
    const methods = [...new Set(users.map(user => formatUserForDisplay(user).authMethod))];
    return methods.filter(method => method !== 'N/A').sort();
  }, [users]);

  // Excel export function
  const handleExportToExcel = async () => {
    try {
      const workbook = XLSX.utils.book_new();

      // Create summary data
      const filteredStats = getUserStats(filteredUsers);
      const summaryData = [
        ['B-Go Bus Transportation - User Report'],
        [''],
        ['Generated:', new Date().toLocaleString()],
        ['Total Users (Filtered):', filteredUsers.length],
        ['Total Users (All):', users.length],
        [''],
        ['STATISTICS'],
        ['Metric', 'Count', 'Percentage'],
        ['Email Verified', filteredStats.emailVerified, `${filteredStats.emailVerificationRate}%`],
        ['ID Verified', filteredStats.idVerified, `${filteredStats.idVerificationRate}%`],
        ['Recent Users (30 days)', filteredStats.recentUsers, `${filteredStats.total > 0 ? ((filteredStats.recentUsers / filteredStats.total) * 100).toFixed(1) : 0}%`],
        ['']
      ];

      // Create summary worksheet
      const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
      summaryWS['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }];
      summaryWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 2, r: 0 } }];
      XLSX.utils.book_append_sheet(workbook, summaryWS, 'Summary');

      // Create user data
      const userData = [
        ['User Details - Complete Report'],
        [''],
        ['Name', 'Email', 'Phone', 'Sign-in Method', 'Created At', 'Email Verified', 'ID Verification']
      ];

      filteredUsers.forEach(user => {
        const formattedUser = formatUserForDisplay(user);
        userData.push([
          formattedUser.name,
          formattedUser.email,
          formattedUser.phone,
          formattedUser.authMethod,
          formattedUser.createdAt,
          formattedUser.emailVerified,
          formattedUser.idVerificationStatus
        ]);
      });

      const userWS = XLSX.utils.aoa_to_sheet(userData);
      userWS['!cols'] = [
        { wch: 20 }, // Name
        { wch: 25 }, // Email
        { wch: 15 }, // Phone
        { wch: 15 }, // Auth Method
        { wch: 15 }, // Created At
        { wch: 15 }, // Email Verified
        { wch: 15 }  // ID Verification
      ];
      userWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 6, r: 0 } }];
      XLSX.utils.book_append_sheet(workbook, userWS, 'User Details');

      // Generate filename
      const filename = `User_Report_${new Date().toISOString().split('T')[0]}.xlsx`;

      // Save the file
      XLSX.writeFile(workbook, filename);

      // Log the export activity
      try {
        await logActivity(
          ACTIVITY_TYPES.DATA_EXPORT,
          `Exported User Report to Excel`,
          {
            filename,
            reportType: 'User Report',
            totalUsers: users.length,
            filteredUsers: filteredUsers.length,
            emailVerifiedCount: filteredStats.emailVerified,
            idVerifiedCount: filteredStats.idVerified,
            filters: {
              search: searchTerm || 'None',
              emailVerified: emailVerifiedFilter || 'All',
              idVerification: idVerificationFilter || 'All',
              authMethod: authMethodFilter || 'All'
            }
          },
          'info'
        );
      } catch (logError) {
        console.warn('Failed to log export activity:', logError);
      }

      console.log('Excel file exported successfully');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export to Excel. Please try again.');
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('');
    setEmailVerifiedFilter('');
    setIdVerificationFilter('');
    setAuthMethodFilter('');
  };

  // Refresh users data
  const handleRefresh = async () => {
    try {
      setLoading(true);
      const userData = await fetchUsersForReports();
      setUsers(userData);
      setStats(getUserStats(userData));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setLoading(true);
        const userData = await fetchUsersForReports();
        setUsers(userData);
        setStats(getUserStats(userData));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
  }, []);

  if (loading) return <div className="user-reports-loading">Loading users...</div>;
  if (error) return <div className="user-reports-error">Error: {error}</div>;

  return (
    <div className="user-reports-container">

      {/* Filters Section */}
      <div className="user-reports-filters">
        <div className="user-reports-filter-group">
          <label className="user-reports-filter-label">Search</label>
          <input
            type="text"
            placeholder="Search by name, email, or phone"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="user-reports-filter-input"
          />
        </div>

        <div className="user-reports-filter-group">
          <label className="user-reports-filter-label">Email Status</label>
          <select
            value={emailVerifiedFilter}
            onChange={(e) => setEmailVerifiedFilter(e.target.value)}
            className="user-reports-filter-select"
          >
            <option value="">All</option>
            <option value="verified">Verified</option>
            <option value="not-verified">Not Verified</option>
          </select>
        </div>

        <div className="user-reports-filter-group">
          <label className="user-reports-filter-label">ID Status</label>
          <select
            value={idVerificationFilter}
            onChange={(e) => setIdVerificationFilter(e.target.value)}
            className="user-reports-filter-select"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div className="user-reports-filter-group">
          <label className="user-reports-filter-label">Sign-in Method</label>
          <select
            value={authMethodFilter}
            onChange={(e) => setAuthMethodFilter(e.target.value)}
            className="user-reports-filter-select"
          >
            <option value="">All</option>
            {uniqueAuthMethods.map((method) => (
              <option key={method} value={method}>
                {method.charAt(0).toUpperCase() + method.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="user-reports-filter-group">
          <label className="user-reports-filter-label">&nbsp;</label>
          <button
            onClick={clearFilters}
            className="user-reports-filter-btn user-reports-clear-btn"
          >
            Clear Filters
          </button>
        </div>

        <div className="user-reports-filter-group">
          <label className="user-reports-filter-label">&nbsp;</label>
          <div className="user-reports-results-count">
            {filteredUsers.length} of {users.length} users
          </div>
        </div>
      </div>
      
      <div className="user-reports-stats-container">
        <div className="user-reports-header-pattern"></div>
        <div className="user-reports-stats-grid">
          <div className="user-reports-stat-card">
            <h3 className="user-reports-stat-title">Total Users</h3>
            <p className="user-reports-stat-value">{stats.total}</p>
          </div>
          <div className="user-reports-stat-card">
            <h3 className="user-reports-stat-title">Email Verified</h3>
            <p className="user-reports-stat-value">
              {stats.emailVerified} ({stats.emailVerificationRate}%)
            </p>
          </div>
          <div className="user-reports-stat-card">
            <h3 className="user-reports-stat-title">ID Verified</h3>
            <p className="user-reports-stat-value">
              {stats.idVerified} ({stats.idVerificationRate}%)
            </p>
          </div>
          <div className="user-reports-stat-card">
            <h3 className="user-reports-stat-title">Recent Users (30 days)</h3>
            <p className="user-reports-stat-value">{stats.recentUsers}</p>
          </div>
        </div>
      </div>

      {/* Controls Section */}
      <div className="user-reports-controls">
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="user-reports-refresh-btn"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
        <button
          onClick={handleExportToExcel}
          className="user-reports-export-btn"
          disabled={loading || filteredUsers.length === 0}
        >
          <PiMicrosoftExcelLogoFill size={16} /> Export to Excel
        </button>
      </div>

      <div className="user-reports-details-section">
        <h2 className="user-reports-details-title">User Details</h2>
        <div className="user-reports-table-container">
          <table className="user-reports-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Sign-in Method</th>
                <th>Created At</th>
                <th>Email Verified</th>
                <th>ID Verification</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const formattedUser = formatUserForDisplay(user);
                return (
                  <tr key={user.id}>
                    <td className="user-reports-name">{formattedUser.name}</td>
                    <td className="user-reports-email">{formattedUser.email}</td>
                    <td className="user-reports-phone">{formattedUser.phone}</td>
                    <td className="user-reports-auth-method">{formattedUser.authMethod}</td>
                    <td className="user-reports-date">{formattedUser.createdAt}</td>
                    <td className={formattedUser.emailVerified === 'Yes' ? 'user-reports-status-verified' : 'user-reports-status-not-verified'}>
                      {formattedUser.emailVerified}
                    </td>
                    <td className={`user-reports-verification-status ${
                      formattedUser.idVerificationStatus === 'verified'
                        ? 'user-reports-verification-verified'
                        : formattedUser.idVerificationStatus === 'rejected' || formattedUser.idVerificationStatus === 'revoked'
                        ? 'user-reports-verification-rejected'
                        : formattedUser.idVerificationStatus === 'No ID Uploaded'
                        ? 'user-reports-verification-no-id'
                        : 'user-reports-verification-pending'
                    }`}>
                      {formattedUser.idVerificationStatus}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserReports;