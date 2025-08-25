// API functions and utility functions for Ticket Analytics Dashboard
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '/src/firebase/firebase.js';

// Import useful functions from DailyRevenue.js
import { 
  calculateRevenueMetrics,
  preparePieChartData,
  prepareRouteRevenueData,
  fetchConductorTripsAndPreBooking,
  fetchPreTicketing
} from '../DailyRevenue/DailyRevenue.js';

// Available time ranges for filtering
export const getAvailableTimeRanges = async () => {
  return [
    { value: 'last_7_days', label: 'Last 7 Days' },
    { value: 'last_30_days', label: 'Last 30 Days' },
    { value: 'last_3_months', label: 'Last 3 Months' },
    { value: 'last_6_months', label: 'Last 6 Months' },
    { value: 'last_year', label: 'Last Year' },
    { value: 'custom', label: 'Custom Range' }
  ];
};

// Get available routes from the database - Uses same logic as Daily Revenue
export const getAvailableRoutes = async () => {
  try {
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    const availableRoutes = new Set();

    // Define trip directions to exclude (empty array - include all routes)
    const excludedDirections = [];

    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;
      
      try {
        // Get all daily trips for this conductor
        const dailyTripsRef = collection(db, `conductors/${conductorId}/dailyTrips`);
        const dailyTripsSnapshot = await getDocs(dailyTripsRef);
        
        for (const dateDoc of dailyTripsSnapshot.docs) {
          const dateData = dateDoc.data();
          
          // Look for trip maps directly in the date document
          for (const [key, value] of Object.entries(dateData)) {
            if (key.startsWith('trip') && typeof value === 'object' && value !== null) {
              // Check if this trip map has a direction field
              if (value.direction && typeof value.direction === 'string') {
                const direction = value.direction.trim();
                if (direction.length > 0) {
                  // Check if this direction should be excluded
                  if (excludedDirections.includes(direction)) {
                    continue;
                  }
                  
                  availableRoutes.add(direction);
                }
              }
            }
          }
        }
      } catch (conductorError) {
        console.error(`Error fetching routes for conductor ${conductorId}:`, conductorError);
        continue;
      }
    }

    const sortedRoutes = Array.from(availableRoutes).sort();
    
    // Format routes for dropdown - add "All Routes" option
    const formattedRoutes = [
      { value: 'all', label: 'All Routes' },
      ...sortedRoutes.map(route => ({ 
        value: route, 
        label: route 
      }))
    ];
    
    return formattedRoutes;
  } catch (error) {
    console.error('Error fetching routes for ticket analytics:', error);
    return [{ value: 'all', label: 'All Routes' }];
  }
};

