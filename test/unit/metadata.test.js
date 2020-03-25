const assert = require('assert');
const Imap = require('../../lib/Connection');
const { getServer, getDefaultConfig } = require('./util');

describe('Metadata', function () {
  let server, imap;

  afterEach(function () {
    if (server) server.close();
    if (imap) imap.end();
  });

  describe('get', function () {
    it('single', async function () {
      const data = require('../fixtures/metadata/get-single.js');
      server = await getServer(data);
      const config = getDefaultConfig({ server });
      imap = new Imap(Object.assign(config, { keepalive: false }));

      await imap.connect();
      const metadata = await imap.getMetadata('/shared/comment', 'INBOX');

      assert.deepEqual(
        metadata,
        { '/shared/comment': 'Shared comment' }
      );
    });

    it('single without mailbox', async function () {
      const data = require('../fixtures/metadata/get-single-no-mailbox.js');
      server = await getServer(data);
      const config = getDefaultConfig({ server });
      imap = new Imap(Object.assign(config, { keepalive: false }));

      await imap.connect();
      const metadata = await imap.getMetadata('/shared/comment');

      assert.deepEqual(
        metadata,
        { '/shared/comment': 'Shared comment' }
      );
    });

    it('single with depth', async function () {
      const data = require('../fixtures/metadata/get-depth.js');
      server = await getServer(data);
      const config = getDefaultConfig({ server });
      imap = new Imap(Object.assign(config, { keepalive: false }));

      await imap.connect();
      const metadata = await imap.getMetadata('/private/filters/values', 'INBOX', 1);

      assert.deepEqual(
        metadata,
        {
          '/private/filters/values/small': 'SMALLER 5000',
          '/private/filters/values/boss': 'FROM "boss@example.com"',
        }
      );
    });

    it('multiple (one line response)', async function () {
      const data = require('../fixtures/metadata/get-multiple-one-line.js');
      server = await getServer(data);
      const config = getDefaultConfig({ server });
      imap = new Imap(Object.assign(config, { keepalive: false }));

      await imap.connect();
      const metadata = await imap.getMetadata(['/shared/comment', '/private/comment'], 'INBOX');

      assert.deepEqual(
        metadata,
        {
          '/shared/comment': 'Shared comment',
          '/private/comment': 'Private comment',
        }
      );
    });

    it('multiple (multi line response)', async function () {
      const data = require('../fixtures/metadata/get-multiple-multi-line.js');
      server = await getServer(data);
      const config = getDefaultConfig({ server });
      imap = new Imap(Object.assign(config, { keepalive: false }));

      await imap.connect();
      const metadata = await imap.getMetadata(['/shared/comment', '/private/comment'], 'INBOX');

      assert.deepEqual(
        metadata,
        {
          '/shared/comment': 'Shared comment',
          '/private/comment': 'Private comment',
        }
      );
    });
  });
  describe('set', function () {
    it('single', async function () {
      const data = require('../fixtures/metadata/set-single.js');
      server = await getServer(data);
      const config = getDefaultConfig({ server });
      imap = new Imap(Object.assign(config, { keepalive: false }));

      await imap.connect();
      await imap.setMetadata({ '/shared/comment': 'Shared comment' }, 'INBOX');
    });

    it('single without mailbox', async function () {
      const data = require('../fixtures/metadata/set-single-without-mailbox.js');
      server = await getServer(data);
      const config = getDefaultConfig({ server });
      imap = new Imap(Object.assign(config, { keepalive: false }));

      await imap.connect();
      await imap.setMetadata({ '/shared/comment': 'Shared comment' }, '');
    });

    it('single to null', async function () {
      const data = require('../fixtures/metadata/set-nil.js');
      server = await getServer(data);
      const config = getDefaultConfig({ server });
      imap = new Imap(Object.assign(config, { keepalive: false }));

      await imap.connect();
      await imap.setMetadata({ '/shared/comment': null }, 'INBOX');
    });

    it('multiple', async function () {
      const data = require('../fixtures/metadata/set-multiple.js');
      server = await getServer(data);
      const config = getDefaultConfig({ server });
      imap = new Imap(Object.assign(config, { keepalive: false }));

      await imap.connect();
      await imap.setMetadata({ '/shared/comment': 'Shared comment', '/private/comment': 'Private comment' }, 'INBOX');
    });
  });
});