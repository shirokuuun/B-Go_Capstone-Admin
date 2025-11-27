import { 
  loadRemittanceData, 
  parseTicketDiscountBreakdown, 
  getAvailableRemittanceDates,
  getConductorDetails,
  formatTime
} from './Remittance.js';

const getDatesInRange = (startDate, endDate) => {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    dates.push(new Date(current).toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

export const fetchDiscountReportData = async (startDate, endDate) => {
  console.log(`🚀 Fetching Discounts. Start: "${startDate}", End: "${endDate}"`);

  try {
    let datesToFetch = [];

    if (startDate && endDate) {
      datesToFetch = getDatesInRange(startDate, endDate);
    } else {
      datesToFetch = await getAvailableRemittanceDates();
    }

    if (!datesToFetch || datesToFetch.length === 0) return { trips: [], tickets: [] };

    const allRemittanceData = await Promise.all(
      datesToFetch.map(async (date) => {
        try {
          const data = await loadRemittanceData(date);
          return data || [];
        } catch (e) {
          return [];
        }
      })
    );

    const flatTrips = allRemittanceData.flat();

    const uniqueConductorIds = [...new Set(flatTrips.map(t => t.conductorId).filter(Boolean))];

    const conductorBusMap = {};

    await Promise.all(uniqueConductorIds.map(async (id) => {
        try {
            const details = await getConductorDetails(id);
            conductorBusMap[id] = details.busNumber || 'N/A';
        } catch (e) {
            console.warn(`Could not fetch details for conductor ${id}`);
            conductorBusMap[id] = 'N/A';
        }
    }));
    
    // Arrays to hold our two different views
    const processedTrips = [];
    const processedTickets = [];

    flatTrips.forEach(trip => {
      // Get the correct bus number
      const currentBusNumber = conductorBusMap[trip.conductorId] || trip.tripData?.busNumber || 'N/A';
      
      // 1. TRIP LEVEL STATS
      let tripStats = {
        // Discounts
        senior: 0, pwd: 0, student: 0,
        // Revenue (Paid Amount)
        seniorRevenue: 0, pwdRevenue: 0, studentRevenue: 0,
        
        totalDiscount: 0, totalRevenue: 0,
        totalDiscountedPax: 0 
      };

      const allTickets = [
        ...(trip.tickets || []),     
        ...(trip.preBookings || []), 
        ...(trip.preTickets || [])   
      ];

      let tripHasDiscount = false;

      allTickets.forEach(ticket => {
        const revenueBreakdown = parseTicketDiscountBreakdown(ticket);

        // --- Ticket Level Calculations ---
        const seniorDisc = revenueBreakdown.senior * 0.25;
        const pwdDisc = revenueBreakdown.pwd * 0.25;
        const studentDisc = revenueBreakdown.student * 0.25;
        
        const ticketTotalDiscount = seniorDisc + pwdDisc + studentDisc;
        
        const ticketTotalRevenue = 
          revenueBreakdown.regular + revenueBreakdown.senior + 
          revenueBreakdown.pwd + revenueBreakdown.student;

        // Add to Trip Stats (Revenue)
        tripStats.seniorRevenue += revenueBreakdown.senior; 
        tripStats.pwdRevenue += revenueBreakdown.pwd;       
        tripStats.studentRevenue += revenueBreakdown.student; 
        
        tripStats.totalRevenue += ticketTotalRevenue;

        // Only process tickets that actually have a discount
        if (ticketTotalDiscount > 0) {
          tripHasDiscount = true;
          tripStats.senior += seniorDisc;
          tripStats.pwd += pwdDisc;
          tripStats.student += studentDisc;
          tripStats.totalDiscount += ticketTotalDiscount;

          // Determine Pax Count for this ticket
          let ticketPaxCount = 0;
          let ticketTypes = []; // For the ticket table "Type" column

          if (seniorDisc > 0) ticketTypes.push("Senior");
          if (pwdDisc > 0) ticketTypes.push("PWD");
          if (studentDisc > 0) ticketTypes.push("Student");

          if (Array.isArray(ticket.discountBreakdown) && ticket.discountBreakdown.length > 0) {
             ticketPaxCount = ticket.discountBreakdown.filter(item => {
                const type = (typeof item === 'object' ? item.type : item).toLowerCase();
                return type.includes('senior') || type.includes('pwd') || type.includes('student');
             }).length;
          } else {
             ticketPaxCount = 1; // Fallback
          }
          tripStats.totalDiscountedPax += ticketPaxCount;

                    let category = 'Conductor Ticket'; // Default
          const docType = (ticket.documentType || ticket.ticketType || '').toLowerCase();
          const source = (ticket.source || '').toLowerCase();

          if (docType === 'preticket' || source.includes('pre-ticketing')) {
            category = 'Pre-Ticket';
          } else if (docType === 'prebooking' || source.includes('pre-booking')) {
            category = 'Pre-Booking';
          } else {
            category = 'Conductor Ticket';
          }

          // --- 2. PUSH TO TICKET LIST (For the 2nd Table) ---
          processedTickets.push({
            uniqueKey: `${trip.date}-${trip.tripNumber}-${ticket.id}`,
            id: ticket.id,
            tripId: trip.tripNumber, 
            date: trip.date,
            time: formatTime(ticket.timestamp || trip.startTime),
            dateTime: ticket.timestamp ? (ticket.timestamp.toDate ? ticket.timestamp.toDate() : new Date(ticket.timestamp)) : new Date(trip.date),
            route: `${ticket.from || 'N/A'} → ${ticket.to || 'N/A'}`,
            busNumber: currentBusNumber, 
            conductor: trip.conductorId,
            
            // Ticket Specifics
            typeString: ticketTypes.join(', '),
            gross: ticketTotalRevenue + ticketTotalDiscount,
            discount: ticketTotalDiscount,
            paid: ticketTotalRevenue,
            
            // --- ADDED TICKET CATEGORY ---
            ticketCategory: category
          });
        }
      });

      // --- 3. PUSH TO TRIP LIST (For the 1st Table) ---
      if (tripHasDiscount) {
        processedTrips.push({
          id: `${trip.conductorId}-${trip.tripNumber}-${trip.date}`,
          tripId: trip.tripNumber || 'N/A',
          date: trip.date,
          time: formatTime(trip.startTime || trip.createdAt),
          dateTime: trip.dateTime || new Date(trip.date),
          route: trip.tickets?.[0] ? `${trip.tickets[0].from} → ${trip.tickets[0].to}` : 'Multiple/Mixed',
          direction: trip.tripDirection || 'N/A',
          busNumber: currentBusNumber,
          
          breakdown: tripStats,
          totalDiscount: tripStats.totalDiscount,
          totalRevenue: tripStats.totalRevenue, 
          totalDiscountedPax: tripStats.totalDiscountedPax
        });
      }
    });

    const sortedTrips = processedTrips.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
    const sortedTickets = processedTickets.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));

    return { trips: sortedTrips, tickets: sortedTickets };

  } catch (error) {
    console.error("❌ Error generating discount report:", error);
    return { trips: [], tickets: [] };
  }
};

export const calculateDiscountStats = (data) => {
  return data.reduce((acc, trip) => {
    acc.totalDiscount += trip.totalDiscount;
    acc.seniorDiscount += trip.breakdown.senior;
    acc.pwdDiscount += trip.breakdown.pwd;
    acc.studentDiscount += trip.breakdown.student;
    
    acc.totalPaid += trip.totalRevenue;
    
    acc.seniorPaid += trip.breakdown.seniorRevenue || 0;
    acc.pwdPaid += trip.breakdown.pwdRevenue || 0;     
    acc.studentPaid += trip.breakdown.studentRevenue || 0; 
    
    return acc;
  }, {
    totalDiscount: 0, totalPaid: 0,
    seniorDiscount: 0, seniorPaid: 0, 
    pwdDiscount: 0, pwdPaid: 0,
    studentDiscount: 0, studentPaid: 0,
    tripCount: data.length
  });
};