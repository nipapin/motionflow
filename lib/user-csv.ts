function quoteCsvCell(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Prevent spreadsheet programs from interpreting user-supplied text as formulas.
  if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return quoteCsvCell(text);
}
export function makeCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
export function makeMailgunCsv(users: { email: string; name: string }[]): string {
  const seen = new Set<string>();
  const rows: string[][] = [];
  for (const user of users) {
    const email = user.email.trim().toLowerCase();
    if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email) || seen.has(email)) continue;
    seen.add(email);
    rows.push([email, user.name]);
  }
  // Addresses must stay exact for Mailgun, including valid +tag/local prefixes.
  return "address,name\r\n" + rows.map(([email, name]) => `${quoteCsvCell(email)},${csvCell(name)}\r\n`).join("");
}
export function userCsvResponse(csv: string, filename: string): Response {
  return new Response(csv, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
