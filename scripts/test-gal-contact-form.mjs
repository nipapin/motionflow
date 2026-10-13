import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

// Execute the production TypeScript with only the email boundary replaced.
function loadTs(path, replacements = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require: (name) => Object.hasOwn(replacements, name) ? replacements[name] : require(name),
    File, Buffer, process, console,
  }, { filename: path });
  return exports;
}

const attachmentRules = loadTs('lib/gal-contact-attachment.ts');
const sampleFile = (name = 'screenshot.png', type = 'image/png', content = 'image bytes') =>
  new File([content], name, { type });

function routeFixture(send = async () => {}) {
  return loadTs('app/(main)/api/send-galtoolkit-contact-form/route.ts', {
    '@/lib/gal-contact-attachment': attachmentRules,
    '@/lib/laravel-port/galtoolkit-mailer': { sendGaltoolkitContactForm: send },
  });
}

function formRequest(file) {
  const form = new FormData();
  form.set('name', ' Visitor ');
  form.set('email', 'visitor@example.com');
  form.set('message', 'Please help with this screenshot.');
  if (file !== undefined) form.set('attachFile', file);
  return new Request('http://localhost/api/send-galtoolkit-contact-form', { method: 'POST', body: form });
}

test('multipart submissions preserve the attachment bytes and trim contact fields', async () => {
  const calls = [];
  const { POST } = routeFixture(async (payload) => calls.push(payload));
  const response = await POST(formRequest(sampleFile()));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.equal(calls[0].name, 'Visitor');
  assert.equal(calls[0].attachment.name, 'screenshot.png');
  assert.equal(await calls[0].attachment.text(), 'image bytes');
});

test('optional attachment and legacy JSON submissions still work', async () => {
  const calls = [];
  const { POST } = routeFixture(async (payload) => calls.push(payload));
  assert.equal((await POST(formRequest())).status, 200);
  const request = new Request('http://localhost/api/send-galtoolkit-contact-form', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Visitor', email: 'visitor@example.com', message: 'Help please' }),
  });
  assert.equal((await POST(request)).status, 200);
  assert.ok(calls.every((payload) => payload.attachment === null));
});

test('invalid type, oversized, empty and non-file attachments are rejected before sending', async () => {
  let sends = 0;
  const { POST } = routeFixture(async () => sends++);
  for (const file of [
    sampleFile('script.exe', 'application/octet-stream'),
    sampleFile('screenshot.png', 'text/html'),
    sampleFile('screenshot.png', 'image/png', new Uint8Array(attachmentRules.GAL_CONTACT_ATTACHMENT_MAX_BYTES + 1)),
    sampleFile('empty.png', 'image/png', ''),
    'not a file',
  ]) {
    const response = await POST(formRequest(file));
    assert.equal(response.status, 422);
    assert.ok((await response.json()).errors.attachFile.length);
  }
  assert.equal(sends, 0);
});

test('JPG, ZIP and a file at the size limit are supported', async () => {
  const { POST } = routeFixture();
  for (const file of [
    sampleFile('photo.JPG', 'image/jpeg'),
    sampleFile('project.zip', 'application/zip'),
    sampleFile('project.zip', 'application/octet-stream'),
    sampleFile('screenshot.png', 'image/png', new Uint8Array(attachmentRules.GAL_CONTACT_ATTACHMENT_MAX_BYTES)),
  ]) {
    assert.equal((await POST(formRequest(file))).status, 200);
  }
});

test('invalid contact fields and malformed requests never send email', async () => {
  let sends = 0;
  const { POST } = routeFixture(async () => sends++);
  const request = new Request('http://localhost/api/send-galtoolkit-contact-form', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '', email: 'invalid', message: '' }),
  });
  assert.equal((await POST(request)).status, 422);
  const malformed = new Request('http://localhost/api/send-galtoolkit-contact-form', {
    method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: 'broken',
  });
  assert.equal((await POST(malformed)).status, 422);
  assert.equal(sends, 0);
});

test('mailer forwards attachment content and preserves recipient and reply-to', async () => {
  const calls = [];
  const { sendGaltoolkitContactForm } = loadTs('lib/laravel-port/galtoolkit-mailer.ts', {
    'server-only': {},
    '@/lib/mail/resend-mailer': { sendResendEmail: async (payload) => calls.push(payload) },
  });
  const priorRecipient = process.env.CONTACT_FORM_EMAIL;
  process.env.CONTACT_FORM_EMAIL = 'toolkit@premieregal.com';
  try {
    const payload = { name: '<Visitor>', email: 'visitor@example.com', contactMessage: 'Help please' };
    await sendGaltoolkitContactForm({ ...payload, attachment: sampleFile() });
    await sendGaltoolkitContactForm(payload);
    assert.equal(calls[0].to, 'toolkit@premieregal.com');
    assert.equal(calls[0].replyTo, payload.email);
    assert.match(calls[0].html, /&lt;Visitor&gt;/);
    assert.equal(calls[0].attachments[0].filename, 'screenshot.png');
    assert.equal(calls[0].attachments[0].content.toString(), 'image bytes');
    assert.equal(calls[1].attachments, undefined);
  } finally {
    if (priorRecipient === undefined) delete process.env.CONTACT_FORM_EMAIL;
    else process.env.CONTACT_FORM_EMAIL = priorRecipient;
  }
});
