// Build email assets from the installed extension's real profile and popup components.
// Isolated illustrative state: no account, package files, or API calls are changed.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const extension = process.env.GAL_EXTENSION_PATH || 'C:/Users/nipap/AppData/Roaming/Adobe/CEP/extensions/Gal Toolkit Max Beta';
const runtime = process.env.CODEX_NODE_MODULES || 'C:/Users/nipap/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const require = createRequire(join(runtime, '_email-build.cjs'));
const { chromium } = require('playwright');
mkdirSync(join(here, 'images'), { recursive: true });
const base = pathToFileURL(extension + '/').href;
const styles = ['ui', 'global', 'icons', 'popup', 'galtoolkit'].map(name => `<link rel="stylesheet" href="${base}css/${name}.css">`).join('');
const profile = readFileSync(join(extension, 'design/profile.html'), 'utf8');
const events = readFileSync(join(extension, 'js/events.js'), 'utf8');
const removalStart = events.lastIndexOf('$(document).on("click", ".icon-button[data-act=\'remove\']", () => {');
if (removalStart < 0) throw new Error('Expected legacy removal handler was not found');
const removalEnd = events.indexOf('\n});', removalStart) + 4;
const removal = events.slice(removalStart, removalEnd);
const popupSource = readFileSync(join(extension, 'js/installOptions.js'), 'utf8').split('function selectPathCallback(context)')[0];
const componentHtml = `<!doctype html><html><head><meta charset="utf-8"><base href="${base}">${styles}
<style>body{margin:0;background:#17181c} .personalizedMarketLogin{position:relative!important;inset:auto!important;width:100%!important;height:100vh!important} .personalizedMarketLogin .content{padding-top:16px!important} .profile-panel .signed-container{margin:auto} .package-preview{display:none!important} .profile-hero,.profile-devices-section,.profile-header{display:none!important} .package-title{white-space:nowrap} .package-details{border-radius:14px!important} .hidden{display:none!important}</style>
</head><body>${profile}<script>${popupSource}
function applyStyles(el, styles){Object.assign(el.style,styles)}
function removePackageFiles(){throw new Error('Preview must not modify files')}
function $(element){return {on(event,selector,handler){document.querySelector(selector).addEventListener(event,handler)}}}
${removal}
const panel=document.querySelector('.personalizedMarketLogin');panel.classList.remove('hidden');
panel.querySelector('[data-signed="1"]').classList.remove('hidden');
panel.querySelector('[data-signed="0"]').remove();
panel.querySelector('.profile-email').textContent='editor@example.com';
panel.querySelector('.package-version').textContent='version 1.3.3';
panel.querySelector('[data-act="remove"]').classList.remove('hidden');
panel.querySelector('[data-act="install"]').classList.add('hidden');
</script></body></html>`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 500, height: 250 }, deviceScaleFactor: 2 });
  // A file base allows the original CSS/icon resources to resolve exactly as in CEP.
  const scratch = join(here, 'component-preview.html');
  writeFileSync(scratch, componentHtml);
  await page.goto(pathToFileURL(scratch).href);
  await page.locator('.package-details').screenshot({ path: join(here, 'images/01-remove-package.png') });
  await page.locator('[data-act="remove"]').click();
  await page.locator('.popup').screenshot({ path: join(here, 'images/02-confirm-removal.png') });
  await page.locator('.popup-close-button').click();
  await page.evaluate(() => {
    document.querySelector('[data-act="remove"]').classList.add('hidden');
    document.querySelector('[data-act="install"]').classList.remove('hidden');
  });
  await page.locator('.package-details').screenshot({ path: join(here, 'images/03-install-package.png') });

  const subject = 'Gal Toolkit MAX 1.3.3: reinstall your toolkit package';
  const text = `Hi there,

We found an issue with a recent Gal Toolkit MAX package update that may have left some assets missing.

To restore the complete 1.3.3 package, please remove the toolkit package from the panel and install it again. Please do this even if the panel already shows version 1.3.3.

1. Open your profile in the Gal Toolkit MAX panel. Click the trash icon next to the installed package.
2. In the Remove Package window, click Confirm.
3. Open your profile again if needed. Click the download icon next to the package and follow the installation steps. Wait for the full download and installation to finish before using the toolkit.

Once installation is complete, check that your toolkit assets are available again. If you use the toolkit in both Premiere Pro and After Effects, repeat these steps in each app.

You only need to reinstall the toolkit package. You can keep your existing extension installed.

Need help? Visit https://premieregal.motionflow.pro/#faq

Sorry for the inconvenience, and thank you for your patience.

Happy editing,
The Premiere Gal Team

You are receiving this service notice because you use Gal Toolkit MAX.`;
  const screenshot = (file, alt) => `<img src="cid:${file}" width="520" alt="${alt}" style="display:block;border:0;width:100%;max-width:520px;height:auto;border-radius:10px;">`;
  const step = (number, title, body, file, alt) => `<tr><td class="px" style="padding:0 30px 24px;"><p style="margin:0 0 8px;color:#7d16bd;font-size:12px;line-height:18px;letter-spacing:1px;font-weight:bold;">STEP ${number}</p><h2 style="margin:0 0 10px;color:#211e29;font-family:Verdana,Arial,sans-serif;font-size:19px;line-height:27px;">${title}</h2><p style="margin:0 0 14px;color:#5c5669;font-size:15px;line-height:24px;">${body}</p>${screenshot(file, alt)}</td></tr>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${subject}</title>
<style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}img{-ms-interpolation-mode:bicubic}@media(max-width:620px){.outer{padding:16px 10px!important}.px{padding-left:22px!important;padding-right:22px!important}.heading{font-size:27px!important;line-height:34px!important}}</style>
</head><body style="margin:0;padding:0;background-color:#f0f1f9;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">Restore missing assets with a fresh package installation, even if your panel already shows 1.3.3.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f1f9"><tr><td class="outer" align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="580" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:580px;border-radius:16px;">
<tr><td class="px" style="padding:28px 30px;border-bottom:1px solid #f0f1f9;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="44"><img src="cid:gal-logo.png" width="32" height="34" alt="Gal" style="display:block;border:0;"></td><td style="font-family:Verdana,Arial,sans-serif;color:#211e29;font-size:17px;font-weight:bold;">Gal Toolkit MAX<br><span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:20px;font-weight:normal;color:#746d80;">by Premiere Gal</span></td></tr></table></td></tr>
<tr><td class="px" style="padding:30px 30px 24px;"><p style="margin:0 0 12px;color:#7d16bd;font-size:11px;line-height:18px;font-weight:bold;letter-spacing:1px;">PACKAGE 1.3.3 &nbsp;/&nbsp; INSTALLATION NOTICE</p><h1 class="heading" style="margin:0 0 22px;color:#211e29;font-family:Verdana,Arial,sans-serif;font-size:32px;line-height:40px;letter-spacing:-1px;">Restore your missing<br>toolkit assets.</h1><p style="margin:0 0 12px;color:#211e29;font-size:15px;line-height:24px;">Hi there,</p><p style="margin:0 0 18px;color:#5c5669;font-size:15px;line-height:24px;">We found an issue with a recent package update that may have left some assets missing.</p><p style="margin:0;color:#5c5669;font-size:15px;line-height:24px;">A fresh installation will restore the complete <strong style="color:#211e29;">1.3.3 package</strong>. Please follow these steps <strong style="color:#211e29;">even if your panel already shows 1.3.3</strong>.</p></td></tr>
${step('1', 'Remove the installed package', 'Open your <strong>profile</strong> in the Gal Toolkit MAX panel. Click the <strong>trash icon</strong> next to the package.', '01-remove-package.png', 'Package card: the trash icon is on the right.')}
${step('2', 'Confirm removal', 'In the <strong>Remove Package</strong> window, click <strong>Confirm</strong>.', '02-confirm-removal.png', 'Remove Package dialog with a Confirm button.')}
${step('3', 'Install the package again', 'Open your profile again if needed. Click the <strong>download icon</strong> next to the package and follow the installation steps. Wait for the <strong>full download and installation</strong> to finish.', '03-install-package.png', 'Package card: the download icon is on the right.')}
<tr><td class="px" style="padding:0 30px 26px;"><p style="margin:0 0 16px;color:#5c5669;font-size:15px;line-height:24px;">Once installation is complete, check that your toolkit assets are available again. If you use the toolkit in both Premiere Pro and After Effects, repeat these steps in each app.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0f1f9" style="border-radius:10px;"><tr><td style="padding:16px 18px;color:#5c5669;font-size:14px;line-height:22px;">You only need to reinstall the <strong style="color:#211e29;">toolkit package</strong>. You can keep your existing extension installed.</td></tr></table><p style="margin:14px 0 0;color:#857c92;font-size:11px;line-height:17px;">Interface illustrations use Premiere Pro. Your panel may look slightly different.</p></td></tr>
<tr><td class="px" style="padding:0 30px 30px;"><p style="margin:0 0 16px;color:#5c5669;font-size:14px;line-height:23px;">Need help? <a href="https://premieregal.motionflow.pro/#faq" style="color:#7d16bd;text-decoration:underline;">Visit our help section</a>.</p><p style="margin:0 0 16px;color:#5c5669;font-size:14px;line-height:23px;">Sorry for the inconvenience, and thank you for your patience.</p><p style="margin:0;color:#211e29;font-size:14px;line-height:23px;">Happy editing,<br><strong>The Premiere Gal Team</strong></p></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="max-width:520px;margin:20px auto 0;color:#81788c;font-size:11px;line-height:18px;text-align:center;">You are receiving this service notice because you use Gal Toolkit MAX.<br><a href="https://premieregal.motionflow.pro/" style="color:#81788c;text-decoration:none;">premieregal.motionflow.pro</a></p>
</td></tr></table></body></html>`;
  copyFileSync(join(root, 'public/premiere-gal/assets/logo.png'), join(here, 'images/gal-logo.png'));
  writeFileSync(join(here, 'email-mailgun.html'), html);
  writeFileSync(join(here, 'email.txt'), text + '\n');
  writeFileSync(join(here, 'subject.txt'), subject + '\n');
  writeFileSync(join(here, 'email.json'), JSON.stringify({ subject, text, html }, null, 2) + '\n');
  const preview = html.replace(/src="cid:([^"]+)"/g, 'src="images/$1"');
  writeFileSync(join(here, 'preview.html'), preview);
  const standalone = html.replace(/src="cid:([^"]+)"/g, (_, file) =>
    `src="data:image/png;base64,${readFileSync(join(here, 'images', file)).toString('base64')}"`);
  writeFileSync(join(here, 'email.html'), standalone);
  writeFileSync(join(here, 'galtoolkit-133-reinstall.html'), standalone);
  const previewPage = await browser.newPage({ viewport: { width: 860, height: 950 }, deviceScaleFactor: 1 });
  await previewPage.goto(pathToFileURL(join(here, 'email.html')).href);
  await previewPage.screenshot({ path: join(here, 'preview-desktop.png'), fullPage: true });
  await previewPage.setViewportSize({ width: 390, height: 844 });
  await previewPage.screenshot({ path: join(here, 'preview-mobile.png'), fullPage: true });
  const checks = await previewPage.evaluate(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    images: [...document.images].map(img => ({ alt: img.alt, embedded: img.src.startsWith('data:image/png;base64,'), loaded: img.complete && img.naturalWidth > 0 })),
    text: document.body.innerText,
  }));
  if (checks.horizontalOverflow || checks.images.some(img => !img.loaded || !img.embedded)) throw new Error(JSON.stringify(checks));
  if (!checks.text.includes('Confirm') || !checks.text.includes('1.3.3')) throw new Error('Missing required instructions');
  console.log(JSON.stringify({ subject, htmlBytes: Buffer.byteLength(html), images: checks.images, mobileOverflow: checks.horizontalOverflow }, null, 2));
} finally {
  await browser.close();
  const scratch = join(here, 'component-preview.html');
  if (existsSync(scratch)) unlinkSync(scratch);
}
