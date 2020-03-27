var tls = require('tls'),
    Socket = require('net').Socket,
    EventEmitter = require('events').EventEmitter,
    inherits = require('util').inherits,
    inspect = require('util').inspect,
    isDate = require('util').isDate,
    utf7 = require('utf7').imap;

var Parser = require('./Parser').Parser,
    parseExpr = require('./Parser').parseExpr,
    parseHeader = require('./Parser').parseHeader;

var MAX_INT = 9007199254740992,
    KEEPALIVE_INTERVAL = 10000,
    MAX_IDLE_WAIT = 300000, // 5 minutes
    MONTHS = ['Jan', 'Feb', 'Mar',
              'Apr', 'May', 'Jun',
              'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'],
    FETCH_ATTR_MAP = {
      'RFC822.SIZE': 'size',
      'BODY': 'struct',
      'BODYSTRUCTURE': 'struct',
      'ENVELOPE': 'envelope',
      'INTERNALDATE': 'date'
    },
    SPECIAL_USE_ATTRIBUTES = [
      '\\All',
      '\\Archive',
      '\\Drafts',
      '\\Flagged',
      '\\Important',
      '\\Junk',
      '\\Sent',
      '\\Trash'
    ],
    CRLF = '\r\n',
    RE_CMD = /^([^ ]+)(?: |$)/,
    RE_UIDCMD_HASRESULTS = /^UID (?:FETCH|SEARCH|SORT)/,
    RE_IDLENOOPRES = /^(IDLE|NOOP) /,
    RE_OPENBOX = /^EXAMINE|SELECT$/,
    RE_BODYPART = /^BODY\[/,
    RE_INVALID_KW_CHARS = /[\(\)\{\\\"\]\%\*\x00-\x20\x7F]/,
    RE_NUM_RANGE = /^(?:[\d]+|\*):(?:[\d]+|\*)$/,
    RE_BACKSLASH = /\\/g,
    RE_DBLQUOTE = /"/g,
    RE_ESCAPE = /\\\\/g,
    RE_INTEGER = /^\d+$/;

function Connection(config) {
  if (!(this instanceof Connection))
    return new Connection(config);

  EventEmitter.call(this);

  config || (config = {});

  this._config = {
    localAddress: config.localAddress,
    socket: config.socket,
    socketTimeout: config.socketTimeout || 0,
    host: config.host || 'localhost',
    port: config.port || 143,
    tls: config.tls,
    tlsOptions: config.tlsOptions,
    autotls: config.autotls,
    user: config.user,
    password: config.password,
    xoauth: config.xoauth,
    xoauth2: config.xoauth2,
    connTimeout: config.connTimeout || 10000,
    authTimeout: config.authTimeout || 5000,
    keepalive: (config.keepalive === undefined || config.keepalive === null
                ? true
                : config.keepalive)
  };

  this._sock = config.socket || undefined;
  this._tagcount = 0;
  this._tmrKeepalive = undefined;
  this._tmrAuth = undefined;
  this._queue = [];
  this._box = undefined;
  this._idle = { started: undefined, enabled: false };
  this._parser = undefined;
  this._curReq = undefined;
  this.delimiter = undefined;
  this.namespaces = undefined;
  this.state = 'disconnected';
  this.debug = config.debug;
}
inherits(Connection, EventEmitter);

Connection.prototype.connect = async function() {
  var config = this._config,
      self = this,
      socket,
      parser,
      tlsOptions;

  socket = config.socket || new Socket();
  socket.setKeepAlive(true);
  this._sock = undefined;
  this._tagcount = 0;
  this._tmrKeepalive = undefined;
  this._tmrAuth = undefined;
  this._queue = [];
  this._box = undefined;
  this._idle = { started: undefined, enabled: false };
  this._parser = undefined;
  this._curReq = undefined;
  this.delimiter = undefined;
  this.namespaces = undefined;
  this.state = 'disconnected';

  if (config.tls) {
    tlsOptions = {};
    tlsOptions.host = config.host;
    // Host name may be overridden the tlsOptions
    for (var k in config.tlsOptions)
      tlsOptions[k] = config.tlsOptions[k];
    tlsOptions.socket = socket;
  }

  if (config.tls)
    this._sock = tls.connect(tlsOptions, onconnect);
  else {
    socket.once('connect', onconnect);
    this._sock = socket;
  }

  function onconnect() {
    self.state = 'connected';
    self.debug && self.debug('[connection] Connected to host');
    self._tmrAuth = setTimeout(function() {
      var err = new Error('Timed out while authenticating with server');
      err.source = 'timeout-auth';
      self.emit('error', err);
      socket.destroy();
    }, config.authTimeout);
  }

  this._onError = function(err) {
    clearTimeout(self._tmrAuth);
    self.debug && self.debug('[connection] Error: ' + err);
    err.source = 'socket';
    self.emit('error', err);
  };
  this._sock.on('error', this._onError);

  this._onSocketTimeout = function() {
    clearTimeout(self._tmrAuth);
    clearTimeout(self._tmrKeepalive);
    self.state = 'disconnected';
    self.debug && self.debug('[connection] Socket timeout');

    var err = new Error('Socket timed out while talking to server');
    err.source = 'socket-timeout';
    self.emit('error', err);
    socket.destroy();
  };
  this._sock.on('timeout', this._onSocketTimeout);
  socket.setTimeout(config.socketTimeout);

  socket.once('close', function(had_err) {
    clearTimeout(self._tmrAuth);
    clearTimeout(self._tmrKeepalive);
    self.state = 'disconnected';
    self.debug && self.debug('[connection] Closed');
    self.emit('close', had_err);
  });

  socket.once('end', function() {
    clearTimeout(self._tmrAuth);
    clearTimeout(self._tmrKeepalive);
    self.state = 'disconnected';
    self.debug && self.debug('[connection] Ended');
    self.emit('end');
  });

  this._parser = parser = new Parser(this._sock, this.debug);

  parser.on('untagged', function(info) {
    self._resUntagged(info);
  });
  parser.on('tagged', function(info) {
    self._resTagged(info);
  });
  parser.on('body', function(stream, info) {
    var msg = self._curReq.fetchCache[info.seqno], toget;

    if (msg === undefined) {
      msg = self._curReq.fetchCache[info.seqno] = {
        msgEmitter: new EventEmitter(),
        toget: self._curReq.fetching.slice(0),
        attrs: {},
        ended: false
      };

      self._curReq.bodyEmitter.emit('message', msg.msgEmitter, info.seqno);
    }

    toget = msg.toget;

    // here we compare the parsed version of the expression inside BODY[]
    // because 'HEADER.FIELDS (TO FROM)' really is equivalent to
    // 'HEADER.FIELDS ("TO" "FROM")' and some servers will actually send the
    // quoted form even if the client did not use quotes
    var thisbody = parseExpr(info.which);
    for (var i = 0, len = toget.length; i < len; ++i) {
      if (_deepEqual(thisbody, toget[i])) {
        toget.splice(i, 1);
        msg.msgEmitter.emit('body', stream, info);
        return;
      }
    }
    stream.resume(); // a body we didn't ask for?
  });
  parser.on('continue', function(info) {
    var type = self._curReq.type;
    if (type === 'IDLE') {
      if (self._queue.length
          && self._idle.started === 0
          && self._curReq
          && self._curReq.type === 'IDLE'
          && self._sock
          && self._sock.writable
          && !self._idle.enabled) {
        self.debug && self.debug('=> DONE');
        self._sock.write('DONE' + CRLF);
        return;
      }
      // now idling
      self._idle.started = Date.now();
    } else if (/^AUTHENTICATE XOAUTH/.test(self._curReq.fullcmd)) {
      self._curReq.oauthError = Buffer.from(info.text, 'base64').toString('utf8');
      self.debug && self.debug('=> ' + inspect(CRLF));
      self._sock.write(CRLF);
    } else if (type === 'APPEND') {
      self._sockWriteAppendData(self._curReq.appendData);
    } else if (self._curReq.lines && self._curReq.lines.length) {
      var line = self._curReq.lines.shift() + '\r\n';
      self.debug && self.debug('=> ' + inspect(line));
      self._sock.write(line, 'binary');
    }
  });
  parser.on('other', function(line) {
    var m;
    if (m = RE_IDLENOOPRES.exec(line)) {
      // no longer idling
      self._idle.enabled = false;
      self._idle.started = undefined;
      clearTimeout(self._tmrKeepalive);

      self._curReq = undefined;

      if (self._queue.length === 0
          && self._config.keepalive
          && self.state === 'authenticated'
          && !self._idle.enabled) {
        self._idle.enabled = true;
        if (m[1] === 'NOOP')
          self._doKeepaliveTimer();
        else
          self._doKeepaliveTimer(true);
      }

      self._processQueue();
    }
  });

  socket.connect({
    port: config.port,
    host: config.host,
    localAddress: config.localAddress
  });

  await new Promise(resolve => {
    this.once('connected', resolve);
  });

  return Promise.race([
    this._login(),
    new Promise((r, reject) => setTimeout(reject, config.connTimeout))
  ]).catch(err => {
    var err = new Error('Timed out while connecting to server');
    err.source = 'timeout';
    this.emit('error', err);
    socket.destroy();
  });
};

Connection.prototype.serverSupports = function(cap) {
  return (this._caps && this._caps.indexOf(cap) > -1);
};

Connection.prototype.destroy = function() {
  this._queue = [];
  this._curReq = undefined;
  this._sock && this._sock.end();
};

Connection.prototype.end = async function() {
  try {
    await this._enqueue('LOGOUT');
  } catch (e) {
    throw e;
  } finally {
    this._queue = [];
    this._curReq = undefined;
    this._sock.end();
    this.state = 'disconnected';
  }
};

Connection.prototype.append = function(data, options) {
  var literal = this.serverSupports('LITERAL+');
  if (typeof options === 'function') {
    cb = options;
    options = undefined;
  }
  options = options || {};
  if (!options.mailbox) {
    if (!this._box)
      throw new Error('No mailbox specified or currently selected');
    else
      options.mailbox = this._box.name;
  }
  var cmd = 'APPEND "' + escape(utf7.encode(''+options.mailbox)) + '"';
  if (options.flags) {
    if (!Array.isArray(options.flags))
      options.flags = [options.flags];
    if (options.flags.length > 0) {
      for (var i = 0, len = options.flags.length; i < len; ++i) {
        if (options.flags[i][0] !== '$' && options.flags[i][0] !== '\\')
          options.flags[i] = '\\' + options.flags[i];
      }
      cmd += ' (' + options.flags.join(' ') + ')';
    }
  }
  if (options.date) {
    if (!isDate(options.date))
      throw new Error('`date` is not a Date object');
    cmd += ' "';
    cmd += options.date.getDate();
    cmd += '-';
    cmd += MONTHS[options.date.getMonth()];
    cmd += '-';
    cmd += options.date.getFullYear();
    cmd += ' ';
    cmd += ('0' + options.date.getHours()).slice(-2);
    cmd += ':';
    cmd += ('0' + options.date.getMinutes()).slice(-2);
    cmd += ':';
    cmd += ('0' + options.date.getSeconds()).slice(-2);
    cmd += ((options.date.getTimezoneOffset() > 0) ? ' -' : ' +' );
    cmd += ('0' + (-options.date.getTimezoneOffset() / 60)).slice(-2);
    cmd += ('0' + (-options.date.getTimezoneOffset() % 60)).slice(-2);
    cmd += '"';
  }
  cmd += ' {';
  cmd += (Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data));
  cmd += (literal ? '+' : '') + '}';

  const promise = this._enqueue(cmd);

  if (literal)
    this._queue[this._queue.length - 1].literalAppendData = data;
  else
    this._queue[this._queue.length - 1].appendData = data;

    return promise;
};

Connection.prototype.getSpecialUseBoxes = function() {
  return this._enqueue('XLIST "" "*"');
};

Connection.prototype.getBoxes = function(namespace = '') {
  namespace = escape(utf7.encode(''+namespace));

  return this._enqueue('LIST "' + namespace + '" "*"');
};

Connection.prototype.id = function(identification) {
  if (!this.serverSupports('ID'))
    throw new Error('Server does not support ID');
  var cmd = 'ID';
  if ((identification === null) || (Object.keys(identification).length === 0))
    cmd += ' NIL';
  else {
    if (Object.keys(identification).length > 30)
      throw new Error('Max allowed number of keys is 30');
    var kv = [];
    for (var k in identification) {
      if (Buffer.byteLength(k) > 30)
        throw new Error('Max allowed key length is 30');
      if (Buffer.byteLength(identification[k]) > 1024)
        throw new Error('Max allowed value length is 1024');
      kv.push('"' + escape(k) + '"');
      kv.push('"' + escape(identification[k]) + '"');
    }
    cmd += ' (' + kv.join(' ') + ')';
  }
  return this._enqueue(cmd);
};

Connection.prototype.openBox = async function(name, readOnly) {
  if (this.state !== 'authenticated')
    throw new Error('Not authenticated');

  if (typeof readOnly === 'function') {
    cb = readOnly;
    readOnly = false;
  }

  name = ''+name;
  var encname = escape(utf7.encode(name)),
      cmd = (readOnly ? 'EXAMINE' : 'SELECT');

  cmd += ' "' + encname + '"';

  if (this.serverSupports('CONDSTORE'))
    cmd += ' (CONDSTORE)';

  await this._enqueue(cmd);
  this._box.name = name;
  return this._box;
};

Connection.prototype.closeBox = async function(shouldExpunge = true) {
  if (this._box === undefined)
    throw new Error('No mailbox is currently selected');

  if (shouldExpunge) {
    await this._enqueue('CLOSE');
  } else if (this.serverSupports('UNSELECT')) {
    // use UNSELECT if available, as it claims to be "cleaner" than the
    // alternative "hack"
    await this._enqueue('UNSELECT');
  } else {
    // "HACK": close the box without expunging by attempting to SELECT a
    // non-existent mailbox
    var badbox = 'NODEJSIMAPCLOSINGBOX' + Date.now();
    await this._enqueue('SELECT "' + badbox + '"');
  }

  this._box = undefined;
};

Connection.prototype.addBox = function(name) {
  return this._enqueue('CREATE "' + escape(utf7.encode(''+name)) + '"');
};

Connection.prototype.delBox = function(name) {
  return this._enqueue('DELETE "' + escape(utf7.encode(''+name)) + '"');
};

Connection.prototype.renameBox = async function(oldname, newname) {
  var encoldname = escape(utf7.encode(''+oldname)),
      encnewname = escape(utf7.encode(''+newname));

  await this._enqueue('RENAME "' + encoldname + '" "' + encnewname + '"');
  if (this._box
      && this._box.name === oldname
      && oldname.toUpperCase() !== 'INBOX') {
    this._box.name = newname;
    return this._box;
  }
};

Connection.prototype.subscribeBox = function(name) {
	return this._enqueue('SUBSCRIBE "' + escape(utf7.encode(''+name)) + '"');
};

Connection.prototype.unsubscribeBox = function(name) {
	return this._enqueue('UNSUBSCRIBE "' + escape(utf7.encode(''+name)) + '"');
};

Connection.prototype.getSubscribedBoxes = function(namespace = '') {
	namespace = escape(utf7.encode(''+namespace));

	return this._enqueue('LSUB "' + namespace + '" "*"');
};

Connection.prototype.status = function(boxName) {
  if (this._box && this._box.name === boxName)
    throw new Error('Cannot call status on currently selected mailbox');

  boxName = escape(utf7.encode(''+boxName));

  var info = [ 'MESSAGES', 'RECENT', 'UNSEEN', 'UIDVALIDITY', 'UIDNEXT' ];

  if (this.serverSupports('CONDSTORE'))
    info.push('HIGHESTMODSEQ');

  info = info.join(' ');

  return this._enqueue('STATUS "' + boxName + '" (' + info + ')');
};

Connection.prototype.expunge = function(uids) {
  if (uids !== undefined) {
    if (!Array.isArray(uids))
      uids = [uids];
    validateUIDList(uids);

    if (uids.length === 0)
      throw new Error('Empty uid list');

    uids = uids.join(',');

    if (!this.serverSupports('UIDPLUS'))
      throw new Error('Server does not support this feature (UIDPLUS)');

    return this._enqueue('UID EXPUNGE ' + uids);
  }

  return this._enqueue('EXPUNGE');
};

Connection.prototype.search = function(criteria) {
  return this._search('UID ', criteria);
};

Connection.prototype._search = function(which, criteria) {
  if (this._box === undefined)
    throw new Error('No mailbox is currently selected');
  else if (!Array.isArray(criteria))
    throw new Error('Expected array for search criteria');

  var cmd = which + 'SEARCH',
      info = { hasUTF8: false /*output*/ },
      query = buildSearchQuery(criteria, this._caps, info),
      lines;
  if (info.hasUTF8) {
    cmd += ' CHARSET UTF-8';
    lines = query.split(CRLF);
    query = lines.shift();
  }
  cmd += query;
  const promise = this._enqueue(cmd, (err, uids, higestmodseq) => {
    if (err) return;
    if (uids) uids.higestmodseq = higestmodseq;
    return uids;
  });
  if (info.hasUTF8) {
    var req = this._queue[this._queue.length - 1];
    req.lines = lines;
  }
  return promise;
};

Connection.prototype.addFlags = function(uids, flags) {
  return this._store('UID ', uids, { mode: '+', flags: flags });
};

Connection.prototype.delFlags = function(uids, flags) {
  return this._store('UID ', uids, { mode: '-', flags: flags });
};

Connection.prototype.setFlags = function(uids, flags, ) {
  return this._store('UID ', uids, { mode: '', flags: flags });
};

Connection.prototype.addKeywords = function(uids, keywords, ) {
  return this._store('UID ', uids, { mode: '+', keywords: keywords });
};

Connection.prototype.delKeywords = function(uids, keywords, ) {
  return this._store('UID ', uids, { mode: '-', keywords: keywords });
};

Connection.prototype.setKeywords = function(uids, keywords, ) {
  return this._store('UID ', uids, { mode: '', keywords: keywords });
};

Connection.prototype._store = function(which, uids, cfg) {
  var mode = cfg.mode,
      isFlags = (cfg.flags !== undefined),
      items = (isFlags ? cfg.flags : cfg.keywords);
  if (this._box === undefined)
    throw new Error('No mailbox is currently selected');
  else if (uids === undefined)
    throw new Error('No messages specified');

  if (!Array.isArray(uids))
    uids = [uids];
  validateUIDList(uids);

  if (uids.length === 0) {
    throw new Error('Empty '
                    + (which === '' ? 'sequence number' : 'uid')
                    + 'list');
  }

  if ((!Array.isArray(items) && typeof items !== 'string')
      || (Array.isArray(items) && items.length === 0))
    throw new Error((isFlags ? 'Flags' : 'Keywords')
                    + ' argument must be a string or a non-empty Array');
  if (!Array.isArray(items))
    items = [items];
  for (var i = 0, len = items.length; i < len; ++i) {
    if (isFlags) {
      if (items[i][0] !== '\\')
        items[i] = '\\' + items[i];
    } else {
      // keyword contains any char except control characters (%x00-1F and %x7F)
      // and: '(', ')', '{', ' ', '%', '*', '\', '"', ']'
      if (RE_INVALID_KW_CHARS.test(items[i])) {
        throw new Error('The keyword "' + items[i]
                        + '" contains invalid characters');
      }
    }
  }

  items = items.join(' ');
  uids = uids.join(',');

  var modifiers = '';
  if (cfg.modseq !== undefined && !this._box.nomodseq)
    modifiers += 'UNCHANGEDSINCE ' + cfg.modseq + ' ';

  return this._enqueue(which + 'STORE ' + uids + ' '
                + modifiers
                + mode + 'FLAGS.SILENT (' + items + ')');
};

Connection.prototype.copy = function(uids, boxTo) {
  this._copy('UID ', uids, boxTo);
};

Connection.prototype._copy = function(which, uids, boxTo) {
  if (this._box === undefined)
    throw new Error('No mailbox is currently selected');

  if (!Array.isArray(uids))
    uids = [uids];
  validateUIDList(uids);

  if (uids.length === 0) {
    throw new Error('Empty '
                    + (which === '' ? 'sequence number' : 'uid')
                    + 'list');
  }

  boxTo = escape(utf7.encode(''+boxTo));

  return this._enqueue(which + 'COPY ' + uids.join(',') + ' "' + boxTo + '"');
};

Connection.prototype.move = function(uids, boxTo) {
  return this._move('UID ', uids, boxTo);
};

Connection.prototype._move = async function(which, uids, boxTo) {
  if (this._box === undefined)
    throw new Error('No mailbox is currently selected');

  if (this.serverSupports('MOVE')) {
    if (!Array.isArray(uids))
      uids = [uids];
    validateUIDList(uids);

    if (uids.length === 0) {
      throw new Error('Empty '
                      + (which === '' ? 'sequence number' : 'uid')
                      + 'list');
    }

    uids = uids.join(',');
    boxTo = escape(utf7.encode(''+boxTo));

    return this._enqueue(which + 'MOVE ' + uids + ' "' + boxTo + '"');
  } else if (this._box.permFlags.indexOf('\\Deleted') === -1
             && this._box.flags.indexOf('\\Deleted') === -1) {
    throw new Error('Cannot move message: '
                    + 'server does not allow deletion of messages');
  } else {
    var deletedUIDs, task = 0;
    const info = await this._copy(which, uids, boxTo);

    // UIDPLUS gives us a 'UID EXPUNGE n' command to expunge a subset of
    // messages with the \Deleted flag set. This allows us to skip some
    // actions.
    if (!which || !this.serverSupports('UIDPLUS')) {
      // Make sure we don't expunge any messages marked as Deleted except the
      // one we are moving
      deletedUIDs = await this.search(['DELETED']);
      if (deletedUIDs.length) {
        await this.delFlags(deletedUIDs, '\\Deleted');
      }
    }
    // add flags
    if (which) {
      await this.addFlags(uids, '\\Deleted');
    } else {
      await this.seq.addFlags(uids, '\\Deleted');
    }
    // expunge
    if (which && this.serverSupports('UIDPLUS')) {
      await this.expunge(uids);
      return info;
    } else {
      await this.expunge();
    }
    // add flags
    if (deletedUIDs.length) {
      await this.addFlags(deletedUIDs, '\\Deleted');
    }
    return info;
  }
};

Connection.prototype.fetch = function(uids, options) {
  return this._fetch('UID ', uids, options);
};

Connection.prototype._fetch = function(which, uids, options) {
  if (uids === undefined
      || uids === null
      || (Array.isArray(uids) && uids.length === 0))
    throw new Error('Nothing to fetch');

  if (!Array.isArray(uids))
    uids = [uids];
  validateUIDList(uids);

  if (uids.length === 0) {
    throw new Error('Empty '
                    + (which === '' ? 'sequence number' : 'uid')
                    + 'list');
  }

  uids = uids.join(',');

  var cmd = which + 'FETCH ' + uids + ' (',
      fetching = [],
      i, len, key;

  if (this.serverSupports('X-GM-EXT-1')) {
    fetching.push('X-GM-THRID');
    fetching.push('X-GM-MSGID');
    fetching.push('X-GM-LABELS');
  }
  if (this.serverSupports('CONDSTORE') && !this._box.nomodseq)
    fetching.push('MODSEQ');

  fetching.push('UID');
  fetching.push('FLAGS');
  fetching.push('INTERNALDATE');

  var modifiers;

  if (options) {
    modifiers = options.modifiers;
    if (options.envelope)
      fetching.push('ENVELOPE');
    if (options.struct)
      fetching.push('BODYSTRUCTURE');
    if (options.size)
      fetching.push('RFC822.SIZE');
    if (Array.isArray(options.extensions)) {
      options.extensions.forEach(function (extension) {
        fetching.push(extension.toUpperCase());
      });
    }
    cmd += fetching.join(' ');
    if (options.bodies !== undefined) {
      var bodies = options.bodies,
          prefix = (options.markSeen ? '' : '.PEEK');
      if (!Array.isArray(bodies))
        bodies = [bodies];
      for (i = 0, len = bodies.length; i < len; ++i) {
        fetching.push(parseExpr(''+bodies[i]));
        cmd += ' BODY' + prefix + '[' + bodies[i] + ']';
      }
    }
  } else
    cmd += fetching.join(' ');

  cmd += ')';

  var modkeys = (typeof modifiers === 'object' ? Object.keys(modifiers) : []),
      modstr = ' (';
  for (i = 0, len = modkeys.length, key; i < len; ++i) {
    key = modkeys[i].toUpperCase();
    if (key === 'CHANGEDSINCE' && this.serverSupports('CONDSTORE')
        && !this._box.nomodseq)
      modstr += key + ' ' + modifiers[modkeys[i]] + ' ';
  }
  if (modstr.length > 2) {
    cmd += modstr.substring(0, modstr.length - 1);
    cmd += ')';
  }

  this._enqueue(cmd);
  var req = this._queue[this._queue.length - 1];
  req.fetchCache = {};
  req.fetching = fetching;
  return (req.bodyEmitter = new EventEmitter());
};

// Extension methods ===========================================================
Connection.prototype.setLabels = function(uids, labels) {
  return this._storeLabels('UID ', uids, labels, '');
};

Connection.prototype.addLabels = function(uids, labels) {
  return this._storeLabels('UID ', uids, labels, '+');
};

Connection.prototype.delLabels = function(uids, labels) {
  return this._storeLabels('UID ', uids, labels, '-');
};

Connection.prototype._storeLabels = function(which, uids, labels, mode) {
  if (!this.serverSupports('X-GM-EXT-1'))
    throw new Error('Server must support X-GM-EXT-1 capability');
  else if (this._box === undefined)
    throw new Error('No mailbox is currently selected');
  else if (uids === undefined)
    throw new Error('No messages specified');

  if (!Array.isArray(uids))
    uids = [uids];
  validateUIDList(uids);

  if (uids.length === 0) {
    throw new Error('Empty '
                    + (which === '' ? 'sequence number' : 'uid')
                    + 'list');
  }

  if ((!Array.isArray(labels) && typeof labels !== 'string')
      || (Array.isArray(labels) && labels.length === 0))
    throw new Error('labels argument must be a string or a non-empty Array');

  if (!Array.isArray(labels))
    labels = [labels];
  labels = labels.map(function(v) {
    return '"' + escape(utf7.encode(''+v)) + '"';
  }).join(' ');

  uids = uids.join(',');

  return this._enqueue(which + 'STORE ' + uids + ' ' + mode
                + 'X-GM-LABELS.SILENT (' + labels + ')');
};

Connection.prototype.sort = function(sorts, criteria) {
  return this._sort('UID ', sorts, criteria);
};

Connection.prototype._sort = function(which, sorts, criteria) {
  if (this._box === undefined)
    throw new Error('No mailbox is currently selected');
  else if (!Array.isArray(sorts) || !sorts.length)
    throw new Error('Expected array with at least one sort criteria');
  else if (!Array.isArray(criteria))
    throw new Error('Expected array for search criteria');
  else if (!this.serverSupports('SORT'))
    throw new Error('Sort is not supported on the server');

  sorts = sorts.map(function(c) {
    if (typeof c !== 'string')
      throw new Error('Unexpected sort criteria data type. '
                      + 'Expected string. Got: ' + typeof criteria);

    var modifier = '';
    if (c[0] === '-') {
      modifier = 'REVERSE ';
      c = c.substring(1);
    }
    switch (c.toUpperCase()) {
      case 'ARRIVAL':
      case 'CC':
      case 'DATE':
      case 'FROM':
      case 'SIZE':
      case 'SUBJECT':
      case 'TO':
        break;
      default:
        throw new Error('Unexpected sort criteria: ' + c);
    }

    return modifier + c;
  });

  sorts = sorts.join(' ');

  var info = { hasUTF8: false /*output*/ },
      query = buildSearchQuery(criteria, this._caps, info),
      charset = 'US-ASCII',
      lines;
  if (info.hasUTF8) {
    charset = 'UTF-8';
    lines = query.split(CRLF);
    query = lines.shift();
  }

  const promise = this._enqueue(which + 'SORT (' + sorts + ') ' + charset + query);
  if (info.hasUTF8) {
    var req = this._queue[this._queue.length - 1];
    req.lines = lines;
  }
  return promise;
};

Connection.prototype.esearch = function(criteria, options) {
  this._esearch('UID ', criteria, options);
};

Connection.prototype._esearch = function(which, criteria, options = '') {
  if (this._box === undefined)
    throw new Error('No mailbox is currently selected');
  else if (!Array.isArray(criteria))
    throw new Error('Expected array for search options');

  var info = { hasUTF8: false /*output*/ },
      query = buildSearchQuery(criteria, this._caps, info),
      charset = '',
      lines;
  if (info.hasUTF8) {
    charset = ' CHARSET UTF-8';
    lines = query.split(CRLF);
    query = lines.shift();
  }

  if (Array.isArray(options))
    options = options.join(' ');

  const promise = this._enqueue(which + 'SEARCH RETURN (' + options + ')' + charset + query);
  if (info.hasUTF8) {
    var req = this._queue[this._queue.length - 1];
    req.lines = lines;
  }
  return promise;
};

Connection.prototype.setQuota = async function(quotaRoot, limits = {}) {
  var triplets = '';
  for (var l in limits) {
    if (triplets)
      triplets += ' ';
    triplets += l + ' ' + limits[l];
  }

  quotaRoot = escape(utf7.encode(''+quotaRoot));

  const quotalist = await this._enqueue('SETQUOTA "' + quotaRoot + '" (' + triplets + ')')
  return quotalist ? quotalist[0] : limits;
};

Connection.prototype.getQuota = async function(quotaRoot) {
  quotaRoot = escape(utf7.encode(''+quotaRoot));

  const quotalist = await this._enqueue('GETQUOTA "' + quotaRoot + '"');
  return quotalist[0];
};

Connection.prototype.getQuotaRoot = async function(boxName) {
  boxName = escape(utf7.encode(''+boxName));

  const quotalist = await this._enqueue('GETQUOTAROOT "' + boxName + '"');
  var quotas = {};
  if (quotalist) {
    for (var i = 0, len = quotalist.length; i < len; ++i)
      quotas[quotalist[i].root] = quotalist[i].resources;
  }

  return quotas;
};

Connection.prototype.thread = function(algorithm, criteria) {
  return this._thread('UID ', algorithm, criteria);
};

Connection.prototype._thread = function(which, algorithm, criteria) {
  algorithm = algorithm.toUpperCase();

  if (!this.serverSupports('THREAD=' + algorithm))
    throw new Error('Server does not support that threading algorithm');

  var info = { hasUTF8: false /*output*/ },
      query = buildSearchQuery(criteria, this._caps, info),
      charset = 'US-ASCII',
      lines;
  if (info.hasUTF8) {
    charset = 'UTF-8';
    lines = query.split(CRLF);
    query = lines.shift();
  }

  const promise = this._enqueue(which + 'THREAD ' + algorithm + ' ' + charset + query);
  if (info.hasUTF8) {
    var req = this._queue[this._queue.length - 1];
    req.lines = lines;
  }
  return promise;
};

Connection.prototype.addFlagsSince = function(uids, flags, modseq) {
  return this._store('UID ',
              uids,
              { mode: '+', flags: flags, modseq: modseq });
};

Connection.prototype.delFlagsSince = function(uids, flags, modseq) {
  return this._store('UID ',
              uids,
              { mode: '-', flags: flags, modseq: modseq });
};

Connection.prototype.setFlagsSince = function(uids, flags, modseq) {
  return this._store('UID ',
              uids,
              { mode: '', flags: flags, modseq: modseq });
};

Connection.prototype.addKeywordsSince = function(uids, keywords, modseq) {
  return this._store('UID ',
              uids,
              { mode: '+', keywords: keywords, modseq: modseq });
};

Connection.prototype.delKeywordsSince = function(uids, keywords, modseq) {
  return this._store('UID ',
              uids,
              { mode: '-', keywords: keywords, modseq: modseq });
};

Connection.prototype.setKeywordsSince = function(uids, keywords, modseq) {
  return this._store('UID ',
              uids,
              { mode: '', keywords: keywords, modseq: modseq });
};

Connection.prototype.getMetadata = function (keys, mailbox = '', depth) {
  if (!this.serverSupports('METADATA'))
    throw new Error('Server does not support METADATA');
  if (depth !== undefined && !/^(0|1|infinity)$/.test(depth.toString()))
    throw new Error('Depth must be one of 0, 1, infinitiy. Got ' + depth);

  keys = [].concat(keys);
  keys = `(${keys.join(' ')})`;

  if (depth !== undefined) depth = `(DEPTH ${depth}) `;
  else depth = '';

  return this._enqueue(`GETMETADATA "${mailbox}" ${depth}${keys}`);
};

Connection.prototype.setMetadata = function (data, mailbox = '') {
  if (!this.serverSupports('METADATA'))
    throw new Error('Server does not support METADATA');

  if (!mailbox) mailbox = '""';
  data = Object.keys(data).map(key => {
    if (data[key] === null) return `${key} NIL`;
    return `${key} "${data[key]}"`;
  }).join(' ');

  return this._enqueue(`SETMETADATA ${mailbox} (${data})`)
};
// END Extension methods =======================================================

// Namespace for seqno-based commands
Object.defineProperty(Connection.prototype, 'seq', { get: function() {
  var self = this;
  return {
    delKeywords: function(seqnos, keywords) {
      return self._store('', seqnos, { mode: '-', keywords: keywords });
    },
    addKeywords: function(seqnos, keywords) {
      return self._store('', seqnos, { mode: '+', keywords: keywords });
    },
    setKeywords: function(seqnos, keywords) {
      return self._store('', seqnos, { mode: '', keywords: keywords });
    },

    delFlags: function(seqnos, flags) {
      return self._store('', seqnos, { mode: '-', flags: flags });
    },
    addFlags: function(seqnos, flags) {
      return self._store('', seqnos, { mode: '+', flags: flags });
    },
    setFlags: function(seqnos, flags) {
      return self._store('', seqnos, { mode: '', flags: flags });
    },

    move: function(seqnos, boxTo) {
      return self._move('', seqnos, boxTo);
    },
    copy: function(seqnos, boxTo) {
      return self._copy('', seqnos, boxTo);
    },
    fetch: function(seqnos, options) {
      return self._fetch('', seqnos, options);
    },
    search: function(options) {
      return self._search('', options);
    },

    // Extensions ==============================================================
    delLabels: function(seqnos, labels) {
      return self._storeLabels('', seqnos, labels, '-');
    },
    addLabels: function(seqnos, labels) {
      return self._storeLabels('', seqnos, labels, '+');
    },
    setLabels: function(seqnos, labels) {
      return self._storeLabels('', seqnos, labels, '');
    },

    esearch: function(criteria, options) {
      return self._esearch('', criteria, options);
    },

    sort: function(sorts, options) {
      return self._sort('', sorts, options);
    },
    thread: function(algorithm, criteria) {
      return self._thread('', algorithm, criteria);
    },

    delKeywordsSince: function(seqnos, keywords, modseq) {
      return self._store('',
                  seqnos,
                  { mode: '-', keywords: keywords, modseq: modseq });
    },
    addKeywordsSince: function(seqnos, keywords, modseq) {
      return self._store('',
                  seqnos,
                  { mode: '+', keywords: keywords, modseq: modseq });
    },
    setKeywordsSince: function(seqnos, keywords, modseq) {
      return self._store('',
                  seqnos,
                  { mode: '', keywords: keywords, modseq: modseq });
    },

    delFlagsSince: function(seqnos, flags, modseq) {
      return self._store('',
                  seqnos,
                  { mode: '-', flags: flags, modseq: modseq });
    },
    addFlagsSince: function(seqnos, flags, modseq) {
      return self._store('',
                  seqnos,
                  { mode: '+', flags: flags, modseq: modseq });
    },
    setFlagsSince: function(seqnos, flags, modseq) {
      return self._store('',
                  seqnos,
                  { mode: '', flags: flags, modseq: modseq });
    }
  };
}});

Connection.prototype._resUntagged = function(info) {
  var type = info.type, i, len, box, attrs, key;

  if (type === 'bye')
    this._sock.end();
  else if (type === 'namespace')
    this.namespaces = info.text;
  else if (type === 'id')
    this._curReq.cbargs.push(info.text);
  else if (type === 'capability')
    this._caps = info.text.map(function(v) { return v.toUpperCase(); });
  else if (type === 'preauth')
    this.state = 'authenticated';
  else if (type === 'sort' || type === 'thread' || type === 'esearch')
    this._curReq.cbargs.push(info.text);
  else if (type === 'search') {
    if (info.text.results !== undefined) {
      // CONDSTORE-modified search results
      this._curReq.cbargs.push(info.text.results);
      this._curReq.cbargs.push(info.text.modseq);
    } else
      this._curReq.cbargs.push(info.text);
  } else if (type === 'quota') {
    var cbargs = this._curReq.cbargs;
    if (!cbargs.length)
      cbargs.push([]);
    cbargs[0].push(info.text);
  } else if (type === 'metadata') {
    var cbargs = this._curReq.cbargs;
    if (!cbargs.length) cbargs.push({});
    Object.assign(cbargs[0], info.text.data);
  } else if (type === 'recent') {
    if (!this._box && RE_OPENBOX.test(this._curReq.type))
      this._createCurrentBox();
    if (this._box)
      this._box.messages.new = info.num;
  } else if (type === 'flags') {
    if (!this._box && RE_OPENBOX.test(this._curReq.type))
      this._createCurrentBox();
    if (this._box)
      this._box.flags = info.text;
  } else if (type === 'bad' || type === 'no') {
    if (this.state === 'connected' && !this._curReq) {
      clearTimeout(this._tmrAuth);
      var err = new Error('Received negative welcome: ' + info.text);
      err.source = 'protocol';
      this.emit('error', err);
      this._sock.end();
    }
  } else if (type === 'exists') {
    if (!this._box && RE_OPENBOX.test(this._curReq.type))
      this._createCurrentBox();
    if (this._box) {
      var prev = this._box.messages.total,
          now = info.num;
      this._box.messages.total = now;
      if (now > prev && this.state === 'authenticated') {
        this._box.messages.new = now - prev;
        this.emit('mail', this._box.messages.new);
      }
    }
  } else if (type === 'expunge') {
    if (this._box) {
      if (this._box.messages.total > 0)
        --this._box.messages.total;
      this.emit('expunge', info.num);
    }
  } else if (type === 'ok') {
    if (this.state === 'connected' && !this._curReq)
      this.emit('connected');
    else if (typeof info.textCode === 'string'
             && info.textCode.toUpperCase() === 'ALERT')
      this.emit('alert', info.text);
    else if (this._curReq
             && info.textCode
             && (RE_OPENBOX.test(this._curReq.type))) {
      // we're opening a mailbox

      if (!this._box)
        this._createCurrentBox();

      if (info.textCode.key)
        key = info.textCode.key.toUpperCase();
      else
        key = info.textCode;

      if (key === 'UIDVALIDITY')
        this._box.uidvalidity = info.textCode.val;
      else if (key === 'UIDNEXT')
        this._box.uidnext = info.textCode.val;
      else if (key === 'HIGHESTMODSEQ')
        this._box.highestmodseq = ''+info.textCode.val;
      else if (key === 'PERMANENTFLAGS') {
        var idx, permFlags, keywords;
        this._box.permFlags = permFlags = info.textCode.val;
        if ((idx = this._box.permFlags.indexOf('\\*')) > -1) {
          this._box.newKeywords = true;
          permFlags.splice(idx, 1);
        }
        this._box.keywords = keywords = permFlags.filter(function(f) {
                                          return (f[0] !== '\\');
                                        });
        for (i = 0, len = keywords.length; i < len; ++i)
          permFlags.splice(permFlags.indexOf(keywords[i]), 1);
      } else if (key === 'UIDNOTSTICKY')
        this._box.persistentUIDs = false;
      else if (key === 'NOMODSEQ')
        this._box.nomodseq = true;
    } else if (typeof info.textCode === 'string'
               && info.textCode.toUpperCase() === 'UIDVALIDITY')
      this.emit('uidvalidity', info.text);
  } else if (type === 'list' || type === 'lsub' || type === 'xlist') {
    if (this.delimiter === undefined)
      this.delimiter = info.text.delimiter;
    else {
      if (this._curReq.cbargs.length === 0)
        this._curReq.cbargs.push({});

      box = {
        attribs: info.text.flags,
        delimiter: info.text.delimiter,
        children: null,
        parent: null
      };

      for (i = 0, len = SPECIAL_USE_ATTRIBUTES.length; i < len; ++i)
        if (box.attribs.indexOf(SPECIAL_USE_ATTRIBUTES[i]) > -1)
          box.special_use_attrib = SPECIAL_USE_ATTRIBUTES[i];

      var name = info.text.name,
          curChildren = this._curReq.cbargs[0];

      if (box.delimiter) {
        var path = name.split(box.delimiter),
            parent = null;
        name = path.pop();
        for (i = 0, len = path.length; i < len; ++i) {
          if (!curChildren[path[i]])
            curChildren[path[i]] = {};
          if (!curChildren[path[i]].children)
            curChildren[path[i]].children = {};
          parent = curChildren[path[i]];
          curChildren = curChildren[path[i]].children;
        }
        box.parent = parent;
      }
      if (curChildren[name])
        box.children = curChildren[name].children;
      curChildren[name] = box;
    }
  } else if (type === 'status') {
    box = {
      name: info.text.name,
      uidnext: 0,
      uidvalidity: 0,
      messages: {
        total: 0,
        new: 0,
        unseen: 0
      }
    };
    attrs = info.text.attrs;

    if (attrs) {
      if (attrs.recent !== undefined)
        box.messages.new = attrs.recent;
      if (attrs.unseen !== undefined)
        box.messages.unseen = attrs.unseen;
      if (attrs.messages !== undefined)
        box.messages.total = attrs.messages;
      if (attrs.uidnext !== undefined)
        box.uidnext = attrs.uidnext;
      if (attrs.uidvalidity !== undefined)
        box.uidvalidity = attrs.uidvalidity;
      if (attrs.highestmodseq !== undefined) // CONDSTORE
        box.highestmodseq = ''+attrs.highestmodseq;
    }
    this._curReq.cbargs.push(box);
   } else if (type === 'fetch') {
    if (/^(?:UID )?FETCH/.test(this._curReq.fullcmd)) {
      // FETCH response sent as result of FETCH request
      var msg = this._curReq.fetchCache[info.num],
          keys = Object.keys(info.text),
          keyslen = keys.length,
          toget, msgEmitter, j;

      if (msg === undefined) {
        // simple case -- no bodies were streamed
        toget = this._curReq.fetching.slice(0);
        if (toget.length === 0)
          return;

        msgEmitter = new EventEmitter();
        attrs = {};

        this._curReq.bodyEmitter.emit('message', msgEmitter, info.num);
      } else {
        toget = msg.toget;
        msgEmitter = msg.msgEmitter;
        attrs = msg.attrs;
      }

      i = toget.length;
      if (i === 0) {
        if (msg && !msg.ended) {
          msg.ended = true;
          setImmediate(function() {
            msgEmitter.emit('end');
          });
        }
        return;
      }

      if (keyslen > 0) {
        while (--i >= 0) {
          j = keyslen;
          while (--j >= 0) {
            if (keys[j].toUpperCase() === toget[i]) {
              if (!RE_BODYPART.test(toget[i])) {
                if (toget[i] === 'X-GM-LABELS') {
                  var labels = info.text[keys[j]];
                  for (var k = 0, lenk = labels.length; k < lenk; ++k)
                    labels[k] = (''+labels[k]).replace(RE_ESCAPE, '\\');
                }
                key = FETCH_ATTR_MAP[toget[i]];
                if (!key)
                  key = toget[i].toLowerCase();
                attrs[key] = info.text[keys[j]];
              }
              toget.splice(i, 1);
              break;
            }
          }
        }
      }

      if (toget.length === 0) {
        if (msg)
          msg.ended = true;
        setImmediate(function() {
          msgEmitter.emit('attributes', attrs);
          msgEmitter.emit('end');
        });
      } else if (msg === undefined) {
        this._curReq.fetchCache[info.num] = {
          msgEmitter: msgEmitter,
          toget: toget,
          attrs: attrs,
          ended: false
        };
      }
    } else {
      // FETCH response sent as result of STORE request or sent unilaterally,
      // treat them as the same for now for simplicity
      this.emit('update', info.num, info.text);
    }
  }
};

Connection.prototype._resTagged = async function(info) {
  var req = this._curReq, err;

  if (!req)
    return;

  this._curReq = undefined;

  if (info.type === 'no' || info.type === 'bad') {
    var errtext;
    if (info.text)
      errtext = info.text;
    else
      errtext = req.oauthError;
    err = new Error(errtext);
    err.type = info.type;
    err.textCode = info.textCode;
    err.source = 'protocol';
  } else if (this._box) {
    if (req.type === 'EXAMINE' || req.type === 'SELECT') {
      this._box.readOnly = (typeof info.textCode === 'string'
                            && info.textCode.toUpperCase() === 'READ-ONLY');
    }

    // According to RFC 3501, UID commands do not give errors for
    // non-existant user-supplied UIDs, so give the callback empty results
    // if we unexpectedly received no untagged responses.
    if (RE_UIDCMD_HASRESULTS.test(req.fullcmd) && req.cbargs.length === 0)
      req.cbargs.push([]);
  }

  if (req.bodyEmitter) {
    var bodyEmitter = req.bodyEmitter;
    if (err)
      bodyEmitter.emit('error', err);
    setImmediate(function() {
      bodyEmitter.emit('end');
    });
  } else {
    req.cbargs.unshift(err);
    if (info.textCode && info.textCode.key) {
      var key = info.textCode.key.toUpperCase();
      if (key === 'APPENDUID') // [uidvalidity, newUID]
        req.cbargs.push(info.textCode.val[1]);
      else if (key === 'COPYUID') // [uidvalidity, sourceUIDs, destUIDs]
        req.cbargs.push(info.textCode.val[2]);
    }
  }
  await req.cb.apply(this, req.cbargs);

  // wait until event queue is empty
  await new Promise(resolve => setImmediate(resolve));

  if (this._queue.length === 0
      && this._config.keepalive
      && this.state === 'authenticated'
      && !this._idle.enabled) {
    this._idle.enabled = true;
    this._doKeepaliveTimer(true);
  }

  this._processQueue();
};

Connection.prototype._createCurrentBox = function() {
  this._box = {
    name: '',
    flags: [],
    readOnly: false,
    uidvalidity: 0,
    uidnext: 0,
    permFlags: [],
    keywords: [],
    newKeywords: false,
    persistentUIDs: true,
    nomodseq: false,
    messages: {
      total: 0,
      new: 0
    }
  };
};

Connection.prototype._doKeepaliveTimer = function(immediate) {
  var self = this,
      interval = this._config.keepalive.interval || KEEPALIVE_INTERVAL,
      idleWait = this._config.keepalive.idleInterval || MAX_IDLE_WAIT,
      forceNoop = this._config.keepalive.forceNoop || false,
      timerfn = function() {
        if (self._idle.enabled) {
          // unlike NOOP, IDLE is only a valid command after authenticating
          if (!self.serverSupports('IDLE')
              || self.state !== 'authenticated'
              || forceNoop)
            self._enqueue('NOOP', true);
          else {
            if (self._idle.started === undefined) {
              self._idle.started = 0;
              self._enqueue('IDLE', true);
            } else if (self._idle.started > 0) {
              var timeDiff = Date.now() - self._idle.started;
              if (timeDiff >= idleWait) {
                self._idle.enabled = false;
                self.debug && self.debug('=> DONE');
                self._sock.write('DONE' + CRLF);
                return;
              }
            }
            self._tmrKeepalive = setTimeout(timerfn, interval);
          }
        }
      };

  if (immediate)
    timerfn();
  else
    this._tmrKeepalive = setTimeout(timerfn, interval);
};

Connection.prototype._login = async function() {
  try {
    var checkedNS = false;

    // 1. Get the supported capabilities
    await this._enqueue('CAPABILITY');

    // No need to attempt the login sequence if we're on a PREAUTH connection.
    if (this.state === 'connected') {
      if (this.serverSupports('STARTTLS')
          && (this._config.autotls === 'always'
              || (this._config.autotls === 'required'
                  && this.serverSupports('LOGINDISABLED')))) {
          return this._starttls();
      }

      if (this.serverSupports('LOGINDISABLED')) {
        const err = new Error('Logging in is disabled on this server');
        throw err;
      }

      var cmd;
      if (this.serverSupports('AUTH=XOAUTH') && this._config.xoauth) {
        this._caps = undefined;
        cmd = 'AUTHENTICATE XOAUTH';
        // are there any servers that support XOAUTH/XOAUTH2 and not SASL-IR?
        //if (this.serverSupports('SASL-IR'))
          cmd += ' ' + escape(this._config.xoauth);
        await this._enqueue(cmd);
      } else if (this.serverSupports('AUTH=XOAUTH2') && this._config.xoauth2) {
        this._caps = undefined;
        cmd = 'AUTHENTICATE XOAUTH2';
        //if (this.serverSupports('SASL-IR'))
          cmd += ' ' + escape(this._config.xoauth2);
        await this._enqueue(cmd);
      } else if (this._config.user && this._config.password) {
        this._caps = undefined;
        await this._enqueue('LOGIN "' + escape(this._config.user) + '" "'
                      + escape(this._config.password) + '"');
      } else {
        throw new Error('No supported authentication method(s) available. '
                        + 'Unable to login.');
      }

      if (this._caps === undefined) {
        // Fetch server capabilities if they were not automatically
        // provided after authentication
        await this._enqueue('CAPABILITY');
      }
    }

    // 2. Get the list of available namespaces (RFC2342)
    if (!checkedNS && this.serverSupports('NAMESPACE')) {
      checkedNS = true;
      await this._enqueue('NAMESPACE');
    }

    // 3. Get the top-level mailbox hierarchy delimiter used by the server
    await this._enqueue('LIST "" ""');
    this.state = 'authenticated';
  // this.emit('ready');
  } catch (error) {
    // error.source = 'authentication';
    this.emit('error', error);
    self._sock.end();
    throw error;
  }
};

Connection.prototype._starttls = async function() {
  // var self = this;
  try {
    await this._enqueue('STARTTLS');
  } catch (err) {
    this.emit('error', err);
    this._sock.end();
    throw err;
  }
  this._caps = undefined;
  this._sock.removeAllListeners('error');

  var tlsOptions = {};

  tlsOptions.host = this._config.host;
  // Host name may be overridden the tlsOptions
  for (var k in this._config.tlsOptions)
    tlsOptions[k] = this._config.tlsOptions[k];
  tlsOptions.socket = this._sock;

  this._sock = tls.connect(tlsOptions);

  this._sock.on('error', this._onError);
  this._sock.on('timeout', this._onSocketTimeout);
  this._sock.setTimeout(this._config.socketTimeout);

  this._parser.setStream(this._sock);

  await new Promise(resolve, tls.once('secureConnect', resolve));

  return this._login();
};

Connection.prototype._processQueue = function() {
  if (this._curReq || !this._queue.length || !this._sock || !this._sock.writable)
    return;

  this._curReq = this._queue.shift();

  if (this._tagcount === MAX_INT)
    this._tagcount = 0;

  var prefix;

  if (this._curReq.type === 'IDLE' || this._curReq.type === 'NOOP')
    prefix = this._curReq.type;
  else
    prefix = 'A' + (this._tagcount++);

  var out = prefix + ' ' + this._curReq.fullcmd;
  this.debug && this.debug('=> ' + inspect(out));
  this._sock.write(out + CRLF, 'utf8');

  if (this._curReq.literalAppendData) {
    // LITERAL+: we are appending a mesage, and not waiting for a reply
    this._sockWriteAppendData(this._curReq.literalAppendData);
  }
};

Connection.prototype._sockWriteAppendData = function(appendData)
{
  var val = appendData;
  if (Buffer.isBuffer(appendData))
    val = val.toString('utf8');

  this.debug && this.debug('=> ' + inspect(val));
  this._sock.write(val);
  this._sock.write(CRLF);
};

Connection.prototype._enqueue = function(fullcmd, promote, map) {
  var info = {
    type: fullcmd.match(RE_CMD)[1],
    fullcmd: fullcmd,
    cbargs: []
  };
  return info.promise = new Promise((resolve, reject) => {
    if (typeof promote === 'function') {
      cb = promote;
      promote = false;
    }

    info.cb = function (err, result) {
      if (map) result = map.apply(this, arguments) || result;
      if (err) return reject(err);
      return Promise.all([result]).then(([result]) => resolve(result));
    };

    var self = this;

    if (promote)
      this._queue.unshift(info);
    else
      this._queue.push(info);

    if (!this._curReq
        && this.state !== 'disconnected'
        && this.state !== 'upgrading') {
      // defer until next tick for requests like APPEND and FETCH where access to
      // the request object is needed immediately after enqueueing
      setImmediate(() => self._processQueue());
    } else if (this._curReq
               && this._curReq.type === 'IDLE'
               && this._sock
               && this._sock.writable
               && this._idle.enabled) {
      this._idle.enabled = false;
      clearTimeout(this._tmrKeepalive);
      if (this._idle.started > 0) {
        // we've seen the continuation for our IDLE
        this.debug && this.debug('=> DONE');
        this._sock.write('DONE' + CRLF);
      }
    }
  });
};

Connection.parseHeader = parseHeader; // from Parser.js

module.exports = Connection;

// utilities -------------------------------------------------------------------

function escape(str) {
  return str.replace(RE_BACKSLASH, '\\\\').replace(RE_DBLQUOTE, '\\"');
}

function validateUIDList(uids, noThrow) {
  for (var i = 0, len = uids.length, intval; i < len; ++i) {
    if (typeof uids[i] === 'string') {
      if (uids[i] === '*' || uids[i] === '*:*') {
        if (len > 1)
          uids = ['*'];
        break;
      } else if (RE_NUM_RANGE.test(uids[i]))
        continue;
    }
    intval = parseInt(''+uids[i], 10);
    if (isNaN(intval)) {
      var err = new Error('UID/seqno must be an integer, "*", or a range: '
                          + uids[i]);
      if (noThrow)
        return err;
      else
        throw err;
    } else if (intval <= 0) {
      var err = new Error('UID/seqno must be greater than zero');
      if (noThrow)
        return err;
      else
        throw err;
    } else if (typeof uids[i] !== 'number') {
      uids[i] = intval;
    }
  }
}

function hasNonASCII(str) {
  for (var i = 0, len = str.length; i < len; ++i) {
    if (str.charCodeAt(i) > 0x7F)
      return true;
  }
  return false;
}

function buildString(str) {
  if (typeof str !== 'string')
    str = ''+str;

  if (hasNonASCII(str)) {
    var buf = Buffer.from(str, 'utf8');
    return '{' + buf.length + '}\r\n' + buf.toString('binary');
  } else
    return '"' + escape(str) + '"';
}

function buildSearchQuery(options, extensions, info, isOrChild) {
  var searchargs = '', err, val;
  for (var i = 0, len = options.length; i < len; ++i) {
    var criteria = (isOrChild ? options : options[i]),
        args = null,
        modifier = (isOrChild ? '' : ' ');
    if (typeof criteria === 'string')
      criteria = criteria.toUpperCase();
    else if (Array.isArray(criteria)) {
      if (criteria.length > 1)
        args = criteria.slice(1);
      if (criteria.length > 0)
        criteria = criteria[0].toUpperCase();
    } else
      throw new Error('Unexpected search option data type. '
                      + 'Expected string or array. Got: ' + typeof criteria);
    if (criteria === 'OR') {
      if (args.length !== 2)
        throw new Error('OR must have exactly two arguments');
      if (isOrChild)
        searchargs += 'OR (';
      else
        searchargs += ' OR (';
      searchargs += buildSearchQuery(args[0], extensions, info, true);
      searchargs += ') (';
      searchargs += buildSearchQuery(args[1], extensions, info, true);
      searchargs += ')';
    } else {
      if (criteria[0] === '!') {
        modifier += 'NOT ';
        criteria = criteria.substr(1);
      }
      switch(criteria) {
        // -- Standard criteria --
        case 'ALL':
        case 'ANSWERED':
        case 'DELETED':
        case 'DRAFT':
        case 'FLAGGED':
        case 'NEW':
        case 'SEEN':
        case 'RECENT':
        case 'OLD':
        case 'UNANSWERED':
        case 'UNDELETED':
        case 'UNDRAFT':
        case 'UNFLAGGED':
        case 'UNSEEN':
          searchargs += modifier + criteria;
        break;
        case 'BCC':
        case 'BODY':
        case 'CC':
        case 'FROM':
        case 'SUBJECT':
        case 'TEXT':
        case 'TO':
          if (!args || args.length !== 1)
            throw new Error('Incorrect number of arguments for search option: '
                            + criteria);
          val = buildString(args[0]);
          if (info && val[0] === '{')
            info.hasUTF8 = true;
          searchargs += modifier + criteria + ' ' + val;
        break;
        case 'BEFORE':
        case 'ON':
        case 'SENTBEFORE':
        case 'SENTON':
        case 'SENTSINCE':
        case 'SINCE':
          if (!args || args.length !== 1)
            throw new Error('Incorrect number of arguments for search option: '
                            + criteria);
          else if (!(args[0] instanceof Date)) {
            if ((args[0] = new Date(args[0])).toString() === 'Invalid Date')
              throw new Error('Search option argument must be a Date object'
                              + ' or a parseable date string');
          }
          searchargs += modifier + criteria + ' ' + args[0].getDate() + '-'
                        + MONTHS[args[0].getMonth()] + '-'
                        + args[0].getFullYear();
        break;
        case 'KEYWORD':
        case 'UNKEYWORD':
          if (!args || args.length !== 1)
            throw new Error('Incorrect number of arguments for search option: '
                            + criteria);
          searchargs += modifier + criteria + ' ' + args[0];
        break;
        case 'LARGER':
        case 'SMALLER':
          if (!args || args.length !== 1)
            throw new Error('Incorrect number of arguments for search option: '
                            + criteria);
          var num = parseInt(args[0], 10);
          if (isNaN(num))
            throw new Error('Search option argument must be a number');
          searchargs += modifier + criteria + ' ' + args[0];
        break;
        case 'HEADER':
          if (!args || args.length !== 2)
            throw new Error('Incorrect number of arguments for search option: '
                            + criteria);
          val = buildString(args[1]);
          if (info && val[0] === '{')
            info.hasUTF8 = true;
          searchargs += modifier + criteria + ' "' + escape(''+args[0])
                     + '" ' + val;
        break;
        case 'UID':
          if (!args)
            throw new Error('Incorrect number of arguments for search option: '
                            + criteria);
          validateUIDList(args);
          if (args.length === 0)
            throw new Error('Empty uid list');
          searchargs += modifier + criteria + ' ' + args.join(',');
        break;
        // Extensions ==========================================================
        case 'X-GM-MSGID': // Gmail unique message ID
        case 'X-GM-THRID': // Gmail thread ID
          if (extensions.indexOf('X-GM-EXT-1') === -1)
            throw new Error('IMAP extension not available for: ' + criteria);
          if (!args || args.length !== 1)
            throw new Error('Incorrect number of arguments for search option: '
                            + criteria);
          else {
            val = ''+args[0];
            if (!(RE_INTEGER.test(args[0])))
              throw new Error('Invalid value');
          }
          searchargs += modifier + criteria + ' ' + val;
        break;
        case 'X-GM-RAW': // Gmail search syntax
          if (extensions.indexOf('X-GM-EXT-1') === -1)
            throw new Error('IMAP extension not available for: ' + criteria);
          if (!args || args.length !== 1)
            throw new Error('Incorrect number of arguments for search option: '
                            + criteria);
          val = buildString(args[0]);
          if (info && val[0] === '{')
            info.hasUTF8 = true;
          searchargs += modifier + criteria + ' ' + val;
        break;
        case 'X-GM-LABELS': // Gmail labels
          if (extensions.indexOf('X-GM-EXT-1') === -1)
            throw new Error('IMAP extension not available for: ' + criteria);
          if (!args || args.length !== 1)
            throw new Error('Incorrect number of arguments for search option: '
                            + criteria);
          searchargs += modifier + criteria + ' ' + args[0];
        break;
        case 'MODSEQ':
          if (extensions.indexOf('CONDSTORE') === -1)
            throw new Error('IMAP extension not available for: ' + criteria);
          if (!args || args.length !== 1)
            throw new Error('Incorrect number of arguments for search option: '
                            + criteria);
          searchargs += modifier + criteria + ' ' + args[0];
        break;
        default:
          // last hope it's a seqno set
          // http://tools.ietf.org/html/rfc3501#section-6.4.4
          var seqnos = (args ? [criteria].concat(args) : [criteria]);
          if (!validateUIDList(seqnos, true)) {
            if (seqnos.length === 0)
              throw new Error('Empty sequence number list');
            searchargs += modifier + seqnos.join(',');
          } else
            throw new Error('Unexpected search option: ' + criteria);
      }
    }
    if (isOrChild)
      break;
  }
  return searchargs;
}

// Pulled from assert.deepEqual:
var pSlice = Array.prototype.slice;
function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (Buffer.isBuffer(actual) && Buffer.isBuffer(expected)) {
    if (actual.length !== expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (actual instanceof RegExp && expected instanceof RegExp) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (typeof actual !== 'object' && typeof expected !== 'object') {
    return actual == expected;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}
function isUndefinedOrNull(value) {
  return value === null || value === undefined;
}
function isArguments(object) {
  return Object.prototype.toString.call(object) === '[object Arguments]';
}
function objEquiv(a, b) {
  var ka, kb, key, i;
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    ka = Object.keys(a);
    kb = Object.keys(b);
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length !== kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}
