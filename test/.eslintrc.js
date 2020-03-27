module.exports = {
  env: {
    node: true,
    es6: true,
    mocha: true,
  },
  globals: {
    expect: true,
  },
  extends: [
    '../.eslintrc.js',
    'plugin:mocha/recommended',
  ],
}
