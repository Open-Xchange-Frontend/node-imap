module.exports = {
  responses: [
    [
      '* CAPABILITY IMAP4rev1 UNSELECT IDLE NAMESPACE QUOTA CHILDREN',
      'A0 OK Thats all she wrote!'
    ],
    [
      '* CAPABILITY IMAP4rev1 UNSELECT IDLE NAMESPACE QUOTA CHILDREN',
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
    [
      'A5 OK COPY completed'
    ],
    [
      '* SEARCH 4 5',
      'A6 OK SEARCH completed'
    ],
    [
      'A7 OK STORE completed'
    ],
    [
      'A8 OK STORE completed'
    ],
    [
      '* 1 EXPUNGE',
      'A9 OK EXPUNGE completed'
    ],
    [
      'A10 OK STORE completed'
    ],
    [
      '* BYE LOGOUT Requested',
      'A11 OK good day (Success)'
    ]
  ],
  expected: [
    'A0 CAPABILITY',
    'A1 LOGIN "foo" "bar"',
    'A2 NAMESPACE',
    'A3 LIST "" ""',
    'A4 EXAMINE "INBOX"',
    'A5 UID COPY 1:3 "Other"',
    'A6 UID SEARCH DELETED',
    'A7 UID STORE 4,5 -FLAGS.SILENT (\\Deleted)',
    'A8 UID STORE 1:3 +FLAGS.SILENT (\\Deleted)',
    'A9 EXPUNGE',
    'A10 UID STORE 4,5 +FLAGS.SILENT (\\Deleted)',
    'A11 LOGOUT'
  ]
}