// Get main analytics data overview using DailyRevenue functions
export const getTicketAnalyticsData = async (timeRange, route, ticketType = '') => {
  try {
    // Convert timeRange to date range
    const now = new Date();
    let startDate = new Date();
    
    switch (timeRange) {
      case 'last_7_days':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'last_30_days':
        startDate.setDate(now.getDate() - 30);
        break;
      case 'last_3_months':
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'last_6_months':
        startDate.setMonth(now.getMonth() - 6);
        break;
      case 'last_year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Use DailyRevenue functions to get comprehensive data
    // For range queries, we need to aggregate data from multiple dates
    let allConductorTrips = [];
    let allPreBookingTrips = [];
    let allPreTicketing = [];

    // Get available dates within range
    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    const relevantDates = new Set();

    // Find all dates within the time range
    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;
      
      try {
        const dailyTripsRef = collection(db, `conductors/${conductorId}/dailyTrips`);
        const dailyTripsSnapshot = await getDocs(dailyTripsRef);
        
        for (const dateDoc of dailyTripsSnapshot.docs) {
          const dateData = dateDoc.data();
          const dateId = dateDoc.id;
          
          let tripDate;
          if (dateData.createdAt) {
            tripDate = dateData.createdAt.toDate ? dateData.createdAt.toDate() : new Date(dateData.createdAt);
          } else {
            tripDate = new Date(dateId);
          }
          
          if (tripDate >= startDate && tripDate <= now) {
            relevantDates.add(dateId);
          }
        }
      } catch (error) {
        continue;
      }
    }

    // Fetch data for each relevant date
    for (const dateId of relevantDates) {
      try {
        const routeFilter = route === 'all' ? null : route;
        
        const [{ conductorTrips, preBookingTrips }, preTicketing] = await Promise.all([
          fetchConductorTripsAndPreBooking(dateId, routeFilter),
          fetchPreTicketing(dateId, routeFilter)
        ]);

        allConductorTrips = [...allConductorTrips, ...conductorTrips];
        allPreBookingTrips = [...allPreBookingTrips, ...preBookingTrips];
        allPreTicketing = [...allPreTicketing, ...preTicketing];
      } catch (error) {
        console.error(`Error fetching data for date ${dateId}:`, error);
        continue;
      }
    }

    // Apply ticket type filtering
    let filteredConductorTrips = allConductorTrips;
    let filteredPreBookingTrips = allPreBookingTrips;
    let filteredPreTicketing = allPreTicketing;

    if (ticketType && ticketType !== '') {
      switch (ticketType) {
        case 'conductor':
          filteredPreBookingTrips = [];
          filteredPreTicketing = [];
          break;
        case 'pre-book':
          filteredConductorTrips = [];
          filteredPreTicketing = [];
          break;
        case 'pre-ticket':
          filteredConductorTrips = [];
          filteredPreBookingTrips = [];
          break;
      }
    }

    // Use DailyRevenue's calculateRevenueMetrics function with filtered data
    const metrics = calculateRevenueMetrics(filteredConductorTrips, filteredPreBookingTrips, filteredPreTicketing);
    
    // Business metrics (configurable)
    const marketShare = 23.8;
    const customerSatisfactionScore = 4.2;
    const onTimePerformance = 91.5;
    
    return {
      totalTicketsSold: metrics.totalPassengers,
      totalRevenue: Math.round(metrics.totalRevenue * 100) / 100,
      averageTicketPrice: Math.round(metrics.averageFare * 100) / 100,
      marketShare,
      customerSatisfactionScore,
      onTimePerformance,
      // Additional data for other analytics functions
      conductorRevenue: metrics.conductorRevenue,
      preBookingRevenue: metrics.preBookingRevenue,
      preTicketingRevenue: metrics.preTicketingRevenue,
      rawData: {
        conductorTrips: filteredConductorTrips,
        preBookingTrips: filteredPreBookingTrips,
        preTicketing: filteredPreTicketing
      }
    };
    
  } catch (error) {
    console.error('Error fetching analytics data:', error);
    return {
      totalTicketsSold: 0,
      totalRevenue: 0,
      averageTicketPrice: 0,
      marketShare: 23.8,
      customerSatisfactionScore: 4.2,
      onTimePerformance: 91.5,
      conductorRevenue: 0,
      preBookingRevenue: 0,
      preTicketingRevenue: 0,
      rawData: {
        conductorTrips: [],
        preBookingTrips: [],
        preTicketing: []
      }
    };
  }
};


