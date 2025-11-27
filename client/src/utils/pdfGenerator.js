import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; // 1. Import autoTable as a default import

const formatCurrency = (amount) => {
  return parseFloat(amount).toFixed(2);
};

export const generateLandscapePDF = ({
  title,
  subtitle,
  summary = [],
  tables = [],
  fileName = 'report.pdf'
}) => {
  const doc = new jsPDF('l', 'mm', 'a4');
  const themeColor = [0, 124, 145]; 
  
  // Title
  doc.setFontSize(18);
  doc.setTextColor(...themeColor);
  doc.text(title, 14, 15);

  // Subtitle
  if (subtitle) {
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(subtitle, 14, 22);
  }

  let finalY = 30;

  // Summary
  if (summary.length > 0) {
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text("Summary Overview", 14, finalY);
    finalY += 6;

    let currentX = 14;
    doc.setFontSize(10);
    summary.forEach((item) => {
      doc.setTextColor(100);
      doc.text(item.label + ":", currentX, finalY);
      doc.setTextColor(0);
      doc.setFont(undefined, 'bold');
      doc.text(item.value.toString(), currentX, finalY + 5);
      doc.setFont(undefined, 'normal');
      currentX += 45; 
    });
    finalY += 15; 
  }

  // Tables
  tables.forEach((table) => {
    if (table.title) {
        if (finalY > 180) {
            doc.addPage();
            finalY = 20;
        }
        doc.setFontSize(14);
        doc.setTextColor(...themeColor);
        doc.text(table.title, 14, finalY);
        finalY += 6;
    }

    // 2. CHANGE HERE: Use autoTable(doc, options) instead of doc.autoTable(options)
    autoTable(doc, {
      startY: finalY,
      head: [table.head],
      body: table.body,
      theme: 'grid',
      headStyles: {
        fillColor: themeColor,
        textColor: 255,
        fontSize: 9,
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 8,
        textColor: 50
      },
      alternateRowStyles: {
        fillColor: [248, 249, 250]
      },
      columnStyles: table.columnStyles || {},
      margin: { top: 20 },
      didDrawPage: function (data) {
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          'Page ' + doc.internal.getNumberOfPages(),
          data.settings.margin.left,
          doc.internal.pageSize.height - 10
        );
      }
    });

    // 3. CHANGE HERE: Access finalY from the last table drawn
    finalY = doc.lastAutoTable.finalY + 15;
  });

  doc.save(fileName);
};