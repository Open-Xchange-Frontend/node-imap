const CR = '\r';
const LF = '\n';
const CRLF = CR + LF;
const net = require('net');
const assert = require('assert');

module.exports = {
  CR, LF, CRLF,
  getServer({ responses, expected }) {
    responses = responses.map(res => {
      let options = { join: CRLF, end: CRLF };
      if (res.command) {
        options = Object.assign(options, res);
        res = res.command;
      };
      if (res instanceof Array) res = res.join(options.join);
      res += options.end;
      return res;
    });
    let res = -1;
    let exp = -1;
    const server = net.createServer(function(sock) {
      sock.write('* OK asdf\r\n');
      let buf = '', lines;
      sock.on('data', function(data) {
        buf += data.toString('utf8');
        if (buf.indexOf(CRLF) > -1) {
          lines = buf.split(CRLF);
          buf = lines.pop();
          lines.forEach(function(l) {
            if (expected) assert(l === expected[++exp], 'Unexpected client request: ' + l);
            if (l === 'DONE') {
              assert(sentCont, 'DONE seen before continuation sent');
              sock.write('IDLE ok\r\n');
            } else if (l === 'IDLE IDLE') {
              setTimeout(function() {
                sentCont = true;
                sock.write('+ idling\r\n');
              }, 100);
            } else {
              assert(responses[++res], 'No response for client request: ' + l);
              sock.write(responses[res]);
            }
          });
        }
      });
    });

    return new Promise(resolve => {
      server.listen(0, '127.0.0.1', resolve.bind(null, server));
    });
  },
  getDefaultConfig({ server }) {
    const port = server.address().port;
    return {
      user: 'foo',
        password: 'bar',
        host: '127.0.0.1',
        port: port,
    }
  }
};
