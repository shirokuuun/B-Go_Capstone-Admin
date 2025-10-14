import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  getAvailableRemittanceDates,
  loadRemittanceData,
  calculateRemittanceSummary,
  groupRemittanceByconductor,
  validateRemittanceData,
  formatCurrency,
  formatDate,
  formatTime,
  getAllConductorDetails,
  calculateTripDiscountBreakdown,
  forceRefreshRemittanceCache
} from './Remittance.js';
import { PiMicrosoftExcelLogoFill } from "react-icons/pi";
import { logActivity, ACTIVITY_TYPES } from '/src/pages/settings/auditService.js';
import './DailyRevenue.css';

const RemittanceReport = () => {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTripDirection, setSelectedTripDirection] = useState('');
  const [selectedConductor, setSelectedConductor] = useState('');
  const [loading, setLoading] = useState(false);
  const [remittanceData, setRemittanceData] = useState([]);
  const [filteredRemittanceData, setFilteredRemittanceData] = useState([]);
  const [availableDates, setAvailableDates] = useState([]);
  const [availableTripDirections, setAvailableTripDirections] = useState([]);
  const [availableConductors, setAvailableConductors] = useState([]);
  const [conductorData, setConductorData] = useState({});
  const [summary, setSummary] = useState(null);
  const [groupedData, setGroupedData] = useState({});
  const [validationResults, setValidationResults] = useState({ isValid: true, errors: [], warnings: [] });
  const [showValidation, setShowValidation] = useState(false);

  // Load available dates on component mount
  useEffect(() => {
    const loadDates = async () => {
      try {
        const dates = await getAvailableRemittanceDates();
        setAvailableDates(dates);
        
        // Load remittance data for all dates on initial load
        handleLoadRemittanceDataWithDates(dates, selectedDate);
      } catch (error) {
        console.error('Error loading available dates:', error);
      }
    };
    
    loadDates();
  }, []);

  // Load remittance data when date changes (skip initial load)
  useEffect(() => {
    if (availableDates.length > 0) {
      handleLoadRemittanceData();
    }
  }, [selectedDate]);

  // Apply filters when filter values or data changes
  useEffect(() => {
    applyFilters();
  }, [remittanceData, selectedTripDirection, selectedConductor]);

  // Function to extract unique trip directions from data
  const extractTripDirections = (data) => {
    const directions = new Set();
    data.forEach(trip => {
      if (trip.tripDirection) {
        directions.add(trip.tripDirection);
      }
    });
    return Array.from(directions).sort();
  };

  // Function to extract unique conductors from data
  const extractConductors = (data) => {
    const conductors = new Set();
    data.forEach(trip => {
      if (trip.conductorId) {
        conductors.add(trip.conductorId);
      }
    });
    return Array.from(conductors).sort();
  };

  // Function to apply filters to remittance data
  const applyFilters = () => {
    let filtered = [...remittanceData];

    // Apply trip direction filter
    if (selectedTripDirection) {
      filtered = filtered.filter(trip => trip.tripDirection === selectedTripDirection);
    }

    // Apply conductor filter
    if (selectedConductor) {
      filtered = filtered.filter(trip => trip.conductorId === selectedConductor);
    }

    setFilteredRemittanceData(filtered);

    // Recalculate summary and grouped data based on filtered data
    const filteredSummary = calculateRemittanceSummary(filtered);
    const filteredGrouped = groupRemittanceByconductor(filtered);

    setSummary(filteredSummary);
    setGroupedData(filteredGrouped);
  };

  // Function to load remittance data with provided dates array
  const handleLoadRemittanceDataWithDates = async (dates, selectedDateValue) => {
    setLoading(true);
    try {
      
      let data;
      if (selectedDateValue) {
        // Load data for specific date
        data = await loadRemittanceData(selectedDateValue);
      } else {
        // Load data for all available dates
        const allData = [];
        for (const date of dates) {
          const dateData = await loadRemittanceData(date);
          allData.push(...dateData);
        }
        data = allData;
      }
      
      const summaryData = calculateRemittanceSummary(data);
      const grouped = groupRemittanceByconductor(data);
      const validation = validateRemittanceData(data);
      
      // Extract available trip directions from the loaded data
      const tripDirections = extractTripDirections(data);
      setAvailableTripDirections(tripDirections);
      
      // Extract available conductors from the loaded data
      const conductors = extractConductors(data);
      setAvailableConductors(conductors);
      
      // Fetch conductor details with bus numbers
      const conductorDetails = await getAllConductorDetails();
      setConductorData(conductorDetails);
      
      setRemittanceData(data);
      setFilteredRemittanceData(data); // Initialize filtered data
      setSummary(summaryData);
      setGroupedData(grouped);
      setValidationResults(validation);
      
    } catch (error) {
      console.error('Error loading remittance data:', error);
      // Reset data on error
      setRemittanceData([]);
      setFilteredRemittanceData([]);
      setSummary({
        totalTrips: 0,
        totalRevenue: 0,
        totalPassengers: 0,
        totalTickets: 0,
        averageFare: 0
      });
      setGroupedData({});
      setAvailableTripDirections([]);
      setAvailableConductors([]);
    } finally {
      setLoading(false);
    }
  };

  // Function to load remittance data
  const handleLoadRemittanceData = async () => {
    return handleLoadRemittanceDataWithDates(availableDates, selectedDate);
  };

  const handleExportToExcel = async () => {
    try {
      // Create a new workbook
      const workbook = XLSX.utils.book_new();

      // Filter to only show trips with tickets
      const tripsWithTickets = filteredRemittanceData.filter(trip => trip.ticketCount > 0);

      // Create summary data
      const summaryData = [
        ['B-Go Bus Transportation - Daily Trips Remittance Report'],
        [''],
        ['Report Date:', selectedDate ? formatDate(selectedDate) : 'All Dates'],
        ['Trip Direction:', selectedTripDirection || 'All Directions'],
        ['Conductor:', selectedConductor || 'All Conductors'],
        ['Generated:', new Date().toLocaleString()],
        [''],
        ['SUMMARY'],
        ['Metric', 'Value'],
        ['Total Trips', summary.totalTrips],
        ['Total Revenue', `₱${summary.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ['Total Tickets', summary.totalPassengers],
        ['Average Fare', `₱${summary.averageFare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
        ['']
      ];

      // Create the summary worksheet
      const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
      
      // Apply formatting to summary sheet
      // Main title formatting
      summaryWS['A1'] = { 
        v: 'B-Go Bus Transportation - Daily Trips Remittance Report', 
        t: 's',
        s: {
          font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "007C91" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thick", color: { rgb: "000000" } },
            bottom: { style: "thick", color: { rgb: "000000" } },
            left: { style: "thick", color: { rgb: "000000" } },
            right: { style: "thick", color: { rgb: "000000" } }
          }
        }
      };

      // Summary headers formatting
      summaryWS['A9'] = { 
        v: 'Metric', 
        t: 's',
        s: {
          font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "17A2B8" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "medium", color: { rgb: "000000" } },
            bottom: { style: "medium", color: { rgb: "000000" } },
            left: { style: "medium", color: { rgb: "000000" } },
            right: { style: "medium", color: { rgb: "000000" } }
          }
        }
      };

      summaryWS['B9'] = { 
        v: 'Value', 
        t: 's',
        s: {
          font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "17A2B8" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "medium", color: { rgb: "000000" } },
            bottom: { style: "medium", color: { rgb: "000000" } },
            left: { style: "medium", color: { rgb: "000000" } },
            right: { style: "medium", color: { rgb: "000000" } }
          }
        }
      };

      // Apply borders and formatting to data rows
      for (let row = 10; row <= 13; row++) {
        ['A', 'B'].forEach(col => {
          const cellRef = col + row;
          if (!summaryWS[cellRef]) summaryWS[cellRef] = { v: '', t: 's' };
          summaryWS[cellRef].s = {
            border: {
              top: { style: "thin", color: { rgb: "000000" } },
              bottom: { style: "thin", color: { rgb: "000000" } },
              left: { style: "thin", color: { rgb: "000000" } },
              right: { style: "thin", color: { rgb: "000000" } }
            },
            alignment: { horizontal: col === 'A' ? "left" : "right", vertical: "center" }
          };
        });
      }

      // Set column widths
      summaryWS['!cols'] = [
        { wch: 25 }, // Column A
        { wch: 20 }  // Column B
      ];

      // Merge cells for title
      summaryWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 1, r: 0 } }];

      XLSX.utils.book_append_sheet(workbook, summaryWS, 'Summary');

      // Create main remittance data with discount breakdown
      if (tripsWithTickets.length > 0) {
        const mainTableData = [
          ['Daily Trips Remittance Summary'],
          [''],
          ['Conductor ID', 'Bus #', 'Trip Number', 'Date & Time', 'Trip Direction', 'Tickets', 'Regular', 'PWD', 'Senior', 'Student', 'Revenue']
        ];

        tripsWithTickets.forEach(trip => {
          const dateTime = (() => {
            try {
              const dateStr = trip.date ? formatDate(trip.date) : 'N/A';
              const timeStr = trip.startTime ? formatTime(trip.startTime) : 'N/A';
              return `${dateStr} ${timeStr}`;
            } catch (error) {
              return `${trip.date || 'N/A'} ${trip.startTime ? formatTime(trip.startTime) : 'N/A'}`;
            }
          })();

          // Calculate discount breakdown for this trip
          const breakdown = calculateTripDiscountBreakdown(trip);

          mainTableData.push([
            trip.conductorId,
            conductorData[trip.conductorId]?.busNumber || 'N/A',
            trip.tripNumber,
            dateTime,
            trip.tripDirection,
            trip.ticketCount,
            `₱${breakdown.regular.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `₱${breakdown.pwd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `₱${breakdown.senior.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `₱${breakdown.student.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `₱${trip.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          ]);
        });

        // Calculate totals for discount breakdown
        const totalBreakdown = tripsWithTickets.reduce((acc, trip) => {
          const breakdown = calculateTripDiscountBreakdown(trip);
          return {
            regular: acc.regular + breakdown.regular,
            pwd: acc.pwd + breakdown.pwd,
            senior: acc.senior + breakdown.senior,
            student: acc.student + breakdown.student
          };
        }, { regular: 0, pwd: 0, senior: 0, student: 0 });

        // Add total row
        const totalRevenue = tripsWithTickets.reduce((sum, trip) => sum + trip.totalRevenue, 0);
        mainTableData.push([
          '', '', '', '', `TOTAL (${tripsWithTickets.length} trips):`,
          tripsWithTickets.reduce((sum, trip) => sum + trip.ticketCount, 0),
          `₱${totalBreakdown.regular.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₱${totalBreakdown.pwd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₱${totalBreakdown.senior.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₱${totalBreakdown.student.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `₱${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        ]);

        const mainWS = XLSX.utils.aoa_to_sheet(mainTableData);

        // Apply formatting to main report
        // Title formatting
        mainWS['A1'] = { 
          v: 'Daily Trips Remittance Summary', 
          t: 's',
          s: {
            font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "007C91" } },
            alignment: { horizontal: "center", vertical: "center" },
            border: {
              top: { style: "thick", color: { rgb: "000000" } },
              bottom: { style: "thick", color: { rgb: "000000" } },
              left: { style: "thick", color: { rgb: "000000" } },
              right: { style: "thick", color: { rgb: "000000" } }
            }
          }
        };

        // Header row formatting
        const headerCols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
        headerCols.forEach(col => {
          const cellRef = col + '3';
          if (mainWS[cellRef]) {
            mainWS[cellRef].s = {
              font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "28A745" } },
              alignment: { horizontal: "center", vertical: "center" },
              border: {
                top: { style: "medium", color: { rgb: "000000" } },
                bottom: { style: "medium", color: { rgb: "000000" } },
                left: { style: "medium", color: { rgb: "000000" } },
                right: { style: "medium", color: { rgb: "000000" } }
              }
            };
          }
        });

        // Data rows formatting
        const dataStartRow = 4;
        const dataEndRow = dataStartRow + tripsWithTickets.length - 1;
        for (let row = dataStartRow; row <= dataEndRow; row++) {
          headerCols.forEach((col, index) => {
            const cellRef = col + row;
            if (!mainWS[cellRef]) mainWS[cellRef] = { v: '', t: 's' };
            mainWS[cellRef].s = {
              border: {
                top: { style: "thin", color: { rgb: "000000" } },
                bottom: { style: "thin", color: { rgb: "000000" } },
                left: { style: "thin", color: { rgb: "000000" } },
                right: { style: "thin", color: { rgb: "000000" } }
              },
              alignment: { 
                horizontal: index >= 5 ? "right" : "center", 
                vertical: "center" 
              }
            };
          });
        }

        // Total row formatting
        const totalRow = dataEndRow + 1;
        headerCols.forEach((col, index) => {
          const cellRef = col + totalRow;
          if (!mainWS[cellRef]) mainWS[cellRef] = { v: '', t: 's' };
          mainWS[cellRef].s = {
            font: { bold: true, sz: 11 },
            fill: { fgColor: { rgb: "F8F9FA" } },
            border: {
              top: { style: "medium", color: { rgb: "000000" } },
              bottom: { style: "medium", color: { rgb: "000000" } },
              left: { style: "medium", color: { rgb: "000000" } },
              right: { style: "medium", color: { rgb: "000000" } }
            },
            alignment: { 
              horizontal: index >= 5 ? "right" : "center", 
              vertical: "center" 
            }
          };
        });

        // Set column widths
        mainWS['!cols'] = [
          { wch: 15 }, // Conductor ID
          { wch: 8 },  // Bus #
          { wch: 10 }, // Trip Number
          { wch: 20 }, // Date & Time
          { wch: 25 }, // Trip Direction
          { wch: 10 }, // Tickets
          { wch: 12 }, // Regular
          { wch: 12 }, // PWD
          { wch: 12 }, // Senior
          { wch: 12 }, // Student
          { wch: 15 }  // Revenue
        ];

        // Merge cells for title
        mainWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 10, r: 0 } }];

        XLSX.utils.book_append_sheet(workbook, mainWS, 'Main Report');
      }

      // Create detailed breakdown by conductor (only for conductors with tickets)
      if (Object.keys(groupedData).length > 0) {
        Object.entries(groupedData)
          .filter(([conductorId, trips]) => {
            // Only include conductors that have trips with tickets
            return trips.some(trip => trip.conductorId && trip.ticketCount > 0);
          })
          .forEach(([conductorId, trips]) => {
            // Filter to only trips with tickets
            const tripsWithTicketsForConductor = trips.filter(trip => trip.conductorId && trip.ticketCount > 0);
            
            const conductorSummary = {
              totalTrips: tripsWithTicketsForConductor.length,
              totalRevenue: tripsWithTicketsForConductor.reduce((sum, trip) => sum + trip.totalRevenue, 0),
              totalPassengers: tripsWithTicketsForConductor.reduce((sum, trip) => sum + trip.totalPassengers, 0),
              totalTickets: tripsWithTicketsForConductor.reduce((sum, trip) => sum + (trip.ticketCount || 0), 0)
            };

          const conductorSheetData = [
            [`Conductor: ${conductorId} - Bus #${conductorData[conductorId]?.busNumber || 'N/A'}`],
            [`${conductorSummary.totalTrips} trips, ₱${conductorSummary.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, ${conductorSummary.totalTickets} tickets`],
            [''],
            ['Trip #', 'Date & Time', 'Direction', 'Passengers', 'Regular', 'PWD', 'Senior', 'Student', 'Revenue']
          ];

            tripsWithTicketsForConductor.forEach(trip => {
            const dateTime = (() => {
              try {
                const dateStr = trip.date ? formatDate(trip.date) : 'N/A';
                const timeStr = trip.startTime ? formatTime(trip.startTime) : 'N/A';
                return `${dateStr} ${timeStr}`;
              } catch (error) {
                return `${trip.date || 'N/A'} ${trip.startTime ? formatTime(trip.startTime) : 'N/A'}`;
              }
            })();

              // Calculate discount breakdown for this trip
              const breakdown = calculateTripDiscountBreakdown(trip);

            conductorSheetData.push([
              trip.tripNumber,
              dateTime,
              trip.tripDirection,
              trip.totalPassengers || 0,
                `₱${breakdown.regular.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                `₱${breakdown.pwd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                `₱${breakdown.senior.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                `₱${breakdown.student.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              `₱${trip.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            ]);
          });

            // Calculate totals for discount breakdown
            const conductorTotalBreakdown = tripsWithTicketsForConductor.reduce((acc, trip) => {
              const breakdown = calculateTripDiscountBreakdown(trip);
              return {
                regular: acc.regular + breakdown.regular,
                pwd: acc.pwd + breakdown.pwd,
                senior: acc.senior + breakdown.senior,
                student: acc.student + breakdown.student
              };
            }, { regular: 0, pwd: 0, senior: 0, student: 0 });

          // Add conductor total
          conductorSheetData.push([
            '', '', `Conductor ${conductorId} Total:`,
            conductorSummary.totalPassengers,
              `₱${conductorTotalBreakdown.regular.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              `₱${conductorTotalBreakdown.pwd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              `₱${conductorTotalBreakdown.senior.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              `₱${conductorTotalBreakdown.student.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `₱${conductorSummary.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          ]);

          const conductorWS = XLSX.utils.aoa_to_sheet(conductorSheetData);

          // Apply formatting to conductor sheet
          // Title formatting
          conductorWS['A1'] = { 
            v: `Conductor: ${conductorId} - Bus #${conductorData[conductorId]?.busNumber || 'N/A'}`, 
            t: 's',
            s: {
              font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
              fill: { fgColor: { rgb: "6F42C1" } },
              alignment: { horizontal: "center", vertical: "center" },
              border: {
                top: { style: "thick", color: { rgb: "000000" } },
                bottom: { style: "thick", color: { rgb: "000000" } },
                left: { style: "thick", color: { rgb: "000000" } },
                right: { style: "thick", color: { rgb: "000000" } }
              }
            }
          };

          // Summary row formatting
          if (conductorWS['A2']) {
            conductorWS['A2'].s = {
              font: { bold: true, sz: 11, color: { rgb: "495057" } },
              fill: { fgColor: { rgb: "E9ECEF" } },
              alignment: { horizontal: "center", vertical: "center" },
              border: {
                top: { style: "thin", color: { rgb: "000000" } },
                bottom: { style: "thin", color: { rgb: "000000" } },
                left: { style: "thin", color: { rgb: "000000" } },
                right: { style: "thin", color: { rgb: "000000" } }
              }
            };
          }

          // Header row formatting
          const conductorHeaderCols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
          conductorHeaderCols.forEach(col => {
            const cellRef = col + '4';
            if (conductorWS[cellRef]) {
              conductorWS[cellRef].s = {
                font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
                fill: { fgColor: { rgb: "FD7E14" } },
                alignment: { horizontal: "center", vertical: "center" },
                border: {
                  top: { style: "medium", color: { rgb: "000000" } },
                  bottom: { style: "medium", color: { rgb: "000000" } },
                  left: { style: "medium", color: { rgb: "000000" } },
                  right: { style: "medium", color: { rgb: "000000" } }
                }
              };
            }
          });

          // Data rows formatting
          const conductorDataStartRow = 5;
            const conductorDataEndRow = conductorDataStartRow + tripsWithTicketsForConductor.length - 1;
          
          for (let row = conductorDataStartRow; row <= conductorDataEndRow; row++) {
            conductorHeaderCols.forEach((col, index) => {
              const cellRef = col + row;
              if (!conductorWS[cellRef]) conductorWS[cellRef] = { v: '', t: 's' };
              conductorWS[cellRef].s = {
                border: {
                  top: { style: "thin", color: { rgb: "000000" } },
                  bottom: { style: "thin", color: { rgb: "000000" } },
                  left: { style: "thin", color: { rgb: "000000" } },
                  right: { style: "thin", color: { rgb: "000000" } }
                },
                alignment: {
                  horizontal: index >= 3 ? "right" : "center",
                  vertical: "center"
                }
              };
            });
          }

          // Total row formatting
          const conductorTotalRow = conductorDataEndRow + 1;
          conductorHeaderCols.forEach((col, index) => {
            const cellRef = col + conductorTotalRow;
            if (!conductorWS[cellRef]) conductorWS[cellRef] = { v: '', t: 's' };
            conductorWS[cellRef].s = {
              font: { bold: true, sz: 11 },
              fill: { fgColor: { rgb: "E8F4F8" } },
              border: {
                top: { style: "medium", color: { rgb: "17A2B8" } },
                bottom: { style: "medium", color: { rgb: "17A2B8" } },
                left: { style: "medium", color: { rgb: "17A2B8" } },
                right: { style: "medium", color: { rgb: "17A2B8" } }
              },
              alignment: {
                horizontal: index >= 3 ? "right" : "center",
                vertical: "center"
              }
            };
          });

          // Set column widths
          conductorWS['!cols'] = [
            { wch: 12 }, // Trip #
            { wch: 20 }, // Date & Time
            { wch: 25 }, // Direction
            { wch: 12 }, // Passengers
            { wch: 12 }, // Regular
            { wch: 12 }, // PWD
            { wch: 12 }, // Senior
            { wch: 12 }, // Student
            { wch: 15 }  // Revenue
          ];

          // Merge cells for title and summary
          conductorWS['!merges'] = [
            { s: { c: 0, r: 0 }, e: { c: 8, r: 0 } }, // Title
            { s: { c: 0, r: 1 }, e: { c: 8, r: 1 } }  // Summary
          ];

          XLSX.utils.book_append_sheet(workbook, conductorWS, `Conductor ${conductorId}`);
        });
      }

      // Generate filename
      const dateStr = selectedDate ? formatDate(selectedDate) : 'All_Dates';
      const filename = `Remittance_Report_${dateStr.replace(/\//g, '-')}_${new Date().toISOString().split('T')[0]}.xlsx`;

      // Save the file
      XLSX.writeFile(workbook, filename);

      // Log the export activity (don't let logging errors break the export)
      try {
        await logActivity(
          ACTIVITY_TYPES.DATA_EXPORT,
          `Exported Daily Trips Remittance report to Excel`,
          {
            filename,
            reportType: 'Daily Trips Remittance',
            dateFilter: selectedDate || 'All Dates',
            tripDirectionFilter: selectedTripDirection || 'All Directions',
            conductorFilter: selectedConductor || 'All Conductors',
            totalTrips: summary?.totalTrips || 0,
            totalRevenue: summary?.totalRevenue || 0,
            totalPassengers: summary?.totalPassengers || 0,
            totalTickets: summary?.totalTickets || 0,
            uniqueTrips: tripsWithTickets.length,
            conductorsCount: Object.entries(groupedData).filter(([_, trips]) => 
              trips.some(trip => trip.conductorId && trip.ticketCount > 0)
            ).length,
            sheetsCreated: {
              summary: true,
              mainReport: tripsWithTickets.length > 0,
              conductorBreakdowns: Object.entries(groupedData).filter(([_, trips]) => 
                trips.some(trip => trip.conductorId && trip.ticketCount > 0)
              ).length
            }
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

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
  };

  const handleTripDirectionChange = (e) => {
    setSelectedTripDirection(e.target.value);
  };

  const handleConductorChange = (e) => {
    setSelectedConductor(e.target.value);
  };

  const toggleValidationResults = () => {
    setShowValidation(!showValidation);
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      // Force cache refresh by invalidating cache first
      if (selectedDate) {
        await forceRefreshRemittanceCache(selectedDate);
      } else {
        // Refresh all dates
        for (const date of availableDates) {
          await forceRefreshRemittanceCache(date);
        }
      }

      // Reload data
      await handleLoadRemittanceData();
    } catch (error) {
      console.error('Error refreshing remittance data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || summary === null) {
    return (
      <div className="revenue-container">
        <div className="revenue-content-area">
          <div className="revenue-loading-state">
            <p>Loading remittance data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="revenue-container revenue-remittance-print-container">
      {/* Print Header */}
      <div className="revenue-print-header">
        <div className="revenue-company-info">
          <h1>B-Go Bus Transportation</h1>
          <p>Daily Trips Remittance Report</p>
        </div>
        <div className="revenue-report-info">
          <p><strong>Report Date:</strong> {selectedDate ? formatDate(selectedDate) : 'All Dates'}</p>
          {selectedTripDirection && <p><strong>Trip Direction:</strong> {selectedTripDirection}</p>}
          {selectedConductor && <p><strong>Conductor:</strong> {selectedConductor}</p>}
          <p><strong>Generated:</strong> {new Date().toLocaleString()}</p>
          <p><strong>Total Trips:</strong> {summary.totalTrips}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="revenue-filters">
        <div className="revenue-filter-group">
          <label className="revenue-filter-label">Select Date</label>
          <select
            value={selectedDate}
            onChange={handleDateChange}
            className="revenue-filter-select"
          >
            <option value="">All Dates</option>
            {availableDates.map((date) => (
              <option key={date} value={date}>
                {formatDate(date)}
              </option>
            ))}
          </select>
        </div>

        <div className="revenue-filter-group">
          <label className="revenue-filter-label">Trip Direction</label>
          <select
            value={selectedTripDirection}
            onChange={handleTripDirectionChange}
            className="revenue-filter-select"
          >
            <option value="">All Trip Directions</option>
            {availableTripDirections.map((direction) => (
              <option key={direction} value={direction}>
                {direction}
              </option>
            ))}
          </select>
        </div>

        <div className="revenue-filter-group">
          <label className="revenue-filter-label">Conductor</label>
          <select
            value={selectedConductor}
            onChange={handleConductorChange}
            className="revenue-filter-select"
          >
            <option value="">All Conductors</option>
            {availableConductors.map((conductorId) => (
              <option key={conductorId} value={conductorId}>
                {conductorId}
              </option>
            ))}
          </select>
        </div>

        {/* Clear Filters Button */}
        <div className="revenue-filter-group">
          <label className="revenue-filter-label">&nbsp;</label>
          <button
            onClick={() => {
              setSelectedDate('');
              setSelectedRoute('');
              setSelectedConductor('');
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
              if (loading || summary === null) {
                return 'Loading...';
              }
              if (filteredRemittanceData && filteredRemittanceData.length > 0) {
                const totalTrips = filteredRemittanceData.length;
                const totalPassengers = filteredRemittanceData.reduce((sum, trip) => sum + (trip.totalPassengers || 0), 0);
                return `${totalTrips} trips • ${totalPassengers} passengers`;
              }
              return '0 trips • 0 passengers';
            })()}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="revenue-content-area">
        <div className="revenue-daily-container">
          {/* Summary Cards */}
          <div className="revenue-daily-summary-card-container">
            <div className="revenue-daily-header-pattern"></div>
            <div className="revenue-summary-cards">
               <div className="revenue-summary-card">
                <h3 className="revenue-card-title">Total Revenue</h3>
                <p className="revenue-card-value">{formatCurrency(summary?.totalRevenue || 0)}</p>
              </div>
              <div className="revenue-summary-card">
                <h3 className="revenue-card-title">Total Trips</h3>
                <p className="revenue-card-value">{summary?.totalTrips || 0}</p>
              </div>
              <div className="revenue-summary-card">
                <h3 className="revenue-card-title">Total Passengers</h3>
                <p className="revenue-card-value">{summary?.totalPassengers || 0}</p>
              </div>
              <div className="revenue-summary-card">
                <h3 className="revenue-card-title">Total Tickets</h3>
                <p className="revenue-card-value">{summary?.totalTickets || 0}</p>
              </div>
            </div>
          </div>

          {/* Controls */}
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
              disabled={loading || filteredRemittanceData.length === 0}
            >
              <PiMicrosoftExcelLogoFill size={20} /> Export to Excel
            </button>
          </div>


          {/* Main Remittance Table */}
          <div className="revenue-breakdown-section">
            <h3 className="revenue-breakdown-title">Daily Trips Remittance Summary</h3>
            
            {filteredRemittanceData.length > 0 ? (
              <div className="revenue-table-container">
                <table className="revenue-remittance-base-table revenue-remittance-summary-table">
                  <thead>
                    <tr>
                      <th rowSpan={2}>Conductor ID</th>
                      <th rowSpan={2}>Bus #</th>
                      <th rowSpan={2}>Trip #</th>
                      <th rowSpan={2}>Date & Time</th>
                      <th rowSpan={2}>Trip Direction</th>
                      <th rowSpan={2}>Tickets</th>
                      <th colSpan={4} style={{ textAlign: 'center', backgroundColor: '#f8f9fa', color: '#495057', fontSize: '12px', padding: '10px 8px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Discount Breakdown</th>
                      <th rowSpan={2}>Revenue</th>
                    </tr>
                    <tr>
                      <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>Reg</th>
                      <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>PWD</th>
                      <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>Sen</th>
                      <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>Std</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRemittanceData
                      .filter(trip => trip.ticketCount > 0) // Only show trips with tickets
                      .map((trip, index) => {
                        const breakdown = calculateTripDiscountBreakdown(trip);
                        return (
                      <tr key={index}>
                        <td>{trip.conductorId}</td>
                        <td style={{ textAlign: 'center' }}>{conductorData[trip.conductorId]?.busNumber || 'N/A'}</td>
                        <td style={{ textAlign: 'center' }}>{trip.tripNumber}</td>
                        <td>
                          {(() => {
                            try {
                              // Use trip.date for the date part and trip.startTime for the time part
                              const dateStr = trip.date ? formatDate(trip.date) : 'N/A';
                              const timeStr = trip.startTime ? formatTime(trip.startTime) : 'N/A';
                              return `${dateStr} ${timeStr}`;
                            } catch (error) {
                              return `${trip.date || 'N/A'} ${trip.startTime ? formatTime(trip.startTime) : 'N/A'}`;
                            }
                          })()}
                        </td>
                        <td>{trip.tripDirection}</td>
                        <td style={{ textAlign: 'center' }}>{trip.ticketCount}</td>
                        <td>{formatCurrency(breakdown.regular)}</td>
                        <td>{formatCurrency(breakdown.pwd)}</td>
                        <td>{formatCurrency(breakdown.senior)}</td>
                        <td>{formatCurrency(breakdown.student)}</td>
                        <td className="revenue-fare-amount">{formatCurrency(trip.totalRevenue)}</td>
                      </tr>
                        );
                    })}
                    {/* Total Row */}
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'right', fontWeight: 'bold' }}>
                        TOTAL ({filteredRemittanceData.filter(trip => trip.ticketCount > 0).length} trips):
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                        {filteredRemittanceData.filter(trip => trip.ticketCount > 0).reduce((sum, trip) => sum + trip.ticketCount, 0)}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                        {formatCurrency(filteredRemittanceData.filter(trip => trip.ticketCount > 0).reduce((sum, trip) => {
                          const breakdown = calculateTripDiscountBreakdown(trip);
                          return sum + breakdown.regular;
                        }, 0))}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                        {formatCurrency(filteredRemittanceData.filter(trip => trip.ticketCount > 0).reduce((sum, trip) => {
                          const breakdown = calculateTripDiscountBreakdown(trip);
                          return sum + breakdown.pwd;
                        }, 0))}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                        {formatCurrency(filteredRemittanceData.filter(trip => trip.ticketCount > 0).reduce((sum, trip) => {
                          const breakdown = calculateTripDiscountBreakdown(trip);
                          return sum + breakdown.senior;
                        }, 0))}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                        {formatCurrency(filteredRemittanceData.filter(trip => trip.ticketCount > 0).reduce((sum, trip) => {
                          const breakdown = calculateTripDiscountBreakdown(trip);
                          return sum + breakdown.student;
                        }, 0))}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                        {formatCurrency(filteredRemittanceData.filter(trip => trip.ticketCount > 0).reduce((sum, trip) => sum + trip.totalRevenue, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="revenue-empty-state">
                <h3>No remittance data found</h3>
                <p>
                  {selectedDate ? 
                    `No remittance data available for the selected filters.` :
                    'No remittance data available. Please check if there are any available dates or try refreshing.'
                  }
                </p>
                {(selectedTripDirection || selectedConductor) && (
                  <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                    Try removing some filters to see more results.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Detailed Breakdown by Conductor */}
          {Object.keys(groupedData).length > 0 && (
            <div className="revenue-breakdown-section">
              <h3 className="revenue-breakdown-title">Detailed Breakdown by Conductor</h3>
              
              {Object.entries(groupedData)
                .filter(([conductorId, trips]) => {
                  // Only show conductors that have trips with tickets
                  return trips.some(trip => trip.conductorId && trip.ticketCount > 0);
                })
                .map(([conductorId, trips]) => {
                  // Recalculate summary based only on trips with tickets
                  const tripsWithTickets = trips.filter(trip => trip.conductorId && trip.ticketCount > 0);
                  const conductorSummary = {
                    totalTrips: tripsWithTickets.length,
                    totalRevenue: tripsWithTickets.reduce((sum, trip) => sum + trip.totalRevenue, 0),
                    totalPassengers: tripsWithTickets.reduce((sum, trip) => sum + trip.totalPassengers, 0),
                    totalTickets: tripsWithTickets.reduce((sum, trip) => sum + (trip.ticketCount || 0), 0)
                  };

                  return (
                    <div key={conductorId} className="revenue-section-container">
                      <h4 className="revenue-section-title revenue-section-conductor">
                        Conductor: {conductorId} - Bus #{conductorData[conductorId]?.busNumber || 'N/A'}
                        <span style={{ marginLeft: '10px', fontSize: '14px', fontWeight: 'normal' }}>
                          ({conductorSummary.totalTrips} trips, {formatCurrency(conductorSummary.totalRevenue)}, {conductorSummary.totalTickets} tickets)
                        </span>
                      </h4>
                      
                      <div className="revenue-table-container">
                        <table className="revenue-remittance-base-table revenue-remittance-conductor-table">
                          <thead>
                            <tr>
                              <th rowSpan={2}>Trip #</th>
                              <th rowSpan={2}>Date & Time</th>
                              <th rowSpan={2}>Direction</th>
                              <th rowSpan={2}>Passengers</th>
                              <th colSpan={4} style={{ textAlign: 'center', backgroundColor: '#f8f9fa', color: '#495057', fontSize: '12px', padding: '10px 8px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Discount Breakdown</th>
                              <th rowSpan={2}>Revenue</th>
                            </tr>
                            <tr>
                              <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>Reg</th>
                              <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>PWD</th>
                              <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>Sen</th>
                              <th style={{ fontSize: '12px', backgroundColor: '#f8f9fa', padding: '10px 8px' }}>Std</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tripsWithTickets.map((trip, tripIndex) => {
                              const breakdown = calculateTripDiscountBreakdown(trip);
                              return (
                              <tr key={tripIndex}>
                                <td style={{ textAlign: 'center' }}>
                                  {trip.tripNumber}
                                </td>
                                <td>
                                  {(() => {
                                    try {
                                      const dateStr = trip.date ? formatDate(trip.date) : 'N/A';
                                      const timeStr = trip.startTime ? formatTime(trip.startTime) : 'N/A';
                                      return `${dateStr} ${timeStr}`;
                                    } catch (error) {
                                      return `${trip.date || 'N/A'} ${trip.startTime ? formatTime(trip.startTime) : 'N/A'}`;
                                    }
                                  })()}
                                </td>
                                <td>
                                  {trip.tripDirection}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {trip.totalPassengers || 0}
                                </td>
                                <td>{formatCurrency(breakdown.regular)}</td>
                                <td>{formatCurrency(breakdown.pwd)}</td>
                                <td>{formatCurrency(breakdown.senior)}</td>
                                <td>{formatCurrency(breakdown.student)}</td>
                                <td className="revenue-fare-amount">
                                  {formatCurrency(trip.totalRevenue)}
                                </td>
                              </tr>
                              );
                            })}
                            {/* Conductor Total Row - FIXED VERSION */}
                            <tr className="revenue-conductor-total-row">
                              <td colSpan="3">
                                Conductor {conductorId} Total:
                              </td>
                              <td>
                                {conductorSummary.totalPassengers}
                              </td>
                              <td>
                                {formatCurrency(tripsWithTickets.reduce((sum, trip) => {
                                  const breakdown = calculateTripDiscountBreakdown(trip);
                                  return sum + breakdown.regular;
                                }, 0))}
                              </td>
                              <td>
                                {formatCurrency(tripsWithTickets.reduce((sum, trip) => {
                                  const breakdown = calculateTripDiscountBreakdown(trip);
                                  return sum + breakdown.pwd;
                                }, 0))}
                              </td>
                              <td>
                                {formatCurrency(tripsWithTickets.reduce((sum, trip) => {
                                  const breakdown = calculateTripDiscountBreakdown(trip);
                                  return sum + breakdown.senior;
                                }, 0))}
                              </td>
                              <td>
                                {formatCurrency(tripsWithTickets.reduce((sum, trip) => {
                                  const breakdown = calculateTripDiscountBreakdown(trip);
                                  return sum + breakdown.student;
                                }, 0))}
                              </td>
                              <td>
                                {formatCurrency(conductorSummary.totalRevenue)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Print Summary for detailed breakdown */}
          <div className="revenue-print-summary">
            <h3>Remittance Summary by Conductor</h3>
            <div className="revenue-breakdown-summary">
              {Object.entries(groupedData).map(([conductorId, trips]) => {
                const conductorSummary = trips.conductorSummary || {
                  totalTrips: trips.length,
                  totalRevenue: trips.reduce((sum, trip) => sum + trip.totalRevenue, 0),
                  totalPassengers: trips.reduce((sum, trip) => sum + trip.totalPassengers, 0),
                  totalTickets: trips.reduce((sum, trip) => sum + (trip.ticketCount || 0), 0)
                };

                return (
                  <div key={conductorId} className="revenue-breakdown-item">
                    <span className="revenue-breakdown-label">
                      {conductorId}: {conductorSummary.totalTrips} trips, {conductorSummary.totalTickets} tickets
                    </span>
                    <span className="revenue-breakdown-value">
                      {formatCurrency(conductorSummary.totalRevenue)}
                    </span>
                  </div>
                );
              })}
              
              <div className="revenue-breakdown-item revenue-breakdown-total">
                <span className="revenue-breakdown-label">
                  Total: {summary.totalTrips} trips, {summary.totalPassengers} tickets
                </span>
                <span className="revenue-breakdown-value">
                  {formatCurrency(summary.totalRevenue)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Print Footer */}
      <div className="revenue-print-footer">
        <div className="revenue-footer-left">
          <p>This remittance report was generated automatically by the B-Go Bus Transportation System</p>
        </div>
        <div className="revenue-footer-right">
          <p>Page 1 of 1 | Generated on: {new Date().toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
};

export default RemittanceReport;