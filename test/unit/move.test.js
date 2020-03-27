const Imap = require('../../lib/Connection')
const { getServer, getDefaultConfig } = require('./util')

describe('Move', function () {
  let server, imap

  afterEach(async function () {
    if (imap) await imap.end()
    if (server) server.close()
  })

  it('with move', async function () {
    const data = require('../fixtures/move/with-move.js')
    server = await getServer(data)
    const config = getDefaultConfig({ server })
    imap = new Imap(Object.assign(config, { keepalive: false }))

    await imap.connect()
    await imap.openBox('INBOX', true)
    await imap.move('1:3', 'Other')
  })

  it('without move and without uidplus', async function () {
    const data = require('../fixtures/move/plain.js')
    server = await getServer(data)
    const config = getDefaultConfig({ server })
    imap = new Imap(Object.assign(config, { keepalive: false }))

    await imap.connect()
    await imap.openBox('INBOX', true)
    await imap.move('1:3', 'Other')
  })

  it('without move but with uidplus', async function () {
    const data = require('../fixtures/move/with-uidplus.js')
    server = await getServer(data)
    const config = getDefaultConfig({ server })
    imap = new Imap(Object.assign(config, { keepalive: false }))

    await imap.connect()
    await imap.openBox('INBOX', true)
    await imap.move('1:3', 'Other')
  })
})
