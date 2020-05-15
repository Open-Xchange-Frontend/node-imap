module.exports = {
  responses: [
    [
      '* CAPABILITY IMAP4rev1 UNSELECT IDLE NAMESPACE ENABLE',
      'A0 OK Thats all she wrote!'
    ],
    [
      '* CAPABILITY IMAP4rev1 UNSELECT IDLE NAMESPACE QRESYNC CONDSTORE ENABLE',
      'A1 OK authenticated (Success)'
    ],
    [
      '* ENABLED QRESYNC',
      'A2 OK Enabled (0.001 + 0.000 secs).'
    ],
    [
      '* NAMESPACE (("" "/")) NIL NIL',
      'A3 OK Success'
    ],
    [
      '* LIST (\\Noselect) "/" "/"',
      'A4 OK Success'
    ],
    [
      '* FLAGS (\\Answered \\Flagged \\Draft \\Deleted \\Seen)',
      '* OK [PERMANENTFLAGS ()] Flags permitted.',
      '* OK [UIDVALIDITY 2] UIDs valid.',
      '* 685 EXISTS',
      '* 0 RECENT',
      '* OK [UIDNEXT 4422] Predicted next UID.',
      'A5 OK [READ-ONLY] INBOX selected. (Success)'
    ],
    [
      '* VANISHED 405,407,410,425:510',
      'A6 OK [HIGHESTMODSEQ 20010715194045319] expunged'
    ],
    [
      '* BYE LOGOUT Requested',
      'A7 OK good day (Success)'
    ]
  ],
  expected: [
    'A0 CAPABILITY',
    'A1 LOGIN "foo" "bar"',
    'A2 ENABLE QRESYNC',
    'A3 NAMESPACE',
    'A4 LIST "" ""',
    'A5 EXAMINE "INBOX" (CONDSTORE)',
    'A6 EXPUNGE',
    'A7 LOGOUT'
  ]
}
