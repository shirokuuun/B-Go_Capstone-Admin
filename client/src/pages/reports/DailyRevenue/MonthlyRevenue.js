// MonthlyRevenueLogic.js
// Pure JavaScript logic for monthly revenue functionality

import { 
  loadRevenueData, 
  prepareRouteRevenueData,
  getAvailableDates 
} from './DailyRevenue.js'; // Updated path to match your structure

// Initialize monthly data state structure
export const initializeMonthlyData = () => ({
  totalMonthlyRevenue: 0,
  totalMonthlyPassengers: 0,
  averageMonthlyFare: 0,
  conductorMonthlyRevenue: 0,
  preBookingMonthlyRevenue: 0,
  preTicketingMonthlyRevenue: 0,
  dailyBreakdown: [],
  routeMonthlyData: [],
  monthlyGrowth: 0,
  averageDailyRevenue: 0
});

// Get current month in YYYY-MM format
export const getCurrentMonth = () => {
  return new Date().toISOString().slice(0, 7);
};

// Load monthly revenue data
export const loadMonthlyData = async (selectedMonth, selectedRoute, setMonthlyData, setMonthlyLoading, selectedTicketType = '') => {
  setMonthlyLoading(true);
  try {
    console.log('🗓️ Loading monthly revenue data for:', selectedMonth, 'route:', selectedRoute, 'ticketType:', selectedTicketType);
    
    // Get all dates in the selected month
    const year = parseInt(selectedMonth.split('-')[0]);
    const month = parseInt(selectedMonth.split('-')[1]);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    const monthlyPromises = [];
    const dailyBreakdown = [];
    
    // Load data for each day in the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateString = `${selectedMonth}-${day.toString().padStart(2, '0')}`;
      monthlyPromises.push(loadRevenueData(dateString, selectedRoute));
    }
    
    const monthlyResults = await Promise.all(monthlyPromises);
    console.log('📊 Monthly results received:', monthlyResults.length, 'days of data');
    
    // Aggregate monthly data
    let totalMonthlyRevenue = 0;
    let totalMonthlyPassengers = 0;
    let conductorMonthlyRevenue = 0;
    let preBookingMonthlyRevenue = 0;
    let preTicketingMonthlyRevenue = 0;
    const routeAggregation = {};
    
    monthlyResults.forEach((dayData, index) => {
      const day = index + 1;
      const dateString = `${selectedMonth}-${day.toString().padStart(2, '0')}`;
      
      if (dayData && dayData.totalRevenue > 0) {
        console.log(`📅 Processing day ${day} with revenue: ${dayData.totalRevenue}`);
        
        // Apply ticket type filtering to daily data
        let dayRevenue = 0;
        let dayPassengers = 0;
        let dayConductorRevenue = 0;
        let dayPreBookingRevenue = 0;
        let dayPreTicketingRevenue = 0;

        // Filter based on selected ticket type
        if (!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'conductor') {
          dayConductorRevenue = dayData.conductorRevenue;
          dayRevenue += dayConductorRevenue;
          dayPassengers += dayData.conductorTrips?.reduce((sum, trip) => sum + (Number(trip.quantity) || 0), 0) || 0;
        }
        
        if (!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'pre-book') {
          dayPreBookingRevenue = dayData.preBookingRevenue;
          dayRevenue += dayPreBookingRevenue;
          dayPassengers += dayData.preBookingTrips?.reduce((sum, trip) => sum + (Number(trip.quantity) || 0), 0) || 0;
        }
        
        if (!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'pre-ticket') {
          dayPreTicketingRevenue = dayData.preTicketingRevenue;
          dayRevenue += dayPreTicketingRevenue;
          dayPassengers += dayData.preTicketing?.reduce((sum, trip) => sum + (Number(trip.quantity) || 0), 0) || 0;
        }

        // Only include day if it has revenue after filtering
        if (dayRevenue > 0) {
          totalMonthlyRevenue += dayRevenue;
          totalMonthlyPassengers += dayPassengers;
          conductorMonthlyRevenue += dayConductorRevenue;
          preBookingMonthlyRevenue += dayPreBookingRevenue;
          preTicketingMonthlyRevenue += dayPreTicketingRevenue;
          
          // Aggregate route data with filtering - Fix: Process all trips for route aggregation
          let tripsToProcess = [];
          
          if (!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'conductor') {
            tripsToProcess = tripsToProcess.concat(dayData.conductorTrips || []);
          }
          if (!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'pre-book') {
            tripsToProcess = tripsToProcess.concat(dayData.preBookingTrips || []);
          }
          if (!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'pre-ticket') {
            tripsToProcess = tripsToProcess.concat(dayData.preTicketing || []);
          }
          
          console.log(`📊 Processing ${tripsToProcess.length} trips for route aggregation on day ${day}`);
          
          // Process each trip for route aggregation directly (don't use prepareRouteRevenueData)
          tripsToProcess.forEach((trip, tripIndex) => {
            console.log(`🔍 Trip ${tripIndex + 1}:`, {
              from: trip.from,
              to: trip.to,
              totalFare: trip.totalFare,
              quantity: trip.quantity,
              tripDirection: trip.tripDirection,
              hasFromTo: !!(trip.from && trip.to)
            });
            
            // Validate trip has required fields
            if (!trip.from || !trip.to) {
              console.log(`❌ Skipping trip ${tripIndex + 1}: missing from (${trip.from}) or to (${trip.to})`);
              return;
            }
            
            const route = `${trip.from} → ${trip.to}`;
            const fareValue = Number(trip.totalFare) || 0;
            const quantityValue = Number(trip.quantity) || 0;
            
            console.log(`🚌 Processing trip: ${route}, fare: ${fareValue}, passengers: ${quantityValue}`);
            
            if (fareValue > 0) { // Only process trips with actual revenue
              if (!routeAggregation[route]) {
                routeAggregation[route] = {
                  route: route,
                  revenue: 0,
                  passengers: 0,
                  tripDirection: trip.tripDirection || 'N/A'
                };
                console.log(`🆕 Created new route: ${route}`);
              }
              
              routeAggregation[route].revenue += fareValue;
              routeAggregation[route].passengers += quantityValue;
              
              console.log(`📊 Route ${route} updated: revenue=${routeAggregation[route].revenue}, passengers=${routeAggregation[route].passengers}`);
            } else {
              console.log(`⚠️ Skipping trip with zero fare: ${route} (fare: ${fareValue})`);
            }
          });
          
          dailyBreakdown.push({
            date: dateString,
            day: day,
            totalRevenue: dayRevenue,
            totalPassengers: dayPassengers,
            conductorRevenue: dayConductorRevenue,
            preBookingRevenue: dayPreBookingRevenue,
            preTicketingRevenue: dayPreTicketingRevenue,
            averageFare: dayPassengers > 0 ? dayRevenue / dayPassengers : 0
          });
        }
      }
    });
    
    const routeMonthlyData = Object.values(routeAggregation)
      .filter(route => route.revenue > 0) // Only include routes with actual revenue
      .sort((a, b) => b.revenue - a.revenue);
    
    console.log('🎯 Final route aggregation details:', routeMonthlyData.map(route => ({
      route: route.route,
      revenue: route.revenue,
      passengers: route.passengers
    })));
    
    const averageMonthlyFare = totalMonthlyPassengers > 0 ? totalMonthlyRevenue / totalMonthlyPassengers : 0;
    const averageDailyRevenue = dailyBreakdown.length > 0 ? totalMonthlyRevenue / dailyBreakdown.length : 0;
    
    // Calculate growth (simplified for demo - you can enhance this with real previous month data)
    const monthlyGrowth = Math.random() * 20 - 10; // Random growth between -10% and +10%
    
    const monthlyData = {
      totalMonthlyRevenue,
      totalMonthlyPassengers,
      averageMonthlyFare,
      conductorMonthlyRevenue,
      preBookingMonthlyRevenue,
      preTicketingMonthlyRevenue,
      dailyBreakdown,
      routeMonthlyData,
      monthlyGrowth,
      averageDailyRevenue
    };
    
    console.log('🎯 Final monthly data:', monthlyData);
    setMonthlyData(monthlyData);
    return monthlyData;
    
  } catch (error) {
    console.error('Error loading monthly data:', error);
    setMonthlyData(initializeMonthlyData());
    throw error;
  } finally {
    setMonthlyLoading(false);
  }
};

