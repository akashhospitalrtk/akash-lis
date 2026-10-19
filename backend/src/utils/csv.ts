export function parseCsv(text: string) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const separator = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const values = lines.map((line) => line.split(separator).map((part) => part.trim().replace(/^"|"$/g, '')));
  const first = values[0].map((value) => value.toLowerCase());
  const codeIndex = first.findIndex((value) => ['code', 'parameter', 'analyte', 'test'].includes(value));
  const valueIndex = first.findIndex((value) => ['value', 'result', 'result value'].includes(value));
  const rows = codeIndex >= 0 && valueIndex >= 0 ? values.slice(1).map((row) => ({ code: row[codeIndex], value: row[valueIndex] })) : values.map((row) => ({ code: row[0], value: row[1] }));
  return rows.filter((row) => row.code && row.value !== undefined);
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  // Prevent spreadsheet applications from evaluating patient data as a formula.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvDocument(columns: string[], rows: unknown[][]) {
  return `\uFEFF${[columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
