FROM node:12.8.0-slim

RUN  apt-get update \
     # Install latest chrome dev package, which installs the necessary libs to
     # make the bundled version of Chromium that Puppeteer installs work.
     && apt-get install -y wget --no-install-recommends \
     && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
     && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
     && apt-get update \
     && apt-get install -y google-chrome-unstable --no-install-recommends \
     && rm -rf /var/lib/apt/lists/* \
     && wget --quiet https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh -O /usr/sbin/wait-for-it.sh \
     && chmod +x /usr/sbin/wait-for-it.sh

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

ENV PATH /usr/src/app/node_modules/.bin:$PATH

COPY package.json yarn.lock ./
RUN yarn install

COPY . .

EXPOSE 3000

CMD [ "node", "app.js" ]