// Load available months from available dates
export const loadAvailableMonths = async (setAvailableMonths, setSelectedMonth, selectedMonth) => {
  try {
    const dates = await getAvailableDates();
    const months = new Set();
    
    dates.forEach(date => {
      const monthString = date.slice(0, 7); // YYYY-MM
      months.add(monthString);
    });
    
    const sortedMonths = Array.from(months).sort((a, b) => new Date(b) - new Date(a));
    setAvailableMonths(sortedMonths);
    
    // Set current month as default if available and no month is selected
    if (sortedMonths.length > 0 && !selectedMonth) {
      setSelectedMonth(sortedMonths[0]);
    }
    
    return sortedMonths;
  } catch (error) {
    console.error('Error loading available months:', error);
    setAvailableMonths([]);
    return [];
  }
};

// Format month for display
export const formatMonthForDisplay = (monthString) => {
  if (!monthString) return '';
  return new Date(monthString + '-01').toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long' 
  });
};

// Format date for daily breakdown display
export const formatDateForBreakdown = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
};

// Check if growth is positive
export const isGrowthPositive = (growth) => {
  return growth >= 0;
};

// Format growth display
export const formatGrowthDisplay = (growth) => {
  const sign = growth >= 0 ? '+' : '';
  return `${sign}${growth.toFixed(1)}%`;
};

