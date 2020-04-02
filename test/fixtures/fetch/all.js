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
    [...Array(100)].map((v, i) => `* ${i + 1} FETCH (UID ${i + 1} FLAGS (\\Seen) INTERNALDATE "01-Apr-2020 15:52:41 +0000")`).concat([
      'A5 OK Success'
    ]),
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
    'A5 FETCH 1:100 (UID FLAGS INTERNALDATE)',
    'A6 LOGOUT'
  ]
}
