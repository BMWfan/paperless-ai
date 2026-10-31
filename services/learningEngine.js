'use strict';
const { openLearningStore } = require('./learningStore');
let store;
const inFlight = new Set();
module.exports = {
  inFlight,
  get store() { return store || (store = openLearningStore()); }
};
