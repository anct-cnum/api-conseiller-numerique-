#!/usr/bin/env node
'use strict';

const { execute } = require('../../utils');
const csv = require('csv-parser');
const fs = require('fs');
const { ObjectId } = require('mongodb');
const { program } = require('commander');

const updateCra = db => async (newIdPermanence, oldIdPermanence, conseillers) => {
  const tab = [];
  conseillers.split(',').forEach(conseiller => {
    tab.push(new ObjectId(conseiller));
  });
  await db.collection('cra_test').updateMany(
    { 'permanence.$id': new ObjectId(newIdPermanence), 'conseiller.$id': { '$in': tab } },
    { '$set': { 'permanence.$id': oldIdPermanence } }
  );
};

program.option('-l, --lot <lot>', 'lot du fichier');
program.helpOption('-e', 'HELP command');
program.parse(process.argv);

execute(__filename, async ({ logger, db, exit }) => {
  logger.info('Etape 3 :');
  logger.info('Application des corrections de cras à partir du csv');

  const { lot = 1 } = program;
  const limit = 100;
  const debutlimit = limit * (lot - 1);
  const finlimit = limit * lot;
  const permanences = [];
  const promises = [];

  if (!lot || lot < 1 && lot > 6) {
    exit('Lot de déploiement entre 1 et 6');
    return;
  }

  fs.createReadStream('data/exports/permanences-structure-correction.csv')
  .pipe(csv({ separator: ';' }))
  .on('data', data => permanences.push(data))
  .on('end', () => {

    for (let i = debutlimit; i < finlimit; i++) {
      if (permanences[i].conseillers.length > 0) {
        promises.push(new Promise(async resolve => {
          await updateCra(db)(permanences[i].newIdPermanence, permanences[i].idPermanence, permanences[i].conseillers);
          console.log(
            'Les cras du/des conseiller(s) ' + String(permanences[i].conseillers) +
            ' mis sur la permanence ' + permanences[i].idPermanence +
            'ont été réaffectés à la permanence ' + permanences[i].newIdPermanence
          );
          resolve();
        }));
      }
    }
  /*
    permanences.forEach(permanence, i => {
      if (permanence.conseillers.length > 0) {
        promises.push(new Promise(async resolve => {
          await updateCra(db)(permanence.newIdPermanence, permanence.idPermanence, permanence.conseillers);
          console.log(
            'Les cras du/des conseiller(s) ' + String(permanence.conseillers) +
            ' mis sur la permanence ' + permanence.idPermanence +
            'ont été réaffectés à la permanence' + permanence.newIdPermanence
          );
          resolve();
        }));
      }
    });*/
  });

  await Promise.all(promises).then(() => {
    logger.info('Application des corrections de cras à partir du csv réalisé avec succès');
  });
});