// Get growth CSS class
export const getGrowthCssClass = (growth) => {
  return growth >= 0 ? 'revenue-card-positive' : 'revenue-card-negative';
};

// Calculate chart data for line chart Y-axis formatting
export const formatChartValue = (value) => {
  return `₱${(value/1000).toFixed(0)}k`;
};

// Format tooltip for charts
export const formatChartTooltip = (value, formatCurrency) => {
  return formatCurrency(value);
};

// Format label for line chart
export const formatChartLabel = (day) => {
  return `Day ${day}`;
};

// Validate month selection
export const isValidMonth = (monthString) => {
  if (!monthString) return false;
  const regex = /^\d{4}-\d{2}$/;
  return regex.test(monthString);
};

// Get days in month
export const getDaysInMonth = (monthString) => {
  if (!isValidMonth(monthString)) return 0;
  const year = parseInt(monthString.split('-')[0]);
  const month = parseInt(monthString.split('-')[1]);
  return new Date(year, month, 0).getDate();
};

// Filter monthly data by ticket type
export const filterMonthlyDataByTicketType = (monthlyData, selectedTicketType) => {
  if (!selectedTicketType || selectedTicketType === '') {
    return monthlyData;
  }
  
  // This would be implemented based on your filtering requirements
  // For now, return the data as-is since filtering is handled at the day level
  return monthlyData;
};

// Generate month options for select dropdown
export const generateMonthOptions = (availableMonths) => {
  return availableMonths.map(month => ({
    value: month,
    label: formatMonthForDisplay(month)
  }));
};

// Check if monthly data has content
export const hasMonthlyData = (monthlyData) => {
  return monthlyData && monthlyData.dailyBreakdown && monthlyData.dailyBreakdown.length > 0;
};

// Get top routes for display (limit to specified number)
export const getTopRoutes = (routeMonthlyData, limit = 5) => {
  if (!routeMonthlyData || !Array.isArray(routeMonthlyData)) {
    return [];
  }
  return routeMonthlyData.slice(0, limit);
};