/**
 * Capture browser console errors using Puppeteer.
 * Run: node scripts/check-console.mjs
 */
import puppeteer from 'puppeteer-core';

const CHROME_PATH = process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const PAGES = [
  'http://localhost:3000',
  'http://localhost:3000/benchmarks',
  'http://localhost:3000/login',
];

const errors = [];
const warnings = [];

async function checkPage(browser, url) {
  const page = await browser.newPage();
  
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') {
      errors.push({ url, message: text });
    } else if (type === 'warning') {
      warnings.push({ url, message: text });
    }
  });

  page.on('pageerror', (err) => {
    errors.push({ url, message: `PAGE ERROR: ${err.message}` });
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));
  } catch (err) {
    errors.push({ url, message: `NAVIGATION ERROR: ${err.message}` });
  }

  await page.close();
}

async function main() {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    for (const url of PAGES) {
      console.log(`Checking ${url}...`);
      await checkPage(browser, url);
    }
  } catch (err) {
    console.error('Failed to launch browser:', err.message);
    console.log('Set CHROME_PATH env var if Chrome is in a non-standard location.');
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }

  console.log('\n════════════════════════════════════════════════');
  console.log('  Browser Console Error Report');
  console.log('════════════════════════════════════════════════');
  console.log(`  Pages checked:  ${PAGES.length}`);
  console.log(`  Errors:         ${errors.length}`);
  console.log(`  Warnings:       ${warnings.length}`);
  console.log('════════════════════════════════════════════════\n');

  if (errors.length > 0) {
    console.log('ERRORS:');
    for (const e of errors) {
      console.log(`  [${e.url}]`);
      console.log(`    ${e.message}\n`);
    }
  }

  if (warnings.length > 0) {
    console.log('WARNINGS (first 10):');
    for (const w of warnings.slice(0, 10)) {
      console.log(`  [${w.url}]`);
      console.log(`    ${w.message}\n`);
    }
  }

  if (errors.length === 0) {
    console.log('No browser console errors found.');
  }
}

main();
