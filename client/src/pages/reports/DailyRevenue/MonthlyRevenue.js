import {
  loadRevenueData,
  prepareRouteRevenueData,
  getAvailableDates
} from './DailyRevenue.js'; 
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '/src/firebase/firebase.js';

// MONTHLY REVENUE DATA CACHE SERVICE
class MonthlyRevenueDataCacheService {
  constructor() {
    this.listeners = new Map();
    this.maxListeners = 10;
    this.cleanupOnError = true;

    // IN-MEMORY CACHE SYSTEM
    this.monthlyCache = new Map(); // key: `${month}_${route}_${ticketType}`, value: monthly data
    this.lastFetchTime = new Map(); // Track fetch times per key
    this.isCacheListenerActive = false;
    this.cacheVersion = 1;
    this.currentCallbacks = new Map(); // Store callbacks for cache updates

    // Available months cache
    this.availableMonthsCache = null;
    this.monthsCacheTime = null;

    // Force cleanup on page load/refresh
    this.forceCleanup();
  }

  // Force cleanup method
  forceCleanup() {
    try {
      this.removeAllListeners();

      // Clear global listeners if they exist
      if (window.monthlyRevenueListeners) {
        window.monthlyRevenueListeners.forEach(unsubscribe => {
          try { unsubscribe(); } catch (e) {}
        });
        window.monthlyRevenueListeners = [];
      }
    } catch (error) {
      console.warn('Error during monthly revenue cache cleanup:', error);
    }
  }

  // Get monthly data with cache-first approach
  async getMonthlyData(selectedMonth, selectedRoute = null, selectedTicketType = '') {
    try {
      const cacheKey = this.getCacheKey(selectedMonth, selectedRoute, selectedTicketType);


      //Return cached data immediately if available and fresh
      if (this.monthlyCache.has(cacheKey) && this.isCacheFresh(cacheKey)) {
        return { ...this.monthlyCache.get(cacheKey), fromCache: true };
      }

      //Fetch fresh data
      const freshData = await this.fetchMonthlyDataFromFirestore(selectedMonth, selectedRoute, selectedTicketType);

      // Save to cache
      this.monthlyCache.set(cacheKey, freshData);
      this.lastFetchTime.set(cacheKey, Date.now());

      // Start listening for real-time changes if not already active
      if (!this.isCacheListenerActive) {
        this.startMonthlyDataListener();
      }

      return { ...freshData, fromCache: false };
    } catch (error) {
      console.error('Error fetching monthly data:', error);
      throw error;
    }
  }

  // Generate cache key from month, route, and ticket type
  getCacheKey(month, route, ticketType) {
    const monthKey = month || 'all_months';
    const routeKey = route && route.trim() !== '' ? route : 'all_routes';
    const typeKey = ticketType && ticketType.trim() !== '' ? ticketType : 'all_types';
    return `${monthKey}_${routeKey}_${typeKey}`;
  }

  // Check if cache is fresh (10 minutes for monthly data)
  isCacheFresh(cacheKey) {
    const lastFetch = this.lastFetchTime.get(cacheKey);
    if (!lastFetch) return false;
    const ageMinutes = (Date.now() - lastFetch) / (1000 * 60);
    return ageMinutes < 10; // Cache valid for 10 minutes (longer than daily)
  }

  // Fetch monthly data from Firestore 
  async fetchMonthlyDataFromFirestore(selectedMonth, selectedRoute, selectedTicketType) {

    // Get all dates in the selected month
    const year = parseInt(selectedMonth.split('-')[0]);   // "2024-01" → 2024
    const month = parseInt(selectedMonth.split('-')[1]);  // "2024-01" → 1
    const daysInMonth = new Date(year, month, 0).getDate(); // January 2024 = 31 days

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

          // Aggregate route data with filtering
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

          // Process each trip for route aggregation directly
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
      monthlyGrowth = await this.calculateMonthlyGrowth(selectedMonth, selectedRoute, totalMonthlyRevenue, selectedTicketType);
    } catch (error) {
      monthlyGrowth = this.calculateSimpleGrowth(totalMonthlyRevenue, dailyBreakdown);
    }

    const result = {
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


    return result;
  }

