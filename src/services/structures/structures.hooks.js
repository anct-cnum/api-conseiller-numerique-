const { authenticate } = require('@feathersjs/authentication').hooks;
const search = require('feathers-mongodb-fuzzy-search');

/* TODO:
- seul les admin doivent pouvoir tout faire
- les structures ne peuvent modifier que les donneés qui les concernent
- les conseillers ne peuvent lire les infos que sur la structure qui le concerne
*/
module.exports = {
  before: {
    all: [authenticate('jwt')],
    find: [search()],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  },

  after: {
    all: [],
    find: [],
    get: [async context => {
      let lastCoselec = {};
      if (context.result.coselec !== undefined && context.result.coselec.length > 0) {
        lastCoselec = context.result.coselec[context.result.coselec.length - 1];
      }
      Object.assign(context.result, lastCoselec);
      return context;
    }],
    create: [],
    update: [],
    patch: [],
    remove: []
  },

  error: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: []
  }
};
