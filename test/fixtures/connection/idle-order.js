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
    [
      '* 1 FETCH (UID 1)',
      '* 1 FETCH (INTERNALDATE "05-Sep-2004 00:38:03 +0000" UID 1000)',
      '* 1 FETCH (BODY[TEXT] "IMAP is terrible")',
      '* 1 FETCH (FLAGS (\\Seen))',
      'A5 OK Success'
    ],
    [
      '* STATUS test (MESSAGES 231 RECENT 0 UNSEEN 0 UIDVALIDITY 123 UIDNEXT 442)',
      'A6 OK STATUS completed'
    ],
    [
      '* BYE LOGOUT Requested',
      'A7 OK good day (Success)'
    ]
  ],
  expected: [
    'A0 CAPABILITY',
    'A1 LOGIN "foo" "bar"',
    'A2 NAMESPACE',
    'A3 LIST "" ""',
    'A4 EXAMINE "INBOX"',
    'A5 FETCH 1 (UID FLAGS INTERNALDATE BODY.PEEK[TEXT])',
    'IDLE IDLE',
    'DONE',
    'A6 STATUS "test" (MESSAGES RECENT UNSEEN UIDVALIDITY UIDNEXT)',
    'A7 LOGOUT'
  ]
}