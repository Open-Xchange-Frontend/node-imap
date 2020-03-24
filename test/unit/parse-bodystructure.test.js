const assert = require('assert');
const { parseBodyStructure } = require('../../lib/Parser');

describe('parse bodystructure', function () {
  it('RFC3501 example #1', function () {
    const source = '("TEXT" "PLAIN" ("CHARSET" "US-ASCII") NIL NIL "7BIT" 1152 23)'
      + '("TEXT" "PLAIN" ("CHARSET" "US-ASCII" "NAME" "cc.diff")'
      + ' "<960723163407.20117h@cac.washington.edu>" "Compiler diff"'
      + ' "BASE64" 4554 73)'
      + '"MIXED"';
    const result = parseBodyStructure(source);
    assert.deepEqual(
      result,
      [{ type: 'mixed' },
      [{
        partID: '1',
        type: 'text',
        subtype: 'plain',
        params: { charset: 'US-ASCII' },
        id: null,
        description: null,
        encoding: '7BIT',
        size: 1152,
        lines: 23
      }
      ],
      [{
        partID: '2',
        type: 'text',
        subtype: 'plain',
        params: { charset: 'US-ASCII', name: 'cc.diff' },
        id: '<960723163407.20117h@cac.washington.edu>',
        description: 'Compiler diff',
        encoding: 'BASE64',
        size: 4554,
        lines: 73
      }
      ]
      ]
    );
  });
  it('Issue 477', function () {
    const source = 'NIL NIL ("CHARSET" "GB2312") NIL NIL NIL 176 NIL NIL NIL';
    const result = parseBodyStructure(source);
    assert.deepEqual(
      result,
      [{
        type: null,
        params: null,
        disposition: null,
        language: ['CHARSET', 'GB2312'],
        location: null,
        extensions: null
      }
      ]
    );
  });
  it('RFC3501 example #2', function () {
    const source = '"TEXT" "PLAIN" ("CHARSET" "US-ASCII") NIL NIL "7BIT" 3028 92'
    const result = parseBodyStructure(source);
    assert.deepEqual(
      result,
      [{
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
    );
  });
});
