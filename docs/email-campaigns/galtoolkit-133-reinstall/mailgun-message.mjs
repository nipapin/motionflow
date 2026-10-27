// Prepare a multipart Mailgun message. This module does not send any requests.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const template = JSON.parse(readFileSync(join(here, 'email.json'), 'utf8'));
const inlineFiles = ['gal-logo.png', '01-remove-package.png', '02-confirm-removal.png', '03-install-package.png'];

export function buildMailgunMessage({ from, to, replyTo }) {
  const recipients = Array.isArray(to) ? to : [to];
  if (!from || !recipients.length || recipients.some(recipient => typeof recipient !== 'string' || !recipient.trim())) {
    throw new Error('A verified sender and at least one recipient are required');
  }
  // A separate form per recipient prevents exposing addresses in a batch To header.
  if (recipients.length !== 1) throw new Error('Build one message per recipient');
  const form = new FormData();
  form.append('from', from);
  form.append('to', recipients[0]);
  form.append('subject', template.subject);
  form.append('text', template.text);
  form.append('html', template.html);
  if (replyTo) form.append('h:Reply-To', replyTo);
  form.append('o:tag', 'galtoolkit-133-reinstall');
  for (const name of inlineFiles) {
    form.append('inline', new Blob([readFileSync(join(here, 'images', name))], { type: 'image/png' }), name);
  }
  return form;
}
