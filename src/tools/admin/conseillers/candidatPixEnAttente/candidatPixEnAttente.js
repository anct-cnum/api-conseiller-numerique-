#!/usr/bin/env node
'use strict';

const cli = require('commander');
const _ = require('lodash');
const sendCandidatPixEnAttenteEmail = require('./tasks/sendCandidatPixEnAttenteEmail');
const { capitalizeFirstLetter, execute } = require('../../utils');

cli.description('Send point recrutment to candidate emails')
.option('--type [type]', 'resend,send (default: send))', capitalizeFirstLetter)
.option('--delay [delay]', 'Time in milliseconds to wait before sending the next email (default: 100)', parseInt)
.option('--limit [limit]', 'limit the number of emails sent (default: 1)', parseInt)
.parse(process.argv);

execute(__filename, async ({ logger, db, app, emails, Sentry }) => {

  let { type = 'send', delay = 100, limit = 1000 } = cli;

  logger.info('Envoi de l\'email de relance du partage des résultats PIX des candidats...');

  let ActionClass = require(`./tasks/actions/${_.capitalize(type)}Action`);
  let action = new ActionClass(app);

  try {
    let stats = await sendCandidatPixEnAttenteEmail(db, logger, emails, action, {
      limit,
      delay,
    }, Sentry);

    if (stats.total > 0) {
      logger.info(`[CONSEILLERS] Des emails sur le partage des résultats PIX ont été envoyés à des candidats : ` +
      `${stats.sent} envoyés / ${stats.error} erreurs`);
    }

    return stats;
  } catch (err) {
    logger.info(`[CONSEILLERS] Une erreur est survenue lors de l'envoi des emails sur le partage des résultats PIX aux candidats : ` +
    `${err}`);
    Sentry.captureException(err);
    throw err;
  }
}, { slack: cli.slack });
