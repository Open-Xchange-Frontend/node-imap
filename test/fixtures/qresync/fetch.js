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
      '* VANISHED (EARLIER) 300:310,405,411',
      '* 1 FETCH (UID 404 MODSEQ (65402) FLAGS (\\Seen) INTERNALDATE "05-Sep-2004 00:38:03 +0000" UID 1000)',
      '* 2 FETCH (UID 406 MODSEQ (75403) FLAGS (\\Deleted) INTERNALDATE "05-Sep-2004 00:38:03 +0000" UID 1000)',
      '* 4 FETCH (UID 408 MODSEQ (29738) FLAGS ($NoJunk $AutoJunk $MDNSent) INTERNALDATE "05-Sep-2004 00:38:03 +0000" UID 1000)',
      'A6 OK FETCH completed'
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
    'A6 UID FETCH 300:500 (UID FLAGS INTERNALDATE) (CHANGEDSINCE 12345 VANISHED)',
    'A7 LOGOUT'
  ]
}
