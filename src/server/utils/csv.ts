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

// Parse un CSV (séparateur ; ou ,) — gère les champs multi-lignes entre guillemets
export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^﻿/, ''); // strip BOM
  if (!clean.trim()) return { headers: [], rows: [] };

  // Détecte le séparateur sur la première ligne
  const firstLine = clean.split('\n')[0] || '';
  const sep = firstLine.includes(';') ? ';' : ',';

  // Parse caractère par caractère pour respecter les guillemets multi-lignes
  const allRows: string[][] = [];
  let cur = '', inQuote = false, quoted = false;
  let fields: string[] = [];

  const pushField = () => {
    fields.push(quoted ? cur : cur.trim());
    cur = ''; quoted = false;
  };
  const pushRow = () => {
    if (fields.length && fields.some(f => f !== '')) allRows.push(fields);
    fields = [];
  };

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (c === '"') {
      if (inQuote && clean[i + 1] === '"') { cur += '"'; i++; } // "" → guillemet littéral
      else if (inQuote) { inQuote = false; }                    // fermeture de champ quoté
      else if (cur === '') { inQuote = true; quoted = true; }   // ouverture (début de champ seulement)
      else { cur += c; }                                        // " isolé au milieu → littéral
    } else if (c === sep && !inQuote) {
      pushField();
    } else if (c === '\r' && !inQuote) {
      // ignore \r (traité avec \n)
    } else if (c === '\n' && !inQuote) {
      pushField(); pushRow();
    } else {
      cur += c;
    }
  }
  pushField(); pushRow();

  if (!allRows.length) return { headers: [], rows: [] };
  const headers = allRows[0].map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  return { headers, rows: allRows.slice(1) };
}

export function rowToObj(headers: string[], row: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
  return obj;
}