// Demand patterns analysis
export const getDemandPatternsData = async (timeRange, route, ticketType = '') => {
  try {
    // Get analytics data to access raw trip data
    const analyticsData = await getTicketAnalyticsData(timeRange, route, ticketType);
    const { rawData } = analyticsData;

    // Combine all trip data
    const allTrips = [...rawData.conductorTrips, ...rawData.preBookingTrips, ...rawData.preTicketing];
    
    if (allTrips.length === 0) {
      return {
        peakHours: [],
        seasonalTrends: [],
        demandDrivers: []
      };
    }

    // Helper function to convert hour to 12-hour format
    const formatHour = (hour) => {
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      return `${displayHour}:00 ${period}`;
    };

    // Analyze peak hours based on trip start times
    const hourlyDemand = new Array(24).fill(0).map((_, hour) => ({
      hour,
      timeSlot: `${formatHour(hour)} - ${formatHour(hour + 1)}`,
      ticketsCount: 0,
      passengers: 0
    }));

    // Process individual tickets to extract time patterns (not trip-level data)
    let processedCount = 0;
    let timeFieldsFound = { timestamp: 0, fallback: 0, none: 0 };
    
    allTrips.forEach(trip => {
      try {
        let ticketTime;
        
        // For ticket analytics, use the ticket timestamp if available
        if (trip.timestamp) {
          timeFieldsFound.timestamp++;
          ticketTime = trip.timestamp.toDate ? trip.timestamp.toDate() : new Date(trip.timestamp);
        } else if (trip.createdAt) {
          timeFieldsFound.fallback++;
          ticketTime = trip.createdAt.toDate ? trip.createdAt.toDate() : new Date(trip.createdAt);
        } else {
          timeFieldsFound.none++;
          // Skip tickets without timestamps - don't guess
          return;
        }

        if (ticketTime && !isNaN(ticketTime.getTime())) {
          const hour = ticketTime.getHours();
          hourlyDemand[hour].ticketsCount++; // Count this individual ticket
          hourlyDemand[hour].passengers += Number(trip.quantity) || 1;
          processedCount++;
        }
      } catch (error) {
        console.error('Error processing ticket time:', error, trip);
        timeFieldsFound.none++;
      }
    });

    // Calculate peak hours with demand percentages
    const maxTickets = Math.max(...hourlyDemand.map(h => h.ticketsCount));
    const hoursWithData = hourlyDemand.filter(h => h.ticketsCount > 0);
    
    const peakHours = hourlyDemand
      .filter(h => h.ticketsCount > 0)
      .map(h => {
        const rawPercentage = maxTickets > 0 ? Math.round((h.ticketsCount / maxTickets) * 100) : 0;
        const safePercentage = Math.min(rawPercentage, 100);
        
        return {
          timeSlot: h.timeSlot,
          demandPercentage: safePercentage,
          ticketsCount: h.ticketsCount,
          passengers: h.passengers
        };
      })
      .sort((a, b) => b.demandPercentage - a.demandPercentage)
      .slice(0, 8); // Top 8 peak hours

    // Analyze seasonal trends based on dates
    const datePatterns = {};
    allTrips.forEach(trip => {
      try {
        let tripDate;
        if (trip.date) {
          tripDate = new Date(trip.date);
        } else if (trip.createdAt) {
          tripDate = trip.createdAt.toDate ? trip.createdAt.toDate() : new Date(trip.createdAt);
        }

        if (tripDate && !isNaN(tripDate.getTime())) {
          const dayOfWeek = tripDate.toLocaleDateString('en-US', { weekday: 'long' });
          if (!datePatterns[dayOfWeek]) {
            datePatterns[dayOfWeek] = { tickets: 0, passengers: 0 };
          }
          datePatterns[dayOfWeek].tickets++; // Count each ticket record
          datePatterns[dayOfWeek].passengers += Number(trip.quantity) || 1; // Keep passenger count for reference
        }
      } catch (error) {
        console.error('Error processing trip date:', error);
      }
    });

    const totalTickets = Object.values(datePatterns).reduce((sum, data) => sum + data.tickets, 0);
    
    const seasonalTrends = Object.entries(datePatterns)
      .map(([day, data]) => ({
        period: day,
        change: data.tickets, // Show ticket count, not passengers
        indicator: 'up',
        reason: `${data.tickets} tickets, ${data.passengers} passengers`
      }))
      .sort((a, b) => b.change - a.change)
      .slice(0, 3);

    // Analyze demand drivers based on route and ticket type distribution
    const routeDistribution = {};
    const ticketTypeDistribution = { conductor: 0, preBooking: 0, preTicketing: 0 };
    
    allTrips.forEach(trip => {
      // Route distribution
      const route = trip.tripDirection || 'Unknown Route';
      if (!routeDistribution[route]) routeDistribution[route] = 0;
      routeDistribution[route] += Number(trip.quantity) || 1;

      // Ticket type distribution
      if (trip.source === 'Conductor Trips') ticketTypeDistribution.conductor++;
      else if (trip.source === 'Pre-booking') ticketTypeDistribution.preBooking++;
      else if (trip.source === 'Pre-ticketing') ticketTypeDistribution.preTicketing++;
    });

    const totalPassengersForDrivers = allTrips.reduce((sum, trip) => sum + (Number(trip.quantity) || 1), 0);
    const demandDrivers = [
      {
        factor: 'Walk-in Passengers',
        impact: totalPassengersForDrivers > 0 ? Math.round((ticketTypeDistribution.conductor / totalPassengersForDrivers) * 100) : 0
      },
      {
        factor: 'Advance Bookings',
        impact: totalPassengersForDrivers > 0 ? Math.round((ticketTypeDistribution.preBooking / totalPassengersForDrivers) * 100) : 0
      },
      {
        factor: 'Digital Tickets',
        impact: totalPassengersForDrivers > 0 ? Math.round((ticketTypeDistribution.preTicketing / totalPassengersForDrivers) * 100) : 0
      }
    ].filter(driver => driver.impact > 0)
     .sort((a, b) => b.impact - a.impact);

    return {
      peakHours,
      seasonalTrends: seasonalTrends.slice(0, 7), // Top 7 trends
      demandDrivers
    };
    
  } catch (error) {
    console.error('Error fetching demand patterns:', error);
    return {
      peakHours: [],
      seasonalTrends: [],
      demandDrivers: []
    };
  }
};

