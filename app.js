'use strict';

// TODO:
// 404 handler
// Minified ui code

const puppeteer = require('puppeteer-core');
const Koa = require('koa');
var Router = require('koa-router');
const cors = require('@koa/cors');
const favicon = require('koa-favicon');
const compress = require('koa-compress');
const sanitize = require('sanitize-filename');
const serve = require('koa-static');

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

// TODO: Fallback to wkhtml2pdf if chrome fail to launch
const url2pdf = async (url) => {
  // Set up browser and page.
  // TODO: performance booting by invoking existing chrome process.
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    executablePath: isDarwin ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : process.env.CHROME_BIN,
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

  const pdfFilename = buildFileName(url);
  return { pdf, pdfFilename };
};

const buildFileName = (url) => {
  if (url.endsWith('/')) {
    url = url.substring(0, url.length - 1);
  }

  let filename = url.split('#').shift().split('?').shift().split('/').pop();
  if (filename) {
    filename = sanitize(filename);
  }

  filename = filename ? filename : 'exported';
  const limit = filename.length > 100 ? 100 : filename.length;
  filename = filename.substring(0, limit);
  return filename + '_' + (new Date()).getTime() + '.pdf';
}

const isValidURL = (url) => {
  var pattern = new RegExp('^((http)?s?:\\/\\/)?' + // protocol
    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
    '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
    '(\\?.*)?');

  return url && !!pattern.test(url);
}

// ************** Server
const app = module.exports = new Koa();
const router = new Router();

// Middlewares
app.use(cors());
// TODO: Update favicon
app.use(favicon(__dirname + '/ui/favicon.ico'));
app.use(compress({
  filter: function (content_type) {
  	return /text/i.test(content_type)
  },
  threshold: 2048,
  flush: require('zlib').Z_SYNC_FLUSH
}))
app.use(serve(__dirname + '/ui', {
  gzip: true
}));

// API
router.get('/api/v1/pdf', async function (ctx) {
  const url = ctx.query.url;
  if (!isValidURL(url)) {
    console.log(`Bad url ${url}`);
    ctx.throw(400, 'Invalid url');
  }
  console.info(`Request url ${url}`);

  const { pdf, pdfFilename } = await url2pdf(url);
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
      ctx.compress = true
      ctx.type = 'application/pdf';
      ctx.set('Content-Disposition', 'attachment;filename=' + pdfFilename);
      ctx.length = pdf.length;
      ctx.body = pdf;
    }
  } else {
    ctx.throw(500, 'Failed to create pdf');
  }
});

app.use(router.routes()).use(router.allowedMethods());

// UI

var port = process.env.PORT || 8080;
if (!module.parent) app.listen(port);