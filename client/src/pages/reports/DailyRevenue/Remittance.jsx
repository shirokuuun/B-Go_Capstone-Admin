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
  formatTicketType
} from './Remittance.js';
import './DailyRevenue.css';

const RemittanceReport = () => {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTicketType, setSelectedTicketType] = useState('');
  const [selectedTripDirection, setSelectedTripDirection] = useState('');
  const [selectedConductor, setSelectedConductor] = useState('');
  const [loading, setLoading] = useState(false);
  const [remittanceData, setRemittanceData] = useState([]);
  const [filteredRemittanceData, setFilteredRemittanceData] = useState([]);
  const [availableDates, setAvailableDates] = useState([]);
  const [availableTripDirections, setAvailableTripDirections] = useState([]);
  const [availableConductors, setAvailableConductors] = useState([]);
  const [conductorData, setConductorData] = useState({});
  const [summary, setSummary] = useState({
    totalTrips: 0,
    totalRevenue: 0,
    totalPassengers: 0,
    totalTickets: 0,
    averageFare: 0
  });
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
  }, [remittanceData, selectedTicketType, selectedTripDirection, selectedConductor]);

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

    // Apply ticket type filter
    if (selectedTicketType) {
      filtered = filtered.filter(trip => {
        const type = trip.documentType || '';
        
        switch (selectedTicketType) {
          case 'conductor':
            // Conductor ticket is the default/fallback - anything that's not pre-ticket or pre-booking
            return !(type === 'preTicket' || type === 'preBooking');
          case 'pre-book':
            return type === 'preBooking';
          case 'pre-ticket':
            return type === 'preTicket';
          default:
            return true;
        }
      });
    }

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
      console.log('🚀 Loading remittance data for date:', selectedDateValue || 'All dates');
      
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
      
      console.log('📊 Remittance data loaded successfully');
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

  const handleExportToExcel = () => {
    try {
      // Create a new workbook
      const workbook = XLSX.utils.book_new();

      // Create summary data
      const summaryData = [
        ['B-Go Bus Transportation - Daily Trips Remittance Report'],
        [''],
        ['Report Date:', selectedDate ? formatDate(selectedDate) : 'All Dates'],
        ['Trip Direction:', selectedTripDirection || 'All Directions'],
        ['Ticket Type:', selectedTicketType || 'All Types'],
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

      // Create main remittance data
      if (filteredRemittanceData.length > 0) {
        const mainTableData = [
          ['Daily Trips Remittance Summary'],
          [''],
          ['Conductor ID', 'Bus #', 'Trip Number', 'Date & Time', 'Trip Direction', 'Tickets', 'Revenue']
        ];

        filteredRemittanceData.forEach(trip => {
          const dateTime = (() => {
            try {
              const dateStr = trip.date ? formatDate(trip.date) : 'N/A';
              const timeStr = trip.startTime ? formatTime(trip.startTime) : 'N/A';
              return `${dateStr} ${timeStr}`;
            } catch (error) {
              return `${trip.date || 'N/A'} ${trip.startTime ? formatTime(trip.startTime) : 'N/A'}`;
            }
          })();

          mainTableData.push([
            trip.conductorId,
            conductorData[trip.conductorId]?.busNumber || 'N/A',
            trip.tripNumber,
            dateTime,
            trip.tripDirection,
            trip.ticketCount,
            `₱${trip.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          ]);
        });

        // Add total row
        const totalRevenue = filteredRemittanceData.reduce((sum, trip) => sum + trip.totalRevenue, 0);
        mainTableData.push([
          '', '', '', '', `TOTAL (${filteredRemittanceData.length} trips):`,
          filteredRemittanceData.reduce((sum, trip) => sum + trip.ticketCount, 0),
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
        const headerCols = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
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
        const dataEndRow = dataStartRow + filteredRemittanceData.length - 1;
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
                horizontal: index === 5 || index === 6 ? "right" : "center", 
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
              horizontal: index === 5 || index === 6 ? "right" : "center", 
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
          { wch: 15 }  // Revenue
        ];

        // Merge cells for title
        mainWS['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 6, r: 0 } }];

        XLSX.utils.book_append_sheet(workbook, mainWS, 'Main Report');
      }

      // Create detailed breakdown by conductor
      if (Object.keys(groupedData).length > 0) {
        Object.entries(groupedData).forEach(([conductorId, trips]) => {
          const conductorSummary = trips.conductorSummary || {
            totalTrips: trips.length,
            totalRevenue: trips.reduce((sum, trip) => sum + trip.totalRevenue, 0),
            totalPassengers: trips.reduce((sum, trip) => sum + trip.totalPassengers, 0),
            totalTickets: trips.reduce((sum, trip) => sum + (trip.ticketCount || 0), 0)
          };

          const conductorSheetData = [
            [`Conductor: ${conductorId} - Bus #${conductorData[conductorId]?.busNumber || 'N/A'}`],
            [`${conductorSummary.totalTrips} trips, ₱${conductorSummary.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, ${conductorSummary.totalTickets} tickets`],
            [''],
            ['Trip #', 'Date & Time', 'Direction', 'Ticket Type', 'Passengers', 'Revenue']
          ];

          trips.filter(trip => trip.conductorId).forEach(trip => {
            const dateTime = (() => {
              try {
                const dateStr = trip.date ? formatDate(trip.date) : 'N/A';
                const timeStr = trip.startTime ? formatTime(trip.startTime) : 'N/A';
                return `${dateStr} ${timeStr}`;
              } catch (error) {
                return `${trip.date || 'N/A'} ${trip.startTime ? formatTime(trip.startTime) : 'N/A'}`;
              }
            })();

            conductorSheetData.push([
              trip.tripNumber,
              dateTime,
              trip.tripDirection,
              formatTicketType(trip.documentType),
              trip.totalPassengers || 0,
              `₱${trip.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            ]);
          });

          // Add conductor total
          conductorSheetData.push([
            '', '', '', `Conductor ${conductorId} Total:`,
            conductorSummary.totalPassengers,
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
          const conductorHeaderCols = ['A', 'B', 'C', 'D', 'E', 'F'];
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
          const conductorTrips = trips.filter(trip => trip.conductorId);
          const conductorDataEndRow = conductorDataStartRow + conductorTrips.length - 1;
          
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
                  horizontal: index === 4 || index === 5 ? "right" : "center", 
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
                horizontal: index === 4 || index === 5 ? "right" : "center", 
                vertical: "center" 
              }
            };
          });

          // Set column widths
          conductorWS['!cols'] = [
            { wch: 12 }, // Trip #
            { wch: 20 }, // Date & Time
            { wch: 25 }, // Direction
            { wch: 15 }, // Ticket Type
            { wch: 12 }, // Passengers
            { wch: 15 }  // Revenue
          ];

          // Merge cells for title and summary
          conductorWS['!merges'] = [
            { s: { c: 0, r: 0 }, e: { c: 5, r: 0 } }, // Title
            { s: { c: 0, r: 1 }, e: { c: 5, r: 1 } }  // Summary
          ];

          XLSX.utils.book_append_sheet(workbook, conductorWS, `Conductor ${conductorId}`);
        });
      }

      // Generate filename
      const dateStr = selectedDate ? formatDate(selectedDate) : 'All_Dates';
      const filename = `Remittance_Report_${dateStr.replace(/\//g, '-')}_${new Date().toISOString().split('T')[0]}.xlsx`;

      // Save the file
      XLSX.writeFile(workbook, filename);

      console.log('Excel file exported successfully');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export to Excel. Please try again.');
    }
  };

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
  };

  const handleTicketTypeChange = (e) => {
    setSelectedTicketType(e.target.value);
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

  const handleRefresh = () => {
    handleLoadRemittanceData();
  };

  if (loading) {
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
          {selectedTicketType && <p><strong>Ticket Type:</strong> {selectedTicketType}</p>}
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
          <label className="revenue-filter-label">Ticket Type</label>
          <select
            value={selectedTicketType}
            onChange={handleTicketTypeChange}
            className="revenue-filter-select"
          >
            <option value="">All Ticket Types</option>
            <option value="conductor">Conductor Ticket</option>
            <option value="pre-book">Pre-Booking</option>
            <option value="pre-ticket">Pre-Ticketing</option>
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
                <p className="revenue-card-value">{formatCurrency(summary.totalRevenue)}</p>
              </div>
              <div className="revenue-summary-card">
                <h3 className="revenue-card-title">Total Trips</h3>
                <p className="revenue-card-value">
                  {(() => {
                    // Count unique trips by combining conductorId, date, and tripNumber
                    const uniqueTrips = new Set();
                    
                    filteredRemittanceData.forEach(trip => {
                      if (trip.conductorId && trip.tripNumber) {
                        const tripDate = trip.date || trip.createdAt || 'unknown-date';
                        uniqueTrips.add(`${trip.conductorId}_${tripDate}_${trip.tripNumber}`);
                      }
                    });
                    
                    return uniqueTrips.size;
                  })()}
                </p>
              </div>
              <div className="revenue-summary-card">
                <h3 className="revenue-card-title">Total Passengers</h3>
                <p className="revenue-card-value">{summary.totalPassengers}</p>
              </div>
              <div className="revenue-summary-card">
                <h3 className="revenue-card-title">Total Tickets</h3>
                <p className="revenue-card-value">{summary.totalTickets}</p>
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
              📊 Export to Excel
            </button>
          </div>

          {/* Filter Summary */}
          {(selectedTicketType || selectedTripDirection || selectedConductor) && (
            <div className="revenue-breakdown-section" style={{ marginBottom: '20px' }}>
              <h3 className="revenue-breakdown-title">Active Filters</h3>
              <div style={{ padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '8px' }}>
                {selectedTicketType && (
                  <p style={{ margin: '5px 0', color: '#1565c0' }}>
                    <strong>Ticket Type:</strong> {selectedTicketType}
                  </p>
                )}
                {selectedTripDirection && (
                  <p style={{ margin: '5px 0', color: '#1565c0' }}>
                    <strong>Trip Direction:</strong> {selectedTripDirection}
                  </p>
                )}
                {selectedConductor && (
                  <p style={{ margin: '5px 0', color: '#1565c0' }}>
                    <strong>Conductor:</strong> {selectedConductor}
                  </p>
                )}
                <p style={{ margin: '5px 0', fontSize: '14px', color: '#666' }}>
                  Showing {filteredRemittanceData.length} of {remittanceData.length} total trips
                </p>
              </div>
            </div>
          )}

          {/* Main Remittance Table */}
          <div className="revenue-breakdown-section">
            <h3 className="revenue-breakdown-title">Daily Trips Remittance Summary</h3>
            
            {filteredRemittanceData.length > 0 ? (
              <div className="revenue-table-container">
                <table className="revenue-revenue-table revenue-remittance-breakdown-table">
                  <thead>
                    <tr>
                      <th>Conductor ID</th>
                      <th style={{ width: '20px', fontSize: '12px' }}>Bus #</th>
                      <th style={{ width: '40px', fontSize: '12px' }}>Trip #</th>
                      <th>Date & Time</th>
                      <th>Trip Direction</th>
                      <th style={{ width: '30px', fontSize: '12px' }}>Tickets</th>
                      <th style={{ width: '30px', fontSize: '12px' }}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRemittanceData.map((trip, index) => (
                      <tr key={index}>
                        <td className="revenue-trip-id">{trip.conductorId}</td>
                        <td className="revenue-trip-id" style={{ width: '60px', fontSize: '12px', textAlign: 'center', padding: '8px 4px' }}>{conductorData[trip.conductorId]?.busNumber || 'N/A'}</td>
                        <td className="revenue-trip-id" style={{ width: '10px', fontSize: '12px', textAlign: 'center', padding: '8px 4px' }}>{trip.tripNumber}</td>
                        <td>
                          {(() => {
                            try {
                              // Use trip.date for the date part and trip.startTime for the time part
                              const dateStr = trip.date ? formatDate(trip.date) : 'N/A';
                              const timeStr = trip.startTime ? formatTime(trip.startTime) : 'N/A';
                              return `${dateStr} ${timeStr}`;
                            } catch (error) {
                              console.error('Date formatting error:', error, 'Trip data:', trip);
                              return `${trip.date || 'N/A'} ${trip.startTime ? formatTime(trip.startTime) : 'N/A'}`;
                            }
                          })()}
                        </td>
                        <td className="revenue-trip-direction">{trip.tripDirection}</td>
                        <td style={{ textAlign: 'center', width: '40px', fontSize: '12px', padding: '8px 4px' }}>{trip.ticketCount}</td>
                        <td className="revenue-fare-amount" style={{ width: '70px', fontSize: '12px', padding: '8px 4px' }}>{formatCurrency(trip.totalRevenue)}</td>
                      </tr>
                    ))}
                    {/* Total Row */}
                    <tr style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold', borderTop: '2px solid #dee2e6' }}>
                      <td colSpan="5" style={{ textAlign: 'right', padding: '12px', fontSize: '14px' }}>
                        <strong>TOTAL ({filteredRemittanceData.length} trips):</strong>
                      </td>
                      <td style={{ textAlign: 'center', width: '40px', fontSize: '12px', padding: '12px 4px' }}>
                        <strong>{filteredRemittanceData.reduce((sum, trip) => sum + trip.ticketCount, 0)}</strong>
                      </td>
                      <td className="revenue-fare-amount" style={{ width: '70px', fontSize: '12px', padding: '12px 4px' }}>
                        <strong>{formatCurrency(filteredRemittanceData.reduce((sum, trip) => sum + trip.totalRevenue, 0))}</strong>
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
                {(selectedTicketType || selectedTripDirection || selectedConductor) && (
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
              
              {Object.entries(groupedData).map(([conductorId, trips]) => {
                const conductorSummary = trips.conductorSummary || {
                  totalTrips: trips.length,
                  totalRevenue: trips.reduce((sum, trip) => sum + trip.totalRevenue, 0),
                  totalPassengers: trips.reduce((sum, trip) => sum + trip.totalPassengers, 0),
                  totalTickets: trips.reduce((sum, trip) => sum + (trip.ticketCount || 0), 0)
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
                      <table className="revenue-revenue-table revenue-remittance-breakdown-table">
                        <thead>
                          <tr>
                            <th style={{width: '10px'}}>Trip #</th>
                            <th style={{width: '35px'}}>Date & Time</th>
                            <th style={{width: '30px'}}>Direction</th>
                            <th style={{width: '30px'}}>Ticket Type</th>
                            <th style={{ width: '20px' }}>Passengers</th>
                            <th style={{ width: '25px' }}>Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trips.filter(trip => trip.conductorId).map((trip, tripIndex) => (
                            <tr key={tripIndex}>
                              <td className="revenue-trip-id">
                                {trip.tripNumber}
                              </td>
                              <td>
                                {(() => {
                                  try {
                                    // Use trip.date for the date part and trip.startTime for the time part
                                    const dateStr = trip.date ? formatDate(trip.date) : 'N/A';
                                    const timeStr = trip.startTime ? formatTime(trip.startTime) : 'N/A';
                                    return `${dateStr} ${timeStr}`;
                                  } catch (error) {
                                    console.error('Date formatting error:', error, 'Trip data:', trip);
                                    return `${trip.date || 'N/A'} ${trip.startTime ? formatTime(trip.startTime) : 'N/A'}`;
                                  }
                                })()}
                              </td>
                              <td className="revenue-trip-direction">
                                {trip.tripDirection}
                              </td>
                              <td>
                                {formatTicketType(trip.documentType)}
                              </td>
                              <td style={{ textAlign: 'center', width: '120px' }}>
                                {trip.totalPassengers || 0}
                              </td>
                              <td className="revenue-fare-amount" style={{ width: '100px' }}>
                                {formatCurrency(trip.totalRevenue)}
                              </td>
                            </tr>
                          ))}
                          {/* Conductor Total Row */}
                          <tr style={{ backgroundColor: '#e8f4f8', fontWeight: 'bold', borderTop: '2px solid #17a2b8' }}>
                            <td colSpan="4" style={{ textAlign: 'right', padding: '12px', fontSize: '14px' }}>
                              <strong>Conductor {conductorId} Total:</strong>
                            </td>
                            <td style={{ textAlign: 'center', width: '120px', padding: '12px' }}>
                              <strong>{conductorSummary.totalPassengers}</strong>
                            </td>
                            <td className="revenue-fare-amount" style={{ width: '100px', padding: '12px' }}>
                              <strong>{formatCurrency(conductorSummary.totalRevenue)}</strong>
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