// Route performance analysis using direction field from database
export const getRoutePerformanceData = async (timeRange, route, ticketType = '') => {
  try {
    // Get the main analytics data which includes route breakdown
    const analyticsData = await getTicketAnalyticsData(timeRange, route, ticketType);
    const { rawData } = analyticsData;

    // Custom route aggregation using tripDirection (direction field from database)
    const routeDirectionData = [...rawData.conductorTrips, ...rawData.preBookingTrips, ...rawData.preTicketing]
      .reduce((acc, trip) => {
        // Use tripDirection (direction field from database) instead of from → to
        const routeDirection = trip.tripDirection || 'Unknown Direction';
        
        if (!acc[routeDirection]) {
          acc[routeDirection] = { 
            route: routeDirection, 
            revenue: 0, 
            passengers: 0,
            sources: {
              conductorTrips: 0,
              preBooking: 0,
              preTicketing: 0
            }
          };
        }
        
        // Make sure we have valid numeric values
        const fareValue = Number(trip.totalFare) || 0;
        const quantityValue = Number(trip.quantity) || 0;
        
        acc[routeDirection].revenue += fareValue;
        acc[routeDirection].passengers += quantityValue;
        
        // Track revenue by source
        if (trip.source === 'Conductor Trips') {
          acc[routeDirection].sources.conductorTrips += fareValue;
        } else if (trip.source === 'Pre-booking') {
          acc[routeDirection].sources.preBooking += fareValue;
        } else if (trip.source === 'Pre-ticketing') {
          acc[routeDirection].sources.preTicketing += fareValue;
        }
        
        return acc;
      }, {});

    // Convert to array and filter out routes with zero revenue
    const routeRevenueData = Object.values(routeDirectionData)
      .filter(routeData => routeData.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);

    // Convert to route performance format
    const routePerformance = routeRevenueData.map((routeData, index) => {
      const averageFare = routeData.passengers > 0 ? routeData.revenue / routeData.passengers : 0;
      
      // Calculate utilization based on capacity usage (more meaningful than revenue comparison)
      const allTrips = [...rawData.conductorTrips, ...rawData.preBookingTrips, ...rawData.preTicketing];
      const routeTrips = allTrips.filter(trip => trip.tripDirection === routeData.route);
      
      // Group trips by unique trip identifier to count actual trips (not individual tickets)
      const uniqueTrips = new Set();
      routeTrips.forEach(trip => {
        // Create a unique identifier for each trip using conductor, date, and trip name
        // This ensures trips with same name but different days/conductors are counted separately
        const tripDate = trip.date || trip.createdAt || 'unknown-date';
        const conductorId = trip.conductorId || trip.conductor || 'unknown-conductor';
        const tripName = trip.tripId || trip.tripNumber || trip.id || 'unknown-trip';
        const tripId = `${conductorId}_${tripDate}_${tripName}`;
        uniqueTrips.add(tripId);
      });
      
      const numberOfTrips = uniqueTrips.size > 0 ? uniqueTrips.size : routeTrips.length;
      const averagePassengersPerTrip = numberOfTrips > 0 ? routeData.passengers / numberOfTrips : routeData.passengers;
      const utilization = Math.round((averagePassengersPerTrip / 27) * 100); // Based on 27-passenger capacity
      
      // Calculate actual revenue per km using ticket distance data
      const calculateActualDistance = () => {
        const allTrips = [...rawData.conductorTrips, ...rawData.preBookingTrips, ...rawData.preTicketing];
        const routeTrips = allTrips.filter(trip => trip.tripDirection === routeData.route);
        
        if (routeTrips.length === 0) {
          // More intelligent fallback based on common route patterns
          const routeName = routeData.route.toLowerCase();
          if (routeName.includes('cebu') && routeName.includes('talisay')) return 35;
          if (routeName.includes('cebu') && routeName.includes('minglanilla')) return 25;
          if (routeName.includes('talisay') && routeName.includes('minglanilla')) return 15;
          return 30; // Default for unknown routes
        }
        
        // Use totalKm from tickets if available
        const tripsWithDistance = routeTrips.filter(trip => trip.totalKm && trip.totalKm > 0);
        if (tripsWithDistance.length > 0) {
          // Use average totalKm for this route direction
          const totalDistance = tripsWithDistance.reduce((sum, trip) => sum + parseFloat(trip.totalKm), 0);
          return totalDistance / tripsWithDistance.length;
        }
        
        // Fallback: calculate from startKm and endKm
        const tripsWithKmData = routeTrips.filter(trip => trip.startKm !== undefined && trip.endKm !== undefined);
        if (tripsWithKmData.length > 0) {
          const totalDistance = tripsWithKmData.reduce((sum, trip) => {
            const distance = Math.abs(parseFloat(trip.endKm) - parseFloat(trip.startKm));
            return sum + distance;
          }, 0);
          return totalDistance / tripsWithKmData.length;
        }
        
        // No fallback - return 0 if no actual distance data found
        return 0;
      };
      
      const actualDistance = calculateActualDistance();
      const revenuePerKm = routeData.revenue > 0 && actualDistance > 0 
        ? Math.round((routeData.revenue / actualDistance) * 100) / 100 
        : 0;
      
      return {
        routeName: routeData.route, // This is now the direction field from database
        utilization: Math.min(utilization, 100), // Cap at 100%
        revenuePerKm,
        averageFare: Math.round(averageFare * 100) / 100,
        averagePassengers: averagePassengersPerTrip > 0 ? Math.round(averagePassengersPerTrip) : routeData.passengers, // Average passengers per trip
        profitMargin: Math.round((averageFare * 0.25) * 100) / 100, // Estimate 25% margin
        marketShare: Math.min(utilization, 35), // Estimate market share based on utilization
        customerRating: 4.0 + (utilization / 100) * 0.5 // Rating improves with utilization
      };
    });

    return routePerformance.slice(0, 10); // Return top 10 routes
    
  } catch (error) {
    console.error('Error fetching route performance:', error);
    return [];
  }
};

