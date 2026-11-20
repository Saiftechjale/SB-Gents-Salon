import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface ReportExportOptions {
  reportTitle: string;
  salonName: string;
  dateRangeLabel: string;
  summaryItems: { label: string; value: string }[];
  headers: string[];
  rows: (string | number)[][];
  fileNamePrefix: string;
}

export function exportReportToPDF(options: ReportExportOptions): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(`${options.salonName} — ${options.reportTitle}`, 40, 42);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Period: ${options.dateRangeLabel} | Generated: ${new Date().toLocaleString('en-IN')}`, 40, 60);

  let yPos = 82;
  if (options.summaryItems.length > 0) {
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    const summaryLine = options.summaryItems.map((s) => `${s.label}: ${s.value}`).join('   |   ');
    doc.text(summaryLine, 40, yPos);
    yPos += 18;
  }

  autoTable(doc, {
    startY: yPos,
    head: [options.headers],
    body: options.rows.map((row) => row.map((cell) => String(cell))),
    styles: {
      fontSize: 9,
      cellPadding: 6,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  const dateStamp = new Date().toISOString().slice(0, 10);
  doc.save(`${options.fileNamePrefix}_${dateStamp}.pdf`);
}

export function exportReportToExcel(options: ReportExportOptions): void {
  const wb = XLSX.utils.book_new();

  const sheetData: (string | number)[][] = [
    [`${options.salonName} - ${options.reportTitle}`],
    [`Period: ${options.dateRangeLabel}`, `Generated: ${new Date().toLocaleString('en-IN')}`],
    [],
  ];

  if (options.summaryItems.length > 0) {
    sheetData.push(options.summaryItems.map((s) => s.label));
    sheetData.push(options.summaryItems.map((s) => s.value));
    sheetData.push([]);
  }

  sheetData.push(options.headers);
  options.rows.forEach((r) => sheetData.push(r));

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(wb, ws, 'Report');

  const dateStamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${options.fileNamePrefix}_${dateStamp}.xlsx`);
}
