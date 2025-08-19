import React from 'react';
import * as XLSX from 'xlsx';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar, ResponsiveContainer } from 'recharts';
import { preparePieChartData } from './DailyRevenue.js'; 
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
  
  // Excel Export Function
  const handleExportExcel = () => {
    try {
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Generate filename with current date and selected month
      const currentDate = new Date().toISOString().split('T')[0];
      const monthName = formatMonthForDisplay(selectedMonth);
      const routeFilter = selectedRoute ? `_${selectedRoute.replace(/\s+/g, '_')}` : '';
      const ticketFilter = selectedTicketType ? `_${selectedTicketType}` : '';
      const filename = `Monthly_Revenue_${monthName}${routeFilter}${ticketFilter}_${currentDate}.xlsx`;

      // 1. Summary Sheet
      const summaryData = [
        ['B-Go Bus Transportation'],
        ['Monthly Revenue Report'],
        [''],
        ['Report Month', monthName],
        ['Trip Direction', selectedRoute || 'All Directions'],
        ['Ticket Type', selectedTicketType || 'All Tickets'],
        ['Generated', new Date().toLocaleString()],
        [''],
        ['SUMMARY METRICS'],
        ['Total Monthly Revenue', `₱${monthlyData.totalMonthlyRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`],
        ['Total Passengers', monthlyData.totalMonthlyPassengers || 0],
        ['Average Daily Revenue', `₱${monthlyData.averageDailyRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`],
        ['Monthly Growth', formatGrowthDisplay(monthlyData.monthlyGrowth)],
        [''],
        ['REVENUE BREAKDOWN'],
        ['Conductor Revenue', `₱${monthlyData.conductorMonthlyRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`],
        ['Pre-booking Revenue', `₱${monthlyData.preBookingMonthlyRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`],
        ['Pre-ticketing Revenue', `₱${monthlyData.preTicketingMonthlyRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`]
      ];

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      
      // Style the summary sheet
      summarySheet['!cols'] = [{ width: 25 }, { width: 30 }];
      
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

      // 2. Daily Breakdown Sheet
      if (monthlyData.dailyBreakdown && monthlyData.dailyBreakdown.length > 0) {
        const dailyData = [
          ['DAILY REVENUE BREAKDOWN'],
          ['Date', 'Total Revenue', 'Passengers', 'Conductor Revenue', 'Pre-booking Revenue', 'Pre-ticketing Revenue', 'Average Fare'],
          ...monthlyData.dailyBreakdown.map(day => [
            formatDateForBreakdown(day.date),
            `₱${day.totalRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`,
            day.totalPassengers || 0,
            `₱${day.conductorRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`,
            `₱${day.preBookingRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`,
            `₱${day.preTicketingRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`,
            `₱${day.averageFare?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`
          ])
        ];

        const dailySheet = XLSX.utils.aoa_to_sheet(dailyData);
        
        // Style the daily breakdown sheet
        dailySheet['!cols'] = [
          { width: 12 }, // Date
          { width: 15 }, // Total Revenue
          { width: 12 }, // Passengers
          { width: 18 }, // Conductor Revenue
          { width: 18 }, // Pre-booking Revenue
          { width: 18 }, // Pre-ticketing Revenue
          { width: 15 }  // Average Fare
        ];
        
        XLSX.utils.book_append_sheet(workbook, dailySheet, 'Daily Breakdown');
      }

      // 3. Top Routes Sheet (if available)
      const topRoutes = getTopRoutes(monthlyData.routeMonthlyData, 10);
      if (topRoutes && topRoutes.length > 0) {
        const routesData = [
          ['TOP ROUTES BY REVENUE'],
          ['Route', 'Revenue', 'Passengers', 'Average Fare'],
          ...topRoutes.map(route => [
            route.route,
            `₱${route.revenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`,
            route.passengers || 0,
            `₱${route.averageFare?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`
          ])
        ];

        const routesSheet = XLSX.utils.aoa_to_sheet(routesData);
        
        // Style the routes sheet
        routesSheet['!cols'] = [
          { width: 40 }, // Route
          { width: 15 }, // Revenue
          { width: 12 }, // Passengers
          { width: 15 }  // Average Fare
        ];
        
        XLSX.utils.book_append_sheet(workbook, routesSheet, 'Top Routes');
      }

      // Write and download the file
      XLSX.writeFile(workbook, filename);
      
      console.log('Monthly revenue Excel export completed successfully');
    } catch (error) {
      console.error('Error exporting monthly revenue to Excel:', error);
      alert('Error exporting data to Excel. Please try again.');
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
          onClick={handleExportExcel}
          className="revenue-export-btn"
          disabled={monthlyLoading}
        >
          📊 Export Excel
        </button>
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
      <div className="revenue-breakdown-section">
        <h3 className="revenue-breakdown-title">Daily Revenue Breakdown</h3>
        
        {hasData ? (
          <div className="revenue-monthly-table-container">
            <table className="revenue-monthly-table">
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
                {monthlyData.dailyBreakdown.map((day, index) => (
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

    </div>
  );
};

export default MonthlyRevenue;