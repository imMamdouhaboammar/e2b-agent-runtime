import { chromium } from 'playwright';

async function verifyInstallation() {
  console.log('Verifying Playwright & Chromium installation...');
  try {
    const browser = await chromium.launch({ headless: true });
    const version = browser.version();
    console.log(`Chromium browser launched successfully! Version: ${version}`);
    await browser.close();
    console.log('Browser installation verification passed.');
  } catch (err) {
    console.error('Playwright verification failed:', err);
    process.exit(1);
  }
}

verifyInstallation();
