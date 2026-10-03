import * as XLSX from 'xlsx';
import type { CellValue, Sheet, SheetRow, SpreadsheetDoc } from '@/lib/types';

/** Converte número serial do Excel em AAAA-MM-DD sem depender de fuso horário. */
export function serialToIsoDate(serial: number): string {
  const p = XLSX.SSF.parse_date_code(serial);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function cellValue(cell: XLSX.CellObject | undefined): CellValue {
  if (!cell || cell.v === undefined || cell.v === null) return null;
  if (cell.t === 'n' && typeof cell.z === 'string' && XLSX.SSF.is_date(cell.z)) return serialToIsoDate(cell.v as number);
  if (cell.t === 'd') return (cell.v as Date).toISOString().slice(0, 10);
  if (cell.t === 's') {
    const s = String(cell.v).trim();
    return s === '' ? null : s;
  }
  if (cell.t === 'n' || cell.t === 'b') return cell.v as number | boolean;
  return String(cell.v);
}

export function parseXlsx(buffer: Buffer): SpreadsheetDoc {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false, cellNF: true });
  const sheets: Sheet[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) return { name, headers: [], rows: [] };
    const range = XLSX.utils.decode_range(ws['!ref']);
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v = cellValue(ws[XLSX.utils.encode_cell({ r: range.s.r, c })]);
      headers.push(v === null ? '' : String(v).trim());
    }
    const rows: SheetRow[] = [];
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const cells: Record<string, CellValue> = {};
      const cellRefs: Record<string, string> = {};
      let hasValue = false;
      headers.forEach((h, i) => {
        if (!h) return;
        const ref = XLSX.utils.encode_cell({ r, c: range.s.c + i });
        const value = cellValue(ws[ref]);
        cells[h] = value;
        cellRefs[h] = ref;
        if (value !== null) hasValue = true;
      });
      if (hasValue) rows.push({ rowNumber: r + 1, cells, cellRefs });
    }
    return { name, headers, rows };
  });
  return { kind: 'spreadsheet', sheets };
}
