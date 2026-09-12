const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.text()));
  page.on('pageerror', error => console.error('BROWSER_ERROR:', error));
  await page.goto('https://main.jentocalling.pages.dev/calling-system/');
  await page.waitForTimeout(2000);
  await browser.close();
})();
