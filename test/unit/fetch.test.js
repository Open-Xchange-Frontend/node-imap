const assert = require('assert')
const Imap = require('../../lib/Connection')
const { getServer, getDefaultConfig } = require('./util')

describe('Fetch', function () {
  let server, imap

  afterEach(async function () {
    if (server) server.close()
    if (imap && imap.state !== 'disconnected') await imap.end()
  })

  it('multiple bodies, envelope, bodystructure', async function () {
    const data = require('../fixtures/fetch/multibodies.js')
    server = await getServer(data)
    const config = getDefaultConfig({ server })
    imap = new Imap(Object.assign(config, { keepalive: false }))

    await imap.connect()
    await imap.openBox('INBOX', { readOnly: true })

    const messages = await imap.seq.fetch('1', {
      markSeen: false,
      bodies: ['TEXT', 'HEADER.FIELDS (FROM TO SUBJECT DATE)'],
      envelope: true,
      struct: true
    }).all()

    assert.deepEqual(
      messages,
      [{
        TEXT: 'Hello\r\nWorld!\r\n',
        date: new Date('01-Apr-2020 15:52:41 +0000'),
        envelope: {
          bcc: null,
          cc: null,
          date: new Date('01-Apr-2020 15:52:41 +0000'),
          from: [{ host: 'localhost', mailbox: 'user', name: 'Test User' }],
          inReplyTo: null,
          messageId: '<608275564.8.1585756361537@localhost>',
          replyTo: [{ host: 'localhost', mailbox: 'user', name: 'Test User' }],
          sender: [{ host: 'localhost', mailbox: 'user', name: 'Test User' }],
          subject: 'Test',
          to: [{ host: 'localhost', mailbox: 'user', name: 'Test User' }]
        },
        flags: ['\\Seen'],
        header: {
          date: ['Wed, 1 Apr 2020 17:52:41 +0200 (CEST)'],
          from: ['Test User <user@localhost>'],
          subject: ['Test'],
          to: ['Test User <user@localhost>']
        },
        struct: [{
          description: null,
          disposition: null,
          encoding: '7bit',
          id: null,
          language: null,
          lines: 2,
          location: null,
          md5: null,
          params: { charset: 'UTF-8' },
          partID: '1',
          size: 15,
          subtype: 'plain',
          type: 'text'
        }],
        uid: 1
      }]
    )
  })

  it('all', async function () {
    const data = require('../fixtures/fetch/all.js')
    server = await getServer(data)
    const config = getDefaultConfig({ server })
    imap = new Imap(Object.assign(config, { keepalive: false }))

    await imap.connect()
    await imap.openBox('INBOX', { readOnly: true })

    const messages = await imap.seq.fetch('1:100').all()
    assert.deepEqual(messages, [...Array(100)].map((v, i) => ({
      uid: i + 1,
      date: new Date('01-Apr-2020 15:52:41 +0000'),
      flags: ['\\Seen']
    })))
  })

  it('chunks', async function () {
    const data = require('../fixtures/fetch/chunks.js')
    server = await getServer(data)
    const config = getDefaultConfig({ server })
    imap = new Imap(Object.assign(config, { keepalive: false }))

    await imap.connect()
    await imap.openBox('INBOX', { readOnly: true })

    const messages = imap.seq.fetch('1:5').chunks(2)

    assert.deepEqual(await new Promise(resolve => messages.on('chunk', resolve)), [{
      uid: 1,
      date: new Date('01-Apr-2020 15:52:41 +0000'),
      flags: ['\\Seen']
    }, {
      uid: 2,
      date: new Date('01-Apr-2020 15:52:41 +0000'),
      flags: ['\\Seen']
    }])

    assert.deepEqual(await new Promise(resolve => messages.on('chunk', resolve)), [{
      uid: 3,
      date: new Date('01-Apr-2020 15:52:41 +0000'),
      flags: ['\\Seen']
    }, {
      uid: 4,
      date: new Date('01-Apr-2020 15:52:41 +0000'),
      flags: ['\\Seen']
    }])

    assert.deepEqual(await new Promise(resolve => messages.on('chunk', resolve)), [{
      uid: 5,
      date: new Date('01-Apr-2020 15:52:41 +0000'),
      flags: ['\\Seen']
    }])
  })
})
