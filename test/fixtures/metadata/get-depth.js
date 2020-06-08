module.exports = {
  responses: [
    [
      '* CAPABILITY IMAP4rev1 UNSELECT IDLE NAMESPACE QUOTA CHILDREN METADATA',
      'A0 OK Thats all she wrote!'
    ],
    [
      '* CAPABILITY IMAP4rev1 UNSELECT IDLE NAMESPACE QUOTA CHILDREN METADATA UIDPLUS MOVE',
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
      '* METADATA "INBOX" (/private/filters/values/small "SMALLER 5000" /private/filters/values/boss "FROM "boss@example.com"")',
      'A4 OK GETMETADATA complete'
    ],
    [
      '* BYE LOGOUT Requested',
      'A5 OK good day (Success)'
    ]
  ],
  expected: [
    'A0 CAPABILITY',
    'A1 LOGIN "foo" "bar"',
    'A2 NAMESPACE',
    'A3 LIST "" ""',
    'A4 GETMETADATA (DEPTH 1) "INBOX" (/private/filters/values)',
    'A5 LOGOUT'
  ]
}
