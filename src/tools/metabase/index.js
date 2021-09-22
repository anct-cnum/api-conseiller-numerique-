#!/usr/bin/env node
'use strict';

const cli = require('commander');
const { execute } = require('../utils');
const moment = require('moment');
const utilsStructure = require('../../utils/index.js');

cli.description('Data pour metabase').parse(process.argv);

execute(__filename, async ({ logger, db, Sentry }) => {
  logger.info('Récupération des différentes données nécessaires au metabase public...');

  const key = moment(new Date()).format('DD/MM/YYYY');
  const date = new Date().setUTCHours(0, 0, 0, 0);
  const departements = require('../../../data/imports/departements-region.json');
  const tomsJSON = require('../coselec/tom.json');
  const toms = new Map();
  for (const value of tomsJSON) {
    toms.set(String(value.num_tom), value);
  }

  const determineTom = (codePostal, codeCommune) => {
    // Cas Saint Martin (978)
    if (codePostal === '97150') {
      return codeCommune.substring(0, 3);
    }
  };

  const addTomStMartin = (data, results, nomColonne) => {
    results.push({
      'numeroDepartement': '978',
      'departement': toms.get('971').tom_name,
      [nomColonne]: data ?? 0
    });
  };

  let lignes = [];

  /* Nombre de postes validés par département */
  const structures = await db.collection('structures').find({ 'statut': 'VALIDATION_COSELEC' }).sort({ codeDepartement: 1 }).toArray();
  let posteParDepartement = [];
  structures.forEach(structure => {
    let coselecPositif = utilsStructure.getCoselec(structure);
    if (coselecPositif) {
      // eslint-disable-next-line max-len
      const departement = String(structure.codeDepartement) !== '00' ? String(structure.codeDepartement) : determineTom(structure.codePostal, structure.codeCommune);
      if (posteParDepartement[departement]) {
        posteParDepartement[departement] += coselecPositif.nombreConseillersCoselec;
      } else {
        posteParDepartement[departement] = coselecPositif.nombreConseillersCoselec;
      }
    }
  });
  departements.forEach(departement => {
    if (posteParDepartement[departement.num_dep]) {
      lignes.push({
        'numeroDepartement': String(departement.num_dep),
        'departement': departement.dep_name,
        'nombrePostesValides': posteParDepartement[departement.num_dep]
      });
    }
  });
  addTomStMartin(posteParDepartement['978'], lignes, 'nombrePostesValides');
  const postesValidesDepartement = ({ 'key': key, 'date': new Date(date), 'data': lignes });

  /* Nombre de conseillers recrutés par département */
  const queryNombreConseillersRecrutesDepartement = [
    { '$match': { 'statut': { $eq: 'recrutee' } } },
    { $group: { _id: '$structureObj.codeDepartement', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ];
  const listConseillersRecrutesDepartement = await db.collection('misesEnRelation').aggregate(queryNombreConseillersRecrutesDepartement).toArray();
  lignes = [];
  if (listConseillersRecrutesDepartement.length > 0) {
    listConseillersRecrutesDepartement.forEach(conseiller => {
      departements.forEach(departement => {
        if (String(departement.num_dep) === String(conseiller._id)) {
          lignes.push({
            'numeroDepartement': conseiller._id,
            'departement': departement.dep_name,
            'nombreConseillers': conseiller.count
          });
        }
      });
    });
  }
  //Cas Tom Saint Martin
  const listConseillersRecrutesStMartin = await db.collection('misesEnRelation').countDocuments({
    'statut': { $eq: 'recrutee' },
    'structureObj.codePostal': '97150'
  });
  addTomStMartin(listConseillersRecrutesStMartin, lignes, 'nombreConseillers');
  const conseillersRecrutesDepartement = ({ 'key': key, 'date': new Date(date), 'data': lignes });

  /* Nombre de conseillers finalisés par département */
  const queryNombreConseillersFinalisesDepartement = [
    { '$match': { 'statut': { $eq: 'finalisee' } } },
    { $group: { _id: '$structureObj.codeDepartement', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ];
  const listConseillersFinalisesDepartement = await db.collection('misesEnRelation').aggregate(queryNombreConseillersFinalisesDepartement).toArray();
  lignes = [];
  if (listConseillersFinalisesDepartement.length > 0) {
    listConseillersFinalisesDepartement.forEach(conseiller => {
      departements.forEach(departement => {
        if (String(departement.num_dep) === String(conseiller._id)) {
          lignes.push({
            'numeroDepartement': conseiller._id,
            'departement': departement.dep_name,
            'nombreConseillers': conseiller.count
          });
        }
      });
    });
  }
  //Cas Tom Saint Martin
  const listConseillersFinalisesStMartin = await db.collection('misesEnRelation').countDocuments({
    'statut': { $eq: 'finalisee' },
    'structureObj.codePostal': '97150'
  });
  addTomStMartin(listConseillersFinalisesStMartin, lignes, 'nombreConseillers');
  const conseillersFinalisesDepartement = ({ 'key': key, 'date': new Date(date), 'data': lignes });

  //Nombre de conseillers en poste par département
  const conseillersEnPoste = await db.collection('conseillers').find({
    statut: { $eq: 'RECRUTE' },
    structureId: { $ne: null },
    dateFinFormation: { $lt: new Date() }
  }).toArray();
  let promisesConseillers = [];
  lignes = [];
  conseillersEnPoste?.forEach(conseiller => {
    promisesConseillers.push(new Promise(async resolve => {
      try {
        const { codeDepartement, codeCom } = await db.collection('structures').findOne({ _id: conseiller.structureId });
        if (lignes.findIndex(dep => dep.numeroDepartement === codeCom) !== -1) {
          ++lignes[lignes.findIndex(dep => dep.numeroDepartement === codeCom)].nombreConseillersEnPoste;
        } else if (lignes.findIndex(dep => dep.numeroDepartement === codeDepartement) !== -1) {
          ++lignes[lignes.findIndex(dep => dep.numeroDepartement === codeDepartement)].nombreConseillersEnPoste;
        } else if (codeCom === '978') {
          addTomStMartin(1, lignes, 'nombreConseillersEnPoste');
        } else {
          lignes.push({
            'numeroDepartement': codeDepartement,
            'departement': departements.find(dep => String(dep.num_dep) === String(codeDepartement))?.dep_name,
            'nombreConseillersEnPoste': 1
          });
        }
      } catch (error) {
        Sentry.captureException(error);
        logger.error(error.message);
      }
      resolve();
    }));
  });
  await Promise.all(promisesConseillers);
  const conseillersEnPosteDepartement = ({ 'key': key, 'date': new Date(date), 'data': lignes });

  /* Nombre de mises en relation de candidats par département */
  const queryNombreCandidats = [
    { '$match': { 'conseillerObj.disponible': true, 'statut': { $nin: ['finalisee_non_disponible', 'recrutee', 'finalisee'] } } },
    { $group: { _id: '$structureObj.codeDepartement', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ];
  const listCandidats = await db.collection('misesEnRelation').aggregate(queryNombreCandidats).toArray();
  lignes = [];
  if (listCandidats.length > 0) {
    listCandidats.forEach(candidat => {
      departements.forEach(departement => {
        if (String(departement.num_dep) === String(candidat._id)) {
          lignes.push({
            'numeroDepartement': candidat._id,
            'departement': departement.dep_name,
            'nombreCandidats': candidat.count
          });
        }
      });
    });
  }
  //Cas Tom Saint Martin
  const listCandidatsStMartin = await db.collection('misesEnRelation').countDocuments({
    'conseillerObj.disponible': true,
    'statut': { $nin: ['finalisee_non_disponible', 'recrutee', 'finalisee'] },
    'structureObj.codePostal': '97150'
  });
  addTomStMartin(listCandidatsStMartin, lignes, 'nombreCandidats');
  const candidats = ({ 'key': key, 'date': new Date(date), 'data': lignes });


  /* Nombre de structures candidates par département */
  const queryNombreStructures = [
    { $match: { statut: 'CREEE' } },
    { $group: { _id: '$codeDepartement', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ];
  const nombreStructures = await db.collection('structures').aggregate(queryNombreStructures).toArray();
  lignes = [];
  if (nombreStructures.length > 0) {
    nombreStructures.forEach(structure => {
      departements.forEach(departement => {
        if (String(departement.num_dep) === String(structure._id)) {
          lignes.push({
            'numeroDepartement': structure._id,
            'departement': departement.dep_name,
            'nombre': structure.count
          });
        }
      });
    });
  }
  //Cas Tom Saint Martin
  const nombreStructuresStMartin = await db.collection('structures').countDocuments({ statut: 'CREEE', codePostal: '97150' });
  addTomStMartin(nombreStructuresStMartin, lignes, 'nombre');
  const structuresCandidates = ({ 'key': key, 'date': new Date(date), 'data': lignes });

  /* Liste des structures validées Coselec avec détails financement, nb de postes validés... */
  let promises = [];
  const structuresValideesCoselec = await db.collection('structures').find({ statut: 'VALIDATION_COSELEC', userCreated: true }).toArray();
  //Vidage de la liste avant recréation (abandons...)
  await db.collection('stats_StructuresValidees').deleteMany({});
  structuresValideesCoselec.forEach(structure => {
    promises.push(new Promise(async resolve => {
      try {
        // Cherche le bon Coselec
        const coselec = utilsStructure.getCoselec(structure);

        // France Services
        let label = 'non renseigné';
        if (structure?.estLabelliseFranceServices === 'OUI') {
          label = 'oui';
        } else if (structure?.estLabelliseFranceServices === 'NON') {
          label = 'non';
        }

        // Adresse
        let adresse = (structure?.insee?.etablissement?.adresse?.numero_voie ?? '') + ' ' +
          (structure?.insee?.etablissement?.adresse?.type_voie ?? '') + ' ' +
          (structure?.insee?.etablissement?.adresse?.nom_voie ?? '') + ' ' +
          (structure?.insee?.etablissement?.adresse?.complement_adresse ? structure.insee.etablissement.adresse.complement_adresse + ' ' : '') +
          (structure?.insee?.etablissement?.adresse?.code_postal ?? '') + ' ' +
          (structure?.insee?.etablissement?.adresse?.localite ?? '');

        //Coût par cnfs (formation + tenue/equipement + certification)
        const coutCnfs = 4805 + 297.228 + 326.6;
        let investissement = 0;
        if (structure.type === 'PRIVATE') {
          investissement = (32000 + coutCnfs) * coselec?.nombreConseillersCoselec;
        } else if (structure.codeDepartement === '971' || structure.codeDepartement === '972' || structure.codeDepartement === '973') {
          investissement = (70000 + coutCnfs) * coselec?.nombreConseillersCoselec;
        } else if (structure.codeDepartement === '974' || structure.codeDepartement === '976') {
          investissement = (67500 + coutCnfs) * coselec?.nombreConseillersCoselec;
        } else {
          investissement = (50000 + coutCnfs) * coselec?.nombreConseillersCoselec;
        }

        // Nom département
        let structureDepartement = '';
        let structureRegion = '';
        const deps = new Map();
        for (const value of departements) {
          deps.set(String(value.num_dep), value);
        }
        if (deps.has(structure.codeDepartement)) {
          structureDepartement = deps.get(structure.codeDepartement).dep_name;
          structureRegion = deps.get(structure.codeDepartement).region_name;
        } else if (structure.codePostal === '97150') {
          //Cas Saint Martin
          structureDepartement = toms.get(structure.codePostal.substring(0, 3)).tom_name;
          structureRegion = toms.get(structure.codePostal.substring(0, 3)).tom_name;
        }

        // Nombre de conseillers 'recrutee' et 'finalisee'
        let nbConseillers = await db.collection('misesEnRelation').aggregate([
          { $match: { 'structure.$id': structure._id, 'statut': { $in: ['recrutee', 'finalisee'] } } },
          { $group: { _id: '$statut', count: { $sum: 1 } } },
        ]).toArray();

        //Enregistrement de la structure dans une collection metabase en upsert
        const queryUpd = {
          idStructure: structure._id
        };
        const update = { $set: ({
          nomStructure: structure.insee?.entreprise?.raison_sociale ?? structure.nom,
          communeInsee: structure.insee?.etablissement?.commune_implantation?.value ?? '',
          codeCommuneInsee: structure.insee?.etablissement?.adresse?.code_insee_localite ?? '',
          codeDepartement: structure.codeDepartement !== '00' ? structure.codeDepartement : determineTom(structure.codePostal, structure.codeCommune),
          departement: structureDepartement,
          region: structureRegion,
          nombreConseillersValidesCoselec: coselec?.nombreConseillersCoselec,
          numeroCoselec: coselec?.numero,
          type: structure.type === 'PRIVATE' ? 'privée' : 'publique',
          siret: structure.siret,
          adresse: adresse,
          codePostal: structure.codePostal,
          investissementEstimatifEtat: investissement,
          zrr: structure.estZRR ? 'oui' : 'non',
          qpv: structure.qpvStatut ? structure.qpvStatut.toLowerCase() : 'Non défini',
          LabelFranceServices: label,
          nbConseillersRecrutees: nbConseillers?.find(stat => stat._id === 'recrutee')?.count ?? 0,
          nbConseillersFinalisees: nbConseillers?.find(stat => stat._id === 'finalisee')?.count ?? 0,
          estGrandReseau: structure.reseau ? 'oui' : 'non',
          nomGrandReseau: structure.reseau ?? '',
          categorieJuridique: structure.insee?.entreprise?.forme_juridique ?? ''
        }) };
        const options = { upsert: true };
        await db.collection('stats_StructuresValidees').updateOne(queryUpd, update, options);
      } catch (e) {
        Sentry.captureException(`Une erreur est survenue sur la structure idPG=${structure.idPG} : ${e}`);
        logger.error(`Une erreur est survenue sur la structure idPG=${structure.idPG} : ${e}`);
      }
      resolve();
    }));
  });
  await Promise.all(promises);


  try {
    db.collection('stats_PostesValidesDepartement').insertOne(postesValidesDepartement);
    db.collection('stats_ConseillersRecrutesDepartement').insertOne(conseillersRecrutesDepartement);
    db.collection('stats_ConseillersFinalisesDepartement').insertOne(conseillersFinalisesDepartement);
    db.collection('stats_ConseillersEnPosteDepartement').insertOne(conseillersEnPosteDepartement);
    db.collection('stats_Candidats').insertOne(candidats);
    db.collection('stats_StructuresCandidates').insertOne(structuresCandidates);
  } catch (error) {
    Sentry.captureException(error);
    logger.error(error);
  }

});
