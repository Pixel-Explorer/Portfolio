const XLSX = require('xlsx');
const workbook = XLSX.readFile('data/anirudh-ledger-v4.xlsx', { cellDates: true });
console.log('SHEETS', workbook.SheetNames);
for (const sheetName of workbook.SheetNames.slice(0, 5)) {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false, header: 1 });
  console.log('=== SHEET', sheetName, 'rows', rows.length, '===');
  rows.slice(0, 5).forEach((row) => console.log(row));
}
