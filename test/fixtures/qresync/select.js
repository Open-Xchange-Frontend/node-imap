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
      '* OK [CLOSED]',
      '* 100 EXISTS',
      '* 11 RECENT',
      '* OK [UIDVALIDITY 67890007] UIDVALIDITY',
      '* OK [UIDNEXT 600] Predicted next UID',
      '* OK [HIGHESTMODSEQ 90060115205545359] Highest mailbox mod-sequence',
      '* OK [UNSEEN 7] There are some unseen messages in the mailbox',
      '* FLAGS (\\Answered \\Flagged \\Draft \\Deleted \\Seen)',
      '* OK [PERMANENTFLAGS (\\Answered \\Flagged \\Draft \\Deleted \\Seen \\*)] Permanent flags',
      '* VANISHED (EARLIER) 41,43:116,118,120:211,214:540',
      '* 49 FETCH (UID 117 FLAGS (\\Seen \\Answered) MODSEQ (90060115194045001))',
      '* 50 FETCH (UID 119 FLAGS (\\Draft $MDNSent) MODSEQ (90060115194045308))',
      '* 51 FETCH (UID 541 FLAGS (\\Seen $Forwarded) MODSEQ (90060115194045001))',
      'A5 OK [READ-WRITE] mailbox selected'
    ],
    [
      '* BYE LOGOUT Requested',
      'A6 OK good day (Success)'
    ]
  ],
  expected: [
    'A0 CAPABILITY',
    'A1 LOGIN "foo" "bar"',
    'A2 ENABLE QRESYNC',
    'A3 NAMESPACE',
    'A4 LIST "" ""',
    'A5 SELECT "INBOX" (QRESYNC (67890007 90060115194045000 41:211,214:541))',
    'A6 LOGOUT'
  ]
}
