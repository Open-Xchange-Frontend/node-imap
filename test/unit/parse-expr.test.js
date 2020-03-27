const assert = require('assert')
const { parseExpr } = require('../../lib/Parser')

describe('parse expr', function () {
  it('Empty value', function () {
    const source = ''
    const result = parseExpr(source)
    assert.deepEqual(
      result,
      []
    )
  })
  it('Empty quoted string', function () {
    const source = '""'
    const result = parseExpr(source)
    assert.deepEqual(
      result,
      ['']
    )
  })
  it('Simple, two key-value pairs with nil', function () {
    const source = 'FLAGS NIL RFC822.SIZE 44827'
    const result = parseExpr(source)
    assert.deepEqual(
      result,
      ['FLAGS', null, 'RFC822.SIZE', 44827]
    )
  })
  it('Simple, two key-value pairs with list', function () {
    const source = 'FLAGS (\\Seen) RFC822.SIZE 44827'
    const result = parseExpr(source)
    assert.deepEqual(
      result,
      ['FLAGS', ['\\Seen'], 'RFC822.SIZE', 44827]
    )
  })
  it('Integer exceeding JavaScript max int size', function () {
    const source = 'RFC822.SIZE 9007199254740993'
    const result = parseExpr(source)
    assert.deepEqual(
      result,
      ['RFC822.SIZE', '9007199254740993']
    )
  })
  it('Quoted string', function () {
    const source = 'FLAGS (\\Seen) INTERNALDATE "17-Jul-1996 02:44:25 -0700"'
    const result = parseExpr(source)
    assert.deepEqual(
      result,
      ['FLAGS', ['\\Seen'], 'INTERNALDATE', '17-Jul-1996 02:44:25 -0700']
    )
  })
  it('Lists with varying spacing', function () {
    const source = '("Foo")("Bar") ("Baz")'
    const result = parseExpr(source)
    assert.deepEqual(
      result,
      [['Foo'], ['Bar'], ['Baz']]
    )
  })
  it('Quoted string with escaped chars', function () {
    const source = '"\\"IMAP\\" is terrible :\\\\"'
    const result = parseExpr(source)
    assert.deepEqual(
      result,
      ['"IMAP" is terrible :\\']
    )
  })
  it('Quoted string with escaped chars #2', function () {
    const source = '"\\\\"IMAP\\" is terrible :\\\\"'
    const result = parseExpr(source)
    assert.deepEqual(
      result,
      ['\\"IMAP" is terrible :\\']
    )
  })
  it('Quoted string with escaped chars #3', function () {
    const source = '"Who does not think \\"IMAP\\" is terrible\\\\bad?"'
    const result = parseExpr(source)
    assert.deepEqual(
      result,
      ['Who does not think "IMAP" is terrible\\bad?']
    )
  })
  it('Quoted string with escaped chars #4', function () {
    const source = '"Who does not think \\\\"IMAP\\" is terrible\\\\bad?"'
    const result = parseExpr(source)
    assert.deepEqual(
      result,
      ['Who does not think \\"IMAP" is terrible\\bad?']
    )
  })
  it('Triple backslash in quoted string (GH Issue #345)', function () {
    const source = 'ENVELOPE ("Wed, 30 Mar 2014 02:38:23 +0100" "=?ISO-8859-1?Q?##ALLCAPS##123456## - ?= =?ISO-8859-1?Q?[ALERT][P3][ONE.TWO.FR] ?= =?ISO-8859-1?Q?Some Subject Line \\"D:\\\\\\"?=" (("Test Account (Rltvty L)" NIL "account" "test.com")) (("Test Account (Rltvty L)" NIL "account" "test.com")) ((NIL NIL "account" "test.com")) ((NIL NIL "one.two" "test.fr") (NIL NIL "two.three" "test.fr")) NIL NIL NIL "<message@test.eu>")'
    const result = parseExpr(source)
    assert.deepEqual(
      result,
      [
        'ENVELOPE',
        ['Wed, 30 Mar 2014 02:38:23 +0100',
          '=?ISO-8859-1?Q?##ALLCAPS##123456## - ?= =?ISO-8859-1?Q?[ALERT][P3][ONE.TWO.FR] ?= =?ISO-8859-1?Q?Some Subject Line "D:\\"?=',
          [['Test Account (Rltvty L)', null, 'account', 'test.com']],
          [['Test Account (Rltvty L)', null, 'account', 'test.com']],
          [[null, null, 'account', 'test.com']],
          [[null, null, 'one.two', 'test.fr'],
            [null, null, 'two.three', 'test.fr']
          ],
          null,
          null,
          null,
          '<message@test.eu>'
        ]
      ])
  })
})