  // Start real-time cache updates listener
  startMonthlyDataListener() {
    if (this.isCacheListenerActive) {
      return; // Don't create duplicate listeners
    }

    // Listen to conductor collection for changes
    const conductorsRef = collection(db, 'conductors');

    const unsubscribe = onSnapshot(conductorsRef, async (snapshot) => {
      const changes = snapshot.docChanges();

      if (changes.length === 0) {
        return;
      }


      // For simplicity, invalidate all cache when any conductor data changes
      this.invalidateAllCache();

      // Notify active listeners about cache update
      this.notifyListenersOfCacheUpdate();
    }, (error) => {
      console.error('Error in monthly revenue cache listener:', error);
      this.isCacheListenerActive = false;
      this.listeners.delete('monthly_cache_listener');
    });

    this.listeners.set('monthly_cache_listener', unsubscribe);
    this.isCacheListenerActive = true;
  }

  // Notify active listeners about cache updates
  notifyListenersOfCacheUpdate() {
    this.currentCallbacks.forEach((callback, key) => {
      if (typeof callback === 'function') {
        // Debounce multiple rapid updates
        if (this.updateTimeouts && this.updateTimeouts.has(key)) {
          clearTimeout(this.updateTimeouts.get(key));
        }

        if (!this.updateTimeouts) {
          this.updateTimeouts = new Map();
        }

        const timeout = setTimeout(async () => {
          try {
            // Parse the key to get month, route, and ticket type
            const [month, route, ticketType] = key.split('_callback_')[1].split('_');
            const actualMonth = month === 'all-months' ? null : month;
            const actualRoute = route === 'all-routes' ? null : route;
            const actualTicketType = ticketType === 'all-types' ? '' : ticketType;

            // Fetch fresh data and call the callback
            const freshData = await this.getMonthlyData(actualMonth, actualRoute, actualTicketType);
            callback(freshData);
          } catch (error) {
            console.error('Error in monthly cache update callback:', error);
          }
          this.updateTimeouts.delete(key);
        }, 200); // Slightly longer debounce for monthly data

        this.updateTimeouts.set(key, timeout);
      }
    });
  }

  // Cache management methods
  invalidateAllCache() {
    this.monthlyCache.clear();
    this.lastFetchTime.clear();
    this.availableMonthsCache = null;
    this.monthsCacheTime = null;
  }

  invalidateCache(month, route, ticketType) {
    const cacheKey = this.getCacheKey(month, route, ticketType);
    this.monthlyCache.delete(cacheKey);
    this.lastFetchTime.delete(cacheKey);
  }

  // Force refresh cache
  async forceRefreshCache(month, route, ticketType) {
    this.invalidateCache(month, route, ticketType);
    return await this.getMonthlyData(month, route, ticketType);
  }

  // Setup real-time listener for monthly data
  setupMonthlyDataListener(month, route, ticketType, callback) {
    const listenerKey = `monthly_callback_${this.getCacheKey(month, route, ticketType)}`;

    // Remove existing listener
    this.removeListener(listenerKey);

    // Store the callback
    this.currentCallbacks.set(listenerKey, callback);

    // If we have cached data, return it immediately
    const cacheKey = this.getCacheKey(month, route, ticketType);
    if (this.monthlyCache.has(cacheKey)) {
      setTimeout(() => {
        const cachedData = this.monthlyCache.get(cacheKey);
        if (cachedData && typeof callback === 'function') {
          callback({ ...cachedData, fromCache: true });
        }
      }, 0);
    } else {
      // If no cache, fetch data
      this.getMonthlyData(month, route, ticketType)
        .then(data => {
          if (typeof callback === 'function') {
            callback(data);
          }
        })
        .catch(error => {
          console.error('Error in monthly data listener:', error);
          if (typeof callback === 'function') {
            callback({ error: error.message });
          }
        });
    }

    // Create cleanup function
    const unsubscribe = () => {
      this.currentCallbacks.delete(listenerKey);
    };

    this.listeners.set(listenerKey, unsubscribe);
    return unsubscribe;
  }

