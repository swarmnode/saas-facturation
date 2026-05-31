// Utilitaires CSV — séparateur ; / encodage UTF-8 BOM (compatible Excel FR)

export const BOM = '﻿';
export const SEP = ';';

export function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return s.includes(SEP) || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    headers.join(SEP),
    ...rows.map(r => r.map(escape).join(SEP)),
  ];
  return BOM + lines.join('\r\n');
}

// Parse un CSV (séparateur ; ou ,) — retourne les lignes sans l'en-tête
export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  // Détecte le séparateur dominant
  const firstLine = text.split(/\r?\n/)[0] || '';
  const sep = firstLine.includes(';') ? ';' : ',';

  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (c === sep && !inQuote) {
        fields.push(cur.trim()); cur = '';
      } else {
        cur += c;
      }
    }
    fields.push(cur.trim());
    return fields;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  const rows    = lines.slice(1).map(parseLine);
  return { headers, rows };
}

export function rowToObj(headers: string[], row: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
  return obj;
}
