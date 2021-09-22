module.exports = {
  users: db => {
    return Promise.all([
      db.collection('users').createIndex({ 'name': 1 }, { unique: true })
    ]);
  },
  structures: db => {
    return Promise.all([
      db.collection('structures').createIndex({ 'idPG': 1 }),
      db.collection('structures').createIndex({ 'createdAt': -1 }),
      db.collection('structures').createIndex({ 'type': 1 }),
      db.collection('structures').createIndex({ 'statut': 1 }),
      db.collection('structures').createIndex({ 'codeDepartement': 1 }),
      db.collection('structures').createIndex({ 'codePostal': 1 }),
      db.collection('structures').createIndex({ 'codeRegion': 1 }),
      db.collection('structures').createIndex({ 'userCreated': 1 }),
      db.collection('structures').createIndex({ 'prefet.avisPrefet': 1 }),
      db.collection('structures').createIndex({ 'coselec.avisCoselec': 1 }),
      db.collection('structures').createIndex({ 'reseau': 1 }),
      db.collection('structures').createIndex({
        'siret': 'text',
        'nom': 'text',
        'contact.email': 'text',
      }, { name: 'bo-search-fulltext' }),
    ]);
  },
  misesEnRelation: db => {
    return Promise.all([
      db.collection('misesEnRelation').createIndex({ 'statut': 1 }),
      db.collection('misesEnRelation').createIndex({ 'structure.$id': 1 }),
      db.collection('misesEnRelation').createIndex({ 'structure.oid': 1 }),
      db.collection('misesEnRelation').createIndex({ 'conseiller.$id': 1 }),
      db.collection('misesEnRelation').createIndex({ 'structureObj.codePostal': 1 }),
      db.collection('misesEnRelation').createIndex({ 'structureObj.idPG': 1 }),
      db.collection('misesEnRelation').createIndex({ 'conseillerObj.disponible': 1 }),
      db.collection('misesEnRelation').createIndex({ 'conseillerObj.email': 1 }),
      db.collection('misesEnRelation').createIndex({
        'conseillerObj.nom': 'text',
        'conseillerObj.prenom': 'text',
        'conseillerObj.email': 'text',
      }, { name: 'bo-search-fulltext' }),
    ]);
  },
  conseillers: db => {
    return Promise.all([
      db.collection('conseillers').createIndex({ 'idPG': 1 }),
      db.collection('conseillers').createIndex({ 'codeDepartement': 1 }),
      db.collection('conseillers').createIndex({ 'codeRegion': 1 }),
      db.collection('conseillers').createIndex({ 'location': '2dsphere' }),
      db.collection('conseillers').createIndex({
        'nom': 'text',
        'prenom': 'text',
        'email': 'text',
      }, { name: 'bo-search-fulltext' }),
      db.collection('conseillers').createIndex({ 'cv.date': 1 }),
      db.collection('conseillers').createIndex({ 'statut': 1 }),
      db.collection('conseillers').createIndex({ 'userCreated': 1 }),
      db.collection('conseillers').createIndex({ 'userCreationError': 1 }),
      db.collection('conseillers').createIndex({ 'email': 1 }),
      db.collection('conseillers').createIndex({ 'estRecrute': 1 }),
      db.collection('conseillers').createIndex({ 'dateFinFormation': 1 }),
      db.collection('conseillers').createIndex({ 'structureId': 1 })
    ]);
  },
  cras: db => {
    return Promise.all([
      db.collection('cras').createIndex({ 'conseiller.$id': 1 }),
      db.collection('cras').createIndex({ 'createdAt': 1 }),
      db.collection('cras').createIndex({ 'cra.duree': 1 }),
      db.collection('cras').createIndex({ 'cra.codePostal': 1 }),
    ]);
  },
  stats_conseillers_cras: db => {
    return Promise.all([
      db.collection('stats_conseillers_cras').createIndex({ 'conseiller.$id': 1 }),
    ]);
  },
  stats_daily_cras: db => {
    return Promise.all([
      db.collection('stats_daily_cras').createIndex({ 'date': 1 }),
    ]);
  },
  stats_PostesValidesDepartement: db => {
    return Promise.all([
      db.collection('stats_PostesValidesDepartement').createIndex({ 'date': 1 }, { unique: true }),
      db.collection('stats_PostesValidesDepartement').createIndex({ 'data.numeroDepartement': 1 })
    ]);
  },
  stats_ConseillersRecrutesDepartement: db => {
    return Promise.all([
      db.collection('stats_ConseillersRecrutesDepartement').createIndex({ 'date': 1 }, { unique: true }),
      db.collection('stats_ConseillersRecrutesDepartement').createIndex({ 'data.numeroDepartement': 1 })
    ]);
  },
  stats_ConseillersFinalisesDepartement: db => {
    return Promise.all([
      db.collection('stats_ConseillersFinalisesDepartement').createIndex({ 'date': 1 }, { unique: true }),
      db.collection('stats_ConseillersFinalisesDepartement').createIndex({ 'data.numeroDepartement': 1 })
    ]);
  },
  stats_ConseillersEnPosteDepartement: db => {
    return Promise.all([
      db.collection('stats_ConseillersEnPosteDepartement').createIndex({ 'date': 1 }, { unique: true }),
      db.collection('stats_ConseillersEnPosteDepartement').createIndex({ 'data.numeroDepartement': 1 })
    ]);
  },
  stats_Candidats: db => {
    return Promise.all([
      db.collection('stats_Candidats').createIndex({ 'date': 1 }, { unique: true }),
      db.collection('stats_Candidats').createIndex({ 'data.numeroDepartement': 1 })
    ]);
  },
  stats_StructuresCandidates: db => {
    return Promise.all([
      db.collection('stats_StructuresCandidates').createIndex({ 'date': 1 }, { unique: true }),
      db.collection('stats_StructuresCandidates').createIndex({ 'data.numeroDepartement': 1 })
    ]);
  },
  stats_StructuresValidees: db => {
    return Promise.all([
      db.collection('stats_StructuresValidees').createIndex({ 'idStructure': 1 }, { unique: true }),
      db.collection('stats_StructuresValidees').createIndex({ 'estGrandReseau': 1 }),
      db.collection('stats_StructuresValidees').createIndex({ 'codeDepartement': 1 })
    ]);
  },
  stats_Territoires: db => {
    return Promise.all([
      db.collection('stats_Territoires').createIndex({ 'date': 1 }),
    ]);
  }
};
