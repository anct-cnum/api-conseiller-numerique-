#!/usr/bin/env node
'use strict';

const { execute } = require('../utils');
const CSVToJSON = require('csvtojson');
const { program } = require('commander');

program.option('-c, --csv <path>', 'CSV file path');

program.parse(process.argv);

const readCSV = async filePath => {
  try {
    // eslint-disable-next-line new-cap
    const conseillers = await CSVToJSON({ delimiter: 'auto' }).fromFile(filePath);
    return conseillers;
  } catch (err) {
    throw err;
  }
};

execute(__filename, async ({ db, logger, exit }) => {
  logger.info('Mise à jour des conseillers avec le rôle coordinateur');

  let count = 0;

  await new Promise(() => {
    readCSV(program.csv).then(async conseillers => {
      await new Promise(async () => {
        for (const conseiller of conseillers) {
          if (conseiller.estCoordinateur === 'oui') {
            await db.collection('conseillers').updateOne(
              {
                idPG: parseInt(conseiller.idPG),
                estCoordinateur: { $exists: false }
              },
              {
                $set: { estCoordinateur: true }
              });
            count++;
          } else {
            await db.collection('conseillers').updateOne({ idPG: parseInt(conseiller.idPG) }, { $unset: { estCoordinateur: '' } });
          }
        }

        if (count === conseillers.length) {
          logger.info(`${count} conseillers sont devenus coordinateur`);
          exit();
        }
      });
    }).catch(error => {
      logger.error(error);
      exit();
    });
  });

  exit();
});
