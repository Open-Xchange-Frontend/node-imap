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
      '* 1 FETCH (UID 1 FLAGS (\\Seen) INTERNALDATE "01-Apr-2020 15:52:41 +0000" ENVELOPE ("Wed, 1 Apr 2020 17:52:41 +0200 (CEST)" "Test" (("Test User" NIL "user" "localhost")) (("Test User" NIL "user" "localhost")) (("Test User" NIL "user" "localhost")) (("Test User" NIL "user" "localhost")) NIL NIL NIL "<608275564.8.1585756361537@localhost>") BODYSTRUCTURE ("text" "plain" ("charset" "UTF-8") NIL NIL "7bit" 15 2 NIL NIL NIL NIL) BODY[TEXT] {15}',
      'Hello',
      'World!',
      ' BODY[HEADER.FIELDS (FROM TO SUBJECT DATE)] {130}',
      'Date: Wed, 1 Apr 2020 17:52:41 +0200 (CEST)',
      'From: Test User <user@localhost>',
      'To: Test User <user@localhost>',
      'Subject: Test',
      '',
      ')',
      'A5 OK Success'
    ],
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
    'A5 FETCH 1 (UID FLAGS INTERNALDATE ENVELOPE BODYSTRUCTURE BODY.PEEK[TEXT] BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)])',
    'A6 LOGOUT'
  ]
}
