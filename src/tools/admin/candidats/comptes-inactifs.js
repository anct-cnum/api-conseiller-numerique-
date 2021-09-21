#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { execute } = require('../utils');

execute(__filename, async ({ db, logger, exit }) => {
  logger.info('Passe en inactif les candidats qui n\'ont pas choisi leur mot de passe...');
  let count = 0;
  let promises = [];
  await db.collection('users').find({
    'roles': { $elemMatch: { '$eq': 'candidat' } },
    'passwordCreated': false
  }).forEach(async user => {
    promises.push(new Promise(async resolve => {
      const conseiller = await db.collection('conseillers').findOne({ _id: user.entity.oid });
      await db.collection('conseillers').updateMany({ email: conseiller.email }, { $set: { disponible: false } });
      await db.collection('misesEnRelation').deleteMany({ 'conseillerObj.email': conseiller.email });
      count++;
      resolve();
    }));
  });
  await Promise.all(promises);
  logger.info(`${count} candidats désactivés`);
  exit();
});
