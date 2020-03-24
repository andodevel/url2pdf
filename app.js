'use strict';

// TODO:
// 404 handler
// Minified ui code
// Move submit to loaded
// Medium support
// API and docs
// Watermark

const puppeteer = require('puppeteer-core');
const Koa = require('koa');
const Router = require('koa-router');
const cors = require('@koa/cors');
const favicon = require('koa-favicon');
const compress = require('koa-compress');
const sanitize = require('sanitize-filename');
const serve = require('koa-static');
const ratelimit = require('koa-ratelimit');
const nodemailer = require('nodemailer');
const cron = require("node-cron");

const isDarwin = 'darwin' === process.platform
const browserURL = `http://127.0.0.1:21222`;
const pageTimeout = 3 * 60 * 1000; // 3 minutes

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
  let browser;
  try {
    browser = await puppeteer.connect({ browserURL });
    console.log('Connecting to existing instance of Chrome.');
  } catch { }
  if (!browser) {
    console.log('Launch new instance of Chrome.');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=21222'],
      executablePath: isDarwin ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : process.env.CHROME_BIN,
    });
  }

  let pdf;
  const page = await browser.newPage();
  try {
    page.setViewport({ width: 1280, height: 926 });
    await page.setDefaultNavigationTimeout(pageTimeout);
    await page.goto(url);

    // Some page need scrolling to lazy load image.
    await scrollToEnd(page);
    try {
      await Promise.all([page.waitForNavigation({ waitUntil: ['domcontentloaded', 'networkidle0'], timeout: 2000 })]);
    } catch (e) {
      console.log('Ignore timeout(2 seconds) issue!');
    }

    pdf = await page.pdf({
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
  } finally {
    if (page) {
      // Close the page.
      await page.close();
    }
  }

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
  const limit = filename.length > 60 ? 60 : filename.length;
  filename = filename.substring(0, limit);
  return filename + '_' + (new Date()).getTime() + '.pdf';
}

const isValidURL = (url) => {
  var pattern = new RegExp('^((http)?s?:\\/\\/)?' + // protocol
    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
    '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
    '(\\?.*)?'); // any

  return url && !!pattern.test(url);
}

// ************** Server
const app = module.exports = new Koa();
app.use(async (ctx, next) => {
  ctx.req.setTimeout(0); // Disable timeout
  await next();
});

// Middlewares
app.use(cors());
// TODO: Update favicon
app.use(favicon(__dirname + '/favicon.png'));
app.use(compress({
  filter: function (content_type) {
    return /text/i.test(content_type)
  },
  threshold: 2048,
  flush: require('zlib').Z_SYNC_FLUSH
}));
// Simple caching strategy
app.use(async (ctx, next) => {
  if (ctx.url && ctx.url.toLowerCase().endsWith('bg.jpg')) {
    ctx.set('Pragma', 'public');
    ctx.set('Cache-Control', 'max-age: 604800');
    ctx.set("Expires", new Date(Date.now() + 604800).toUTCString());
  }
  await next();
});
app.use(serve(__dirname + '/ui/', {
  gzip: true
}));

// Sending mail
var senderEmailService = process.env.EMAIL_SERVICE;
var senderEmailAddress = process.env.EMAIL_ADDRESS;
var senderEmailPassword = process.env.EMAIL_PASSWORD;
var sedingMailEnabled = senderEmailService && senderEmailAddress && senderEmailPassword;
if (!sedingMailEnabled) {
  console.log('Sending email feature is disabled due to missing env EMAIL_SERVICE, EMAIL_ADDRESS, or EMAIL_PASSWORD');
}
var mailTransporter = nodemailer.createTransport({
  service: senderEmailService,
  auth: {
    user: senderEmailAddress,
    pass: senderEmailPassword
  }
});

// Rate limiting
const db = new Map();
app.use(ratelimit({
  driver: 'memory',
  db: db,
  duration: 60000,
  errorMessage: 'Server is busy. Try again later.',
  id: (ctx) => ctx.ip,
  headers: {
    remaining: 'Rate-Limit-Remaining',
    reset: 'Rate-Limit-Reset',
    total: 'Rate-Limit-Total'
  },
  max: 5,
  disableHeader: false,
  whitelist: (ctx) => {
    // return true;
  },
  blacklist: (ctx) => {
    // return false;
  }
}));

// API
const router = new Router();
router.get('/api/v1/pdf', async (ctx) => {
  let url = ctx.query.url;
  // Auto prepending http protocol.
  if (url) {
    url = url.trim();
    if (!url.startsWith('http')) {
      url = 'http://' + url;
    }
  }
  if (!isValidURL(url)) {
    console.log(`Bad url ${url}`);
    ctx.throw(400, 'Invalid url');
  }
  console.info(`Request url ${url}`);

  const { pdf, pdfFilename } = await url2pdf(url);
  if (pdf) {
    const email = ctx.query.email;
    if (sedingMailEnabled && email && /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
      // TODO: Send to email
      console.info(`Request email ${email}`);
      ctx.type = 'application/json; charset=utf-8';
      const mailOptions = {
        to: email,
        subject: '[url2pdf] Your converted PDF',
        html: '<p>-- Hello, world --</p>',
        attachments: [{
          filename: pdfFilename,
          content: Buffer.from(pdf, 'base64'),
          contentType: 'application/pdf'
        }]
      };
      try {
        await new Promise(function (resolve, reject) {
          mailTransporter.sendMail(mailOptions, (err, info) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
        console.log(`Converted PDF has been sent to email ${email}`);
        ctx.body = {
          status: 'success',
          message: `PDF has been sent to your email ${email}`
        };
      } catch (e) {
        console.log(`Failed to send pdf to email ${email}. Error: ${err}`);
        ctx.throw(500, `Failed to send pdf to email ${email}`);
      }

      console.log('sync code');
    } else {
      console.log(`Streaming converted PDF...`);
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

var port = process.env.PORT || 8080;
if (!module.parent) {
  const server = app.listen(port);
  server.setTimeout(0);
  console.log(`Start an instance of url2pdf server at :${port}`);
}

// Cron job to cleanup at 11:59PM every day.
cron.schedule("* * * * *", async function() {
  console.log("Execute cron job to cleanup resource.");
  try {
    let browser = await puppeteer.connect({ browserURL });
    console.log('Connecting to existing instance of Chrome.');
    if (browser) {
      browser.close();
      console.log('Closed running chrome.');
    }
  } catch { }
});
