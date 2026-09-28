import fs from 'fs';
const dump = fs.readFileSync('dump.csv', 'utf8');
const rows = dump.split('\n').map(row => row.split(','));
const emails = rows.map(row => row[4]);
console.log(emails.length);
const uniqueEmails = [...new Set(emails)];
console.log(uniqueEmails.length);
fs.writeFileSync('unique-emails.csv', uniqueEmails.join('\n'));