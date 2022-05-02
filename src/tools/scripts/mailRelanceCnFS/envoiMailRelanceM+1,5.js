#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { execute } = require('../../utils');
const dayjs = require('dayjs');
const cli = require('commander');

cli.description('Send emails for conseiller without deposit CRA after 1,5 month')
.option('--limit [limit]', 'limit the number of emails sent (default: 1)', parseInt)
.option('--delay [delay]', 'Time in milliseconds to wait before sending the next email (default: 100)', parseInt)
.helpOption('-e', 'HELP command')
.parse(process.argv);

const datePlus1MoisEtDemi = new Date(dayjs(Date.now()).subtract(45, 'day'));
execute(__filename, async ({ db, logger, Sentry, emails }) => {
  const { limit = 25, delay = 2000 } = cli;

  const conseillers = await db.collection('conseillers').find({
    'groupeCRA': { $eq: 4 },
    '$expr': {
      '$and': [
        { '$eq': [{ '$year': [{ '$arrayElemAt': ['$groupeCRAHistorique.dateDeChangement', -1] }] }, datePlus1MoisEtDemi.getFullYear()] },
        { '$eq': [{ '$month': [{ '$arrayElemAt': ['$groupeCRAHistorique.dateDeChangement', -1] }] }, datePlus1MoisEtDemi.getMonth() + 1] },
        { '$eq': [{ '$dayOfMonth': [{ '$arrayElemAt': ['$groupeCRAHistorique.dateDeChangement', -1] }] }, datePlus1MoisEtDemi.getDate()] },
        { '$eq': [{ '$arrayElemAt': ['$groupeCRAHistorique.mailSendConseillerM+1,5', -1] }, undefined] },
        { '$ne': [{ '$arrayElemAt': ['$groupeCRAHistorique.mailSendConseillerM+1', -1] }, undefined] }
      ]
    }
  }).limit(limit).toArray();

  for (const conseiller of conseillers) {
    try {
      const structure = await db.collection('structures').findOne({ _id: conseiller.structureId });
      const messageConseiller = emails.getEmailMessageByTemplateName('mailRelanceM+1,5Conseiller');
      const messageStructure = emails.getEmailMessageByTemplateName('mailRelanceM+1,5Structure');
      await messageConseiller.send(conseiller);
      await messageStructure.send(conseiller, structure.contact.email);
      if (delay) {
        await delay(delay);
      }
    } catch (e) {
      Sentry.captureException(e);
      logger.error(e);
    }
  }

  logger.info(`les mails de relance aux conseillers concernés ont été envoyés`);
});
