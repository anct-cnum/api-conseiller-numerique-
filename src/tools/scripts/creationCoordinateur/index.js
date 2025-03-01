#!/usr/bin/env node
'use strict';
// node src/tools/scripts/creationCoordinateur/index.js -c FILE

const { execute } = require('../../utils');
const { program } = require('commander');
const CSVToJSON = require('csvtojson');
const axios = require('axios');

const getListCoordinateurs = async db => await db.collection('users').distinct('name', { roles: { '$in': ['coordinateur_coop', 'coordinateur'] } });
const getListCodeCommune = db => async codePostaux => await db.collection('structures').distinct('codeCommune', { codePostal: { '$in': codePostaux } });

const isConum = db => async emailConseiller => await db.collection('users').findOne({
  'name': emailConseiller.replace(/\s/g, ''),
  'roles': { '$in': ['conseiller'] }
});

const anonymeCoordinateur = async db => await db.collection('conseillers').distinct('_id', { nonAffichageCarto: true });

const getIdSubordonneByMail = db => async emailConseiller => {
  const conseiller = await db.collection('conseillers').findOne({
    'emailCN.address': emailConseiller.replace(/\s/g, ''),
    'statut': 'RECRUTE'
  });
  return conseiller?._id ?? null;
};

const addSubordonnes = db => async (idConseiller, list, type) => {
  await db.collection('conseillers').updateOne(
    { '_id': idConseiller },
    { $set: {
      'estCoordinateur': true,
      'listeSubordonnes': {
        'type': type, 'liste': list
      }
    } }
  );
  await db.collection('misesEnRelation').updateMany(
    { 'conseiller.$id': idConseiller },
    { $set: {
      'conseillerObj.estCoordinateur': true,
      'conseillerObj.listeSubordonnes': {
        'type': type, 'liste': list
      }
    } }
  );
};

const updateSubordonnes = db => async (coordinateur, list, type) => {
  const updateConumSubordonnes = db => async (match, queryUpdate) =>
    await db.collection('conseillers').updateMany({ statut: 'RECRUTE', ...match }, queryUpdate);
  // Maj du tag coordinateur dans le cas d'un changement de la liste custom ou autre (exemple coordo d'une region qui change en coordo departement)
  await updateConumSubordonnes(db)({ 'coordinateurs': { $elemMatch: { id: coordinateur.id } } }, { $pull: { 'coordinateurs': { id: coordinateur.id } } });
  switch (type) {
    case 'codeRegion':
      await updateConumSubordonnes(db)({ '_id': { $ne: coordinateur.id }, 'codeRegionStructure': { '$in': list } }, { $push: { 'coordinateurs': coordinateur } });
      break;
    case 'codeDepartement':
      await updateConumSubordonnes(db)({ '_id': { $ne: coordinateur.id }, 'codeDepartementStructure': { '$in': list } }, { $push: { 'coordinateurs': coordinateur } });
      break;
    case 'codeCommune':
      const structureIdList = await db.collection('structures').distinct('_id', { 'codeCommune': { '$in': list } });
      await updateConumSubordonnes(db)({ '_id': { $ne: coordinateur.id }, 'structureId': { '$in': structureIdList } }, { $push: { 'coordinateurs': coordinateur } });
      break;
    default: // conseillers
      await updateConumSubordonnes(db)({ '_id': { '$in': list } }, { $push: { 'coordinateurs': coordinateur } });
      break;
  }
  await updateConumSubordonnes(db)({ 'coordinateurs.0': { $exists: false } }, { $unset: { 'coordinateurs': '' } });
};

// CSV importé
const readCSV = async filePath => {
  try {
    const lines = await CSVToJSON({ delimiter: ';' }).fromFile(filePath);
    return lines;
  } catch (err) {
    throw err;
  }
};

program.option('-c, --csv <path>', 'CSV file path');

program.parse(process.argv);

