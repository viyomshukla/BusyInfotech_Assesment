function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const body = rows.map((row) =>
    columns.map((c) => escapeCell(c.value(row))).join(',')
  );
  return [header, ...body].join('\r\n');
}