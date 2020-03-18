// TODO: test!!!
const app = require('./app');
const server = app.listen();
const request = require('supertest').agent(server);

describe('Stream File', function() {
  after(function() {
    server.close();
  });

  it('GET /', function(done) {
    request
    .get('/')
    .expect(404, done);
  });
});