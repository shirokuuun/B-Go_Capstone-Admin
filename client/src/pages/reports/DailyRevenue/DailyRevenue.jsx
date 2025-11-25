import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { PiMicrosoftExcelLogoFill } from "react-icons/pi";
import { IoMdArrowDropdownCircle } from "react-icons/io";
import { FaMoneyCheck } from "react-icons/fa6"
import { FaRegCalendarCheck, FaTicketAlt } from "react-icons/fa";
import { BsCalendar3 } from "react-icons/bs";
import { LuBus } from "react-icons/lu";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar, ResponsiveContainer } from 'recharts';
import {
  loadRevenueData,
  preparePieChartData,
  prepareRouteRevenueData,
  getAvailableDates,
  getAvailableRoutes,
  calculateRevenueMetrics,
  forceRefreshRevenueCache
} from '/src/pages/reports/DailyRevenue/DailyRevenue.js';
import MonthlyRevenue from './MonthlyRevenue.jsx';
import { calculateTripDiscountBreakdown, parseTicketDiscountBreakdown } from './Remittance.js';
import { 
  initializeMonthlyData, 
  getCurrentMonth, 
  loadMonthlyData, 
  loadAvailableMonths 
} from './MonthlyRevenue.js';
import './DailyRevenue.css';
import ReservationsReport from './Reservations.jsx';
import RemittanceReport from './Remittance.jsx';
import { logActivity, ACTIVITY_TYPES } from '/src/pages/settings/auditService.js';


