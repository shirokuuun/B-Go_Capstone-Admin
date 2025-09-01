import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Cell } from 'recharts';
import { 
  getTicketAnalyticsData,
  getDemandPatternsData,
  getRoutePerformanceData,
  getTicketTypeData,
  getAvailableTimeRanges,
  getAvailableRoutes
} from './TicketReport.js';
import { PiMicrosoftExcelLogoFill } from "react-icons/pi";
import { logActivity, ACTIVITY_TYPES } from "/src/pages/settings/auditService.js";
import './TicketReport.css';

const COLORS = {
  primary: '#007c91',
  success: '#28a745',
  warning: '#ffc107',
  danger: '#dc3545',
  info: '#17a2b8'
};

const CHART_COLORS = ['#007c91', '#28a745', '#ffc107', '#dc3545', '#17a2b8', '#6f42c1'];

const TicketReport = () => {
  const [selectedTimeRange, setSelectedTimeRange] = useState('last_30_days');
  const [selectedRoute, setSelectedRoute] = useState('all');
  const [selectedTicketType, setSelectedTicketType] = useState('');
  const [loading, setLoading] = useState(false);
  const [availableTimeRanges, setAvailableTimeRanges] = useState([]);
  const [availableRoutes, setAvailableRoutes] = useState([]);

  const [analyticsData, setAnalyticsData] = useState({
    demandPatterns: {},
    routePerformance: [],
    ticketTypes: []
  });

  useEffect(() => {
    initializeData();
  }, []);

  useEffect(() => {
    if (selectedTimeRange && selectedRoute) {
      loadAnalyticsData();
    }
  }, [selectedTimeRange, selectedRoute, selectedTicketType]);

  const initializeData = async () => {
    try {
      const timeRanges = await getAvailableTimeRanges();
      const routes = await getAvailableRoutes();
      
      setAvailableTimeRanges(timeRanges);
      setAvailableRoutes(routes);
    } catch (error) {
      console.error('Error initializing data:', error);
    }
  };

  const loadAnalyticsData = async () => {
    setLoading(true);
    try {
      const [demand, routes, tickets] = await Promise.all([
        getDemandPatternsData(selectedTimeRange, selectedRoute, selectedTicketType),
        getRoutePerformanceData(selectedTimeRange, selectedRoute, selectedTicketType),
        getTicketTypeData(selectedTimeRange, selectedRoute, selectedTicketType)
      ]);

      setAnalyticsData({
        demandPatterns: demand,
        routePerformance: routes,
        ticketTypes: tickets
      });

    } catch (error) {
      console.error('Error loading analytics data:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatusBadge = ({ status, children }) => (
    <span className={`ticket-status-badge ticket-status-${status}`}>
      {children}
    </span>
  );

  const TrendIndicator = ({ value, isPositive }) => (
    <span className={`ticket-trend-indicator ${isPositive ? 'positive' : 'negative'}`}>
      <span className="ticket-trend-arrow">{isPositive ? '↑' : '↓'}</span>
      {Math.abs(value)}%
    </span>
  );

  // Excel export function
  const handleExportToExcel = async () => {
    try {
      setLoading(true);
      
      // Get the main analytics data for summary
      const totalTickets = analyticsData.ticketTypes?.reduce((sum, type) => sum + (type.volume || 0), 0) || 0;
      const totalRev = analyticsData.ticketTypes?.reduce((sum, type) => sum + (type.revenue || 0), 0) || 0;
      
      const mainAnalyticsData = {
        // Count actual tickets sold from ticket types data
        totalTicketsSold: totalTickets,
        totalRevenue: totalRev,
        // Calculate weighted average ticket price based on volume
        averageTicketPrice: totalTickets > 0 ? Math.round((totalRev / totalTickets) * 100) / 100 : 0
      };
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();

      // Create summary data
      const summaryData = [
        ['B-Go Bus Transportation - Ticket Analytics Report'],
        [''],
        ['Report Parameters'],
        ['Time Period:', availableTimeRanges.find(t => t.value === selectedTimeRange)?.label || selectedTimeRange],
        ['Route Filter:', availableRoutes.find(r => r.value === selectedRoute)?.label || selectedRoute],
        ['Ticket Type Filter:', selectedTicketType || 'All Types'],
        ['Generated:', new Date().toLocaleString()],
        [''],
        ['SUMMARY METRICS'],
        ['Metric', 'Value'],
        ['Total Tickets Sold', mainAnalyticsData.totalTicketsSold],
        ['Total Revenue', `₱${mainAnalyticsData.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ['Revenue per Ticket Sold', `₱${mainAnalyticsData.averageTicketPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ['']
      ];

      // Create the summary worksheet
      const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
      
      // Set column widths for summary
      summaryWS['!cols'] = [
        { wch: 25 }, // Column A
        { wch: 25 }  // Column B
      ];

      // Merge cells for title
      summaryWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 1, r: 0 } }];

      XLSX.utils.book_append_sheet(workbook, summaryWS, 'Summary');

      // Create Peak Hours Analysis sheet
      if (analyticsData.demandPatterns.peakHours?.length > 0) {
        const peakHoursData = [
          ['Peak Hours Analysis'],
          [''],
          ['Time Slot', 'Demand Percentage', 'Tickets Count', 'Passengers']
        ];

        analyticsData.demandPatterns.peakHours.forEach(hour => {
          peakHoursData.push([
            hour.timeSlot,
            `${hour.demandPercentage}%`,
            hour.ticketsCount || 0,
            hour.passengers || 0
          ]);
        });

        const peakHoursWS = XLSX.utils.aoa_to_sheet(peakHoursData);
        
        peakHoursWS['!cols'] = [
          { wch: 20 }, // Time Slot
          { wch: 18 }, // Demand Percentage
          { wch: 15 }, // Tickets Count
          { wch: 15 }  // Passengers
        ];

        peakHoursWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 3, r: 0 } }];

        XLSX.utils.book_append_sheet(workbook, peakHoursWS, 'Peak Hours');
      }

      // Create Seasonal Trends sheet
      if (analyticsData.demandPatterns.seasonalTrends?.length > 0) {
        const seasonalData = [
          ['Daily Demand Analysis'],
          [''],
          ['Day of Week', 'Tickets Sold', 'Total Passengers', 'Details']
        ];

        analyticsData.demandPatterns.seasonalTrends.forEach(trend => {
          seasonalData.push([
            trend.period,
            trend.change, // This is ticket count, not percentage
            trend.reason?.split(', ')[1]?.replace(' passengers', '') || 'N/A', // Extract passenger count
            trend.reason || 'N/A'
          ]);
        });

        const seasonalWS = XLSX.utils.aoa_to_sheet(seasonalData);
        
        seasonalWS['!cols'] = [
          { wch: 15 }, // Day of Week
          { wch: 15 }, // Tickets Sold
          { wch: 18 }, // Total Passengers
          { wch: 25 }  // Details
        ];

        seasonalWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 3, r: 0 } }];

        XLSX.utils.book_append_sheet(workbook, seasonalWS, 'Daily Demand');
      }

      // Create Route Performance sheet
      if (analyticsData.routePerformance?.length > 0) {
        const routeData = [
          ['Route Performance Analysis'],
          [''],
          ['Route Name', 'Utilization %', 'Revenue per KM', 'Average Passengers']
        ];

        analyticsData.routePerformance.forEach(route => {
          routeData.push([
            route.routeName,
            `${route.utilization}%`,
            `₱${route.revenuePerKm}`,
            route.averagePassengers
          ]);
        });

        const routeWS = XLSX.utils.aoa_to_sheet(routeData);
        
        routeWS['!cols'] = [
          { wch: 25 }, // Route Name
          { wch: 15 }, // Utilization %
          { wch: 15 }, // Revenue per KM
          { wch: 18 }  // Average Passengers
        ];

        routeWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 3, r: 0 } }];

        XLSX.utils.book_append_sheet(workbook, routeWS, 'Route Performance');
      }

      // Create Ticket Type Performance sheet
      if (analyticsData.ticketTypes?.length > 0) {
        const ticketTypeData = [
          ['Ticket Type Performance Analysis'],
          [''],
          ['Ticket Type', 'Market Share %', 'Growth %', 'Margin Level', 'Average Price', 'Volume', 'Revenue', 'Customer Segment']
        ];

        analyticsData.ticketTypes.forEach(type => {
          ticketTypeData.push([
            type.type,
            `${type.marketShare}%`,
            `${type.growth}%`,
            type.marginLevel,
            `₱${type.averagePrice}`,
            type.volume,
            `₱${type.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            type.customerSegment
          ]);
        });

        const ticketTypeWS = XLSX.utils.aoa_to_sheet(ticketTypeData);
        
        ticketTypeWS['!cols'] = [
          { wch: 20 }, // Ticket Type
          { wch: 15 }, // Market Share %
          { wch: 12 }, // Growth %
          { wch: 15 }, // Margin Level
          { wch: 15 }, // Average Price
          { wch: 12 }, // Volume
          { wch: 15 }, // Revenue
          { wch: 20 }  // Customer Segment
        ];

        ticketTypeWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 7, r: 0 } }];

        XLSX.utils.book_append_sheet(workbook, ticketTypeWS, 'Ticket Types');
      }

      // Generate filename
      const timeRangeLabel = availableTimeRanges.find(t => t.value === selectedTimeRange)?.label || selectedTimeRange;
      const filename = `Ticket_Analytics_Report_${timeRangeLabel.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;

      // Save the file
      XLSX.writeFile(workbook, filename);

      // Log the export activity
      try {
        await logActivity(
          ACTIVITY_TYPES.DATA_EXPORT,
          `Exported Ticket Analytics report to Excel`,
          {
            exportType: 'Ticket Analytics Report',
            filename: filename,
            format: 'Excel (.xlsx)',
            timeRange: availableTimeRanges.find(t => t.value === selectedTimeRange)?.label || selectedTimeRange,
            routeFilter: availableRoutes.find(r => r.value === selectedRoute)?.label || selectedRoute,
            ticketTypeFilter: selectedTicketType || 'All Types',
            totalTicketsSold: mainAnalyticsData.totalTicketsSold,
            totalRevenue: mainAnalyticsData.totalRevenue,
            averageTicketPrice: mainAnalyticsData.averageTicketPrice,
            sheetsIncluded: [
              'Summary',
              ...(analyticsData.demandPatterns.peakHours?.length > 0 ? ['Peak Hours'] : []),
              ...(analyticsData.demandPatterns.seasonalTrends?.length > 0 ? ['Seasonal Trends'] : []),
              ...(analyticsData.routePerformance?.length > 0 ? ['Route Performance'] : []),
              ...(analyticsData.ticketTypes?.length > 0 ? ['Ticket Types'] : [])
            ],
            dataPoints: {
              peakHours: analyticsData.demandPatterns?.peakHours?.length || 0,
              seasonalTrends: analyticsData.demandPatterns?.seasonalTrends?.length || 0,
              routePerformance: analyticsData.routePerformance?.length || 0,
              ticketTypes: analyticsData.ticketTypes?.length || 0
            }
          },
          'info'
        );
      } catch (logError) {
        console.error('Error logging ticket analytics export activity:', logError);
      }

    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export to Excel. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ticket-analytics-container">
      {/* Filters Section */}
      <div className="ticket-filters">
        <div className="ticket-filter-group">
          <label className="ticket-filter-label">
            <span className="ticket-filter-icon"></span>
            Time Period
          </label>
          <select 
            className="ticket-filter-select"
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value)}
          >
            {availableTimeRanges.map(range => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ticket-filter-group">
          <label className="ticket-filter-label">
            <span className="ticket-filter-icon"></span>
            Trip Direction
          </label>
          <select 
            className="ticket-filter-select"
            value={selectedRoute}
            onChange={(e) => setSelectedRoute(e.target.value)}
          >
            {availableRoutes.map(route => (
              <option key={route.value} value={route.value}>
                {route.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ticket-filter-group">
          <label className="ticket-filter-label">
            <span className="ticket-filter-icon"></span>
            Ticket Type
          </label>
          <select 
            className="ticket-filter-select"
            value={selectedTicketType}
            onChange={(e) => setSelectedTicketType(e.target.value)}
          >
            <option value="">All Tickets</option>
            <option value="conductor">Conductor Ticket</option>
            <option value="pre-book">Pre Book</option>
            <option value="pre-ticket">Pre Ticket</option>
          </select>
        </div>

        {/* Clear Filters Button */}
        <div className="ticket-filter-group">
          <label className="ticket-filter-label">&nbsp;</label>
          <button 
            onClick={() => {
              setSelectedTimeRange(availableTimeRanges.length > 0 ? availableTimeRanges[0].value : 'last_30_days');
              setSelectedRoute(availableRoutes.length > 0 ? availableRoutes[0].value : 'all');
              setSelectedTicketType('');
            }}
            className="revenue-filter-btn"
            style={{ height: '42px' }}
          >
            Clear Filters
          </button>
        </div>
        
        {/* Results Count */}
        <div className="ticket-filter-group">
          <label className="ticket-filter-label">&nbsp;</label>
          <div className="ticket-results-count" style={{ 
            background: '#f8f9fa', 
            padding: '10px 12px', 
            borderRadius: '8px', 
            border: '2px solid #e1e8ed',
            fontSize: '14px',
            color: '#2c3e50',
            fontWeight: '600'
          }}>
            {(() => {
              if (loading) return 'Loading...';
              
              // Count total data points from analytics
              let totalRoutes = analyticsData.routePerformance?.length || 0;
              let totalTicketTypes = analyticsData.ticketTypes?.length || 0;
              let totalPeakHours = analyticsData.demandPatterns?.peakHours?.length || 0;
              
              return `${totalRoutes} routes • ${totalTicketTypes} ticket types`;
            })()}
          </div>
        </div>
      </div>

      {/* Export Controls */}
      <div className="ticket-controls">
        <button
          onClick={handleExportToExcel}
          className="ticket-export-btn"
          disabled={loading}
        >
          <PiMicrosoftExcelLogoFill size={16} /> Export to Excel
        </button>
      </div>

      {loading ? (
        <div className="ticket-loading-state">
          <div className="ticket-spinner"></div>
          <p>Loading analytics data...</p>
        </div>
      ) : (
        <>
          {/* Demand Patterns Card */}
          <div className="ticket-card">
            <div className="ticket-card-header">
              <div className="ticket-card-title">
                Demand Patterns
              </div>
            </div>
            <div className="ticket-card-content">
              <div className="ticket-patterns-section">
                <h4>Peak Hours Analysis</h4>
                <div className="ticket-peak-hours">
                  {analyticsData.demandPatterns.peakHours?.length > 0 ? (
                    analyticsData.demandPatterns.peakHours.map((hour, index) => (
                      <div key={index} className="ticket-peak-hour">
                        <div className="ticket-hour-time">{hour.timeSlot}</div>
                        <div className="ticket-hour-bar">
                          <div 
                            className="ticket-hour-fill" 
                            style={{ width: `${hour.demandPercentage}%` }}
                          ></div>
                        </div>
                        <div className="ticket-hour-percentage">{hour.demandPercentage}%</div>
                      </div>
                    ))
                  ) : (
                    <div className="ticket-empty-state">
                      <div className="ticket-empty-icon">📊</div>
                      <h3>No Peak Hours Data</h3>
                      <p>No peak hours data available for the selected filters.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="ticket-patterns-section">
                <h4>Top 3 Days by Ticket Count</h4>
                <div className="ticket-seasonal-trends">
                  {analyticsData.demandPatterns.seasonalTrends?.length > 0 ? (
                    analyticsData.demandPatterns.seasonalTrends.map((trend, index) => (
                      <div key={index} className="ticket-trend-item">
                        <div className="ticket-trend-period">{trend.period}</div>
                        <div className="ticket-trend-change">
                          <span className={`ticket-trend-indicator positive`}>
                            {trend.change}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="ticket-empty-state">
                      <div className="ticket-empty-icon">📈</div>
                      <h3>No Ticket Data</h3>
                      <p>No daily ticket data available for the selected filters.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Route Performance Analysis */}
          <div className="ticket-card">
            <div className="ticket-card-header">
              <div className="ticket-card-title">
                Route Performance Analysis
              </div>
            </div>
            <div className="ticket-card-content">
              <div className="ticket-routes-grid">
                {analyticsData.routePerformance?.length > 0 ? (
                  analyticsData.routePerformance.map((route, index) => (
                    <div key={index} className="ticket-route-card">
                      <div className="ticket-route-header">
                        <h4>{route.routeName}</h4>
                      </div>
                      
                      <div className="ticket-route-metrics">
                        <div className="ticket-route-metric">
                          <div className="ticket-metric-label">Utilization</div>
                          <div className="ticket-metric-value">{route.utilization}%</div>
                          <div className="ticket-metric-bar">
                            <div 
                              className="ticket-metric-fill" 
                              style={{ width: `${route.utilization}%` }}
                            ></div>
                          </div>
                        </div>

                        <div className="ticket-route-metric">
                          <div className="ticket-metric-label">Revenue/km</div>
                          <div className="ticket-metric-value">₱{route.revenuePerKm}</div>
                        </div>

                        <div className="ticket-route-metric">
                          <div className="ticket-metric-label">Average Load</div>
                          <div className="ticket-metric-value">{route.averagePassengers}/27 passengers</div>
                        </div>

                      </div>
                    </div>
                  ))
                ) : (
                  <div className="ticket-empty-state">
                    <div className="ticket-empty-icon">🚌</div>
                    <h3>No Route Performance Data</h3>
                    <p>No route performance data available for the selected filters.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Ticket Type Performance */}
          <div className="ticket-card">
            <div className="ticket-card-header">
              <div className="ticket-card-title">
                Ticket Type Performance
              </div>
            </div>
            <div className="ticket-card-content">
              {analyticsData.ticketTypes?.length > 0 ? (
                <div className="ticket-types-table-container">
                  <div className="ticket-types-table">
                    <div className="ticket-table-header">
                      <div className="ticket-table-cell ticket-header-cell">Ticket Type</div>
                      <div className="ticket-table-cell ticket-header-cell">Market Share</div>
                      <div className="ticket-table-cell ticket-header-cell">Growth</div>
                      <div className="ticket-table-cell ticket-header-cell">Margin Level</div>
                      <div className="ticket-table-cell ticket-header-cell">Average Price</div>
                      <div className="ticket-table-cell ticket-header-cell">Volume</div>
                      <div className="ticket-table-cell ticket-header-cell">Revenue</div>
                      <div className="ticket-table-cell ticket-header-cell">Customer Segment</div>
                    </div>
                    
                    {analyticsData.ticketTypes.map((type, index) => (
                      <div key={index} className="ticket-table-row">
                        <div className="ticket-table-cell ticket-type-cell">
                          <div 
                            className="ticket-type-indicator" 
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                          ></div>
                          {type.type}
                        </div>
                        <div className="ticket-table-cell">{type.marketShare}%</div>
                        <div className="ticket-table-cell">
                          <span className={`ticket-growth-indicator ${type.growth >= 0 ? 'positive' : 'negative'}`}>
                            {type.growth >= 0 ? '+' : ''}{type.growth}%
                          </span>
                        </div>
                        <div className="ticket-table-cell">
                          <StatusBadge status={type.marginLevel?.toLowerCase()}>
                            {type.marginLevel}
                          </StatusBadge>
                        </div>
                        <div className="ticket-table-cell">₱{type.averagePrice}</div>
                        <div className="ticket-table-cell">{type.volume}</div>
                        <div className="ticket-table-cell">₱{type.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="ticket-table-cell">{type.customerSegment}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="ticket-empty-state">
                  <div className="ticket-empty-icon">📊</div>
                  <h3>No Ticket Type Data</h3>
                  <p>No ticket type performance data available for the selected filters.</p>
                </div>
              )}
            </div>
          </div>

        </>
      )}
    </div>
  );
};

export default TicketReport;