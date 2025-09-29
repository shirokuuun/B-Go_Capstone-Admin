import React from 'react';
import * as XLSX from 'xlsx';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar, ResponsiveContainer } from 'recharts';
import { preparePieChartData } from './DailyRevenue.js';
import { PiMicrosoftExcelLogoFill } from "react-icons/pi";
import { logActivity, ACTIVITY_TYPES } from '/src/pages/settings/auditService.js'; 
import {
  formatMonthForDisplay,
  formatDateForBreakdown,
  formatGrowthDisplay,
  getGrowthCssClass,
  formatChartValue,
  formatChartTooltip,
  formatChartLabel,
  generateMonthOptions,
  hasMonthlyData,
  getTopRoutes
} from './MonthlyRevenue.js';

const MonthlyRevenue = ({
  monthlyData,
  monthlyLoading,
  selectedMonth,
  selectedRoute,
  selectedTicketType,
  availableMonths,
  availableRoutes,
  formatCurrency,
  onMonthChange,
  onRouteChange,
  onTicketTypeChange,
  onRefresh
}) => {
  
  // Excel export function
  const handleExportToExcel = async () => {
    try {
      // Create a new workbook
      const workbook = XLSX.utils.book_new();

      // Create summary data
      const summaryData = [
        ['B-Go Bus Transportation - Monthly Revenue Report'],
        [''],
        ['Report Month:', formatMonthForDisplay(selectedMonth)],
        ['Route Filter:', selectedRoute || 'All Routes'],
        ['Ticket Type Filter:', selectedTicketType || 'All Types'],
        ['Generated:', new Date().toLocaleString()],
        [''],
        ['SUMMARY'],
        ['Metric', 'Value'],
        ['Total Monthly Revenue', `₱${monthlyData.totalMonthlyRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`],
        ['Total Passengers', monthlyData.totalMonthlyPassengers || 0],
        ['Average Daily Revenue', `₱${monthlyData.averageDailyRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`],
        ['Monthly Growth', formatGrowthDisplay(monthlyData.monthlyGrowth)],
        ['Conductor Revenue', `₱${monthlyData.conductorMonthlyRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`],
        ['Pre-booking Revenue', `₱${monthlyData.preBookingMonthlyRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`],
        ['Pre-ticketing Revenue', `₱${monthlyData.preTicketingMonthlyRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`],
        ['']
      ];

      // Create the summary worksheet
      const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
      
      // Set column widths
      summaryWS['!cols'] = [
        { wch: 25 }, // Column A
        { wch: 25 }  // Column B
      ];

      // Merge cells for title
      summaryWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 1, r: 0 } }];

      XLSX.utils.book_append_sheet(workbook, summaryWS, 'Summary');

      // Create daily breakdown sheet
      if (monthlyData.dailyBreakdown && monthlyData.dailyBreakdown.length > 0) {
        const dailyData = [
          ['Daily Revenue Breakdown'],
          [''],
          ['Date', 'Total Revenue', 'Passengers', 'Conductor Revenue', 'Pre-booking Revenue', 'Pre-ticketing Revenue', 'Average Fare']
        ];

        monthlyData.dailyBreakdown.forEach(day => {
          dailyData.push([
            formatDateForBreakdown(day.date),
            `₱${day.totalRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`,
            day.totalPassengers || 0,
            `₱${day.conductorRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`,
            `₱${day.preBookingRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`,
            `₱${day.preTicketingRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`,
            `₱${day.averageFare?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`
          ]);
        });

        const dailyWS = XLSX.utils.aoa_to_sheet(dailyData);

        // Set column widths
        dailyWS['!cols'] = [
          { wch: 12 }, // Date
          { wch: 15 }, // Total Revenue
          { wch: 12 }, // Passengers
          { wch: 18 }, // Conductor Revenue
          { wch: 18 }, // Pre-booking Revenue
          { wch: 18 }, // Pre-ticketing Revenue
          { wch: 15 }  // Average Fare
        ];

        // Merge title
        dailyWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 6, r: 0 } }];

        XLSX.utils.book_append_sheet(workbook, dailyWS, 'Daily Breakdown');
      }

      // Create top routes sheet
      const topRoutes = getTopRoutes(monthlyData.routeMonthlyData, 10);
      if (topRoutes && topRoutes.length > 0) {
        const routesData = [
          ['Top Routes by Revenue'],
          [''],
          ['Route', 'Revenue', 'Passengers']
        ];

        topRoutes.forEach(route => {
          routesData.push([
            route.route,
            `₱${route.revenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`,
            route.passengers || 0
          ]);
        });

        const routesWS = XLSX.utils.aoa_to_sheet(routesData);

        // Set column widths
        routesWS['!cols'] = [
          { wch: 30 }, // Route
          { wch: 15 }, // Revenue
          { wch: 12 }  // Passengers
        ];

        // Merge title
        routesWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 2, r: 0 } }];

        XLSX.utils.book_append_sheet(workbook, routesWS, 'Top Routes');
      }

      // Generate filename
      const monthStr = formatMonthForDisplay(selectedMonth).replace(/\s+/g, '_').replace(/,/g, '');
      const filename = `Monthly_Revenue_Report_${monthStr}_${new Date().toISOString().split('T')[0]}.xlsx`;

      // Save the file
      XLSX.writeFile(workbook, filename);

      // Log the export activity (don't let logging errors break the export)
      try {
        await logActivity(
          ACTIVITY_TYPES.DATA_EXPORT,
          `Exported Monthly Revenue report to Excel`,
          {
            filename,
            reportType: 'Monthly Revenue',
            monthFilter: formatMonthForDisplay(selectedMonth),
            routeFilter: selectedRoute || 'All Routes',
            ticketTypeFilter: selectedTicketType || 'All Types',
            totalRevenue: monthlyData.totalMonthlyRevenue,
            totalPassengers: monthlyData.totalMonthlyPassengers,
            averageDailyRevenue: monthlyData.averageDailyRevenue,
            monthlyGrowth: monthlyData.monthlyGrowth,
            daysCount: monthlyData.dailyBreakdown?.length || 0
          },
          'info'
        );
      } catch (logError) {
        console.warn('Failed to log export activity:', logError);
      }

      console.log('Monthly Excel file exported successfully');
    } catch (error) {
      console.error('Error exporting monthly report to Excel:', error);
      alert('Failed to export to Excel. Please try again.');
    }
  };
  
  if (monthlyLoading) {
    return (
      <div className="revenue-monthly-container">
        <div className="revenue-loading-state">
          <p>Loading monthly revenue data...</p>
        </div>
      </div>
    );
  }

  const monthOptions = generateMonthOptions(availableMonths);
  const topRoutes = getTopRoutes(monthlyData.routeMonthlyData, 10);
  const hasData = hasMonthlyData(monthlyData);

  return (
    <div className="revenue-monthly-container">
      {/* Print Header - Only visible when printing */}
      <div className="revenue-print-header">
        <div className="revenue-company-info">
          <h1>B-Go Bus Transportation</h1>
          <p>Monthly Revenue Report</p>
        </div>
        <div className="revenue-report-info">
          <p><strong>Report Month:</strong> {formatMonthForDisplay(selectedMonth)}</p>
          {selectedRoute && <p><strong>Trip Direction:</strong> {selectedRoute}</p>}
          <p><strong>Generated:</strong> {new Date().toLocaleString()}</p>
        </div>
      </div>

        {/* Monthly Filters */}
      <div className="revenue-monthly-filters">
        <div className="revenue-filter-group">
          <label className="revenue-filter-label">Select Month</label>
          <select
            value={selectedMonth}
            onChange={(e) => onMonthChange(e.target.value)}
            className="revenue-filter-select"
          >
            <option value="">Select a month...</option>
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="revenue-filter-group">
          <label className="revenue-filter-label">Trip Direction</label>
          <select 
            value={selectedRoute}
            onChange={(e) => onRouteChange(e.target.value)}
            className="revenue-filter-select"
          >
            <option value="">All Trip Directions</option>
            {availableRoutes && availableRoutes.map((route) => (
              <option key={route} value={route}>
                {route}
              </option>
            ))}
          </select>
        </div>
        
        <div className="revenue-filter-group">
          <label className="revenue-filter-label">Ticket Type</label>
          <select 
            value={selectedTicketType}
            onChange={(e) => onTicketTypeChange(e.target.value)}
            className="revenue-filter-select"
          >
            <option value="">All Tickets</option>
            <option value="pre-ticket">Pre Ticket</option>
            <option value="pre-book">Pre Book</option>
            <option value="conductor">Conductor Ticket</option>
          </select>
        </div>

        {/* Clear Filters Button */}
        <div className="revenue-filter-group">
          <label className="revenue-filter-label">&nbsp;</label>
          <button 
            onClick={() => {
              onMonthChange('');
              onRouteChange('');
              onTicketTypeChange('');
            }}
            className="revenue-filter-btn"
            style={{ height: '42px' }}
          >
            Clear Filters
          </button>
        </div>
        
        {/* Results Count */}
        <div className="revenue-filter-group">
          <label className="revenue-filter-label">&nbsp;</label>
          <div className="revenue-results-count" style={{ 
            background: '#f8f9fa', 
            padding: '10px 12px', 
            borderRadius: '8px', 
            border: '2px solid #e1e8ed',
            fontSize: '14px',
            color: '#2c3e50',
            fontWeight: '600'
          }}>
            {(() => {
              if (monthlyData && monthlyData.dailyBreakdown) {
                const totalDays = monthlyData.dailyBreakdown.length;
                const totalPassengers = monthlyData.totalMonthlyPassengers || 0;
                return `${totalDays} days • ${totalPassengers} passengers`;
              }
              return 'Loading...';
            })()}
          </div>
        </div>
      </div>

      {/* Monthly Summary Cards */}
      <div className="revenue-daily-summary-card-container">
        <div className="revenue-daily-header-pattern"></div>
        <div className="revenue-summary-cards">
          <div className="revenue-summary-card">
            <h3 className="revenue-card-title">Total Monthly Revenue</h3>
            <p className="revenue-card-value revenue-card-revenue">
              {formatCurrency(monthlyData.totalMonthlyRevenue)}
            </p>
          </div>
          <div className="revenue-summary-card">
            <h3 className="revenue-card-title">Total Passengers</h3>
            <p className="revenue-card-value revenue-card-passengers">
              {monthlyData.totalMonthlyPassengers}
            </p>
          </div>
          <div className="revenue-summary-card">
            <h3 className="revenue-card-title">Average Daily Revenue</h3>
            <p className="revenue-card-value revenue-card-average">
              {formatCurrency(monthlyData.averageDailyRevenue)}
            </p>
          </div>
          <div className="revenue-summary-card">
            <h3 className="revenue-card-title">Monthly Growth</h3>
            <p className={`revenue-card-value ${getGrowthCssClass(monthlyData.monthlyGrowth)}`}>
              {formatGrowthDisplay(monthlyData.monthlyGrowth)}
            </p>
          </div>
        </div>
      </div>

      {/* Monthly Controls */}
      <div className="revenue-daily-controls">
        <button
          onClick={onRefresh}
          disabled={monthlyLoading}
          className="revenue-refresh-btn"
        >
          {monthlyLoading ? 'Loading...' : 'Refresh'}
        </button>
        <button
          onClick={handleExportToExcel}
          className="revenue-export-btn"
          disabled={monthlyLoading || !hasData}
        >
          <PiMicrosoftExcelLogoFill size={20} /> Export to Excel
        </button>
      </div>

      {/* Monthly Revenue Breakdown Summary for Print */}
      <div className="revenue-print-summary">
        <h3>Monthly Revenue Breakdown Summary</h3>
        <div className="revenue-breakdown-summary">
          {(!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'conductor') && (
            <div className="revenue-breakdown-item">
              <span className="revenue-breakdown-label">Conductor Trips Revenue:</span>
              <span className="revenue-breakdown-value">{formatCurrency(monthlyData.conductorMonthlyRevenue)}</span>
            </div>
          )}
          
          {(!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'pre-book') && (
            <div className="revenue-breakdown-item">
              <span className="revenue-breakdown-label">Pre-booking Revenue:</span>
              <span className="revenue-breakdown-value">{formatCurrency(monthlyData.preBookingMonthlyRevenue)}</span>
            </div>
          )}
          
          {(!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'pre-ticket') && (
            <div className="revenue-breakdown-item">
              <span className="revenue-breakdown-label">Pre-ticketing Revenue:</span>
              <span className="revenue-breakdown-value">{formatCurrency(monthlyData.preTicketingMonthlyRevenue)}</span>
            </div>
          )}
          
          <div className="revenue-breakdown-item revenue-breakdown-total">
            <span className="revenue-breakdown-label">Total Monthly Revenue:</span>
            <span className="revenue-breakdown-value">{formatCurrency(monthlyData.totalMonthlyRevenue)}</span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="revenue-charts-section">
        {/* Monthly Revenue Source Breakdown */}
        <div className="revenue-chart-container">
          <h3 className="revenue-chart-title">Monthly Revenue by Source</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={preparePieChartData(monthlyData.conductorMonthlyRevenue, monthlyData.preBookingMonthlyRevenue, monthlyData.preTicketingMonthlyRevenue)}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {preparePieChartData(monthlyData.conductorMonthlyRevenue, monthlyData.preBookingMonthlyRevenue, monthlyData.preTicketingMonthlyRevenue).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatChartTooltip(value, formatCurrency)} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Daily Revenue Trend */}
        <div className="revenue-chart-container">
          <h3 className="revenue-chart-title">Daily Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData.dailyBreakdown}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="day" 
                tickFormatter={(day) => `${day}`}
              />
              <YAxis tickFormatter={formatChartValue} />
              <Tooltip 
                formatter={(value) => formatChartTooltip(value, formatCurrency)}
                labelFormatter={formatChartLabel}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="totalRevenue" 
                stroke="#8884d8" 
                strokeWidth={2}
                name="Total Revenue"
              />
              <Line 
                type="monotone" 
                dataKey="conductorRevenue" 
                stroke="#82ca9d" 
                strokeWidth={1}
                name="Conductor Revenue"
              />
              <Line 
                type="monotone" 
                dataKey="preBookingRevenue" 
                stroke="#ffc658" 
                strokeWidth={1}
                name="Pre-booking Revenue"
              />
              <Line 
                type="monotone" 
                dataKey="preTicketingRevenue" 
                stroke="#ff7c7c" 
                strokeWidth={1}
                name="Pre-ticketing Revenue"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Routes for the Month */}
      <div className="revenue-chart-container revenue-routes-chart">
        <h3 className="revenue-chart-title">Top 5 Routes by Monthly Revenue</h3>
        {topRoutes && topRoutes.length > 0 ? (
          <div>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart 
                data={topRoutes.slice(0, 5)} 
                margin={{ top: 20, right: 30, left: 20, bottom: 120 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="route" 
                  angle={-45}
                  textAnchor="end"
                  height={120}
                  fontSize={10}
                  interval={0}
                  tick={{ fontSize: 10 }}
                />
                <YAxis 
                  tickFormatter={formatChartValue}
                  fontSize={11}
                />
                <Tooltip 
                  formatter={(value) => [formatChartTooltip(value, formatCurrency), 'Revenue']}
                  labelFormatter={(label) => `Route: ${label}`}
                />
                <Bar dataKey="revenue" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="revenue-empty-state">
            <h3>No route data available</h3>
            <p>No route revenue data found for the selected month{selectedRoute ? ` and trip direction: ${selectedRoute}` : ''}.</p>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
              Debug info: routeMonthlyData length = {monthlyData.routeMonthlyData ? monthlyData.routeMonthlyData.length : 'undefined'}
            </div>
          </div>
        )}
      </div>

      {/* Daily Breakdown Table */}
      <div className="revenue-breakdown-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
        <h3 className="revenue-breakdown-title">Daily Revenue Breakdown</h3>

        {hasData ? (
          <div className="revenue-table-container" style={{ width: '100%', display: 'flex', justifyContent: 'flex-start' }}>
            <table className="revenue-revenue-table revenue-detailed-breakdown-table daily-revenue-table" style={{ width: '100%', margin: '0' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Total Revenue</th>
                  <th>Passengers</th>
                  <th>Conductor</th>
                  <th>Pre-booking</th>
                  <th>Pre-ticketing </th>
                  <th>Avg Fare</th>
                </tr>
              </thead>
              <tbody>
                {[...monthlyData.dailyBreakdown]
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map((day, index) => (
                  <tr key={index}>
                    <td>{formatDateForBreakdown(day.date)}</td>
                    <td className="revenue-fare-amount">{formatCurrency(day.totalRevenue)}</td>
                    <td>{day.totalPassengers}</td>
                    <td className="revenue-fare-amount">{formatCurrency(day.conductorRevenue)}</td>
                    <td className="revenue-fare-amount">{formatCurrency(day.preBookingRevenue)}</td>
                    <td className="revenue-fare-amount">{formatCurrency(day.preTicketingRevenue)}</td>
                    <td className="revenue-fare-amount">{formatCurrency(day.averageFare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="revenue-empty-state">
            <h3>No data found</h3>
            <p>No revenue data available for the selected month{selectedRoute ? ` and trip direction: ${selectedRoute}` : ''}.</p>
          </div>
        )}
      </div>

      {/* Print Footer */}
      <div className="revenue-print-footer">
        <div className="revenue-footer-left">
          <p>This report was generated automatically by the B-Go Bus Transportation System</p>
        </div>
        <div className="revenue-footer-right">
          <p>Page 1 of 1</p>
        </div>
      </div>
    </div>
  );
};

export default MonthlyRevenue;