const Revenue = () => {
  const [currentView, setCurrentView] = useState('');
  const [isMenuExpanded, setIsMenuExpanded] = useState(true);
  
  // --- CHANGED: DATE RANGE STATES (Replaces single selectedDate) ---
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [selectedTicketType, setSelectedTicketType] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [loading, setLoading] = useState(false);
  const [availableDates, setAvailableDates] = useState([]);
  const [availableRoutes, setAvailableRoutes] = useState([]);

    //Monthly Revenue
  const [monthlyData, setMonthlyData] = useState(initializeMonthlyData());
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [availableMonths, setAvailableMonths] = useState([]);
  // Monthly-specific filter states
  const [monthlySelectedTicketType, setMonthlySelectedTicketType] = useState('');
  const [monthlySelectedRoute, setMonthlySelectedRoute] = useState('');
  
  // Daily Revenue Data - Start with null to show loading
  const [revenueData, setRevenueData] = useState(null);

  // --- NEW: HELPER FOR DATE PRESETS (From Reservations Page) ---
  const applyDatePreset = (range) => {
    const end = new Date();
    const start = new Date();
    
    if (range === 'all') {
      setStartDate('');
      setEndDate('');
      return;
    }

    if (range === 'year') {
      start.setFullYear(end.getFullYear() - 1);
    } else {
      start.setDate(end.getDate() - range);
    }
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  // --- NEW: FILTER LOGIC ---
  const getFilteredDates = () => {
    let datesToFetch = availableDates;
    if (startDate) {
      datesToFetch = datesToFetch.filter(date => date >= startDate);
    }
    if (endDate) {
      datesToFetch = datesToFetch.filter(date => date <= endDate);
    }
    return datesToFetch;
  };

  // Function to load revenue data with provided dates array
  const handleLoadRevenueDataWithDates = async (dates) => {
    setLoading(true);
    try {
      let data;
      
      // If we have a specific single date, we could optimize, but since we have ranges now,
      // we default to aggregating data for all dates in the filtered range.
      
      const allData = {
        conductorTrips: [],
        preBookingTrips: [],
        preTicketing: [],
        totalRevenue: 0,
        totalPassengers: 0,
        averageFare: 0,
        conductorRevenue: 0,
        preBookingRevenue: 0,
        preTicketingRevenue: 0
      };
      
      // If no dates match filter, we just use the empty data structure
      if (dates.length > 0) {
        for (const date of dates) {
          const dateData = await loadRevenueData(date, selectedRoute);
          allData.conductorTrips.push(...(dateData.conductorTrips || []));
          allData.preBookingTrips.push(...(dateData.preBookingTrips || []));
          allData.preTicketing.push(...(dateData.preTicketing || []));
          allData.totalRevenue += dateData.totalRevenue || 0;
          allData.totalPassengers += dateData.totalPassengers || 0;
          allData.conductorRevenue += dateData.conductorRevenue || 0;
          allData.preBookingRevenue += dateData.preBookingRevenue || 0;
          allData.preTicketingRevenue += dateData.preTicketingRevenue || 0;
        }
        
        // Recalculate average fare
        allData.averageFare = allData.totalPassengers > 0 ? allData.totalRevenue / allData.totalPassengers : 0;
      }
      
      data = allData;
      
      // Apply ticket type filtering
      const filteredData = applyTicketTypeFilter(data, selectedTicketType);
      
      // Ensure we always have a complete data structure
      const completeData = {
        conductorTrips: filteredData.conductorTrips || [],
        preBookingTrips: filteredData.preBookingTrips || [],
        preTicketing: filteredData.preTicketing || [],
        totalRevenue: filteredData.totalRevenue || 0,
        totalPassengers: filteredData.totalPassengers || 0,
        averageFare: filteredData.averageFare || 0,
        conductorRevenue: filteredData.conductorRevenue || 0,
        preBookingRevenue: filteredData.preBookingRevenue || 0,
        preTicketingRevenue: filteredData.preTicketingRevenue || 0
      };
      
      setRevenueData(completeData);
    } catch (error) {
      console.error('Error loading revenue data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load revenue data for summary cards (always load) and detailed view
  const handleLoadRevenueData = async () => {
    const datesToFetch = getFilteredDates();
    return handleLoadRevenueDataWithDates(datesToFetch);
  };

  // Force refresh - clears cache and reloads data
  const handleRefresh = async () => {
    setLoading(true);
    try {
      const datesToRefresh = getFilteredDates();
      // Refresh cache for dates in range
      for (const date of datesToRefresh) {
        await forceRefreshRevenueCache(date, selectedRoute);
      }

      // Reload data
      await handleLoadRevenueData();
    } catch (error) {
      console.error('Error refreshing revenue data:', error);
    } finally {
      setLoading(false);
    }
  };

  //Monthly Revenue Data load
  const handleMonthlyDataLoad = async () => {
    await loadMonthlyData(selectedMonth, monthlySelectedRoute, setMonthlyData, setMonthlyLoading, monthlySelectedTicketType);
  };

  const handleMonthChange = (newMonth) => {
    setSelectedMonth(newMonth);
  };

  const handleMonthlyRefresh = () => {
    handleMonthlyDataLoad();
  };

  const handleMonthlyTicketTypeChange = (ticketType) => {
    setMonthlySelectedTicketType(ticketType);
  };

  const handleMonthlyRouteChange = (route) => {
    setMonthlySelectedRoute(route);
  };

  useEffect(() => {
    if (currentView === 'monthly-revenue') {
      handleMonthlyDataLoad();
    }
  }, [selectedMonth, monthlySelectedRoute, monthlySelectedTicketType, currentView]);

  useEffect(() => {
    loadAvailableMonths(setAvailableMonths, setSelectedMonth, selectedMonth);
  }, []);

  // Filter revenue data based on selected ticket type
  const applyTicketTypeFilter = (data, ticketType) => {
    if (!ticketType || ticketType === '') {
      // Return all data if no filter is selected
      return data;
    }

    let filteredConductorTrips = [];
    let filteredPreBookingTrips = [];
    let filteredPreTicketing = [];

    switch (ticketType) {
      case 'conductor':
        filteredConductorTrips = data.conductorTrips || [];
        break;
      case 'pre-book':
        filteredPreBookingTrips = data.preBookingTrips || [];
        break;
      case 'pre-ticket':
        filteredPreTicketing = data.preTicketing || [];
        break;
      default:
        // Return all data for unknown filter
        return data;
    }

    // Recalculate metrics with filtered data
    const metrics = calculateRevenueMetrics(filteredConductorTrips, filteredPreBookingTrips, filteredPreTicketing);

    return {
      ...data,
      conductorTrips: filteredConductorTrips,
      preBookingTrips: filteredPreBookingTrips,
      preTicketing: filteredPreTicketing,
      ...metrics
    };
  };

  // Load available dates when component mounts
  const loadAvailableDates = async () => {
    try {
      const dates = await getAvailableDates();
      setAvailableDates(dates);
      
      // Only load data if daily-revenue view is active
      // Initial load: if we have dates, load them all (since start/end date are empty initially)
      if (dates.length > 0 && currentView === 'daily-revenue') {
        await handleLoadRevenueDataWithDates(dates);
      }
    } catch (error) {
      console.error('Error loading available dates:', error);
    }
  };

  // Load available routes when component mounts
  const loadAvailableRoutes = async () => {
    try {
      const routes = await getAvailableRoutes();
      setAvailableRoutes(routes);
    } catch (error) {
      console.error('Error loading available routes:', error);
    }
  };

  useEffect(() => {
    loadAvailableRoutes();
  }, []);

  // Load dates and data when view changes to daily-revenue
  useEffect(() => {
    if (currentView === 'daily-revenue') {
      loadAvailableDates();
    }
  }, [currentView]);

  // Trigger data load when filters change
  // UPDATED: Dependencies now include start/end date instead of selectedDate
  useEffect(() => {
    if (availableDates.length > 0 && currentView === 'daily-revenue') {
      handleLoadRevenueData();
    }
  }, [startDate, endDate, selectedTicketType, selectedRoute, currentView]);


  const toggleMenu = () => {
    setIsMenuExpanded(!isMenuExpanded);
  };

  const selectMenuItem = (viewType) => {
    setCurrentView(viewType);
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    
    let date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      date = new Date(timestamp);
    }
    
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatCurrency = (amount) => {
    const numAmount = Number(amount) || 0;
    return `₱${numAmount.toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatDateTime = (dateStr, timestamp) => {
    try {
      const formattedDate = dateStr ? formatDate(dateStr) : 'N/A';
      const formattedTime = timestamp ? formatTime(timestamp) : 'N/A';
      return `${formattedDate} ${formattedTime}`;
    } catch (error) {
      return `${dateStr || 'N/A'} ${formatTime(timestamp)}`;
    }
  };

  // Excel export function
  const handleExportToExcel = async () => {
    try {
      // Create a new workbook
      const workbook = XLSX.utils.book_new();

      // Calculate unique trips count
      const uniqueTrips = new Set();
      revenueData.conductorTrips?.forEach(trip => {
        if (trip.conductorId && trip.tripId) {
          const tripDate = trip.date || trip.createdAt || 'unknown-date';
          uniqueTrips.add(`${trip.conductorId}_${tripDate}_${trip.tripId}`);
        }
      });
      revenueData.preBookingTrips?.forEach(trip => {
        if (trip.conductorId && trip.tripId) {
          const tripDate = trip.date || trip.createdAt || 'unknown-date';
          uniqueTrips.add(`${trip.conductorId}_${tripDate}_${trip.tripId}`);
        }
      });
      revenueData.preTicketing?.forEach(trip => {
        if (trip.conductorId && trip.tripId) {
          const tripDate = trip.date || trip.createdAt || 'unknown-date';
          uniqueTrips.add(`${trip.conductorId}_${tripDate}_${trip.tripId}`);
        }
      });

      // Determine date string for summary
      let dateRangeStr = 'All Dates';
      if(startDate && endDate) dateRangeStr = `${startDate} to ${endDate}`;
      else if (startDate) dateRangeStr = `From ${startDate}`;

      // Create summary data
      const summaryData = [
        ['B-Go Bus Transportation - Daily Revenue Report'],
        [''],
        ['Report Date:', dateRangeStr],
        ['Route Filter:', selectedRoute || 'All Routes'],
        ['Ticket Type Filter:', selectedTicketType || 'All Types'],
        ['Generated:', new Date().toLocaleString()],
        [''],
        ['SUMMARY'],
        ['Metric', 'Value'],
        ['Total Revenue', `₱${revenueData.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ['Total Trips', uniqueTrips.size],
        ['Total Passengers', revenueData.totalPassengers],
        ['Total Tickets', (revenueData.conductorTrips?.length || 0) + (revenueData.preBookingTrips?.length || 0) + (revenueData.preTicketing?.length || 0)],
        ['Average Fare', `₱${revenueData.averageFare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ['Conductor Revenue', `₱${revenueData.conductorRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ['Pre-booking Revenue', `₱${revenueData.preBookingRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ['Pre-ticketing Revenue', `₱${revenueData.preTicketingRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ['']
      ];

      // Create the summary worksheet with formatting
      const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
      
      // Apply basic formatting to summary sheet
      summaryWS['A1'] = { 
        v: 'B-Go Bus Transportation - Daily Revenue Report', 
        t: 's'
      };

      // Set column widths
      summaryWS['!cols'] = [
        { wch: 25 }, // Column A
        { wch: 25 }  // Column B
      ];

      // Merge cells for title
      summaryWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 1, r: 0 } }];

      XLSX.utils.book_append_sheet(workbook, summaryWS, 'Summary');

      // Create conductor trips sheet
      if (revenueData.conductorTrips && revenueData.conductorTrips.length > 0) {
        const conductorData = [
          ['Conductor Trips - Detailed Breakdown'],
          [''],
          ['Trip ID', 'Date & Time', 'Route', 'Trip Direction', 'Passengers', 'Regular', 'PWD', 'Senior', 'Student', 'Revenue']
        ];

        // Calculate totals for discount breakdown
        let totalBreakdown = { regular: 0, pwd: 0, senior: 0, student: 0 };

        revenueData.conductorTrips.forEach(trip => {
          const dateTime = formatDateTime(trip.date, trip.timestamp);

          // Calculate discount breakdown for this trip
          const breakdown = parseTicketDiscountBreakdown(trip);
          totalBreakdown.regular += breakdown.regular;
          totalBreakdown.pwd += breakdown.pwd;
          totalBreakdown.senior += breakdown.senior;
          totalBreakdown.student += breakdown.student;

          conductorData.push([
            trip.tripId || 'N/A',
            dateTime,
            `${trip.from} → ${trip.to}`,
            trip.tripDirection || 'N/A',
            trip.quantity,
            `₱${breakdown.regular.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `₱${breakdown.pwd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `₱${breakdown.senior.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `₱${breakdown.student.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `₱${trip.totalFare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          ]);
        });

        // Add total row
        conductorData.push([
          '', '', '', `Conductor Total (${revenueData.conductorTrips.length} tickets):`,
          revenueData.conductorTrips.reduce((sum, trip) => sum + (trip.quantity || 0), 0),
          `₱${totalBreakdown.regular.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₱${totalBreakdown.pwd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₱${totalBreakdown.senior.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₱${totalBreakdown.student.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₱${revenueData.conductorRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        ]);

        const conductorWS = XLSX.utils.aoa_to_sheet(conductorData);

        // Set column widths
        conductorWS['!cols'] = [
          { wch: 12 }, // Trip ID
          { wch: 20 }, // Date & Time
          { wch: 25 }, // Route
          { wch: 25 }, // Trip Direction
          { wch: 12 }, // Passengers
          { wch: 12 }, // Regular
          { wch: 12 }, // PWD
          { wch: 12 }, // Senior
          { wch: 12 }, // Student
          { wch: 15 }  // Revenue
        ];

        // Merge title
        conductorWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 9, r: 0 } }];

        XLSX.utils.book_append_sheet(workbook, conductorWS, 'Conductor Trips');
      }

      // Create pre-booking sheet
      if (revenueData.preBookingTrips && revenueData.preBookingTrips.length > 0) {
        const preBookingData = [
          ['Pre-booking - Detailed Breakdown'],
          [''],
          ['Trip ID', 'Date & Time', 'Route', 'Trip Direction', 'Passengers', 'Regular', 'PWD', 'Senior', 'Student', 'Revenue']
        ];

        // Calculate totals for discount breakdown
        let totalBreakdown = { regular: 0, pwd: 0, senior: 0, student: 0 };

        revenueData.preBookingTrips.forEach(trip => {
          const dateTime = formatDateTime(trip.date, trip.timestamp);

          // Calculate discount breakdown for this trip
          const breakdown = parseTicketDiscountBreakdown(trip);
          totalBreakdown.regular += breakdown.regular;
          totalBreakdown.pwd += breakdown.pwd;
          totalBreakdown.senior += breakdown.senior;
          totalBreakdown.student += breakdown.student;

          preBookingData.push([
            trip.tripId || 'N/A',
            dateTime,
            `${trip.from} → ${trip.to}`,
            trip.tripDirection || 'N/A',
            trip.quantity,
            `₱${breakdown.regular.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `₱${breakdown.pwd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `₱${breakdown.senior.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `₱${breakdown.student.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `₱${trip.totalFare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          ]);
        });

        // Add total row
        preBookingData.push([
          '', '', '', `Pre-booking Total (${revenueData.preBookingTrips.length} tickets):`,
          revenueData.preBookingTrips.reduce((sum, trip) => sum + (trip.quantity || 0), 0),
          `₱${totalBreakdown.regular.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₱${totalBreakdown.pwd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₱${totalBreakdown.senior.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₱${totalBreakdown.student.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₱${revenueData.preBookingRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        ]);

        const preBookingWS = XLSX.utils.aoa_to_sheet(preBookingData);

        preBookingWS['!cols'] = [
          { wch: 12 }, { wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }
        ];

        preBookingWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 9, r: 0 } }];

        XLSX.utils.book_append_sheet(workbook, preBookingWS, 'Pre-booking');
      }

      // Create pre-ticketing sheet
      if (revenueData.preTicketing && revenueData.preTicketing.length > 0) {
        const preTicketingData = [
          ['Pre-ticketing - Detailed Breakdown'],
          [''],
          ['Trip ID', 'Date & Time', 'Route', 'Trip Direction', 'Passengers', 'Regular', 'PWD', 'Senior', 'Student', 'Revenue']
        ];

        // Calculate totals for discount breakdown
        let totalBreakdown = { regular: 0, pwd: 0, senior: 0, student: 0 };

        revenueData.preTicketing.forEach(trip => {
          const dateTime = formatDateTime(trip.date, trip.timestamp);

          // Calculate discount breakdown for this trip
          const breakdown = parseTicketDiscountBreakdown(trip);
          totalBreakdown.regular += breakdown.regular;
          totalBreakdown.pwd += breakdown.pwd;
          totalBreakdown.senior += breakdown.senior;
          totalBreakdown.student += breakdown.student;

          preTicketingData.push([
            trip.tripId || 'N/A',
            dateTime,
            `${trip.from} → ${trip.to}`,
            trip.tripDirection || 'N/A',
            trip.quantity,
            `₱${breakdown.regular.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `₱${breakdown.pwd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `₱${breakdown.senior.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `₱${breakdown.student.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `₱${trip.totalFare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          ]);
        });

        // Add total row
        preTicketingData.push([
          '', '', '', `Pre-ticketing Total (${revenueData.preTicketing.length} tickets):`,
          revenueData.preTicketing.reduce((sum, trip) => sum + (trip.quantity || 0), 0),
          `₱${totalBreakdown.regular.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₱${totalBreakdown.pwd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₱${totalBreakdown.senior.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₱${totalBreakdown.student.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₱${revenueData.preTicketingRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        ]);

        const preTicketingWS = XLSX.utils.aoa_to_sheet(preTicketingData);

        preTicketingWS['!cols'] = [
          { wch: 12 }, { wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }
        ];

        preTicketingWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 9, r: 0 } }];

        XLSX.utils.book_append_sheet(workbook, preTicketingWS, 'Pre-ticketing');
      }

      // Generate filename
      const safeFilename = dateRangeStr.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `Daily_Revenue_Report_${safeFilename}_${new Date().toISOString().split('T')[0]}.xlsx`;

      // Save the file
      XLSX.writeFile(workbook, filename);

      // Log the export activity
      try {
        await logActivity(
          ACTIVITY_TYPES.DATA_EXPORT,
          `Exported Daily Revenue report to Excel`,
          {
            filename,
            reportType: 'Daily Revenue',
            dateFilter: dateRangeStr,
            routeFilter: selectedRoute || 'All Routes',
            ticketTypeFilter: selectedTicketType || 'All Types',
            totalRevenue: revenueData.totalRevenue,
            totalTrips: uniqueTrips.size,
            totalPassengers: revenueData.totalPassengers,
            conductorTripsCount: revenueData.conductorTrips?.length || 0,
            preBookingTripsCount: revenueData.preBookingTrips?.length || 0,
            preTicketingCount: revenueData.preTicketing?.length || 0
          },
          'info'
        );
      } catch (logError) {
        console.warn('Failed to log export activity:', logError);
      }
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export to Excel. Please try again.');
    }
  };

  // Prepare chart data for daily revenue (only if data exists)
  const pieChartData = revenueData ? 
    preparePieChartData(revenueData.conductorRevenue, revenueData.preBookingRevenue, revenueData.preTicketingRevenue) : 
    [];
  const routeChartData = revenueData ? 
    prepareRouteRevenueData(revenueData.conductorTrips, revenueData.preBookingTrips, revenueData.preTicketing) : 
    [];


  const renderViewContent = () => {
    switch(currentView) {
      case 'daily-revenue':
        return renderDailyRevenue();
      case 'monthly-revenue':
        return renderMonthlyRevenue();
      case 'daily-trips':
        return renderDailyTripsRemittance();
      case 'reservations': 
        return <ReservationsReport />;
      default:
        return renderDefaultView();
    }
  };

  const renderDefaultView = () => (
    <div className="revenue-default-view">
      <div className="revenue-welcome-card">
        <h3 className="revenue-welcome-title">Revenue Management Dashboard</h3>
        <p className="revenue-welcome-description">
          Select a revenue report from the menu above to view detailed information with filtering options.
        </p>
        <div className="revenue-quick-stats">
          <div className="revenue-stat-item">
            <span className="revenue-stat-label">Available Reports</span>
            <span className="revenue-stat-value">3</span>
          </div>
          <div className="revenue-stat-item">
            <span className="revenue-stat-label">Last Updated</span>
            <span className="revenue-stat-value">Today</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderMonthlyRevenue = () => {
    return (
      <MonthlyRevenue
        monthlyData={monthlyData}
        monthlyLoading={monthlyLoading}
        selectedMonth={selectedMonth}
        selectedRoute={monthlySelectedRoute}
        selectedTicketType={monthlySelectedTicketType}
        availableMonths={availableMonths}
        availableRoutes={availableRoutes}
        formatCurrency={formatCurrency}
        onMonthChange={handleMonthChange}
        onRouteChange={handleMonthlyRouteChange}
        onTicketTypeChange={handleMonthlyTicketTypeChange}
        onRefresh={handleMonthlyRefresh}
      />
    );
  };

  const renderDailyTripsRemittance = () => {
    return <RemittanceReport />;
  };

  const renderDailyRevenue = () => {
    if (loading || revenueData === null) {
      return (
        <div className="revenue-daily-container">
          <div className="revenue-loading-state">
            <p>Loading revenue data...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="revenue-daily-container">

        {/* --- NEW: SORT/FILTER BAR (REPLACED OLD FILTERS) --- */}
        <div className="res-sort-container">

          {/* 1. Date: FROM */}
          <div className="res-sort-group">
            <label className="res-sort-label">From</label>
            <input 
              type="date" 
              className="res-sort-select" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
              style={{ paddingRight: '0' }}
            />
          </div>

          {/* 2. Date: TO */}
          <div className="res-sort-group">
            <label className="res-sort-label">To</label>
            <input 
              type="date" 
              className="res-sort-select" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
              style={{ paddingRight: '0' }}
            />
          </div>
          
          {/* 3. Quick Presets */}
          <div className="res-sort-group">
            <label className="res-sort-label">Quick Select</label>
            <div className="res-qs-container">
              <button className="res-qs-btn" onClick={() => applyDatePreset(7)}>7 Days</button>
              <button className="res-qs-btn" onClick={() => applyDatePreset(30)}>30 Days</button>
              <button className="res-qs-btn" onClick={() => applyDatePreset('year')}>1 Year</button>
            </div>
          </div>  
          
          {/* 4. Trip Direction */}
          <div className="res-sort-group">
            <label className="res-sort-label">Trip Direction</label>
            <select className="res-sort-select" value={selectedRoute} onChange={(e) => setSelectedRoute(e.target.value)}>
              <option value="">All Trip Directions</option>
              {availableRoutes.map((route) => (
                <option key={route} value={route}>
                  {route}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Ticket Type */}
          <div className="res-sort-group">
            <label className="res-sort-label">Type</label>
            <select className="res-sort-select" value={selectedTicketType} onChange={(e) => setSelectedTicketType(e.target.value)}>
              <option value="">All Tickets</option>
              <option value="pre-ticket">Pre Ticket</option>
              <option value="pre-book">Pre Book</option>
              <option value="conductor">Conductor Ticket</option>
            </select>
          </div>

          {/* 6. Clear Filters Button */}
          <div className="res-sort-group">
             <label className="res-sort-label">&nbsp;</label>
             <button className="res-sort-clear-btn" onClick={() => { setStartDate(''); setEndDate(''); setSelectedRoute(''); setSelectedTicketType(''); }}>
               Clear Filters
             </button>
          </div>

          {/* 7. Stats Pill */}
          <div className="res-sort-group">
            <label className="res-sort-label">&nbsp;</label>
            <div className="res-sort-stats-pill">
              {(() => {
                if (loading || revenueData === null) {
                  return 'Loading...';
                }
                if (revenueData) {
                  const totalTrips = (revenueData.conductorTrips?.length || 0) +
                                   (revenueData.preBookingTrips?.length || 0) +
                                   (revenueData.preTicketing?.length || 0);
                  const totalPassengers = revenueData.totalPassengers || 0;
                  return `${totalTrips} tickets • ${totalPassengers} pax`;
                }
                return 'No data';
              })()}
            </div>
          </div>

        </div>

        {/* Summary Cards */}
        <div className="revenue-daily-summary-card-container">
          <div className="revenue-daily-header-pattern"></div>
          <div className="revenue-summary-cards">
            <div className="revenue-summary-card">
              <h3 className="revenue-card-title">Total Revenue</h3>
              <p className="revenue-card-value revenue-card-revenue">
                {formatCurrency(revenueData.totalRevenue)}
              </p>
            </div>
            <div className="revenue-summary-card">
              <h3 className="revenue-card-title">Total Trips</h3>
              <p className="revenue-card-value revenue-card-trips">
                {(() => {
                  // Count unique trips by combining conductorId, date, and tripId
                  const uniqueTrips = new Set();
                  
                  // Add trips from conductor trips
                  revenueData.conductorTrips?.forEach(trip => {
                    if (trip.conductorId && trip.tripId) {
                      const tripDate = trip.date || trip.createdAt || 'unknown-date';
                      uniqueTrips.add(`${trip.conductorId}_${tripDate}_${trip.tripId}`);
                    }
                  });
                  
                  // Add trips from pre-booking trips
                  revenueData.preBookingTrips?.forEach(trip => {
                    if (trip.conductorId && trip.tripId) {
                      const tripDate = trip.date || trip.createdAt || 'unknown-date';
                      uniqueTrips.add(`${trip.conductorId}_${tripDate}_${trip.tripId}`);
                    }
                  });
                  
                  // Add trips from pre-ticketing
                  revenueData.preTicketing?.forEach(trip => {
                    if (trip.conductorId && trip.tripId) {
                      const tripDate = trip.date || trip.createdAt || 'unknown-date';
                      uniqueTrips.add(`${trip.conductorId}_${tripDate}_${trip.tripId}`);
                    }
                  });
                  
                  return uniqueTrips.size;
                })()}
              </p>
            </div>
            <div className="revenue-summary-card">
              <h3 className="revenue-card-title">Total Passengers</h3>
              <p className="revenue-card-value revenue-card-passengers">
                {revenueData.totalPassengers}
              </p>
            </div>
            <div className="revenue-summary-card">
              <h3 className="revenue-card-title">Total Tickets</h3>
              <p className="revenue-card-value revenue-card-tickets">
                {(() => {
                  // Count total tickets from all trip types
                  let totalTickets = 0;
                  
                  // Count tickets from conductor trips
                  totalTickets += revenueData.conductorTrips?.length || 0;
                  
                  // Count tickets from pre-booking trips  
                  totalTickets += revenueData.preBookingTrips?.length || 0;
                  
                  // Count tickets from pre-ticketing
                  totalTickets += revenueData.preTicketing?.length || 0;
                  
                  return totalTickets;
                })()}
              </p>
            </div>
          </div>
        </div>

        {/* Controls - Only show for daily revenue */}
        <div className="revenue-daily-controls">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="revenue-refresh-btn"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={handleExportToExcel}
            className="revenue-export-btn"
            disabled={loading || revenueData.totalRevenue === 0}
          >
            <PiMicrosoftExcelLogoFill size={20} /> Export to Excel
          </button>
        </div>




        {/* Charts Section */}
        <div className="revenue-charts-section">
          {/* Revenue Source Breakdown */}
          <div className="revenue-chart-container">
            <h3 className="revenue-chart-title">Revenue by Source</h3>
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="45%"
                  labelLine={false}
                  label={({ percent, value }) => {
                    // Only show percentage if value exists (greater than 0)
                    if (!value || value <= 0) return null;
                    return `${(percent * 100).toFixed(1)}%`;
                  }}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [formatCurrency(value), name]}
                  contentStyle={{ fontSize: '12px' }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={50}
                  formatter={(value, entry) => `${value}: ${formatCurrency(entry.payload.value)}`}
                  wrapperStyle={{ fontSize: '12px', fontWeight: '600' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Top Routes by Revenue */}
          <div className="revenue-chart-container">
            <h3 className="revenue-chart-title">Top Routes by Revenue</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart
                data={routeChartData.slice(0, 5)}
                margin={{ top: 20, right: 30, left: 20, bottom: 100 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="route"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  fontSize={9}
                  interval={0}
                  tick={{ fontSize: 9 }}
                />
                <YAxis
                  fontSize={11}
                  tickFormatter={(value) => `₱${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                />
                <Tooltip
                  formatter={(value) => [formatCurrency(value), 'Revenue']}
                  labelFormatter={(label) => `Route: ${label}`}
                />
                <Bar dataKey="revenue" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed Breakdown - Now positioned in the main content area */}
        <div className="revenue-breakdown-section">
          <h3 className="revenue-breakdown-title">Detailed Revenue Breakdown</h3>
          
          {/* Conductor Trips Section - Show only if no filter or conductor filter is selected */}
          {(!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'conductor') && (
            <div className="revenue-section-container">
              <h4 className="revenue-section-title revenue-section-conductor">
                Conductor Trips ({formatCurrency(revenueData.conductorRevenue || 0)})
              </h4>
              {revenueData.conductorTrips.length > 0 ? (
                <div className="revenue-table-container">
                  <table className="revenue-revenue-table revenue-detailed-breakdown-table daily-revenue-table">
                    <thead>
                      <tr>
                        <th rowSpan={2}>Trip ID</th>
                        <th rowSpan={2}>Date & Time</th>
                        <th rowSpan={2}>Route</th>
                        <th rowSpan={2}>Trip Direction</th>
                        <th rowSpan={2}>Passengers</th>
                        <th colSpan={4} style={{ textAlign: 'center', backgroundColor: '#f8f9fa', color: '#495057', fontSize: '12px', padding: '10px 8px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Discount Breakdown</th>
                        <th rowSpan={2}>Fare</th>
                      </tr>
                      <tr>
                        <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>Reg</th>
                        <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>PWD</th>
                        <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>Sen</th>
                        <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>Std</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueData.conductorTrips.map((trip, index) => {
                        const breakdown = parseTicketDiscountBreakdown(trip);
                        // Extract trip number from tripId (e.g., "trip5" -> "5")
                        const tripNum = trip.tripId ? trip.tripId.replace(/trip/i, '') : '';
                        return (
                          <tr key={index}>
                            <td className="revenue-trip-id">
                              {tripNum ? `TRIP${tripNum}` : 'N/A'}
                            </td>
                            <td>
                              {formatDateTime(trip.date, trip.timestamp)}
                            </td>
                            <td className="revenue-route-text">
                              {trip.from} → {trip.to}
                            </td>
                            <td className="revenue-trip-direction">
                              {trip.tripDirection || 'N/A'}
                            </td>
                            <td>{trip.quantity}</td>
                            <td>{formatCurrency(breakdown.regular)}</td>
                            <td>{formatCurrency(breakdown.pwd)}</td>
                            <td>{formatCurrency(breakdown.senior)}</td>
                            <td>{formatCurrency(breakdown.student)}</td>
                            <td className="revenue-fare-amount">{formatCurrency(trip.totalFare)}</td>
                          </tr>
                        );
                      })}
                      {/* Conductor Total Row */}
                      <tr style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold', borderTop: '2px solid #dee2e6' }}>
                        <td colSpan="4" style={{ textAlign: 'right', padding: '12px', fontSize: '14px' }}>
                          <strong>Conductor Total ({revenueData.conductorTrips.length} tickets):</strong>
                        </td>
                        <td style={{ textAlign: 'center', padding: '12px' }}>
                          <strong>{revenueData.conductorTrips.reduce((sum, trip) => sum + (trip.quantity || 0), 0)}</strong>
                        </td>
                        <td style={{ textAlign: 'center', padding: '12px' }}>
                          <strong>{formatCurrency(revenueData.conductorTrips.reduce((sum, trip) => {
                            const breakdown = parseTicketDiscountBreakdown(trip);
                            return sum + breakdown.regular;
                          }, 0))}</strong>
                        </td>
                        <td style={{ textAlign: 'center', padding: '12px' }}>
                          <strong>{formatCurrency(revenueData.conductorTrips.reduce((sum, trip) => {
                            const breakdown = parseTicketDiscountBreakdown(trip);
                            return sum + breakdown.pwd;
                          }, 0))}</strong>
                        </td>
                        <td style={{ textAlign: 'center', padding: '12px' }}>
                          <strong>{formatCurrency(revenueData.conductorTrips.reduce((sum, trip) => {
                            const breakdown = parseTicketDiscountBreakdown(trip);
                            return sum + breakdown.senior;
                          }, 0))}</strong>
                        </td>
                        <td style={{ textAlign: 'center', padding: '12px' }}>
                          <strong>{formatCurrency(revenueData.conductorTrips.reduce((sum, trip) => {
                            const breakdown = parseTicketDiscountBreakdown(trip);
                            return sum + breakdown.student;
                          }, 0))}</strong>
                        </td>
                        <td className="revenue-fare-amount" style={{ padding: '12px', color: '#28a745', fontWeight: 'bold' }}>
                          <strong>{formatCurrency(revenueData.conductorRevenue || 0)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="revenue-empty-state">
                  <h3>No conductor trips found</h3>
                  <p>No conductor trip data available for the selected date{selectedRoute ? ` and trip direction: ${selectedRoute}` : ''}.</p>
                </div>
              )}
            </div>
          )}

         {/* Pre-booking Section - Show only if no filter or pre-book filter is selected */}
        {(!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'pre-book') && (
          <div className="revenue-section-container">
            <h4 className="revenue-section-title revenue-section-pre-booking">
              Pre-booking ({formatCurrency(revenueData.preBookingRevenue || 0)})
            </h4>
            {revenueData.preBookingTrips && revenueData.preBookingTrips.length > 0 ? (
              <div className="revenue-table-container">
                <table className="revenue-revenue-table revenue-detailed-breakdown-table daily-revenue-table">
                  <thead>
                    <tr>
                      <th rowSpan={2}>Trip ID</th>
                      <th rowSpan={2}>Date & Time</th>
                      <th rowSpan={2}>Route</th>
                      <th rowSpan={2}>Trip Direction</th>
                      <th rowSpan={2}>Passengers</th>
                      <th colSpan={4} style={{ textAlign: 'center', backgroundColor: '#f8f9fa', color: '#495057', fontSize: '12px', padding: '10px 8px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Discount Breakdown</th>
                      <th rowSpan={2}>Fare</th>
                    </tr>
                    <tr>
                      <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>Reg</th>
                      <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>PWD</th>
                      <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>Sen</th>
                      <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>Std</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueData.preBookingTrips.map((trip, index) => {
                      const breakdown = parseTicketDiscountBreakdown(trip);
                      // Extract trip number from tripId (e.g., "trip5" -> "5")
                      const tripNum = trip.tripId ? trip.tripId.replace(/trip/i, '') : '';
                      return (
                        <tr key={index}>
                          <td className="revenue-trip-id">
                            {tripNum ? `TRIP${tripNum}` : 'N/A'}
                          </td>
                          <td>
                            {formatDateTime(trip.date, trip.timestamp)}
                          </td>
                          <td className="revenue-route-text">
                            {trip.from} → {trip.to}
                          </td>
                          <td className="revenue-trip-direction">
                            {trip.tripDirection || 'N/A'}
                          </td>
                          <td>{trip.quantity}</td>
                          <td>{formatCurrency(breakdown.regular)}</td>
                          <td>{formatCurrency(breakdown.pwd)}</td>
                          <td>{formatCurrency(breakdown.senior)}</td>
                          <td>{formatCurrency(breakdown.student)}</td>
                          <td className="revenue-fare-amount">{formatCurrency(trip.totalFare)}</td>
                        </tr>
                      );
                    })}
                    {/* Pre-booking Total Row */}
                    <tr style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold', borderTop: '2px solid #dee2e6' }}>
                      <td colSpan="4" style={{ textAlign: 'right', padding: '12px', fontSize: '14px' }}>
                        <strong>Pre-booking Total ({revenueData.preBookingTrips?.length || 0} tickets):</strong>
                      </td>
                      <td style={{ textAlign: 'center', padding: '12px' }}>
                        <strong>{revenueData.preBookingTrips?.reduce((sum, trip) => sum + (trip.quantity || 0), 0) || 0}</strong>
                      </td>
                      <td style={{ textAlign: 'center', padding: '12px' }}>
                        <strong>{formatCurrency(revenueData.preBookingTrips.reduce((sum, trip) => {
                          const breakdown = parseTicketDiscountBreakdown(trip);
                          return sum + breakdown.regular;
                        }, 0))}</strong>
                      </td>
                      <td style={{ textAlign: 'center', padding: '12px' }}>
                        <strong>{formatCurrency(revenueData.preBookingTrips.reduce((sum, trip) => {
                          const breakdown = parseTicketDiscountBreakdown(trip);
                          return sum + breakdown.pwd;
                        }, 0))}</strong>
                      </td>
                      <td style={{ textAlign: 'center', padding: '12px' }}>
                        <strong>{formatCurrency(revenueData.preBookingTrips.reduce((sum, trip) => {
                          const breakdown = parseTicketDiscountBreakdown(trip);
                          return sum + breakdown.senior;
                        }, 0))}</strong>
                      </td>
                      <td style={{ textAlign: 'center', padding: '12px' }}>
                        <strong>{formatCurrency(revenueData.preBookingTrips.reduce((sum, trip) => {
                          const breakdown = parseTicketDiscountBreakdown(trip);
                          return sum + breakdown.student;
                        }, 0))}</strong>
                      </td>
                      <td className="revenue-fare-amount" style={{ padding: '12px', color: '#28a745', fontWeight: 'bold' }}>
                        <strong>{formatCurrency(revenueData.preBookingRevenue || 0)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="revenue-empty-state">
                <h3>No pre-booking data found</h3>
                <p>No pre-booking data available for the selected date{selectedRoute ? ` and trip direction: ${selectedRoute}` : ''}.</p>
              </div>
            )}
          </div>
        )}
        </div>

        {/* Pre-ticketing Section - Show only if no filter or pre-ticket filter is selected */}
          {(!selectedTicketType || selectedTicketType === '' || selectedTicketType === 'pre-ticket') && (
            <div className="revenue-section-container">
              <h4 className="revenue-section-title revenue-section-pre-ticketing">
                Pre-ticketing ({formatCurrency(revenueData.preTicketingRevenue || 0)})
              </h4>
              {revenueData.preTicketing && revenueData.preTicketing.length > 0 ? (
                <div className="revenue-table-container">
                  <table className="revenue-revenue-table revenue-detailed-breakdown-table daily-revenue-table">
                    <thead>
                      <tr>
                        <th rowSpan={2}>Trip ID</th>
                        <th rowSpan={2}>Date & Time</th>
                        <th rowSpan={2}>Route</th>
                        <th rowSpan={2}>Trip Direction</th>
                        <th rowSpan={2}>Passengers</th>
                        <th colSpan={4} style={{ textAlign: 'center', backgroundColor: '#f8f9fa', color: '#495057', fontSize: '12px', padding: '10px 8px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Discount Breakdown</th>
                        <th rowSpan={2}>Fare</th>
                      </tr>
                      <tr>
                        <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>Reg</th>
                        <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>PWD</th>
                        <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>Sen</th>
                        <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>Std</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueData.preTicketing.map((trip, index) => {
                        const breakdown = parseTicketDiscountBreakdown(trip);
                        // Extract trip number from tripId (e.g., "trip5" -> "5")
                        const tripNum = trip.tripId ? trip.tripId.replace(/trip/i, '') : '';
                        return (
                          <tr key={index}>
                            <td className="revenue-trip-id">
                              {tripNum ? `TRIP${tripNum}` : 'N/A'}
                            </td>
                            <td>
                              {formatDateTime(trip.date, trip.timestamp)}
                            </td>
                            <td className="revenue-route-text">
                              {trip.from} → {trip.to}
                            </td>
                            <td className="revenue-trip-direction">
                              {trip.tripDirection || 'N/A'}
                            </td>
                            <td>{trip.quantity}</td>
                            <td>{formatCurrency(breakdown.regular)}</td>
                            <td>{formatCurrency(breakdown.pwd)}</td>
                            <td>{formatCurrency(breakdown.senior)}</td>
                            <td>{formatCurrency(breakdown.student)}</td>
                            <td className="revenue-fare-amount">{formatCurrency(trip.totalFare)}</td>
                          </tr>
                        );
                      })}
                      {/* Pre-ticketing Total Row */}
                      <tr style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold', borderTop: '2px solid #dee2e6' }}>
                        <td colSpan="4" style={{ textAlign: 'right', padding: '12px', fontSize: '14px' }}>
                          <strong>Pre-ticketing Total ({revenueData.preTicketing.length} tickets):</strong>
                        </td>
                        <td style={{ textAlign: 'center', padding: '12px' }}>
                          <strong>{revenueData.preTicketing.reduce((sum, trip) => sum + (trip.quantity || 0), 0)}</strong>
                        </td>
                        <td style={{ textAlign: 'center', padding: '12px' }}>
                          <strong>{formatCurrency(revenueData.preTicketing.reduce((sum, trip) => {
                            const breakdown = parseTicketDiscountBreakdown(trip);
                            return sum + breakdown.regular;
                          }, 0))}</strong>
                        </td>
                        <td style={{ textAlign: 'center', padding: '12px' }}>
                          <strong>{formatCurrency(revenueData.preTicketing.reduce((sum, trip) => {
                            const breakdown = parseTicketDiscountBreakdown(trip);
                            return sum + breakdown.pwd;
                          }, 0))}</strong>
                        </td>
                        <td style={{ textAlign: 'center', padding: '12px' }}>
                          <strong>{formatCurrency(revenueData.preTicketing.reduce((sum, trip) => {
                            const breakdown = parseTicketDiscountBreakdown(trip);
                            return sum + breakdown.senior;
                          }, 0))}</strong>
                        </td>
                        <td style={{ textAlign: 'center', padding: '12px' }}>
                          <strong>{formatCurrency(revenueData.preTicketing.reduce((sum, trip) => {
                            const breakdown = parseTicketDiscountBreakdown(trip);
                            return sum + breakdown.student;
                          }, 0))}</strong>
                        </td>
                        <td className="revenue-fare-amount" style={{ padding: '12px', color: '#28a745', fontWeight: 'bold' }}>
                          <strong>{formatCurrency(revenueData.preTicketingRevenue || 0)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="revenue-empty-state">
                  <h3>No pre-ticketing data found</h3>
                  <p>No pre-ticketing data available for the selected date{selectedRoute ? ` and route: ${selectedRoute}` : ''}.</p>
                </div>
              )}
            </div>
          )}

      </div>
    );
  };

  return (
    <div className="revenue-container">
      {/* Revenue Menu */}
      <div className="revenue-menu-container">
        <div className="revenue-menu-item">
          <div 
            className={`revenue-menu-header ${isMenuExpanded ? 'revenue-menu-active' : ''}`}
            onClick={toggleMenu}
          >
            <span><span className="revenue-menu-icon"><FaMoneyCheck size={20}/></span>Revenue</span>
            <span className={`revenue-chevron ${isMenuExpanded ? 'revenue-chevron-rotated' : ''}`}><IoMdArrowDropdownCircle size={20} /></span>
          </div>
          <div className={`revenue-submenu ${isMenuExpanded ? 'revenue-submenu-open' : ''}`}>
            <div 
              className={`revenue-submenu-item ${currentView === 'daily-revenue' ? 'revenue-submenu-selected' : ''}`}
              onClick={() => selectMenuItem('daily-revenue')}
            >
              <span className="revenue-menu-icon"><FaRegCalendarCheck size={20} /></span>Daily Revenue
            </div>
            <div 
              className={`revenue-submenu-item ${currentView === 'monthly-revenue' ? 'revenue-submenu-selected' : ''}`}
              onClick={() => selectMenuItem('monthly-revenue')}
            >
              <span className="revenue-menu-icon"><BsCalendar3 size={23} /></span>Monthly Revenue
            </div>
            <div 
              className={`revenue-submenu-item ${currentView === 'daily-trips' ? 'revenue-submenu-selected' : ''}`}
              onClick={() => selectMenuItem('daily-trips')}
            >
              <span className="revenue-menu-icon"><LuBus size={20} /></span>Daily Trips Remittance
            </div>

            <div 
              className={`revenue-submenu-item ${currentView === 'reservations' ? 'revenue-submenu-selected' : ''}`}
              onClick={() => selectMenuItem('reservations')}
            >
              <span className="revenue-menu-icon"><FaTicketAlt size={20} /></span>Reservations
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="revenue-content-area">
        {renderViewContent()}
      </div>
    </div>
  );
};

export default Revenue;