const assert = require('assert')
const { parseExpr, parseEnvelopeAddresses } = require('../../lib/Parser')

describe('parse envelope address', function () {
  it('RFC3501 example #1', function () {
    const source = '("Terry Gray" NIL "gray" "cac.washington.edu")'
    const result = parseEnvelopeAddresses(parseExpr(source))
    assert.deepEqual(
      result,
      [{
        name: 'Terry Gray',
        mailbox: 'gray',
        host: 'cac.washington.edu'
      }
      ]
    )
  })
  it('RFC3501 example #2', function () {
    const source = '(NIL NIL "imap" "cac.washington.edu")'
    const result = parseEnvelopeAddresses(parseExpr(source))
    assert.deepEqual(
      result,
      [{
        name: null,
        mailbox: 'imap',
        host: 'cac.washington.edu'
      }
      ]
    )
  })
  it('Name with encoded word(s)', function () {
    const source = '("=?utf-8?Q?=C2=A9=C2=AEAZ=C2=A5?=" NIL "crazy" "example.org")'
    const result = parseEnvelopeAddresses(parseExpr(source))
    assert.deepEqual(
      result,
      [{
        name: '©®AZ¥',
        mailbox: 'crazy',
        host: 'example.org'
      }
      ]
    )
  })
  it('Zero-length group', function () {
    const source = '(NIL NIL "imap" NIL)' +
      '(NIL NIL NIL NIL)'
    const result = parseEnvelopeAddresses(parseExpr(source))
    assert.deepEqual(
      result,
      [{
        group: 'imap',
        addresses: []
      }
      ]
    )
  })
  it('One-length group', function () {
    const source = '(NIL NIL "imap" NIL)' +
      '("Terry Gray" NIL "gray" "cac.washington.edu")' +
      '(NIL NIL NIL NIL)'
    const result = parseEnvelopeAddresses(parseExpr(source))
    assert.deepEqual(
      result,
      [{
        group: 'imap',
        addresses: [
          {
            name: 'Terry Gray',
            mailbox: 'gray',
            host: 'cac.washington.edu'
          }
        ]
      }
      ]
    )
  })
  it('One-length group and address', function () {
    const source = '(NIL NIL "imap" NIL)' +
      '("Terry Gray" NIL "gray" "cac.washington.edu")' +
      '(NIL NIL NIL NIL)' +
      '(NIL NIL "imap" "cac.washington.edu")'
    const result = parseEnvelopeAddresses(parseExpr(source))
    assert.deepEqual(
      result,
      [{
        group: 'imap',
        addresses: [
          {
            name: 'Terry Gray',
            mailbox: 'gray',
            host: 'cac.washington.edu'
          }
        ]
      },
      {
        name: null,
        mailbox: 'imap',
        host: 'cac.washington.edu'
      }
      ]
    )
  })
  it('Implicit group end', function () {
    const source = '(NIL NIL "imap" NIL)' +
      '("Terry Gray" NIL "gray" "cac.washington.edu")'
    const result = parseEnvelopeAddresses(parseExpr(source))
    assert.deepEqual(
      result,
      [{
        group: 'imap',
        addresses: [
          {
            name: 'Terry Gray',
            mailbox: 'gray',
            host: 'cac.washington.edu'
          }
        ]
      }
      ]
    )
  })
  it('Group end without start', function () {
    const source = '("Terry Gray" NIL "gray" "cac.washington.edu")' +
      '(NIL NIL NIL NIL)'
    const result = parseEnvelopeAddresses(parseExpr(source))
    assert.deepEqual(
      result,
      [{
        name: 'Terry Gray',
        mailbox: 'gray',
        host: 'cac.washington.edu'
      }
      ]
    )
  })
})
