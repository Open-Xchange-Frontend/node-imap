const assert = require('assert')
const sinon = require('sinon')
const Imap = require('../../lib/Connection')
const { getServer, getDefaultConfig } = require('./util')

describe('Fetch', function () {
  let server, imap

  afterEach(async function () {
    if (server) server.close()
    if (imap && imap.state !== 'disconnected') await imap.end()
  })

  it('Opens a box and receive vanished events', async function () {
    const data = require('../fixtures/qresync/select.js')
    server = await getServer(data)
    const config = getDefaultConfig({ server })
    imap = new Imap(Object.assign(config, { keepalive: false }))

    await imap.connect()

    // register listener to vanished event before opening the box
    const spy = new Promise(resolve => imap.once('vanished', (uids, earlier) => resolve({ uids, earlier })))

    const onUpdateSpy = sinon.spy()
    imap.on('update', onUpdateSpy)

    const box = await imap.openBox('INBOX', {
      readOnly: false,
      qresync: {
        uidvalidity: '67890007',
        modseq: '90060115194045000',
        knownUIDs: ['41:211', '214:541']
      }
    })

    assert.deepEqual(
      box,
      {
        name: 'INBOX',
        flags: ['\\Answered', '\\Flagged', '\\Draft', '\\Deleted', '\\Seen'],
        readOnly: false,
        uidvalidity: 67890007,
        uidnext: 600,
        permFlags: ['\\Answered', '\\Flagged', '\\Draft', '\\Deleted', '\\Seen'],
        keywords: [],
        newKeywords: true,
        persistentUIDs: true,
        nomodseq: false,
        messages: { total: 100, new: 11 },
        highestmodseq: '90060115205545359'
      }
    )

    const { uids, earlier } = await spy
    assert.deepEqual(
      uids,
      ['41', '43:116', '118', '120:211', '214:540']
    )
    assert.equal(earlier, true)

    assert.equal(onUpdateSpy.callCount, 3)
    assert.deepEqual(
      onUpdateSpy.firstCall.args,
      [
        49,
        { uid: 117, flags: ['\\Seen', '\\Answered'], modseq: '90060115194045001' }
      ]
    )
    assert.deepEqual(
      onUpdateSpy.secondCall.args,
      [
        50,
        { uid: 119, flags: ['\\Draft', '$MDNSent'], modseq: '90060115194045308' }
      ]
    )
    assert.deepEqual(
      onUpdateSpy.thirdCall.args,
      [
        51,
        { uid: 541, flags: ['\\Seen', '$Forwarded'], modseq: '90060115194045001' }
      ]
    )
  })

  it('Adjusts message total on a vanished event', async function () {
    const data = require('../fixtures/qresync/expunge.js')
    server = await getServer(data)
    const config = getDefaultConfig({ server })
    imap = new Imap(Object.assign(config, { keepalive: false }))

    await imap.connect()

    const box = await imap.openBox('INBOX', { readOnly: true })
    assert.equal(box.messages.total, 685)

    const spy = new Promise(resolve => imap.once('vanished', (uids, earlier) => resolve({ uids, earlier })))

    await imap.expunge()

    assert.equal(box.messages.total, 596)

    const { uids, earlier } = await spy
    assert.deepEqual(
      uids,
      ['405', '407', '410', '425:510']
    )
    assert.equal(earlier, false)
  })

  it('triggers untagged VANISH response when fetching with qresync', async function () {
    const data = require('../fixtures/qresync/fetch.js')
    server = await getServer(data)
    const config = getDefaultConfig({ server })
    imap = new Imap(Object.assign(config, { keepalive: false }))

    await imap.connect()

    const box = await imap.openBox('INBOX', { readOnly: true })
    assert.equal(box.messages.total, 685)

    const spy = new Promise(resolve => imap.once('vanished', (uids, earlier) => resolve({ uids, earlier })))

    // messages somehow do not trigger the 'end' events
    const messages = await imap.fetch('300:500', {
      modifiers: {
        changedsince: '12345'
      }
    }).all()
    assert.equal(messages.length, 3)

    const { uids, earlier } = await spy
    assert.deepEqual(
      uids,
      ['300:310', '405', '411']
    )
    assert.equal(earlier, true)
  })
})