execute(__filename, async ({ db, logger, exit, Sentry }) => {
  let promises = [];
  const { csv } = program.opts();
  logger.info('Début d\'import du fichier coordo');
  let coordoAnonyme = await anonymeCoordinateur(db);
  coordoAnonyme = coordoAnonyme.map(i => String(i));
  await new Promise(resolve => {
    readCSV(csv).then(async ressources => {

      let ok = 0;
      let error = 0;
      const total = ressources.length;
      const listCoordinateurs = await getListCoordinateurs(db);
      let coordoFichier = [];

      ressources.forEach(ressource => {
        let p = new Promise(async (resolve, reject) => {

          const adresseCoordo = ressource['Adresse CnFS'];
          const listCustom = ressource['Adresse mail CNFS'];
          const mailleRegional = ressource['Code région'];
          const mailleDepartement = ressource['Code département'];
          const mailleCodePostaux = ressource['Code postaux'] ?? ressource['Bassins de vie - codes postaux'];

          const conum = await isConum(db)(adresseCoordo.trim().toLowerCase());

          if (conum?.roles.some(role => role === 'coordinateur_coop' || role === 'coordinateur')) {
            let listMaille = [];
            coordoFichier.push(adresseCoordo);
            const idCoordinateur = conum?.entity?.oid;
            const coordinateur = {
              id: conum?.entity?.oid, nom: conum?.nom, prenom: conum?.prenom,
              nonAffichageCarto: coordoAnonyme.includes(String(idCoordinateur))
            };
            if (mailleCodePostaux?.length > 0) {
              const codePostaux = mailleCodePostaux.split('/')?.map(code => code.trim());
              const conflictCodesCommunes = [];
              for (const codePostal of codePostaux) {
                const urlAPI = `https://geo.api.gouv.fr/communes?codePostal=${codePostal}&format=geojson&geometry=centre`;
                const { data } = await axios.get(urlAPI);
                if (data?.features.length >= 2) {
                  conflictCodesCommunes.push(codePostal);
                }
              }
              if (conflictCodesCommunes.length >= 1) {
                logger.warn(`Liste code Postaux ${conflictCodesCommunes} du coordinateur ${adresseCoordo} a plusieurs codes commune !`);
              }
              listMaille = await getListCodeCommune(db)(codePostaux);
              await addSubordonnes(db)(idCoordinateur, listMaille, 'codeCommune');
              await updateSubordonnes(db)(coordinateur, listMaille, 'codeCommune');
            } else if (mailleRegional?.length > 0) {
              listMaille = mailleRegional.split('/');
              await addSubordonnes(db)(idCoordinateur, listMaille, 'codeRegion');
              await updateSubordonnes(db)(coordinateur, listMaille, 'codeRegion');
            } else if (mailleDepartement.length > 0) {
              listMaille = mailleDepartement.split('/');
              await addSubordonnes(db)(idCoordinateur, listMaille, 'codeDepartement');
              await updateSubordonnes(db)(coordinateur, listMaille, 'codeDepartement');
            } else if (listCustom.length > 0) {
              const emailsSubordonnes = listCustom.split('/');
              const promisesEmails = [];
              const idSubordonnes = [];
              emailsSubordonnes.forEach(email => {
                let p = new Promise(async (resolve, reject) => {
                  const idSubordonne = await getIdSubordonneByMail(db)(email.trim().toLowerCase());
                  if (idSubordonne) {
                    idSubordonnes.push(idSubordonne);
                    resolve();
                  } else {
                    logger.error('Erreur : Le subordonné recruté avec l\'adresse email : ' + email + ' n\'existe pas !');
                    reject();
                  }
                });
                promisesEmails.push(p);
              });
              await Promise.allSettled(promisesEmails);

              //Maj avec la nouvelle liste des subordonnés directement (au cas où rupture entre temps par exemple)
              await addSubordonnes(db)(idCoordinateur, idSubordonnes, 'conseillers');
              await updateSubordonnes(db)(coordinateur, idSubordonnes, 'conseillers');

            } else {
              logger.warn(`Erreur : ${conum?.name} coordonne 0 CN`);
            }
            ok++;
            resolve();
          } else {
            error++;
            logger.error(`Erreur : ${conum?.name} n'a pas le role coordinateur ou est inconnu (file: ${conum?.name ?? adresseCoordo}) `);
            reject();
          }
          if (total === ok + error) {
            logger.warn(`Liste des ${listCoordinateurs.filter(i => !coordoFichier.includes(i))?.length} coordos manquante dans le fichier => ${listCoordinateurs.filter(i => !coordoFichier.includes(i)).map(i => i + '\r\n')}`);
            logger.info(`Fin de la création du rôle coordinateur_ pour les conseillers du fichier d'import : ${ok} traité(s) & ${error} en erreur`);
            exit();
          }
        });
        promises.push(p);
      });
      resolve();
    }).catch(error => {
      logger.error(error);
      Sentry.captureException(error);
    });
  });

  await Promise.allSettled(promises);
  exit();
});
