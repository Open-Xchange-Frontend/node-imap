const assert = require('assert')
const { Parser } = require('../../lib/Parser')
const { CR, LF, CRLF } = require('./util')
const crypto = require('crypto')

describe('parser', function () {
  let parser, stream

  async function pushToStream (chunks, collectSHA1) {
    parser.result = []
    parser.collectSHA1 = collectSHA1 || false
    chunks.forEach(function (chunk) {
      stream.push(chunk)
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    return { result: parser.result, calculatedSHA1: parser.calculatedSHA1 }
  }

  beforeEach(function () {
    stream = new (require('stream').Readable)()
    stream._read = function () { }

    parser = new Parser(stream)
    parser.on('tagged', function (info) {
      parser.result.push(info)
    })
    parser.on('untagged', function (info) {
      parser.result.push(info)
    })
    parser.on('continue', function (info) {
      parser.result.push(info)
    })
    parser.on('other', function (line) {
      parser.result.push(line)
    })
    parser.on('body', function (stream, info) {
      parser.result.push(info)
      if (parser.collectSHA1) {
        var hash = crypto.createHash('sha1')
        stream.on('data', function (d) {
          hash.update(d)
        })
        stream.on('end', function () {
          parser.calculatedSHA1 = hash.digest('hex')
        })
      } else {
        stream.resume()
      }
    })
  })

  it('Tagged OK', async function () {
    const source = ['A1 OK LOGIN completed', CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'ok',
        tagnum: 1,
        textCode: undefined,
        text: 'LOGIN completed'
      }
      ]
    )
  })
  it('Unknown line', async function () {
    const source = ['IDLE OK IDLE terminated', CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      ['IDLE OK IDLE terminated']
    )
  })
  it('Unknown line with + char', async function () {
    const source = ['IDLE OK Idle completed (0.002 + 1.783 + 1.783 secs).', CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      ['IDLE OK Idle completed (0.002 + 1.783 + 1.783 secs).']
    )
  })
  it('Continuation', async function () {
    const source = ['+ idling', CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        textCode: undefined,
        text: 'idling'
      }
      ]
    )
  })
  it('Continuation with text code', async function () {
    const source = ['+ [ALERT] idling', CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        textCode: 'ALERT',
        text: 'idling'
      }
      ]
    )
  })
  it('Continuation (broken -- RFC violation) sent by AOL IMAP', async function () {
    const source = ['+', CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        textCode: undefined,
        text: undefined
      }
      ]
    )
  })
  it('Multiple namespaces', async function () {
    const source = ['* NAMESPACE ',
      '(("" "/")) ',
      '(("~" "/")) ',
      '(("#shared/" "/")("#public/" "/")("#ftp/" "/")("#news." "."))',
      CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'namespace',
        num: undefined,
        textCode: undefined,
        text: {
          personal: [
            {
              prefix: '',
              delimiter: '/',
              extensions: undefined
            }
          ],
          other: [
            {
              prefix: '~',
              delimiter: '/',
              extensions: undefined
            }
          ],
          shared: [
            {
              prefix: '#shared/',
              delimiter: '/',
              extensions: undefined
            },
            {
              prefix: '#public/',
              delimiter: '/',
              extensions: undefined
            },
            {
              prefix: '#ftp/',
              delimiter: '/',
              extensions: undefined
            },
            {
              prefix: '#news.',
              delimiter: '.',
              extensions: undefined
            }
          ]
        }
      }
      ]
    )
  })
  it('Multiple namespaces 2', async function () {
    const source = ['* NAMESPACE ',
      '(("" "/" "X-PARAM" ("FLAG1" "FLAG2"))) ',
      'NIL ',
      'NIL',
      CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'namespace',
        num: undefined,
        textCode: undefined,
        text: {
          personal: [
            {
              prefix: '',
              delimiter: '/',
              extensions: {
                'X-PARAM': ['FLAG1', 'FLAG2']
              }
            }
          ],
          other: null,
          shared: null
        }
      }
      ]
    )
  })
  it('Flags', async function () {
    const source = ['* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)', CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'flags',
        num: undefined,
        textCode: undefined,
        text: [
          '\\Answered',
          '\\Flagged',
          '\\Deleted',
          '\\Seen',
          '\\Draft'
        ]
      }
      ]
    )
  })
  it('Search', async function () {
    const source = ['* SEARCH 2 3 6', CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'search',
        num: undefined,
        textCode: undefined,
        text: [2, 3, 6]
      }
      ]
    )
  })
  it('XList', async function () {
    const source = ['* XLIST (\\Noselect) "/" ~/Mail/foo', CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'xlist',
        num: undefined,
        textCode: undefined,
        text: {
          flags: ['\\Noselect'],
          delimiter: '/',
          name: '~/Mail/foo'
        }
      }
      ]
    )
  })
  it('List', async function () {
    const source = ['* LIST (\\Noselect) "/" ~/Mail/foo', CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'list',
        num: undefined,
        textCode: undefined,
        text: {
          flags: ['\\Noselect'],
          delimiter: '/',
          name: '~/Mail/foo'
        }
      }
      ]
    )
  })
  it('Status', async function () {
    const source = ['* STATUS blurdybloop (MESSAGES 231 UIDNEXT 44292)', CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'status',
        num: undefined,
        textCode: undefined,
        text: {
          name: 'blurdybloop',
          attrs: { messages: 231, uidnext: 44292 }
        }
      }
      ]
    )
  })
  it('Untagged OK (with text code, with text)', async function () {
    const source = ['* OK [UNSEEN 17] Message 17 is the first unseen message', CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'ok',
        num: undefined,
        textCode: {
          key: 'UNSEEN',
          val: 17
        },
        text: 'Message 17 is the first unseen message'
      }
      ]
    )
  })
  it('Untagged OK (with text code, with text) (2)', async function () {
    const source = ['* OK [PERMANENTFLAGS (\\Deleted \\Seen \\*)] Limited', CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'ok',
        num: undefined,
        textCode: {
          key: 'PERMANENTFLAGS',
          val: ['\\Deleted', '\\Seen', '\\*']
        },
        text: 'Limited'
      }
      ]
    )
  })
  it('Untagged OK (no text code, with text) (RFC violation)', async function () {
    const source = ['* OK [UNSEEN 17]', CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'ok',
        num: undefined,
        textCode: {
          key: 'UNSEEN',
          val: 17
        },
        text: undefined
      }
      ]
    )
  })
  it('Untagged OK (no text code, with text)', async function () {
    const source = ['* OK IMAP4rev1 Service Ready', CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'ok',
        num: undefined,
        textCode: undefined,
        text: 'IMAP4rev1 Service Ready'
      }
      ]
    )
  })
  it('Untagged OK (no text code, no text) (RFC violation)', async function () {
    const source = ['* OK', CRLF] // I have seen servers that send stuff like this ..
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'ok',
        num: undefined,
        textCode: undefined,
        text: undefined
      }
      ]
    )
  })
  it('Untagged EXISTS', async function () {
    const source = ['* 18 EXISTS', CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'exists',
        num: 18,
        textCode: undefined,
        text: undefined
      }
      ]
    )
  })
  it('Untagged RECENT', async function () {
    const source = ['* 2 RECENT', CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'recent',
        num: 2,
        textCode: undefined,
        text: undefined
      }
      ]
    )
  })
  it('Untagged FETCH (body)', async function () {
    const source = ['* 12 FETCH (BODY[HEADER] {342}', CRLF,
      'Date: Wed, 17 Jul 1996 02:23:25 -0700 (PDT)', CRLF,
      'From: Terry Gray <gray@cac.washington.edu>', CRLF,
      'Subject: IMAP4rev1 WG mtg summary and minutes', CRLF,
      'To: imap@cac.washington.edu', CRLF,
      'cc: minutes@CNRI.Reston.VA.US, John Klensin <KLENSIN@MIT.EDU>', CRLF,
      'Message-Id: <B27397-0100000@cac.washington.edu>', CRLF,
      'MIME-Version: 1.0', CRLF,
      'Content-Type: TEXT/PLAIN; CHARSET=US-ASCII', CRLF, CRLF,
      ')', CRLF]
    const { result, calculatedSHA1 } = await pushToStream(source, true)
    assert.deepEqual(
      result,
      [{
        seqno: 12,
        which: 'HEADER',
        size: 342
      },
      {
        type: 'fetch',
        num: 12,
        textCode: undefined,
        text: {}
      }
      ]
    )
    assert.equal(calculatedSHA1, '1f96faf50f6410f99237791f9e3b89454bf93fa7')
  })
  it('Untagged FETCH (quoted body)', async function () {
    const source = ['* 12 FETCH (BODY[TEXT] "IMAP is terrible")', CRLF]
    const { result, calculatedSHA1 } = await pushToStream(source, true)
    assert.deepEqual(
      result,
      [{
        seqno: 12,
        which: 'TEXT',
        size: 16
      },
      {
        type: 'fetch',
        num: 12,
        textCode: undefined,
        text: {}
      }
      ]
    )
    assert.equal(calculatedSHA1, 'bac8a1528c133787a6969a10a1ff453ebb9adfc8')
  })
  it('Untagged FETCH (quoted body with escaped chars)', async function () {
    const source = ['* 12 FETCH (BODY[TEXT] "\\"IMAP\\" is terrible :\\\\")', CRLF]
    const { result, calculatedSHA1 } = await pushToStream(source, true)
    assert.deepEqual(
      result,
      [{
        seqno: 12,
        which: 'TEXT',
        size: 21
      },
      {
        type: 'fetch',
        num: 12,
        textCode: undefined,
        text: {}
      }
      ]
    )
    assert.equal(calculatedSHA1, '7570c08150050a404603f63f60b65b42378d7d42')
  })
  it('Untagged FETCH with non-body literal', async function () {
    const source = ['* 12 FETCH (INTERNALDATE {26}', CRLF,
      '17-Jul-1996 02:44:25 -0700)' + CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'fetch',
        num: 12,
        textCode: undefined,
        text: {
          internaldate: new Date('17-Jul-1996 02:44:25 -0700')
        }
      }
      ]
    )
  })
  it('Untagged FETCH with non-body literal (length split)', async function () {
    const source = ['* 12 FETCH (INTERNALDATE {2',
      '6}' + CRLF + '17-Jul-1996 02:44:25 -0700)' + CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'fetch',
        num: 12,
        textCode: undefined,
        text: {
          internaldate: new Date('17-Jul-1996 02:44:25 -0700')
        }
      }
      ]
    )
  })
  it('Untagged FETCH with non-body literal (split CRLF)', async function () {
    const source = ['* 12 FETCH (INTERNALDATE {26}', CRLF,
      '17-Jul-1996 02:44:25 -0700)' + CR,
      LF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'fetch',
        num: 12,
        textCode: undefined,
        text: {
          internaldate: new Date('17-Jul-1996 02:44:25 -0700')
        }
      }
      ]
    )
  })
  it('Untagged FETCH (flags, date, size, envelope, body[structure])', async function () {
    const source = ['* 12 FETCH (FLAGS (\\Seen)',
      ' INTERNALDATE "17-Jul-1996 02:44:25 -0700"',
      ' RFC822.SIZE 4286',
      ' ENVELOPE ("Wed, 17 Jul 1996 02:23:25 -0700 (PDT)"',
      ' "IMAP4rev1 WG mtg summary and minutes"',
      ' (("Terry Gray" NIL "gray" "cac.washington.edu"))',
      ' (("Terry Gray" NIL "gray" "cac.washington.edu"))',
      ' (("Terry Gray" NIL "gray" "cac.washington.edu"))',
      ' ((NIL NIL "imap" "cac.washington.edu"))',
      ' ((NIL NIL "minutes" "CNRI.Reston.VA.US")',
      '("John Klensin" NIL "KLENSIN" "MIT.EDU")) NIL NIL',
      ' "<B27397-0100000@cac.washington.edu>")',
      ' BODY ("TEXT" "PLAIN" ("CHARSET" "US-ASCII") NIL NIL "7BIT" 3028',
      ' 92))',
      CRLF]
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'fetch',
        num: 12,
        textCode: undefined,
        text: {
          flags: ['\\Seen'],
          internaldate: new Date('17-Jul-1996 02:44:25 -0700'),
          'rfc822.size': 4286,
          envelope: {
            date: new Date('Wed, 17 Jul 1996 02:23:25 -0700 (PDT)'),
            subject: 'IMAP4rev1 WG mtg summary and minutes',
            from: [
              {
                name: 'Terry Gray',
                mailbox: 'gray',
                host: 'cac.washington.edu'
              }
            ],
            sender: [
              {
                name: 'Terry Gray',
                mailbox: 'gray',
                host: 'cac.washington.edu'
              }
            ],
            replyTo: [
              {
                name: 'Terry Gray',
                mailbox: 'gray',
                host: 'cac.washington.edu'
              }
            ],
            to: [
              {
                name: null,
                mailbox: 'imap',
                host: 'cac.washington.edu'
              }
            ],
            cc: [
              {
                name: null,
                mailbox: 'minutes',
                host: 'CNRI.Reston.VA.US'
              },
              {
                name: 'John Klensin',
                mailbox: 'KLENSIN',
                host: 'MIT.EDU'
              }
            ],
            bcc: null,
            inReplyTo: null,
            messageId: '<B27397-0100000@cac.washington.edu>'
          },
          body: [
            {
              partID: '1',
              type: 'text',
              subtype: 'plain',
              params: { charset: 'US-ASCII' },
              id: null,
              description: null,
              encoding: '7BIT',
              size: 3028,
              lines: 92
            }
          ]
        }
      }
      ]
    )
  })

  describe('extensions', function () {
    it('ESearch UID, 2 items', async function () {
      const source = ['* ESEARCH (TAG "A285") UID MIN 7 MAX 3800', CRLF]
      const { result } = await pushToStream(source)
      assert.deepEqual(
        result,
        [{
          type: 'esearch',
          num: undefined,
          textCode: undefined,
          text: { min: 7, max: 3800 }
        }
        ]
      )
    })
    it('ESearch 1 item', async function () {
      const source = ['* ESEARCH (TAG "A284") MIN 4', CRLF]
      const { result } = await pushToStream(source)
      assert.deepEqual(
        result,
        [{
          type: 'esearch',
          num: undefined,
          textCode: undefined,
          text: { min: 4 }
        }
        ]
      )
    })
    it('ESearch ALL list', async function () {
      const source = ['* ESEARCH (TAG "A283") ALL 2,10:11', CRLF]
      const { result } = await pushToStream(source)
      assert.deepEqual(
        result,
        [{
          type: 'esearch',
          num: undefined,
          textCode: undefined,
          text: { all: ['2', '10:11'] }
        }
        ]
      )
    })
    it('Quota', async function () {
      const source = ['* QUOTA "" (STORAGE 10 512)', CRLF]
      const { result } = await pushToStream(source)
      assert.deepEqual(
        result,
        [{
          type: 'quota',
          num: undefined,
          textCode: undefined,
          text: {
            root: '',
            resources: {
              storage: { usage: 10, limit: 512 }
            }
          }
        }
        ]
      )
    })
    it('QuotaRoot', async function () {
      const source = ['* QUOTAROOT INBOX ""', CRLF]
      const { result } = await pushToStream(source)
      assert.deepEqual(
        result,
        [{
          type: 'quotaroot',
          num: undefined,
          textCode: undefined,
          text: {
            roots: [''],
            mailbox: 'INBOX'
          }
        }
        ]
      )
    })
    describe('Metadata', function () {
      it('single entry-value pair', async function () {
        const source = ['* METADATA "INBOX" (/private/comment "My own comment")', CRLF]
        const { result } = await pushToStream(source)
        assert.deepEqual(
          result,
          [{
            type: 'metadata',
            num: undefined,
            textCode: undefined,
            text: {
              mailbox: 'INBOX',
              data: {
                '/private/comment': 'My own comment'
              }
            }
          }]
        )
      })
      it('multiple entry-value pair', async function () {
        const source = ['* METADATA "INBOX" (/private/comment "My comment" /shared/comment "Its sunny outside!")', CRLF]
        const { result } = await pushToStream(source)
        assert.deepEqual(
          result,
          [{
            type: 'metadata',
            num: undefined,
            textCode: undefined,
            text: {
              mailbox: 'INBOX',
              data: {
                '/private/comment': 'My comment',
                '/shared/comment': 'Its sunny outside!'
              }
            }
          }]
        )
      })
      it('unsolicited response', async function () {
        const source = ['* METADATA "" /shared/comment', CRLF]
        const { result } = await pushToStream(source)
        assert.deepEqual(
          result,
          [{
            type: 'metadata',
            num: undefined,
            textCode: undefined,
            text: {
              mailbox: '',
              data: {
                '/shared/comment': undefined
              }
            }
          }]
        )
      })
    })
  })
  it('Tagged OK (no text code, no text)', async function () {
    const source = ['A1 OK', CRLF] // some servers like ppops.net sends such response
    const { result } = await pushToStream(source)
    assert.deepEqual(
      result,
      [{
        type: 'ok',
        tagnum: 1,
        textCode: undefined,
        text: ''
      }
      ]
    )
  })
})
