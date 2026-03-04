const puppeteer = require('puppeteer');

async function test() {
  const browser = await puppeteer.launch({ 
    args: ['--no-sandbox'],
    headless: "new"
  });
  const page = await browser.newPage();
  
  // Navigate to login
  await page.goto('http://localhost:3000/login');
  await page.type('input[placeholder="Email"]', 'naratorndoo@gmail.com');
  await page.type('input[placeholder="Password"]', 'P@ssw0rd');
  await page.click('button[type="submit"]');
  
  // Wait for login to complete (url changes to /bu/...)
  await page.waitForNavigation();
  
  // Go to the specified BU staff page
  await page.goto('http://localhost:3000/bu/79716354-bb24-471e-9d20-8a72fc8c50e8/staff', { waitUntil: 'networkidle2' });
  
  // wait for table to load
  await page.waitForSelector('table', { timeout: 5000 }).catch(() => {});
  
  const html = await page.evaluate(() => {
    return document.querySelector('table')?.outerHTML || 'No table';
  });
  
  console.log(html);
  
  await browser.close();
}

test().catch(console.error);
