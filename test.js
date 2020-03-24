const t = new Promise((resolve) => {
  console.log('resolve');
  resolve();
});

t.then(() => console.log('After resolved'));
process.nextTick(() => console.log('after next tick'));
setTimeout(() => console.log('after timeout'), 0);
console.log('last line');
