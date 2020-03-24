const assert = require('assert');
const { CRLF } = require('./util');
const { parseHeader } = require('../../lib/Parser');

describe('Parse header', function () {
  it('Folded header value (plain -- space)', function () {
    const source = ['To: Foo', CRLF, ' Bar Baz', CRLF];
    const result = parseHeader(source.join(''));
    assert.deepEqual(result, { to: ['Foo Bar Baz'] })
  });
  it('Folded header value (plain -- tab)', function () {
    const source = ['To: Foo', CRLF, '\tBar\tBaz', CRLF];
    const result = parseHeader(source.join(''));
    assert.deepEqual(result, { to: ['Foo\tBar\tBaz'] })
  });
  it('MIME encoded-word in value', function () {
    const source = ['Subject: =?iso-8859-1?Q?=A1Hola,_se=F1or!?=', CRLF];
    const result = parseHeader(source.join(''));
    assert.deepEqual(result, { subject: ['¡Hola, señor!'] })
  });
  it('MIME encoded-word in value with language set (RFC2231)', function () {
    const source = ['Subject: =?iso-8859-1*es?Q?=A1Hola,_se=F1or!?=', CRLF];
    const result = parseHeader(source.join(''));
    assert.deepEqual(result, { subject: ['¡Hola, señor!'] })
  });
  it('MIME encoded-word in value with empty language set', function () {
    const source = ['Subject: =?iso-8859-1*?Q?=A1Hola,_se=F1or!?=', CRLF];
    const result = parseHeader(source.join(''));
    assert.deepEqual(result, { subject: ['¡Hola, señor!'] })
  });
  it('Folded header value (adjacent MIME encoded-words)', function () {
    const source = ['Subject: =?GB2312?Q?=B2=E2=CA=D4=CC=E2=C4=BF=D3=EB=D6=D0=B9=FA=D0=C5_long_subjects_are_not_OK_12?=', CRLF, ' =?GB2312?Q?345678901234567890123456789012345678901234567890123456789012?=', CRLF, ' =?GB2312?Q?345678901234567890?=', CRLF];
    const result = parseHeader(source.join(''));
    assert.deepEqual(result, { subject: ['测试题目与中国信 long subjects are not OK 12345678901234567890123456789012345678901234567890123456789012345678901234567890'] })
  });
  it('Folded header value (non-adjacent MIME encoded-words)', function () {
    const source = ['Subject: =?GB2312?Q?=B2=E2=CA=D4=CC=E2=C4=BF=D3=EB=D6=D0=B9=FA=D0=C5_long_subjects_are_not_OK_12?=', CRLF, ' 3=?GB2312?Q?45678901234567890123456789012345678901234567890123456789012?=', CRLF, ' 3=?GB2312?Q?45678901234567890?=', CRLF];
    const result = parseHeader(source.join(''));
    assert.deepEqual(result, { subject: ['测试题目与中国信 long subjects are not OK 12 345678901234567890123456789012345678901234567890123456789012 345678901234567890'] })
  });
  it('Folded header value (one adjacent, one non-adjacent MIME encoded-words)', function () {
    const source = ['Subject: =?GB2312?Q?=B2=E2=CA=D4=CC=E2=C4=BF=D3=EB=D6=D0=B9=FA=D0=C5_long_subjects_are_not_OK_12?=', CRLF, ' 3=?GB2312?Q?45678901234567890123456789012345678901234567890123456789012?=', CRLF, ' =?GB2312?Q?345678901234567890?=', CRLF];
    const result = parseHeader(source.join(''));
    assert.deepEqual(result, { subject: ['测试题目与中国信 long subjects are not OK 12 345678901234567890123456789012345678901234567890123456789012345678901234567890'] })
  });
  it('Folded header value (adjacent MIME encoded-words seperated by linear whitespace)', function () {
    const source = ['Subject: =?UTF-8?Q?=E0=B9=84=E0=B8=97=E0=B8=A2_=E0=B9=84?=', CRLF, '   ', CRLF, ' =?UTF-8?Q?=E0=B8=97=E0=B8=A2_=E0=B9=84=E0=B8=97?=  =?UTF-8?Q?=E0=B8=A2?=', CRLF];
    const result = parseHeader(source.join(''));
    assert.deepEqual(result, { subject: ['ไทย ไทย ไทย'] })
  });
  it('Folded header value (incomplete multi-byte character split)', function () {
    const source = ['Subject: =?utf-8?Q?abcdefghij_=E0=B9=83=E0=B8=99_klmnopqr_=E0=B9=84=E0=B8=A1=E0=B9?=', CRLF, ' =?utf-8?Q?=88=E0=B8=82=E0=B8=B6=E0=B9=89=E0=B8=99?=', CRLF];
    const result = parseHeader(source.join(''));
    assert.deepEqual(result, { subject: ['abcdefghij ใน klmnopqr ไม่ขึ้น'] })
  });
  it('Folded header value (consecutive complete base64-encoded words)', function () {
    const source = ['Subject: =?utf-8?B?Rlc6IOC4quC4tOC5iOC4h+C4oeC4tQ==?=', CRLF, ' =?utf-8?B?4LiK4Li14Lin4Li04LiV4Lir4LiZ4LmJ4Liy4LiV?=', CRLF, ' =?utf-8?B?4Liy4LmB4Lib4Lil4LiBIOC5hiDguKPguK3=?=', CRLF, ' =?utf-8?Q?=E0=B8=9A=E0=B9=82=E0=B8=A5=E0=B8=81?=', CRLF];
    const result = parseHeader(source.join(''));
    assert.deepEqual(result, { subject: ['FW: สิ่งมีชีวิตหน้าตาแปลก ๆ รอบโลก'] })
  });
  it('Folded header value (consecutive partial base64-encoded words)', function () {
    const source = ['Subject: =?utf-8?B?4Lij4Li54Lib4Lig4Liy4Lie4LiX4Li14LmIIGVtYmVkIOC5g+C4meC5gOC4?=', CRLF, ' =?utf-8?B?meC4t+C5ieC4reC5gOC4oeC4peC4peC5jOC5hOC4oeC5iOC5geC4quC4lOC4?=', CRLF, ' =?utf-8?B?hw==?=', CRLF];
    const result = parseHeader(source.join(''));
    assert.deepEqual(result, { subject: ['รูปภาพที่ embed ในเนื้อเมลล์ไม่แสดง'] })
  });
  it('Invalid first line', function () {
    const source = ['               ', CRLF, 'To: Foo', CRLF];
    const result = parseHeader(source.join(''));
    assert.deepEqual(result, { to: ['Foo'] })
  });
  // header with body
  it('Header with the body', function () {
    const source = ['Subject: test subject', CRLF, 'X-Another-Header: test', CRLF, CRLF, 'This is body: Not a header', CRLF];
    const result = parseHeader(source.join(''));
    assert.deepEqual(result, { subject: ['test subject'], 'x-another-header': ['test'] })
  });
});
