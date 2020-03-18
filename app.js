'use strict';

const puppeteer = require('puppeteer-core');
const koa = require('koa');
const cors = require('@koa/cors');
const favicon = require('koa-favicon');

const isDarwin = 'darwin' === process.platform

const scrollToEnd = async (page) => {
  await page.evaluate(async () => {
    return new Promise(resolve => {
      var totalHeight = 0;
      var distance = 100;
      var timer = setInterval(() => {
        var scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
};

const url2pdf = async (url) => {
  // Set up browser and page.
  // TODO: performance booting by invoking existing chrome process.
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: isDarwin ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'chromnium',
  });

  const page = await browser.newPage();
  page.setViewport({ width: 1280, height: 926 });

  // Navigate to the demo page.
  await page.goto(url);

  // Some page need scrolling to lazy load image.
  await scrollToEnd(page);
  try {
    await Promise.all([page.waitForNavigation({ waitUntil: ['domcontentloaded', 'networkidle0'], timeout: 2000 })]);
  } catch (e) {
    console.log('Ignore timeout(2 seconds) issue!');
  }

  const pdf = await page.pdf({
    format: 'A4', margin: {
      left: '30px',
      top: '30px',
      right: '20px',
      bottom: '30px'
    }
  });
  if (pdf) {
    console.log('Wrote pdf to buffer');
  }
  // Close the browser.
  await browser.close();

  return pdf;
};

function isValidURL(url) {
  var pattern = new RegExp('^((http)?s?:\\/\\/)?' + // protocol
    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
    '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
    '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
    '(\\#[-a-z\\d_]*)?$','i'); // fragment locator
  return url && !!pattern.test(url);
}

// Server
const app = module.exports = new koa();
app.use(cors());
app.use(favicon(__dirname + '/favicon.ico'));
app.use(async function (ctx) {
  const url = ctx.query.url;
  if (!isValidURL(url)) {
    console.log(`Bad url ${url}`);
    ctx.throw(400, 'Invalid url');
  }
  console.info(`Request url ${url}`);

  const pdf = await url2pdf(url);
  if (pdf) {
    const email = ctx.query.email;
    if (email && /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
      // TODO: Send to email
      console.info(`Request email ${email}`);
      ctx.type = 'application/json; charset=utf-8';
      ctx.body = {
        status: 'success',
        message: `PDF has been sent to your email ${email}`
      };
    } else {
      ctx.type = 'application/pdf';
      ctx.body = pdf;
    }
  } else {
    ctx.throw(500, 'Failed to create pdf');
  }
});

if (!module.parent) app.listen(3000);