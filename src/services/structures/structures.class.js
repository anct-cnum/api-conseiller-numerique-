const { ObjectID, DBRef } = require('mongodb');

const { BadRequest, NotFound, Forbidden, GeneralError, Conflict } = require('@feathersjs/errors');

const { Service } = require('feathers-mongodb');

const Joi = require('joi');
const logger = require('../../logger');
const createEmails = require('../../emails/emails');
const createMailer = require('../../mailer');
const { jwtDecode } = require('jwt-decode');
const utils = require('../../utils/index.js');
const { v4: uuidv4 } = require('uuid');
const { checkAuth } = require('../../common/utils/feathers.utils');
const { getRaisonSocialeBySiretEntrepriseApiV3 } = require('../../utils/entreprise.api.gouv');

exports.Structures = class Structures extends Service {
  constructor(options, app) {
    super(options);

    let db;

    app.get('mongoClient').then(mongoDB => {
      db = mongoDB;
      this.Model = db.collection('structures');
    });

    app.post('/structures/:id/preSelectionner/:conseillerId', checkAuth, async (req, res) => {
      //verify user role structure
      let userId = jwtDecode(req.feathers.authentication?.accessToken)?.sub;
      const structureUser = await db.collection('users').findOne({ _id: new ObjectID(userId) });
      if (!structureUser?.roles.includes('structure')) {
        res.status(403).send(new Forbidden('User not authorized', {
          userId: structureUser
        }).toJSON());
        return;
      }

      let structureId = null;
      let conseillerId = null;
      try {
        structureId = new ObjectID(req.params.id);
        conseillerId = new ObjectID(req.params.conseillerId);
      } catch (e) {
        res.status(404).send(new NotFound('Structure or conseiller not found', {
          id: req.params.id
        }).toJSON());
        return;
      }

      let structure = await db.collection('structures').findOne({ _id: structureId });
      let conseiller = await db.collection('conseillers').findOne({ _id: conseillerId });

      if (structure === null || conseiller === null) {
        res.status(404).send(new NotFound('Structure or conseiller not found', {
          id: req.params.id,
          conseillerId: req.params.conseillerId
        }).toJSON());
      }

      const connection = app.get('mongodb');
      const database = connection.substr(connection.lastIndexOf('/') + 1);
      const miseEnRelation = await db.collection('misesEnRelation').insertOne({
        conseiller: new DBRef('conseillers', conseillerId, database),
        structure: new DBRef('structures', structureId, database),
        statut: 'interessee',
        type: 'MANUEL',
        createdAt: new Date(),
        conseillerCreatedAt: conseiller.createdAt,
        conseillerObj: conseiller,
        structureObj: structure
      });

      res.status(201).send({ misEnRelation: miseEnRelation.ops[0] });
    });

    app.get('/structures/:id/misesEnRelation/stats', checkAuth, async (req, res) => {
      //verify user role
      let userId = jwtDecode(req.feathers.authentication?.accessToken)?.sub;
      const user = await db.collection('users').findOne({ _id: new ObjectID(userId) });
      let rolesUserAllowed = user?.roles.filter(role => ['admin', 'structure', 'prefet'].includes(role));
      if (rolesUserAllowed.length < 1) {
        res.status(403).send(new Forbidden('User not authorized', {
          userId: user
        }).toJSON());
        return;
      }

      let structureId = null;
      try {
        structureId = new ObjectID(req.params.id);
      } catch (e) {
        res.status(404).send(new NotFound('Structure not found', {
          id: req.params.id
        }).toJSON());
        return;
      }

      const stats = await db.collection('misesEnRelation').aggregate([
        { '$match': { 'structure.$id': structureId } },
        { '$group': { _id: '$statut', count: { $sum: 1 } } },
        { '$sort': { '_id': 1 } }
      ]).toArray();

      const statsDisponibles = stats.filter(item => {
        return item._id !== 'non_disponible';
      });

      /* ajout des candidats dont le recrutement est finalisé dans détails structure*/
      const misesEnRelationFinalise = await db.collection('misesEnRelation').find({ 'statut': 'finalisee', 'structure.$id': structureId }).toArray();
      const candidatsFinalise = misesEnRelationFinalise.map(item => {
        return item.conseillerObj;
      });

      /* ajout des candidats dont le recrutement est validé dans détails structure*/
      const misesEnRelationValide = await db.collection('misesEnRelation').find({ 'statut': 'recrutee', 'structure.$id': structureId }).toArray();
      const candidatsValide = misesEnRelationValide.map(item => {
        return item.conseillerObj;
      });
      res.send(statsDisponibles.map(item => {
        item.statut = item._id;
        if (item.statut === 'recrutee') {
          item.candidats = candidatsValide;
        }
        if (item.statut === 'finalisee') {
          item.candidats = candidatsFinalise;
        }
        delete item._id;
        return item;
      }));
    });

    app.get('/structures/:id/misesEnRelation', checkAuth, async (req, res) => {
      //verify user role
      let userId = jwtDecode(req.feathers.authentication?.accessToken)?.sub;
      const user = await db.collection('users').findOne({ _id: new ObjectID(userId) });
      let rolesUserAllowed = user?.roles.filter(role => ['admin', 'structure', 'prefet'].includes(role));
      if (rolesUserAllowed.length < 1) {
        res.status(403).send(new Forbidden('User not authorized', {
          userId: user
        }).toJSON());
        return;
      }

      const misesEnRelationService = app.service('misesEnRelation');
      let structureId = null;
      try {
        structureId = new ObjectID(req.params.id);
      } catch (e) {
        res.status(404).send(new NotFound('Structure not found', {
          id: req.params.id
        }).toJSON());
        return;
      }

      let queryFilter = {};
      const { filter } = req.query;
      const search = req.query['$search'];
      if (filter) {
        const allowedFilters = ['nouvelle', 'interessee', 'nonInteressee', 'recrutee', 'finalisee', 'nouvelle_rupture', 'toutes'];
        if (allowedFilters.includes(filter)) {
          if (filter !== 'toutes') {
            queryFilter = { statut: filter };
          } else {
            queryFilter = { statut: { '$nin': ['renouvellement_initiee', 'terminee'] } };
          }
        } else {
          res.status(400).send(new BadRequest('Invalid filter', {
            filter
          }).toJSON());
          return;
        }
      }

      if (search) {
        queryFilter['$text'] = { $search: '"' + search + '"' };
      }

      //User Filters
      let { pix, diplome, cv } = req.query;
      if (pix !== undefined) {
        pix = pix.split(',').map(k => parseInt(k));
        queryFilter['conseillerObj.pix.palier'] = { $in: pix };
      }
      if (diplome !== undefined) {
        queryFilter['conseillerObj.estDiplomeMedNum'] = (diplome === 'true');
      }
      if (cv !== undefined) {
        queryFilter['conseillerObj.cv'] = (cv === 'true') ? { '$ne': null } : { $in: [null] };
      }

      const skip = req.query['$skip'];
      if (skip) {
        queryFilter['$skip'] = skip;
      }
      const sort = req.query['$sort'];
      if (sort) {
        queryFilter['$sort'] = sort;
      }

      const misesEnRelation = await misesEnRelationService.find({ query: Object.assign({ 'structure.$id': structureId }, queryFilter) });
      if (misesEnRelation.total === 0) {
        res.send(misesEnRelation);
        return;
      }
      res.send(misesEnRelation);
    });

    app.post('/structures/:id/relance-inscription', checkAuth, async (req, res) => {
      let adminId = jwtDecode(req.feathers.authentication?.accessToken)?.sub;
      const adminUser = await db.collection('users').findOne({ _id: new ObjectID(adminId) });
      if (adminUser?.roles.filter(role => ['admin'].includes(role)).length < 1) {
        res.status(403).send(new Forbidden('User not authorized', {
          userId: adminUser
        }).toJSON());
        return;
      }

      let structureId = null;
      try {
        structureId = new ObjectID(req.params.id);
      } catch (e) {
        res.status(404).send(new NotFound('Structure not found', {
          id: req.params.id
        }).toJSON());
        return;
      }

      //La structure associée doit etre validée en COSELEC pour relancer une inscription
      let structure = await db.collection('structures').findOne({ _id: structureId });
      if (structure === null) {
        res.status(404).send(new NotFound('Structure not found', {
          structureId: structureId,
        }).toJSON());
      }
      if (structure.statut !== 'VALIDATION_COSELEC') {
        res.status(400).send(new BadRequest('Structure not validated in COSELEC', {
          structure: structure,
        }).toJSON());
      }

      try {
        const structureUser = await db.collection('users').findOne({ 'name': structure.contact?.email });
        // Cas où le cron n'est pas encore passé ou user inactif
        if (structureUser === null) {
          res.status(404).send(new NotFound('Utilisateur inexistant (inactivité)', {
            id: req.params.id
          }).toJSON());
          return;
        }
        if (structureUser.passwordCreated === true) {
          res.status(409).send(new Conflict(`Le compte ${structure.contact?.email} est déjà activé`));
          return;
        }
        //Met à jour le token possiblement expiré
        await db.collection('users').updateOne({ _id: structureUser._id }, { $set: { token: uuidv4(), tokenCreatedAt: new Date() } });
        const structureUserUpdated = await db.collection('users').findOne({ _id: structureUser._id });
        let mailer = createMailer(app);
        const emails = createEmails(db, mailer, app);
        let message = emails.getEmailMessageByTemplateName('creationCompteStructure');
        await message.send(structureUserUpdated);
        res.send(structureUserUpdated);

      } catch (error) {
        app.get('sentry').captureException(error);
      }

    });

    app.post('/structures/verifyStructureSiret', checkAuth, async (req, res) => {
      let adminId = jwtDecode(req.feathers.authentication?.accessToken)?.sub;
      const adminUser = await db.collection('users').findOne({ _id: new ObjectID(adminId) });
      if (adminUser?.roles.filter(role => ['admin'].includes(role)).length < 1) {
        res.status(403).send(new Forbidden('User not authorized', {
          userId: adminUser
        }).toJSON());
        return;
      }

      try {
        const raisonSociale = await getRaisonSocialeBySiretEntrepriseApiV3(req.body.siret, app.get('api_entreprise'));
        return res.send({ 'nomStructure': raisonSociale });
      } catch (error) {
        logger.error(error);
        app.get('sentry').captureException(error);
        return res.status(404).send(new NotFound('Le numéro de SIRET ( N° ' + req.body.siret + ' ) que vous avez demandé n\'existe pas !').toJSON());
      }
    });

    app.patch('/structures/:id/email', checkAuth, async (req, res) => {
      const { email } = req.body;
      const structureId = req.params.id;
      let adminId = jwtDecode(req.feathers.authentication?.accessToken)?.sub;
      const adminUser = await db.collection('users').findOne({ _id: new ObjectID(adminId) });
      if (adminUser?.roles.filter(role => ['admin'].includes(role)).length < 1) {
        res.status(403).send(new Forbidden('User not authorized', {
          userId: adminId
        }).toJSON());
        return;
      }
      const emailValidation = Joi.string().email().required().error(new Error('Le format de l\'email est invalide')).validate(email);
      if (emailValidation.error) {
        res.status(400).json(new BadRequest(emailValidation.error));
        return;
      }
      const structure = await db.collection('structures').findOne({ _id: new ObjectID(structureId) });
      if (!structure) {
        return res.status(404).send(new NotFound('Structure not found', {
          structureId
        }).toJSON());
      }
      const emailExists = await db.collection('users').findOne({ name: email });
      if (emailExists !== null) {
        return res.status(409).send(new Conflict('L\'adresse email que vous avez renseigné existe déjà', {
          structureId
        }).toJSON());
      }
      const emailExistStructure = await db.collection('structures').countDocuments({ 'contact.email': email });
      if (emailExistStructure !== 0) {
        return res.status(409).send(new Conflict('L\'adresse email que vous avez renseigné existe déjà dans une autre structure', {
          structureId
        }).toJSON());
      }

      const updateStructure = async (id, email, inactivite, statut) => {
        try {
          await db.collection('structures').updateOne(
            { _id: new ObjectID(structureId) },
            { $set: { 'contact.email': email },
              $push: {
                historique: {
                  data: {
                    ancienEmail: structure?.contact?.email,
                    nouveauEmail: email
                  },
                  changement: 'email',
                  date: new Date(),
                  idAdmin: adminUser?._id
                }
              } });

          if (inactivite === true && statut === 'VALIDATION_COSELEC') {
            await db.collection('structures').updateOne(
              { _id: new ObjectID(structureId) },
              {
                $set: {
                  'userCreated': true
                },
                $unset: {
                  'contact.inactivite': '',
                  'userCreationError': '',
                },
              });
            await db.collection('users').insertOne(
              {
                name: email,
                password: uuidv4(),
                roles: ['structure', 'structure_coop'],
                entity: {
                  '$ref': 'stuctures',
                  '$id': new ObjectID(structureId),
                  '$db': db.serverConfig.s.options.dbName
                },
                token: uuidv4(),
                tokenCreatedAt: new Date(),
                passwordCreated: false,
                createdAt: new Date(),
                resend: false,
                mailSentDate: null
              }
            );
            await db.collection('misesEnRelation').updateMany(
              { 'structure.$id': new ObjectID(structureId) },
              {
                $set: {
                  'structureObj.userCreated': true,
                  'structureObj.contact.email': email,
                },
                $unset: {
                  'structureObj.contact.inactivite': '',
                  'structureObj.userCreationError': '',
                }
              });
          } else {
            await db.collection('users').updateOne(
              { 'name': structure.contact.email, 'entity.$id': new ObjectID(structureId), 'roles': { $in: ['structure'] } },
              { $set: { name: email }
              });
            await db.collection('misesEnRelation').updateMany(
              { 'structure.$id': new ObjectID(structureId) },
              { $set: { 'structureObj.contact.email': email }
              });
          }
          res.send({ emailUpdated: true });
        } catch (error) {
          logger.error(error);
          app.get('sentry').captureException(error);
          res.status(500).send(new GeneralError(`Echec du changement d'email de la structure ${structure.nom}`));
        }
      };
      await updateStructure(structure.idPG, email, structure.contact?.inactivite, structure.statut);
    });

    app.post('/structures/updateStructureSiret', checkAuth, async (req, res) => {
      let adminId = jwtDecode(req.feathers.authentication?.accessToken)?.sub;
      const adminUser = await db.collection('users').findOne({ _id: new ObjectID(adminId) });
      if (adminUser?.roles.filter(role => ['admin'].includes(role)).length < 1) {
        res.status(403).send(new Forbidden('User not authorized', {
          userId: adminUser
        }).toJSON());
        return;
      }

      const structure = await db.collection('structures').findOne({ _id: new ObjectID(req.body.structureId) });
      if (!structure) {
        return res.status(404).send(new NotFound('Structure not found', {
          structureId: req.body.structureId
        }).toJSON());
      }

      try {
        await db.collection('structures').updateOne({ _id: new ObjectID(req.body.structureId) }, { $set: { siret: req.body.siret },
          $push: {
            historique: {
              data: {
                ancienSiret: structure?.siret === '' ? 'non renseigné' : structure?.siret,
                nouveauSiret: req.body.siret
              },
              changement: 'siret',
              date: new Date(),
              idAdmin: adminUser?._id

            }
          } });
        res.send({ siretUpdated: true });
      } catch (error) {
        logger.error(error);
        app.get('sentry').captureException(error);
        res.status(500).send(new GeneralError('Un problème avec la base de données est survenu ! Veuillez recommencer.'));
      }
    });

    app.get('/structures/getAvancementRecrutement', checkAuth, async (req, res) => {
      //verify user role
      let userId = jwtDecode(req.feathers.authentication?.accessToken)?.sub;
      const user = await db.collection('users').findOne({ _id: new ObjectID(userId) });
      if (user?.roles.filter(role => ['prefet'].includes(role)).length < 1) {
        res.status(403).send(new Forbidden('User not authorized', {
          userId: user
        }).toJSON());
        return;
      }

      let structures = [];
      if (user?.region) {
        structures = await db.collection('structures').find({
          codeRegion: user?.region.toString(),
          statut: 'VALIDATION_COSELEC',
          userCreated: true }).toArray();
      } else if (user?.departement) {
        structures = await db.collection('structures').find({
          codeDepartement: user?.departement.toString(),
          statut: 'VALIDATION_COSELEC',
          userCreated: true }).toArray();
      }

      let nombreCandidatsRecrutes = 0;
      let nombreDotations = 0;
      let promises = [];

      structures.forEach(structure => {
        const coselec = utils.getCoselec(structure);
        if (coselec) {
          nombreDotations += coselec.nombreConseillersCoselec;
        }
        promises.push(new Promise(async resolve => {
          let candidatsRecrutes = await db.collection('misesEnRelation').countDocuments({
            'statut': 'finalisee',
            'structure.$id': new ObjectID(structure._id)
          });
          nombreCandidatsRecrutes += candidatsRecrutes;
          resolve();
        }));
      });
      await Promise.all(promises);
      const pourcentage = nombreDotations !== 0 ? Math.round(nombreCandidatsRecrutes * 100 / nombreDotations) : 0;

      return res.send({ 'candidatsRecrutes': nombreCandidatsRecrutes, 'dotations': nombreDotations, 'pourcentage': pourcentage });
    });

  }
};