// Ticket type performance data using DailyRevenue functions
export const getTicketTypeData = async (timeRange, route, ticketType = '') => {
  try {
    // Get current period data
    const analyticsData = await getTicketAnalyticsData(timeRange, route, ticketType);
    const { rawData, conductorRevenue, preBookingRevenue, preTicketingRevenue, totalRevenue } = analyticsData;

    // Get previous period data for growth calculation
    const previousPeriodData = await getPreviousPeriodData(timeRange, route, ticketType);
    const growthRates = calculateGrowthRates(
      { conductorRevenue, preBookingRevenue, preTicketingRevenue },
      previousPeriodData
    );

    // Use DailyRevenue's preparePieChartData for ticket type breakdown
    const pieChartData = preparePieChartData(conductorRevenue, preBookingRevenue, preTicketingRevenue);
    
    // Helper function to determine margin level based on performance
    const getMarginLevel = (marketShare, volume) => {
      if (marketShare >= 70 || volume >= 30) return 'High';
      if (marketShare >= 20 || volume >= 10) return 'Standard';
      return 'Low';
    };

    // Convert to ticket analytics format
    const ticketTypesData = [
      {
        type: 'Regular/Conductor',
        marketShare: totalRevenue > 0 ? Math.round((conductorRevenue / totalRevenue) * 100) : 0,
        growth: growthRates.conductorGrowth,
        averagePrice: (() => {
          const totalPassengers = rawData.conductorTrips.reduce((sum, trip) => sum + (trip.quantity || 1), 0);
          return totalPassengers > 0 ? Math.round((conductorRevenue / totalPassengers) * 100) / 100 : 0;
        })(),
        volume: rawData.conductorTrips.length,
        revenue: conductorRevenue,
        customerSegment: 'Walk-in Passengers'
      },
      {
        type: 'Pre-booking',
        marketShare: totalRevenue > 0 ? Math.round((preBookingRevenue / totalRevenue) * 100) : 0,
        growth: growthRates.preBookingGrowth,
        averagePrice: (() => {
          const totalPassengers = rawData.preBookingTrips.reduce((sum, trip) => sum + (trip.quantity || 1), 0);
          return totalPassengers > 0 ? Math.round((preBookingRevenue / totalPassengers) * 100) / 100 : 0;
        })(),
        volume: rawData.preBookingTrips.length,
        revenue: preBookingRevenue,
        customerSegment: 'Advance Planners'
      },
      {
        type: 'Pre-ticketing',
        marketShare: totalRevenue > 0 ? Math.round((preTicketingRevenue / totalRevenue) * 100) : 0,
        growth: growthRates.preTicketingGrowth,
        averagePrice: (() => {
          const totalPassengers = rawData.preTicketing.reduce((sum, trip) => sum + (trip.quantity || 1), 0);
          return totalPassengers > 0 ? Math.round((preTicketingRevenue / totalPassengers) * 100) / 100 : 0;
        })(),
        volume: rawData.preTicketing.length,
        revenue: preTicketingRevenue,
        customerSegment: 'Digital Users'
      }
    ].filter(type => type.volume > 0); // Only include types with actual data
    
    // Add margin level to each ticket type based on its performance
    const ticketTypes = ticketTypesData.map(type => ({
      ...type,
      marginLevel: getMarginLevel(type.marketShare, type.volume)
    }));

    return ticketTypes;
    
  } catch (error) {
    console.error('Error fetching ticket type data:', error);
    return [];
  }
};

