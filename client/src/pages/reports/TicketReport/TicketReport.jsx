import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Cell } from 'recharts';
import { 
  getTicketAnalyticsData,
  getDemandPatternsData,
  getRoutePerformanceData,
  getTicketTypeData,
  getAvailableTimeRanges,
  getAvailableRoutes
} from './TicketReport.js';
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
      
      if (timeRanges.length > 0) setSelectedTimeRange(timeRanges[0].value);
      if (routes.length > 0) setSelectedRoute(routes[0].value);
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
                <span className="ticket-card-icon">⏰</span>
                Demand Patterns
              </div>
            </div>
            <div className="ticket-card-content">
              <div className="ticket-patterns-section">
                <h4>Peak Hours Analysis</h4>
                <div className="ticket-peak-hours">
                  {analyticsData.demandPatterns.peakHours?.map((hour, index) => (
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
                  ))}
                </div>
              </div>

              <div className="ticket-patterns-section">
                <h4>Seasonal Trends</h4>
                <div className="ticket-seasonal-trends">
                  {analyticsData.demandPatterns.seasonalTrends?.map((trend, index) => (
                    <div key={index} className="ticket-trend-item">
                      <div className="ticket-trend-period">{trend.period}</div>
                      <div className="ticket-trend-change">
                        <TrendIndicator 
                          value={trend.change} 
                          isPositive={trend.indicator === 'up'} 
                        />
                      </div>
                      <div className="ticket-trend-indicator">
                        {trend.indicator === 'up' ? (
                          <span className="text-success">📈</span>
                        ) : (
                          <span className="text-danger">📉</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Route Performance Analysis */}
          <div className="ticket-card">
            <div className="ticket-card-header">
              <div className="ticket-card-title">
                <span className="ticket-card-icon">🚌</span>
                Route Performance Analysis
              </div>
            </div>
            <div className="ticket-card-content">
              <div className="ticket-routes-grid">
                {analyticsData.routePerformance.map((route, index) => (
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
                ))}
              </div>
            </div>
          </div>

          {/* Ticket Type Performance */}
          <div className="ticket-card">
            <div className="ticket-card-header">
              <div className="ticket-card-title">
                <span className="ticket-card-icon">📊</span>
                Ticket Type Performance
              </div>
            </div>
            <div className="ticket-card-content">
              <div className="ticket-types-grid">
                <div className="ticket-types-chart">
                  <div className="ticket-simple-chart">
                    <h4>Market Share Distribution</h4>
                    {analyticsData.ticketTypes.map((type, index) => (
                      <div key={index} className="ticket-chart-bar">
                        <div className="ticket-chart-label">{type.type}</div>
                        <div className="ticket-chart-progress">
                          <div 
                            className="ticket-chart-fill" 
                            style={{ 
                              width: `${type.marketShare}%`,
                              backgroundColor: CHART_COLORS[index % CHART_COLORS.length]
                            }}
                          ></div>
                        </div>
                        <div className="ticket-chart-value">{type.marketShare}%</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ticket-types-breakdown">
                  {analyticsData.ticketTypes.map((type, index) => (
                    <div key={index} className="ticket-type-item">
                      <div className="ticket-type-header">
                        <div 
                          className="ticket-type-color" 
                          style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                        ></div>
                        <div className="ticket-type-name">{type.type}</div>
                        <div className="ticket-type-share">{type.marketShare}%</div>
                      </div>
                      
                      <div className="ticket-type-metrics">
                        <div className="ticket-type-growth">
                          <TrendIndicator value={type.growth} isPositive={type.growth > 0} />
                        </div>
                        <StatusBadge status={type.marginLevel?.toLowerCase()}>
                          {type.marginLevel} Margin
                        </StatusBadge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </>
      )}
    </div>
  );
};

export default TicketReport;