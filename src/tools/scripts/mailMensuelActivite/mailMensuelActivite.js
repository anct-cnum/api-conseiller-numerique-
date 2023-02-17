#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { execute } = require('../../utils');
const dayjs = require('dayjs');
const cli = require('commander');
let { delay } = require('../../utils');
const { getStatsDurees } = require('../../../../src/services/stats/cras/durees');

cli.description('Envoi du mail mensuel d\'activité sur les CRAs')
.option('--limit [limit]', 'limit the number of emails sent (default: 1)', parseInt)
.option('--delai [delai]', 'Time in milliseconds to wait before sending the next email (default: 1000)', parseInt)
.helpOption('-e', 'HELP command')
.parse(process.argv);

const listeMois = ['de janvier', 'de février', 'de mars', 'd\'avril', 'de mai', 'de juin',
  'de juillet', 'd\'août', 'de septembre', 'd\'octobre', 'de novembre', 'de décembre'];
const mois = new Date(dayjs(Date.now()).subtract(1, 'month'));
const debutMois = new Date(dayjs(mois).startOf('month'));
const finMois = new Date(dayjs(mois).endOf('month'));

const moisDernier = new Date(dayjs(Date.now()).subtract(2, 'month'));
const debutMoisDernier = new Date(dayjs(moisDernier).startOf('month'));
const finMoisDernier = new Date(dayjs(moisDernier).endOf('month'));

const getQuery = (conseillerId, debut, fin) => {
  return {
    'conseiller.$id': conseillerId,
    'cra.dateAccompagnement': {
      '$gte': debut, '$lte': fin }
  };
};

const getConseillers = db => async limit => await db.collection('conseillers').find({
  'emailCN.address': { $exists: true },
  'estCoordinateur': { $ne: true },
  'statut': 'RECRUTE',
  'mailActiviteCRAMois': { $ne: listeMois[new Date(mois).getMonth()] }
}).limit(limit).toArray();

const getCountCras = db => async query => await db.collection('cras').countDocuments(query);

const getNbUsagers = db => async query => await db.collection('cras').aggregate(
  {
    $match:
    { ...query }
  },
  { $group:
    { _id: null, count: { $sum: '$cra.nbParticipants' } }
  },
  { $project: { 'valeur': '$count' } }
).toArray();

const getMoins1Heure = async arrayHeures => {
  let totalMinutes = 0;
  arrayHeures.forEach(heures => {
    if (heures.nom === '0-30') {
      totalMinutes += 30 * heures.valeur;
    } else if (heures.nom === '30-60') {
      totalMinutes += 60 * heures.valeur;
    }
  });
  return Math.round(totalMinutes / 60);
};
const getPlus1Heure = async arrayHeures => {
  let totalMinutes = 0;
  arrayHeures.forEach(heures => {
    totalMinutes += heures._id * heures.count;
  });
  return Math.round(totalMinutes / 60);
};

const get1hEtPlus = db => async query => await db.collection('cras').aggregate(
  { $unwind: '$cra.duree' },
  { $match: { ...query,
    'cra.duree': { $gte: 60 } } },
  { $group: { _id: '$cra.duree', count: { $sum: 1 } } },
  { $project: { '_id': 0, 'nom': '$_id', 'valeur': '$count' } }
).toArray();

const pourcentage = async (nbMoisDernier, nbMois) => {
  const diff = nbMois - nbMoisDernier;
  const pourcentage = nbMoisDernier > 0 ? Math.round(diff / nbMoisDernier * 100) : 100;
  return pourcentage >= 0 ? '+' + pourcentage : pourcentage;
};

execute(__filename, async ({ db, logger, emails, Sentry }) => {

  const { limit = 1, delai = 1000 } = cli;

  logger.info(`Début de l'envoi des emails mensuels sur l'activité des conseillers:`);
  const conseillers = await getConseillers(db)(limit);
  let nbEnvoisMails = 0;
  let mailAvecCras = 0;
  let mailSansCra = 0;
  for (const conseiller of conseillers) {

    const query = getQuery(conseiller._id, debutMois, finMois);
    const queryMoisDernier = getQuery(conseiller._id, debutMoisDernier, finMoisDernier);

    try {
      const cras = {};
      cras.mois = listeMois[new Date(mois).getMonth()];
      const countCrasMois = await getCountCras(db)(query);
      const countCrasMoisPasse = await getCountCras(db)(queryMoisDernier);
      cras.nbAccompagnements = countCrasMois;
      cras.pourcentageAccompagnements = await pourcentage(countCrasMoisPasse, countCrasMois);

      if (countCrasMois > 0) {

        const nbUsagers = await getNbUsagers(db)(query);
        const nbUsagersPasse = await getNbUsagers(db)(queryMoisDernier);
        cras.nbUsagers = nbUsagers[0]?.count;
        cras.pourcentageUsagers = await pourcentage(nbUsagersPasse[0]?.count ?? 0, nbUsagers[0]?.count ?? 0);

        let totalHeuresMois = 0;
        const nbHeures = await getStatsDurees(db, query);
        const nb1HeuresEtPlus = await get1hEtPlus(db)(query);

        let totalHeuresMoisPasse = 0;
        const nbHeuresPasse = await getStatsDurees(db, queryMoisDernier);
        const nb1HeuresEtPlusPasse = await get1hEtPlus(db)(queryMoisDernier);

        totalHeuresMois = await getPlus1Heure(nb1HeuresEtPlus) + await getMoins1Heure(nbHeures);
        totalHeuresMoisPasse = await getPlus1Heure(nb1HeuresEtPlusPasse) + await getMoins1Heure(nbHeuresPasse);

        cras.nbHeures = totalHeuresMois;
        cras.pourcentageHeures = await pourcentage(totalHeuresMoisPasse, totalHeuresMois);
        mailAvecCras++;

        //En attente de contenue de la BDT pour le mail 0 cra
        const messageMensuelActivite = emails.getEmailMessageByTemplateName('mailMensuelActivite');
        messageMensuelActivite.send(conseiller, cras);
        nbEnvoisMails++;
      } else {
        cras.nbUsagers = 0;
        cras.nbHeures = 0;
        //mailSansCra++;
      }

      //En attente de contenu de la BDT pour le mail 0 cra
      /*const messageMensuelActivite = emails.getEmailMessageByTemplateName('mailMensuelActivite');
      messageMensuelActivite.send(conseiller, cras);
      nbEnvoisMails++;
      */
      if (delai) {
        await delay(delai);
      }

    } catch (e) {
      Sentry.captureException(e);
      logger.error(e);
    }
  }

  logger.info(`Fin de l'envoi de mail (${nbEnvoisMails} envois) aux conseillers:`);
  logger.info(`+ ${mailAvecCras} mails pour des conseillers actifs`);
  logger.info(`+ ${mailSansCra} mails pour des conseillers inactifs`);
});