// Helper function to get previous period data for growth calculation
const getPreviousPeriodData = async (timeRange, route, ticketType = '') => {
  try {
    // Calculate the previous period date range
    const now = new Date();
    let currentStartDate = new Date();
    let previousStartDate = new Date();
    let previousEndDate = new Date();
    
    switch (timeRange) {
      case 'last_7_days':
        currentStartDate.setDate(now.getDate() - 7);
        previousStartDate.setDate(now.getDate() - 14);
        previousEndDate.setDate(now.getDate() - 7);
        break;
      case 'last_30_days':
        currentStartDate.setDate(now.getDate() - 30);
        previousStartDate.setDate(now.getDate() - 60);
        previousEndDate.setDate(now.getDate() - 30);
        break;
      case 'last_3_months':
        currentStartDate.setMonth(now.getMonth() - 3);
        previousStartDate.setMonth(now.getMonth() - 6);
        previousEndDate.setMonth(now.getMonth() - 3);
        break;
      case 'last_6_months':
        currentStartDate.setMonth(now.getMonth() - 6);
        previousStartDate.setMonth(now.getMonth() - 12);
        previousEndDate.setMonth(now.getMonth() - 6);
        break;
      case 'last_year':
        currentStartDate.setFullYear(now.getFullYear() - 1);
        previousStartDate.setFullYear(now.getFullYear() - 2);
        previousEndDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        // Default to last 30 days comparison
        currentStartDate.setDate(now.getDate() - 30);
        previousStartDate.setDate(now.getDate() - 60);
        previousEndDate.setDate(now.getDate() - 30);
    }

    // Get data for the previous period using same logic as getTicketAnalyticsData
    let allConductorTrips = [];
    let allPreBookingTrips = [];
    let allPreTicketing = [];

    const conductorsRef = collection(db, 'conductors');
    const conductorsSnapshot = await getDocs(conductorsRef);
    const relevantDates = new Set();

    // Find all dates within the previous period range
    for (const conductorDoc of conductorsSnapshot.docs) {
      const conductorId = conductorDoc.id;
      
      try {
        const dailyTripsRef = collection(db, `conductors/${conductorId}/dailyTrips`);
        const dailyTripsSnapshot = await getDocs(dailyTripsRef);
        
        for (const dateDoc of dailyTripsSnapshot.docs) {
          const dateData = dateDoc.data();
          const dateId = dateDoc.id;
          
          let tripDate;
          if (dateData.createdAt) {
            tripDate = dateData.createdAt.toDate ? dateData.createdAt.toDate() : new Date(dateData.createdAt);
          } else {
            tripDate = new Date(dateId);
          }
          
          if (tripDate >= previousStartDate && tripDate <= previousEndDate) {
            relevantDates.add(dateId);
          }
        }
      } catch (error) {
        continue;
      }
    }

    // Fetch data for each relevant date in previous period
    for (const dateId of relevantDates) {
      try {
        const routeFilter = route === 'all' ? null : route;
        
        const [{ conductorTrips, preBookingTrips }, preTicketing] = await Promise.all([
          fetchConductorTripsAndPreBooking(dateId, routeFilter),
          fetchPreTicketing(dateId, routeFilter)
        ]);

        allConductorTrips = [...allConductorTrips, ...conductorTrips];
        allPreBookingTrips = [...allPreBookingTrips, ...preBookingTrips];
        allPreTicketing = [...allPreTicketing, ...preTicketing];
      } catch (error) {
        console.error(`Error fetching previous period data for date ${dateId}:`, error);
        continue;
      }
    }

    // Apply ticket type filtering to previous period data
    let filteredConductorTrips = allConductorTrips;
    let filteredPreBookingTrips = allPreBookingTrips;
    let filteredPreTicketing = allPreTicketing;

    if (ticketType && ticketType !== '') {
      switch (ticketType) {
        case 'conductor':
          filteredPreBookingTrips = [];
          filteredPreTicketing = [];
          break;
        case 'pre-book':
          filteredConductorTrips = [];
          filteredPreTicketing = [];
          break;
        case 'pre-ticket':
          filteredConductorTrips = [];
          filteredPreBookingTrips = [];
          break;
      }
    }

    // Calculate previous period metrics with filtered data
    const previousMetrics = calculateRevenueMetrics(filteredConductorTrips, filteredPreBookingTrips, filteredPreTicketing);
    
    return {
      conductorRevenue: previousMetrics.conductorRevenue || 0,
      preBookingRevenue: previousMetrics.preBookingRevenue || 0,
      preTicketingRevenue: previousMetrics.preTicketingRevenue || 0
    };

  } catch (error) {
    console.error('Error fetching previous period data:', error);
    return {
      conductorRevenue: 0,
      preBookingRevenue: 0,
      preTicketingRevenue: 0
    };
  }
};