  //  Get available months with caching
  async getAvailableMonths() {
    try {
      // Check if cache is fresh (15 minutes for months)
      if (this.availableMonthsCache && this.monthsCacheTime) {
        const ageMinutes = (Date.now() - this.monthsCacheTime) / (1000 * 60);
        if (ageMinutes < 15) {
          return this.availableMonthsCache;
        }
      }

      const dates = await getAvailableDates();
      const months = new Set();

      dates.forEach(date => {
        const monthString = date.slice(0, 7); // YYYY-MM
        months.add(monthString);
      });

      const sortedMonths = Array.from(months).sort((a, b) => new Date(b) - new Date(a));

      // Cache the results
      this.availableMonthsCache = sortedMonths;
      this.monthsCacheTime = Date.now();

      return sortedMonths;
    } catch (error) {
      console.error('Error fetching available months:', error);
      return this.availableMonthsCache || [];
    }
  }

  // Move calculateMonthlyGrowth to cache service
  async calculateMonthlyGrowth(selectedMonth, selectedRoute, currentMonthRevenue, selectedTicketType = '') {
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
        return currentMonthRevenue > 0 ? 100 : 0;
      }

      const growthPercentage = ((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100;
      return growthPercentage;

    } catch (error) {
      // Fallback to simple growth calculation if previous month data is unavailable
      return this.calculateSimpleGrowth(currentMonthRevenue);
    }
  }

  // Move calculateSimpleGrowth to cache service
  calculateSimpleGrowth(currentMonthRevenue, dailyBreakdown = []) {
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
  }

  getCacheInfo() {
    return {
      cacheSize: this.monthlyCache.size,
      isListenerActive: this.isCacheListenerActive,
      cachedKeys: Array.from(this.monthlyCache.keys()),
      availableMonthsCache: !!this.availableMonthsCache
    };
  }

  // Clean up listeners
  removeListener(key) {
    const unsubscribe = this.listeners.get(key);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(key);
    }
  }

  removeAllListeners() {
    this.listeners.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (error) {
        console.warn('Error cleaning up monthly listener:', error);
      }
    });
    this.listeners.clear();
    this.currentCallbacks.clear();
    this.isCacheListenerActive = false;
  }
}

// Create singleton instance
const monthlyRevenueDataCache = new MonthlyRevenueDataCacheService();

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

// Calculate monthly growth using cache service
export const calculateMonthlyGrowth = async (selectedMonth, selectedRoute, currentMonthRevenue, selectedTicketType = '') => {
  return await monthlyRevenueDataCache.calculateMonthlyGrowth(selectedMonth, selectedRoute, currentMonthRevenue, selectedTicketType);
};

//  Simple growth calculation using cache service
export const calculateSimpleGrowth = (currentMonthRevenue, dailyBreakdown = []) => {
  return monthlyRevenueDataCache.calculateSimpleGrowth(currentMonthRevenue, dailyBreakdown);
};

//Load monthly revenue data using cache-first approach
export const loadMonthlyData = async (selectedMonth, selectedRoute, setMonthlyData, setMonthlyLoading, selectedTicketType = '') => {
  setMonthlyLoading(true);
  try {
    const monthlyData = await monthlyRevenueDataCache.getMonthlyData(selectedMonth, selectedRoute, selectedTicketType);
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

//Load available months using cache-first approach
export const loadAvailableMonths = async (setAvailableMonths, setSelectedMonth, selectedMonth) => {
  try {
    const sortedMonths = await monthlyRevenueDataCache.getAvailableMonths();
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

//Setup real-time listener for monthly data updates
export const setupMonthlyDataListener = (month, route, ticketType, callback) => {
  return monthlyRevenueDataCache.setupMonthlyDataListener(month, route, ticketType, callback);
};

//Force refresh cache for specific monthly data
export const forceRefreshMonthlyCache = async (month, route, ticketType) => {
  return await monthlyRevenueDataCache.forceRefreshCache(month, route, ticketType);
};

// Get cache information for debugging
export const getMonthlyRevenueDataCacheInfo = () => {
  return monthlyRevenueDataCache.getCacheInfo();
};

// Remove all listeners on cleanup
export const removeAllMonthlyRevenueListeners = () => {
  monthlyRevenueDataCache.removeAllListeners();
};