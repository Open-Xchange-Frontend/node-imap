const { CRLF } = require('../../unit/util');
const crypto = require('crypto');
const bytes = crypto.pseudoRandomBytes(10240).toString('hex');

module.exports = {
  responses: [
    [
      '* CAPABILITY IMAP4rev1 UNSELECT IDLE NAMESPACE QUOTA CHILDREN',
      'A0 OK Thats all she wrote!'
    ],
    [
      '* CAPABILITY IMAP4rev1 UNSELECT IDLE NAMESPACE QUOTA CHILDREN UIDPLUS MOVE',
      'A1 OK authenticated (Success)'
    ],
    [
      '* NAMESPACE (("" "/")) NIL NIL',
      'A2 OK Success'
    ],
    [
      '* LIST (\\Noselect) "/" "/"',
      'A3 OK Success'
    ],
    [
      '* FLAGS (\\Answered \\Flagged \\Draft \\Deleted \\Seen)',
      '* OK [PERMANENTFLAGS ()] Flags permitted.',
      '* OK [UIDVALIDITY 2] UIDs valid.',
      '* 685 EXISTS',
      '* 0 RECENT',
      '* OK [UIDNEXT 4422] Predicted next UID.',
      'A4 OK [READ-ONLY] INBOX selected. (Success)'
    ],
    {
      command: '* 1 FETCH (UID 1000 FLAGS (\\Seen) INTERNALDATE "05-Sep-2004 00:38:03 +0000" BODY[TEXT] {'
        + bytes.length
        + '}'
        + CRLF
        + bytes.substring(0, 20000),
      end: ''
    },
    [
      '* BYE LOGOUT Requested',
      'A6 OK good day (Success)'
    ]
  ],
  expected: [
    'A0 CAPABILITY',
    'A1 LOGIN "foo" "bar"',
    'A2 NAMESPACE',
    'A3 LIST "" ""',
    'A4 EXAMINE "INBOX"',
    'A5 FETCH 1,2 (UID FLAGS INTERNALDATE BODY.PEEK[TEXT])',
    'A6 LOGOUT'
  ],
  bytes,
};
