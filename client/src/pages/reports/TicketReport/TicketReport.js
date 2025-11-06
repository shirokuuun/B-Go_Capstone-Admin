import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '/src/firebase/firebase.js';

// Import useful functions from DailyRevenue.js
import {
  calculateRevenueMetrics,
  preparePieChartData,
  prepareRouteRevenueData,
  fetchConductorTripsAndPreBooking,
  fetchPreBookingFromNewPath,
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

// Get available routes from the database 
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

// Get main analytics data overview 
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
        console.error(`Error processing conductor ${conductorId}:`, error);
        continue;
      }
    }

    // Fetch data for each relevant date
    for (const dateId of relevantDates) {
      try {
        const routeFilter = route === 'all' ? null : route;

        const [{ conductorTrips }, preBookingTrips, preTicketing] = await Promise.all([
          fetchConductorTripsAndPreBooking(dateId, routeFilter),
          fetchPreBookingFromNewPath(dateId, routeFilter),
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
    
    // Business metrics
    const marketShare = 23.8;
    const customerSatisfactionScore = 4.2;
    const onTimePerformance = 91.5;
    
    const result = {
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

    return result;
    
  } catch (error) {
    console.error('=== ERROR in getTicketAnalyticsData ===', error);
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
    allTrips.forEach(trip => {
      try {
        let ticketTime;

        // For ticket analytics, use the ticket timestamp if available
        if (trip.timestamp) {
          ticketTime = trip.timestamp.toDate ? trip.timestamp.toDate() : new Date(trip.timestamp);
        } else if (trip.createdAt) {
          ticketTime = trip.createdAt.toDate ? trip.createdAt.toDate() : new Date(trip.createdAt);
        } else {
          // Skip tickets without timestamps - don't guess
          return;
        }

        if (ticketTime && !isNaN(ticketTime.getTime())) {
          const hour = ticketTime.getHours();
          hourlyDemand[hour].ticketsCount++; // Count this individual ticket
          hourlyDemand[hour].passengers += Number(trip.quantity) || 1;
        }
      } catch (error) {
        // Skip invalid timestamps
      }
    });

    // Calculate peak hours with demand percentages
    const maxTickets = Math.max(...hourlyDemand.map(h => h.ticketsCount));

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
        // Skip invalid trip dates
      }
    });

    const seasonalTrends = Object.entries(datePatterns)
      .map(([day, data]) => ({
        period: day,
        change: data.tickets, 
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
    console.error('=== ERROR in getDemandPatternsData ===', error);
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

    

    // totalTripsCount - The TOTAL number of trips across ALL routes
    // numberOfTrips - The number of trips for a SPECIFIC route 
    // Calculate total trips across all routes for percentage calculation
    const allTrips = [...rawData.conductorTrips, ...rawData.preBookingTrips, ...rawData.preTicketing];
    const allUniqueTrips = new Set();
    allTrips.forEach(trip => {
      if (trip.conductorId && trip.tripId) {
        const tripDate = trip.date || trip.createdAt || 'unknown-date';
        allUniqueTrips.add(`${trip.conductorId}_${tripDate}_${trip.tripId}`);
      }
    });
    const totalTripsCount = allUniqueTrips.size > 0 ? allUniqueTrips.size : allTrips.length;

    // Convert to route performance format
    const routePerformance = routeRevenueData.map((routeData, index) => {
      const averageFare = routeData.passengers > 0 ? routeData.revenue / routeData.passengers : 0;

      // Calculation for trip distribution
      //Trip Distribution = (Number of Trips for This Route ÷ Total Trips Across All Routes) × 100
      const routeTrips = allTrips.filter(trip => trip.tripDirection === routeData.route);

      // Group trips by unique trip identifier to count actual trips (not individual tickets)
      // Use the same logic as Daily Revenue Report for consistency
      const uniqueTrips = new Set();
      routeTrips.forEach(trip => {
        // Use same format as Daily Revenue Report: conductorId_date_tripId
        if (trip.conductorId && trip.tripId) {
          const tripDate = trip.date || trip.createdAt || 'unknown-date';
          uniqueTrips.add(`${trip.conductorId}_${tripDate}_${trip.tripId}`);
        }
      });

      const numberOfTrips = uniqueTrips.size > 0 ? uniqueTrips.size : routeTrips.length;

      // Average load calculation
      const averagePassengersPerTrip = numberOfTrips > 0 ? routeData.passengers / numberOfTrips : routeData.passengers;

      // Calculate trip distribution percentage (what % of all trips use this route)
      const tripDistributionPercentage = totalTripsCount > 0
        ? Math.round((numberOfTrips / totalTripsCount) * 100)
        : 0;

      // Calculation of revenue/km
      // Revenue/km = Total Revenue for Route ÷ Average Distance (in km)
      const calculateActualDistance = () => {
        const allTrips = [...rawData.conductorTrips, ...rawData.preBookingTrips, ...rawData.preTicketing];
        const routeTrips = allTrips.filter(trip => trip.tripDirection === routeData.route);

        // Use totalKm from tickets if available
        const tripsWithDistance = routeTrips.filter(trip => trip.totalKm && trip.totalKm > 0);
        if (tripsWithDistance.length > 0) {
          // Use average totalKm for this route direction
          const totalDistance = tripsWithDistance.reduce((sum, trip) => sum + parseFloat(trip.totalKm), 0);
          return totalDistance / tripsWithDistance.length;
        }

        // Calculate from startKm and endKm
        const tripsWithKmData = routeTrips.filter(trip => trip.startKm !== undefined && trip.endKm !== undefined);
        if (tripsWithKmData.length > 0) {
          const totalDistance = tripsWithKmData.reduce((sum, trip) => {
            const distance = Math.abs(parseFloat(trip.endKm) - parseFloat(trip.startKm));
            return sum + distance;
          }, 0);
          return totalDistance / tripsWithKmData.length;
        }


        return 0;
      };

      const actualDistance = calculateActualDistance();
      // calculate revenue per km
      //Revenue/km = Total Revenue for Route ÷ Average Distance (in km)
      const revenuePerKm = routeData.revenue > 0 && actualDistance > 0
        ? Math.round((routeData.revenue / actualDistance) * 100) / 100
        : 0;

      return {
        routeName: routeData.route, 
        tripCount: numberOfTrips,
        tripDistributionPercentage, 
        revenuePerKm,
        averageFare: Math.round(averageFare * 100) / 100,
        averagePassengers: averagePassengersPerTrip > 0 ? Math.round(averagePassengersPerTrip) : routeData.passengers //averagePassengersPerTrip = routeData.passengers ÷ numberOfTrips
      };
    });

    return routePerformance.slice(0, 10); 
    
  } catch (error) {
    console.error('Error fetching route performance:', error);
    return [];
  }
};

// Ticket type performance data 
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
    
    // Helper function to determine margin level based on business performance
    const getMarginLevel = (marketShare, volume, growth, averagePrice) => {
      // Calculate performance score based on multiple factors
      let score = 0;

      // Market share contribution (0-40 points)
      if (marketShare >= 70) score += 40;
      else if (marketShare >= 40) score += 30;
      else if (marketShare >= 20) score += 20;
      else if (marketShare >= 5) score += 10;

      // Growth rate contribution (0-30 points)
      if (growth >= 50) score += 30;
      else if (growth >= 20) score += 25;
      else if (growth >= 10) score += 20;
      else if (growth >= 5) score += 15;
      else if (growth >= 0) score += 10;

      // Volume contribution (0-20 points)
      if (volume >= 50) score += 20;
      else if (volume >= 20) score += 15;
      else if (volume >= 10) score += 10;
      else if (volume >= 5) score += 5;

      // Average price contribution (0-10 points)
      if (averagePrice >= 50) score += 10;
      else if (averagePrice >= 30) score += 8;
      else if (averagePrice >= 20) score += 5;

      // Determine margin level based on total score
      if (score >= 70) return 'High';
      if (score >= 40) return 'Standard';
      return 'Low';
    };

    // Convert to ticket analytics format
    // calculation depending on the ticket type
    const ticketTypesData = [
      {
        type: 'Regular/Conductor',
        marketShare: totalRevenue > 0 ? Math.round((conductorRevenue / totalRevenue) * 100) : 0,
        growth: growthRates.conductorGrowth,
        averagePrice: (() => {
          const tripCount = rawData.conductorTrips.length;
          return tripCount > 0 ? Math.round((conductorRevenue / tripCount) * 100) / 100 : 0;
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
          const tripCount = rawData.preBookingTrips.length;
          return tripCount > 0 ? Math.round((preBookingRevenue / tripCount) * 100) / 100 : 0;
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
          const tripCount = rawData.preTicketing.length;
          return tripCount > 0 ? Math.round((preTicketingRevenue / tripCount) * 100) / 100 : 0;
        })(),
        volume: rawData.preTicketing.length,
        revenue: preTicketingRevenue,
        customerSegment: 'Digital Users'
      }
    ].filter(type => type.volume > 0); 
    
    // Add margin level to each ticket type based on its performance
    const ticketTypes = ticketTypesData.map(type => ({
      ...type,
      marginLevel: getMarginLevel(type.marketShare, type.volume, type.growth, type.averagePrice)
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
        
        const [{ conductorTrips }, preBookingTrips, preTicketing] = await Promise.all([
          fetchConductorTripsAndPreBooking(dateId, routeFilter),
          fetchPreBookingFromNewPath(dateId, routeFilter),
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
// for the ticket type performance data
const calculateGrowthRates = (currentData, previousData) => {
  const calculateGrowth = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0; 
    return Math.round(((current - previous) / previous) * 100) / 100; 
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

// Helper function to convert data to CSV 
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

// Helper function to parse discount breakdown from ticket 
// used on the getDiscountRevenueData function
const parseTicketDiscountBreakdown = (ticket) => {
  const breakdown = {
    regular: 0,
    pwd: 0,
    senior: 0,
    student: 0
  };

  const quantity = ticket.quantity || 0;
  const discountBreakdown = ticket.discountBreakdown || [];
  const farePerPassenger = ticket.farePerPassenger || ticket.passengerFares || [];

  // Calculate REVENUE for each type using farePerPassenger array
  if (farePerPassenger.length > 0 && discountBreakdown.length > 0) {
    discountBreakdown.forEach((desc, index) => {
      if (index >= farePerPassenger.length) return;

      let fareType = 'regular';
      let fare = parseFloat(farePerPassenger[index]) || 0;

      if (typeof desc === 'string') {
        const lowerDesc = desc.toLowerCase();
        if (lowerDesc.includes('pwd')) {
          fareType = 'pwd';
        } else if (lowerDesc.includes('senior')) {
          fareType = 'senior';
        } else if (lowerDesc.includes('student')) {
          fareType = 'student';
        } else {
          fareType = 'regular';
        }
      } else if (typeof desc === 'object' && desc !== null) {
        const type = (desc.type || 'Regular').toLowerCase();
        if (desc.fare !== undefined) {
          fare = parseFloat(desc.fare) || 0;
        }
        if (type.includes('pwd')) {
          fareType = 'pwd';
        } else if (type.includes('senior')) {
          fareType = 'senior';
        } else if (type.includes('student')) {
          fareType = 'student';
        } else {
          fareType = 'regular';
        }
      }

      breakdown[fareType] += fare;
    });
  } else if (farePerPassenger.length > 0) {
    farePerPassenger.forEach(fare => {
      breakdown.regular += parseFloat(fare) || 0;
    });
  } else {
    const totalFare = parseFloat(ticket.totalFare || ticket.amount) || 0;
    breakdown.regular = totalFare;
  }

  return breakdown;
};

// Get discount revenue breakdown (Regular, Student, PWD, Senior)
// main function to get discount revenue data
export const getDiscountRevenueData = async (timeRange, route, ticketType = '') => {
  try {
    // Get analytics data to access raw trip data
    const analyticsData = await getTicketAnalyticsData(timeRange, route, ticketType);
    const { rawData } = analyticsData;

    // Combine all trip data
    const allTrips = [...rawData.conductorTrips, ...rawData.preBookingTrips, ...rawData.preTicketing];

    if (allTrips.length === 0) {
      return [];
    }

    // Initialize discount totals
    const discountTotals = {
      regular: { revenue: 0, passengers: 0 },
      pwd: { revenue: 0, passengers: 0 },
      senior: { revenue: 0, passengers: 0 },
      student: { revenue: 0, passengers: 0 }
    };

    // Process each ticket to extract discount breakdown
    allTrips.forEach(ticket => {
      const breakdown = parseTicketDiscountBreakdown(ticket);

      // Count passengers for each type from discountBreakdown
      const discountBreakdown = ticket.discountBreakdown || [];
      const passengerCounts = { regular: 0, pwd: 0, senior: 0, student: 0 };

      if (discountBreakdown.length > 0) {
        discountBreakdown.forEach(desc => {
          let fareType = 'regular';
          if (typeof desc === 'string') {
            const lowerDesc = desc.toLowerCase();
            if (lowerDesc.includes('pwd')) fareType = 'pwd';
            else if (lowerDesc.includes('senior')) fareType = 'senior';
            else if (lowerDesc.includes('student')) fareType = 'student';
          } else if (typeof desc === 'object' && desc !== null) {
            const type = (desc.type || 'Regular').toLowerCase();
            if (type.includes('pwd')) fareType = 'pwd';
            else if (type.includes('senior')) fareType = 'senior';
            else if (type.includes('student')) fareType = 'student';
          }
          passengerCounts[fareType]++;
        });
      } else {
        // If no breakdown, assume all passengers are regular
        passengerCounts.regular = ticket.quantity || 0;
      }

      // Add to totals
      discountTotals.regular.revenue += breakdown.regular;
      discountTotals.regular.passengers += passengerCounts.regular;

      discountTotals.pwd.revenue += breakdown.pwd;
      discountTotals.pwd.passengers += passengerCounts.pwd;

      discountTotals.senior.revenue += breakdown.senior;
      discountTotals.senior.passengers += passengerCounts.senior;

      discountTotals.student.revenue += breakdown.student;
      discountTotals.student.passengers += passengerCounts.student;
    });

    // Calculate total revenue for percentages
    const totalRevenue = Object.values(discountTotals).reduce((sum, d) => sum + d.revenue, 0);

    // Convert to array format, filtering out types with no revenue
    const discountArray = [
      { type: 'Regular', ...discountTotals.regular },
      { type: 'PWD', ...discountTotals.pwd },
      { type: 'Senior Citizen', ...discountTotals.senior },
      { type: 'Student', ...discountTotals.student }
    ]
      .filter(discount => discount.revenue > 0)
      .map(discount => ({
        type: discount.type,
        revenue: Math.round(discount.revenue * 100) / 100,
        passengers: discount.passengers,
        percentage: totalRevenue > 0 ? Math.round((discount.revenue / totalRevenue) * 100) : 0,
        avgFare: discount.passengers > 0 ? Math.round((discount.revenue / discount.passengers) * 100) / 100 : 0
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return discountArray;

  } catch (error) {
    console.error('=== ERROR in getDiscountRevenueData ===', error);
    return [];
  }
};
