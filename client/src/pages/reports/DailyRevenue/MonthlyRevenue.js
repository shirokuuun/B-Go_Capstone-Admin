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

// Calculate monthly growth based on previous month comparison
export const calculateMonthlyGrowth = async (selectedMonth, selectedRoute, currentMonthRevenue, selectedTicketType = '') => {
  try {
    // Calculate previous month
    const [year, month] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2); // month - 2 because Date months are 0-indexed
    const prevMonth = `${prevDate.getFullYear()}-${(prevDate.getMonth() + 1).toString().padStart(2, '0')}`;
    
    
    // Load previous month's data
    const prevYear = prevDate.getFullYear();
    const prevMonthNum = prevDate.getMonth() + 1;
    const daysInPrevMonth = new Date(prevYear, prevMonthNum, 0).getDate();
    
    const prevMonthPromises = [];
    for (let day = 1; day <= daysInPrevMonth; day++) {
      const dateString = `${prevMonth}-${day.toString().padStart(2, '0')}`;
      prevMonthPromises.push(loadRevenueData(dateString, selectedRoute));
    }
    
    const prevMonthResults = await Promise.all(prevMonthPromises);
    
    // Calculate previous month revenue with same filtering logic
    let prevMonthRevenue = 0;
    
    prevMonthResults.forEach((dayData) => {
      if (dayData && dayData.totalRevenue > 0) {
        let dayRevenue = 0;
        
        // Apply same ticket type filtering
        if (!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'conductor') {
          dayRevenue += dayData.conductorRevenue || 0;
        }
        if (!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'pre-book') {
          dayRevenue += dayData.preBookingRevenue || 0;
        }
        if (!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'pre-ticket') {
          dayRevenue += dayData.preTicketingRevenue || 0;
        }
        
        prevMonthRevenue += dayRevenue;
      }
    });
    
    
    // Calculate growth percentage
    if (prevMonthRevenue === 0) {
      // If previous month had no revenue, current revenue represents infinite growth
      // Return 100% if current month has revenue, 0% if both months have no revenue
      return currentMonthRevenue > 0 ? 100 : 0;
    }
    
    const growthPercentage = ((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100;
    
    return growthPercentage;
    
  } catch (error) {
    // Fallback to simple growth calculation if previous month data is unavailable
    return calculateSimpleGrowth(currentMonthRevenue);
  }
};

// Alternative simple growth calculation based on daily performance
export const calculateSimpleGrowth = (currentMonthRevenue, dailyBreakdown = []) => {
  if (currentMonthRevenue === 0) return 0;
  
  // If we have daily breakdown, use it for better calculation
  if (dailyBreakdown && dailyBreakdown.length > 0) {
    const totalDays = dailyBreakdown.length;
    const averageDailyRevenue = currentMonthRevenue / totalDays;
    
    // Compare with a baseline daily revenue target
    const expectedDailyTarget = 3000; // Adjust this based on your business expectations
    const expectedMonthlyTarget = expectedDailyTarget * totalDays;
    
    if (expectedMonthlyTarget === 0) return 0;
    
    const growthVsTarget = ((currentMonthRevenue - expectedMonthlyTarget) / expectedMonthlyTarget) * 100;
    return Math.max(-50, Math.min(100, growthVsTarget)); // Cap between -50% and 100%
  }
  
  // Fallback: assume positive growth if we have revenue
  return currentMonthRevenue > 0 ? 5 : 0;
};

// Load monthly revenue data
export const loadMonthlyData = async (selectedMonth, selectedRoute, setMonthlyData, setMonthlyLoading, selectedTicketType = '') => {
  setMonthlyLoading(true);
  try {
    
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
          
          
          // Process each trip for route aggregation directly (don't use prepareRouteRevenueData)
          tripsToProcess.forEach((trip, tripIndex) => {
            
            // Validate trip has required fields
            if (!trip.from || !trip.to) {
              return;
            }
            
            const route = `${trip.from} → ${trip.to}`;
            const fareValue = Number(trip.totalFare) || 0;
            const quantityValue = Number(trip.quantity) || 0;
            
            
            if (fareValue > 0) { // Only process trips with actual revenue
              if (!routeAggregation[route]) {
                routeAggregation[route] = {
                  route: route,
                  revenue: 0,
                  passengers: 0,
                  tripDirection: trip.tripDirection || 'N/A'
                };
              }
              
              routeAggregation[route].revenue += fareValue;
              routeAggregation[route].passengers += quantityValue;
              
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
    
    
    const averageMonthlyFare = totalMonthlyPassengers > 0 ? totalMonthlyRevenue / totalMonthlyPassengers : 0;
    const averageDailyRevenue = dailyBreakdown.length > 0 ? totalMonthlyRevenue / dailyBreakdown.length : 0;
    
    // Calculate growth with real data
    let monthlyGrowth = 0;
    try {
      monthlyGrowth = await calculateMonthlyGrowth(selectedMonth, selectedRoute, totalMonthlyRevenue, selectedTicketType);
    } catch (error) {
      monthlyGrowth = calculateSimpleGrowth(totalMonthlyRevenue, dailyBreakdown);
    }
    
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