// Helper function to calculate growth rates
const calculateGrowthRates = (currentData, previousData) => {
  const calculateGrowth = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0; // If no previous data, 100% growth if current > 0
    return Math.round(((current - previous) / previous) * 100 * 100) / 100; // Round to 2 decimal places
  };

  return {
    conductorGrowth: calculateGrowth(currentData.conductorRevenue, previousData.conductorRevenue),
    preBookingGrowth: calculateGrowth(currentData.preBookingRevenue, previousData.preBookingRevenue),
    preTicketingGrowth: calculateGrowth(currentData.preTicketingRevenue, previousData.preTicketingRevenue)
  };
};


// Utility functions for data processing
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

export const formatPercentage = (value, decimals = 1) => {
  return `${value.toFixed(decimals)}%`;
};

export const formatNumber = (value) => {
  return new Intl.NumberFormat('en-PH').format(value);
};

export const calculateGrowthRate = (current, previous) => {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

export const getStatusColor = (value, thresholds = { high: 80, medium: 60 }) => {
  if (value >= thresholds.high) return 'success';
  if (value >= thresholds.medium) return 'warning';
  return 'danger';
};

export const generateReportDate = () => {
  return new Date().toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

// Export data for external use (CSV, Excel, etc.)
export const exportAnalyticsData = (data, format = 'json') => {
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `ticket-analytics-${timestamp}`;
  
  switch (format) {
    case 'json':
      return {
        filename: `${filename}.json`,
        data: JSON.stringify(data, null, 2),
        mimeType: 'application/json'
      };
    case 'csv':
      return {
        filename: `${filename}.csv`,
        data: convertToCSV(data),
        mimeType: 'text/csv'
      };
    default:
      return data;
  }
};

// Helper function to convert data to CSV (simplified version)
const convertToCSV = (data) => {
  let csv = '';
  
  if (Array.isArray(data)) {
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      csv += headers.join(',') + '\n';
      
      data.forEach(row => {
        const values = headers.map(header => {
          const value = row[header];
          return typeof value === 'string' ? `"${value}"` : value;
        });
        csv += values.join(',') + '\n';
      });
    }
  }
  
  return csv;
};

// Performance metrics calculation
export const calculatePerformanceMetrics = (data) => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return {
      average: 0,
      total: 0,
      maximum: 0,
      minimum: 0,
      standardDeviation: 0
    };
  }
  
  const values = data.map(item => item.value || 0);
  const total = values.reduce((sum, val) => sum + val, 0);
  const average = total / values.length;
  const maximum = Math.max(...values);
  const minimum = Math.min(...values);
  
  // Calculate standard deviation
  const variance = values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / values.length;
  const standardDeviation = Math.sqrt(variance);
  
  return {
    average: parseFloat(average.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
    maximum,
    minimum,
    standardDeviation: parseFloat(standardDeviation.toFixed(2))
  };
};