const assert = require('assert');
const Imap = require('../../lib/Connection');
const { getServer, getDefaultConfig, CRLF } = require('./util');

describe('Connection', function () {
  let server, imap;

  afterEach(async function () {
    if (server) server.close();
    if (imap && imap.state !== 'disconnected') await imap.end();
  });

  it('fetch dup', async function () {
    const data = require('../fixtures/connection/fetch-dup.js');
    server = await getServer(data);
    const config = getDefaultConfig({ server });
    imap = new Imap(Object.assign(config, { keepalive: false }));

    await imap.connect();
    await imap.openBox('INBOX', true);

    const result = await new Promise(resolve => {
      const f = imap.seq.fetch(1);
      f.on('message', m => {
        m.once('attributes', attrs => {
          resolve(attrs);
        });
      });
    });

    assert.deepEqual(result, {
      uid: 1,
      date: new Date('05-Sep-2004 00:38:03 +0000'),
      flags: ['\\Seen']
    });
  });

  it('fetch frag', async function () {
    const data = require('../fixtures/connection/fetch-frag.js');
    server = await getServer(data);
    const config = getDefaultConfig({ server });
    imap = new Imap(Object.assign(config, { keepalive: false }));

    await imap.connect();
    await imap.openBox('INBOX', true);

    const result = await new Promise(resolve => {
      var f = imap.seq.fetch(1);
      f.on('message', (m) => {
        m.once('attributes', (attrs) => {
          resolve(attrs);
        });
      });
    });

    assert.deepEqual(result, {
      uid: 1,
      date: new Date('05-Sep-2004 00:38:03 +0000'),
      flags: ['\\Seen']
    });
  });

  it('fetch spillover', async function () {
    const data = require('../fixtures/connection/fetch-spillover.js');
    server = await getServer(data);
    const config = getDefaultConfig({ server });
    imap = new Imap(Object.assign(config, { keepalive: false }));

    await imap.connect();
    await imap.openBox('INBOX', true);

    const { result, body, bodyInfo } = await new Promise(resolve => {
      const f = imap.seq.fetch([1, 2], { bodies: ['TEXT'] });
      let nbody = -1;
      let result = [];
      let body = [];
      let bodyInfo = [];
      f.on('message', function (m) {
        m.on('body', function (stream, info) {
          ++nbody;
          bodyInfo.push(info);
          body[nbody] = '';
          if (nbody === 0) {
            // first allow body.push() to return false in parser.js
            setTimeout(function () {
              stream.on('data', function (chunk) {
                body[nbody] += chunk.toString('binary');
              });
              setTimeout(function () {
                var oldRead = stream._read,
                  readCalled = false;
                stream._read = function (n) {
                  readCalled = true;
                  stream._read = oldRead;
                  imap._sock.push(data.bytes.substring(100, 200)
                    + ')'
                    + CRLF
                    + 'A5 OK Success'
                    + CRLF);
                  imap._parser._tryread();
                };
                imap._sock.push(data.bytes.substring(20000)
                  + ')'
                  + CRLF
                  + '* 2 FETCH (UID 1001 FLAGS (\\Seen) INTERNALDATE "05-Sep-2004 00:38:13 +0000" BODY[TEXT] {200}'
                  + CRLF
                  + data.bytes.substring(0, 100));

                // if we got this far, then we didn't get an exception and we
                // are running with the bug fix in place
                if (!readCalled) {
                  imap._sock.push(data.bytes.substring(100, 200)
                    + ')'
                    + CRLF
                    + 'A5 OK Success'
                    + CRLF);
                }
              }, 100);
            }, 100);
          } else {
            stream.on('data', function (chunk) {
              body[nbody] += chunk.toString('binary');
            });
          }
        });
        m.on('attributes', function (attrs) {
          result.push(attrs);
        });
      });
      f.on('end', function () {
        resolve({ result, body, bodyInfo });
      });
    });

    assert.deepEqual(result, [{
      uid: 1000,
      date: new Date('05-Sep-2004 00:38:03 +0000'),
      flags: ['\\Seen']
    }, {
      uid: 1001,
      date: new Date('05-Sep-2004 00:38:13 +0000'),
      flags: ['\\Seen']
    }]);
    assert.deepEqual(body, [data.bytes, data.bytes.substring(0, 200)]);
    assert.deepEqual(bodyInfo, [{
      seqno: 1,
      which: 'TEXT',
      size: data.bytes.length
    }, {
      seqno: 2,
      which: 'TEXT',
      size: 200
    }]);
  });

  it('fetch stringbody', async function () {
    const data = require('../fixtures/connection/fetch-stringbody.js');
    server = await getServer(data);
    const config = getDefaultConfig({ server });
    imap = new Imap(Object.assign(config, { keepalive: false }));

    await imap.connect();
    await imap.openBox('INBOX', true);

    const { result, body, bodyInfo } = await new Promise(resolve => {
      const f = imap.seq.fetch(1, { bodies: ['TEXT'] });
      let result, body = '', bodyInfo;
      f.on('message', function (m) {
        m.on('body', function (stream, info) {
          bodyInfo = info;
          stream.on('data', function (chunk) { body += chunk.toString('utf8'); });
        });
        m.on('attributes', function (attrs) {
          result = attrs;
        });
        m.on('end', function () {
          resolve({ result, body, bodyInfo });
        })
      });
    });

    assert.deepEqual(result, {
      uid: 1,
      date: new Date('05-Sep-2004 00:38:03 +0000'),
      flags: ['\\Seen']
    });
    assert.equal(body, 'IMAP is terrible');
    assert.deepEqual(bodyInfo, {
      seqno: 1,
      which: 'TEXT',
      size: 16
    });
  });

  it('idle normal', async function () {
    const data = require('../fixtures/connection/idle-normal.js');
    server = await getServer(data);
    const config = getDefaultConfig({ server });
    imap = new Imap(Object.assign(config, { keepalive: true }));

    await imap.connect();
    await imap.openBox('INBOX', true);

    const { result, body, bodyInfo } = await new Promise(resolve => {
      const f = imap.seq.fetch(1, { bodies: ['TEXT'] });
      let result, body = '', bodyInfo;
      f.on('message', function (m) {
        m.on('body', function (stream, info) {
          bodyInfo = info;
          stream.on('data', function (chunk) { body += chunk.toString('utf8'); });
        });
        m.on('attributes', function (attrs) {
          result = attrs;
        });
      });
      f.on('end', async function () {
        await new Promise(resolve => setTimeout(resolve, 400));
        await imap.status('test');
        await imap.end();
        resolve({ result, body, bodyInfo });
      });
    });

    assert.deepEqual(result, {
      uid: 1,
      date: new Date('05-Sep-2004 00:38:03 +0000'),
      flags: ['\\Seen']
    });
    assert.equal(body, 'IMAP is terrible');
    assert.deepEqual(bodyInfo, {
      seqno: 1,
      which: 'TEXT',
      size: 16
    });
  });

  it('idle order', async function () {
    const data = require('../fixtures/connection/idle-order.js');
    server = await getServer(data);
    const config = getDefaultConfig({ server });
    imap = new Imap(Object.assign(config, { keepalive: true }));

    await imap.connect();
    await imap.openBox('INBOX', true);

    const { result, body, bodyInfo } = await new Promise(resolve => {
      const f = imap.seq.fetch(1, { bodies: ['TEXT'] });
      let result, body = '', bodyInfo;
      f.on('message', function (m) {
        m.on('body', function (stream, info) {
          bodyInfo = info;
          stream.on('data', function (chunk) { body += chunk.toString('utf8'); });
        });
        m.on('attributes', function (attrs) {
          result = attrs;
        });
      });
      f.on('end', async function () {
        await new Promise(resolve => setTimeout(resolve, 100));
        await imap.status('test');
        await imap.end();
        resolve({ result, body, bodyInfo });
      });
    });

    assert.deepEqual(result, {
      uid: 1,
      date: new Date('05-Sep-2004 00:38:03 +0000'),
      flags: ['\\Seen']
    });
    assert.equal(body, 'IMAP is terrible');
    assert.deepEqual(bodyInfo, {
      seqno: 1,
      which: 'TEXT',
      size: 16
    });
  });
});
