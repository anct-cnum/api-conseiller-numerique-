const { Service } = require('feathers-mongodb');
const { NotFound, Conflict, BadRequest, GeneralError, Forbidden } = require('@feathersjs/errors');
const logger = require('../../logger');
const createEmails = require('../../emails/emails');
const createMailer = require('../../mailer');
const Joi = require('joi');
const { jwtDecode } = require('jwt-decode');
const { validationEmailPrefet, validationCodeRegion, validationCodeDepartement } = require('./users.repository');
const { checkAuth } = require('../../common/utils/feathers.utils');
const { v4: uuidv4 } = require('uuid');
const { DBRef, ObjectId, ObjectID } = require('mongodb');

exports.Users = class Users extends Service {
  constructor(options, app) {
    super(options);

    app.get('mongoClient').then(db => {
      this.Model = db.collection('users');
    });

    const db = app.get('mongoClient');
    let mailer = createMailer(app);
    const emails = createEmails(db, mailer, app);

    app.patch('/candidat/updateInfosCandidat/:id', checkAuth, async (req, res) => {
      app.get('mongoClient').then(async db => {
        const nouveauEmail = req.body.email.toLowerCase();
        let { nom, prenom, telephone, dateDisponibilite, email } = req.body;
        telephone = telephone.trim();
        email = email.trim();
        const mongoDateDisponibilite = new Date(dateDisponibilite);
        const body = { nom, prenom, telephone, dateDisponibilite, email };
        const schema = Joi.object({
          prenom: Joi.string().error(new Error('Le nom est invalide')),
          nom: Joi.string().error(new Error('Le nom est invalide')),
          telephone: Joi.string().required().regex(new RegExp(/^(?:(?:\+)(33|590|596|594|262|269))(?:[\s.-]*\d{3}){3,4}$/)).error(new Error('Le format du téléphone est invalide')),
          dateDisponibilite: Joi.date().error(new Error('La date est invalide, veuillez choisir une date supérieur ou égale à la date du jour')),
          email: Joi.string().trim().required().regex(/^([a-zA-Z0-9]+(?:[\\._-][a-zA-Z0-9]+)*)@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/).error(new Error('Le format de l\'email est invalide')),
        });
        const regexOldTelephone = new RegExp('^((06)|(07))[0-9]{8}$');
        let extended = '';
        if (!regexOldTelephone.test(telephone)) {
          extended = schema.keys({
            telephone: Joi.string().required().regex(/^(?:(?:\+)(33|590|596|594|262|269))(?:[\s.-]*\d{3}){3,4}$/).error(new Error('Le numéro de téléphone personnel est invalide')),
          }).validate(body);
        } else {
          extended = schema.keys({
            telephone: Joi.string().required().regex(/^((06)|(07))[0-9]{8}$/).error(new Error('Le numéro de téléphone personnel est invalide'))
          }).validate(body);
        }

        if (extended.error) {
          res.status(400).json(new BadRequest(extended.error));
          return;
        }
        const idUser = req.params.id;
        const userConnected = await this.find({ query: { _id: idUser } });
        const id = userConnected?.data[0].entity?.oid;
        const changeInfos = { nom, prenom, telephone, 'dateDisponibilite': mongoDateDisponibilite };
        const changeInfosMisesEnRelation = {
          'conseillerObj.nom': nom,
          'conseillerObj.prenom': prenom,
          'conseillerObj.telephone': telephone,
          'conseillerObj.dateDisponibilite': mongoDateDisponibilite
        };
        try {
          await app.service('conseillers').patch(id, changeInfos);
          await db.collection('misesEnRelation').updateMany({ 'conseiller.$id': id }, { $set: changeInfosMisesEnRelation });
        } catch (err) {
          app.get('sentry').captureException(err);
          logger.error(err);
          res.status(500).json(new GeneralError('Une erreur s\'est produite, veuillez réessayez plus tard !'));
          return;
        }
        if (nouveauEmail !== userConnected.data[0].name) {
          const gandi = app.get('gandi');
          if (nouveauEmail.includes(gandi.domain)) {
            res.status(400).send(new BadRequest('Erreur: l\'email saisi est invalide', {
              nouveauEmail
            }).toJSON());
            return;
          }
          const verificationEmail = await db.collection('users').countDocuments({ name: nouveauEmail });
          // vérification si le nouvel email est déjà utilisé par un conseiller
          const hasUserCoop = await db.collection('conseillers').countDocuments({ statut: { $exists: true }, email: nouveauEmail });
          if (verificationEmail !== 0 || hasUserCoop !== 0) {
            logger.error(`Erreur: l'email ${nouveauEmail} est déjà utilisé.`);
            res.status(409).send(new Conflict('Erreur: l\'email saisi est déjà utilisé', {
              nouveauEmail
            }).toJSON());
            return;
          }
          try {
            await this.patch(idUser, { $set: { token: uuidv4(), tokenCreatedAt: new Date(), mailAModifier: nouveauEmail } });
            const user = await db.collection('users').findOne({ _id: new ObjectID(idUser) });
            user.nouveauEmail = nouveauEmail;
            let mailer = createMailer(app, nouveauEmail);
            const emails = createEmails(db, mailer);
            let message = emails.getEmailMessageByTemplateName('candidatConfirmeNouveauEmail');
            await message.send(user);
          } catch (error) {
            app.get('sentry').captureException(error);
            logger.error(error);
            res.status(500).json(new GeneralError('Une erreur s\'est produite, veuillez réessayez plus tard !'));
            return;
          }
        }
        res.send({ success: true, sendmail: nouveauEmail !== userConnected.data[0].name });
      });

    });

    app.patch('/conseiller/updateInfosConseiller/:id', checkAuth, async (req, res) => {
      app.get('mongoClient').then(async db => {
        const nouveauEmail = req.body.email.toLowerCase();
        const nouveauEmailPro = req.body.emailPro?.toLowerCase();
        let { telephone, dateDisponibilite, email, emailPro } = req.body;
        telephone = telephone.trim();
        email = email.trim();
        emailPro = emailPro?.trim();
        const mongoDateDisponibilite = new Date(dateDisponibilite);
        const body = { telephone, dateDisponibilite, email, emailPro };
        const schema = Joi.object({
          telephone: Joi.string().required().regex(new RegExp(/^(?:(?:\+)(33|590|596|594|262|269))(?:[\s.-]*\d{3}){3,4}$/)).error(new Error('Le format du téléphone est invalide')),
          dateDisponibilite: Joi.date().error(new Error('La date est invalide, veuillez choisir une date supérieur ou égale à la date du jour')),
          email: Joi.string().trim().required().regex(/^([a-zA-Z0-9]+(?:[\\._-][a-zA-Z0-9]+)*)@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/).error(new Error('Le format de l\'email est invalide')),
          emailPro: Joi.string().trim().required().regex(/^([a-zA-Z0-9]+(?:[\\._-][a-zA-Z0-9]+)*)@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/).error(new Error('Le format de l\'email est invalide')),
        });
        const regexOldTelephone = new RegExp('^((06)|(07))[0-9]{8}$');
        let extended = '';
        if (!regexOldTelephone.test(telephone)) {
          extended = schema.keys({
            telephone: Joi.string().required().regex(/^(?:(?:\+)(33|590|596|594|262|269))(?:[\s.-]*\d{3}){3,4}$/).error(new Error('Le numéro de téléphone personnel est invalide')),
          }).validate(body);
        } else {
          extended = schema.keys({
            telephone: Joi.string().required().regex(/^((06)|(07))[0-9]{8}$/).error(new Error('Le numéro de téléphone personnel est invalide'))
          }).validate(body);
        }

        if (extended.error) {
          res.status(400).json(new BadRequest(extended.error));
          return;
        }
        const idUser = req.params.id;
        const userConnected = await this.find({ query: { _id: idUser } });
        const id = userConnected?.data[0].entity?.oid;
        const conseiller = await db.collection('conseillers').findOne({ _id: id });
        const changeInfos = { telephone, 'dateDisponibilite': mongoDateDisponibilite };
        const changeInfosMisesEnRelation = {
          'conseillerObj.telephone': telephone,
          'conseillerObj.dateDisponibilite': mongoDateDisponibilite
        };
        try {
          await app.service('conseillers').patch(id, changeInfos);
          await db.collection('misesEnRelation').updateMany({ 'conseiller.$id': id }, { $set: changeInfosMisesEnRelation });
        } catch (err) {
          app.get('sentry').captureException(err);
          logger.error(err);
          res.status(500).json(new GeneralError('Une erreur s\'est produite, veuillez réessayez plus tard !'));
          return;
        }
        if (conseiller?.statut === 'RECRUTE' && nouveauEmailPro !== conseiller?.emailPro) {
          const gandi = app.get('gandi');
          if (nouveauEmail.includes(gandi.domain)) {
            res.status(400).send(new BadRequest('Erreur: l\'email saisi est invalide', {
              nouveauEmail
            }).toJSON());
            return;
          }
          const verificationEmail = await db.collection('conseillers').countDocuments({ emailPro: nouveauEmailPro });
          if (verificationEmail !== 0) {
            logger.error(`Erreur: l'email professionnelle ${emailPro} est déjà utilisé par un autre utilisateur`);
            res.status(409).send(new Conflict('Erreur: l\'email professionnelle est déjà utilisé par un autre utilisateur', {
              emailPro
            }).toJSON());
            return;
          }
          try {
            const setMailProAConfirmer = {
              tokenChangementMailPro: uuidv4(),
              tokenChangementMailProCreatedAt: new Date(),
              mailProAModifier: emailPro.toLowerCase()
            };
            await db.collection('conseillers').updateOne({ _id: id }, { $set: setMailProAConfirmer });
            await db.collection('misesEnRelation').updateMany({ 'conseiller.$id': id },
              { '$set': {
                'conseillerObj.tokenChangementMailPro': setMailProAConfirmer.tokenChangementMailPro,
                'conseillerObj.tokenChangementMailProCreatedAt': setMailProAConfirmer.tokenChangementMailProCreatedAt,
                'conseillerObj.mailProAModifier': setMailProAConfirmer.mailProAModifier
              } });
            const conseiller = await db.collection('conseillers').findOne({ _id: id });
            conseiller.nouveauEmailPro = emailPro.toLowerCase();
            let mailer = createMailer(app, emailPro);
            const emails = createEmails(db, mailer);
            let message = emails.getEmailMessageByTemplateName('conseillerConfirmeNouveauEmailPro');
            await message.send(conseiller);
          } catch (error) {
            app.get('sentry').captureException(error);
            logger.error(error);
            res.status(500).json(new GeneralError('Une erreur s\'est produite, veuillez réessayez plus tard !'));
            return;
          }
        }

        if (nouveauEmail !== userConnected.data[0].name) {
          const gandi = app.get('gandi');
          if (nouveauEmail.includes(gandi.domain)) {
            res.status(400).send(new BadRequest('Erreur: l\'email saisi est invalide', {
              nouveauEmail
            }).toJSON());
            return;
          }
          const verificationEmail = await db.collection('users').countDocuments({ name: nouveauEmail });
          // vérification si le nouvel email est déjà utilisé par un conseiller
          const hasUserCoop = await db.collection('conseillers').countDocuments({ statut: { $exists: true }, email: nouveauEmail });
          if (verificationEmail !== 0 || hasUserCoop !== 0) {
            logger.error(`Erreur: l'email ${nouveauEmail} est déjà utilisé.`);
            res.status(409).send(new Conflict('Erreur: l\'email saisi est déjà utilisé', {
              nouveauEmail
            }).toJSON());
            return;
          }
          try {
            await this.patch(idUser, { $set: { token: uuidv4(), tokenCreatedAt: new Date(), mailAModifier: nouveauEmail } });
            const user = await db.collection('users').findOne({ _id: new ObjectID(idUser) });
            user.nouveauEmail = nouveauEmail;
            let mailer = createMailer(app, nouveauEmail);
            const emails = createEmails(db, mailer);
            let message = emails.getEmailMessageByTemplateName('candidatConfirmeNouveauEmail');
            await message.send(user);
          } catch (error) {
            app.get('sentry').captureException(error);
            logger.error(error);
            res.status(500).json(new GeneralError('Une erreur s\'est produite, veuillez réessayez plus tard !'));
            return;
          }
        }
        res.send({ success: true, sendmail: nouveauEmail !== userConnected.data[0].name || nouveauEmailPro !== conseiller?.emailPro });
      });
    });

    app.patch('/candidat/confirmation-email/:token', async (req, res) => {
      app.get('mongoClient').then(async db => {
        const token = req.params.token;
        const user = await this.find({
          query: {
            token: token,
            $limit: 1,
          }
        });
        if (user.total === 0) {
          logger.error(`Token inconnu: ${token}`);
          res.status(404).send(new NotFound('User not found', {
            token
          }).toJSON());
          return;
        }
        const userInfo = user?.data[0];
        if (!userInfo?.mailAModifier) {
          res.status(404).send(new NotFound('mailAModifier not found').toJSON());
          return;
        }
        try {
          await this.patch(userInfo._id, { $set: { name: userInfo.mailAModifier.toLowerCase() } });
          await app.service('conseillers').patch(userInfo?.entity?.oid, { email: userInfo.mailAModifier.toLowerCase() });
          await db.collection('misesEnRelation').updateMany({ 'conseiller.$id': userInfo?.entity?.oid },
            { '$set': { 'conseillerObj.email': userInfo.mailAModifier.toLowerCase() } }
          );
        } catch (err) {
          app.get('sentry').captureException(err);
          logger.error(err);
        }
        try {
          await this.patch(userInfo._id, { $set: { token: null, tokenCreatedAt: null }, $unset: { mailAModifier: '' } });
        } catch (err) {
          app.get('sentry').captureException(err);
          logger.error(err);
        }
        const apresEmailConfirmer = await this.find({
          query: {
            token: token,
            $limit: 1,
          }
        });
        res.send(apresEmailConfirmer.data[0]);
      });
    });

    app.patch('/confirmation-email/:token', async (req, res) => { // Portail-backoffice
      const token = req.params.token;
      const user = await this.find({
        query: {
          token: token,
          $limit: 1,
        }
      });
      if (user.total === 0) {
        res.status(404).send(new NotFound('User not found', {
          token
        }).toJSON());
        return;
      }
      const userInfo = user?.data[0];

      if (userInfo.mailAModifier === undefined) {
        res.status(400).send(new BadRequest('le nouveau mail n\'est pas renseignée', {
          token
        }).toJSON());
        return;
      }
      try {
        await this.patch(userInfo._id, { $set: { name: userInfo.mailAModifier.toLowerCase(), token: uuidv4() }, $unset: { mailAModifier: '' } });
      } catch (err) {
        app.get('sentry').captureException(err);
        logger.error(err);
      }

      const apresEmailConfirmer = await this.find({
        query: {
          token: token,
          $limit: 1,
        }
      });
      res.send(apresEmailConfirmer.data[0]);
    });

    app.patch('/users/sendEmailUpdate/:id', async (req, res) => {
      const nouveauEmail = req.body.name.toLowerCase();
      const idUser = req.params.id;
      const emailValidation = Joi.string().email().required().error(new Error('Le format de l\'email est invalide')).validate(nouveauEmail);
      if (emailValidation.error) {
        res.status(400).json(new BadRequest(emailValidation.error));
        return;
      }
      app.get('mongoClient').then(async db => {
        const verificationEmail = await db.collection('users').countDocuments({ name: nouveauEmail });
        if (verificationEmail !== 0) {
          logger.error(`Erreur: l'email ${nouveauEmail} est déjà utilisé`);
          res.status(409).send(new Conflict('Erreur: l\'email est déjà utilisé', {
            nouveauEmail
          }).toJSON());
          return;
        }
        try {
          await this.patch(idUser, { $set: { token: uuidv4(), mailAModifier: nouveauEmail } });
          const user = await db.collection('users').findOne({ _id: new ObjectID(idUser) });
          user.nouveauEmail = nouveauEmail;
          let mailer = createMailer(app, nouveauEmail);
          const emails = createEmails(db, mailer);
          let message = emails.getEmailMessageByTemplateName('confirmeNouveauEmail');
          await message.send(user);
          res.send(user);
        } catch (error) {
          app.get('sentry').captureException(error);
          logger.error(error);
        }
      });
    });

    app.get('/users/verifyToken/:token', async (req, res) => {
      const token = req.params.token;
      const users = await this.find({
        query: {
          token: token,
          $limit: 1,
        }
      });

      if (users.total === 0) {
        res.status(404).send(new NotFound('User not found', {
          token
        }).toJSON());
        return;
      }

      // eslint-disable-next-line camelcase
      const { roles, name, persoEmail, nom, prenom, support_cnfs } = users.data[0];
      if (roles.includes('conseiller')) {
        //Si le user est un conseiller, remonter son email perso pour l'afficher (cas renouvellement mot de passe)
        const conseiller = await app.service('conseillers').get(users.data[0].entity?.oid, { user: users.data[0] });
        users.data[0].persoEmail = conseiller.email;
        // eslint-disable-next-line camelcase
        res.send({ roles, name, persoEmail, nom, prenom, support_cnfs });
      } else {
        res.send({ roles, name });
      }
    });

    app.post('/users/inviteAccountsPrefet', checkAuth, async (req, res) => {
      let userId = jwtDecode(req.feathers.authentication?.accessToken)?.sub;
      const adminUser = await this.find({
        query: {
          _id: new ObjectID(userId),
          $limit: 1,
        }
      });
      if (!adminUser?.data[0].roles.includes('admin')) {
        res.status(403).send(new Forbidden('User not authorized', {
          userId: adminUser?.data[0]._id
        }).toJSON());
        return;
      }
      const { niveau, emails } = req.body;
      const { departement, regionCode } = niveau;
      if (!departement && !regionCode) {
        res.status(400).send(new BadRequest('Une erreur s\'est produite, veuillez réessayez plus tard !'));
        return;
      } else {
        if (departement) {
          const schemaDeparetement = await validationCodeDepartement(Joi)(niveau);
          if (schemaDeparetement.error) {
            res.status(400).send(new BadRequest(schemaDeparetement.error));
            return;
          }
        }
        if (regionCode) {
          const schemaRegion = await validationCodeRegion(Joi)(niveau);
          if (schemaRegion.error) {
            res.status(400).send(new BadRequest(schemaRegion.error));
            return;
          }
        }
      }
      let promises = [];
      const errorConflict = email => res.status(409).send(new Conflict(`Compte déjà existant pour l'email : ${email}, veuillez le retirer de la liste`));
      const errorBadRequestJoi = schema => res.status(400).send(new BadRequest(schema.error));
      let emailForEach;
      let emailMongoTrue = false;
      let schemaJoi;
      let errorValidationJoiTrue = false;
      await emails.forEach(async email => {
        await app.get('mongoClient').then(async db => {
          promises.push(new Promise(async resolve => {
            const schema = await validationEmailPrefet(Joi)(email);
            if (schema.error) {
              schemaJoi = schema;
              errorValidationJoiTrue = true;
            }
            const verificationEmail = await db.collection('users').countDocuments({ name: email });
            if (verificationEmail !== 0) {
              emailForEach = email;
              emailMongoTrue = true;
            }
            resolve();
          }));
        });
      });
      await Promise.all(promises);
      if (errorValidationJoiTrue) {
        errorBadRequestJoi(schemaJoi);
        return;
      } else if (emailMongoTrue) {
        errorConflict(emailForEach);
        return;
      }
      await emails.forEach(async email => {
        let userInfo = {
          name: email.toLowerCase(),
          roles: ['prefet'],
          token: uuidv4(),
          tokenCreatedAt: new Date(),
          passwordCreated: false,
          createdAt: new Date()
        };
        if (departement) {
          userInfo.departement = departement;
        } else {
          userInfo.region = regionCode;
        }
        await app.service('users').create(userInfo);
      });
      res.send({ status: 'compte créé' });
    });
    app.post('/users/inviteStructure', async (req, res) => {
      const email = req.body.email;
      const structureId = req.body.structureId;
      const schema = Joi.object({
        email: Joi.string().trim().email().required().error(new Error('Le format de l\'email est invalide')),
        structureId: Joi.string().required().error(new Error('Id de la structure est invalide')),
      }).validate(req.body);
      if (schema.error) {
        res.status(400).json(new BadRequest(schema.error));
        return;
      }
      app.get('mongoClient').then(async db => {
        const verificationEmail = await db.collection('users').countDocuments({ name: email });
        if (verificationEmail !== 0) {
          res.status(409).send(new Conflict('Erreur: l\'email est déjà utilisé pour une structure').toJSON());
          return;
        }
        const emailExistStructure = await db.collection('structures').countDocuments({ 'contact.email': email });
        if (emailExistStructure !== 0) {
          return res.status(409).send(new Conflict('L\'adresse email que vous avez renseigné existe déjà dans une autre structure').toJSON());
        }

        try {
          const connection = app.get('mongodb');
          const database = connection.substr(connection.lastIndexOf('/') + 1);
          const newUser = {
            name: email.toLowerCase(),
            roles: ['structure', 'structure_coop'],
            entity: new DBRef('structures', new ObjectId(structureId), database),
            token: uuidv4(),
            tokenCreatedAt: new Date(),
            passwordCreated: false,
            createdAt: new Date(),
            resend: false
          };

          await app.service('users').create(newUser);
          let mailer = createMailer(app, email);
          const emails = createEmails(db, mailer);
          let message = emails.getEmailMessageByTemplateName('invitationCompteStructure');
          await message.send(newUser, email);
          let messageCoop = emails.getEmailMessageByTemplateName('invitationStructureEspaceCoop');
          await messageCoop.send(newUser);

          res.send({ status: 'Invitation à rejoindre la structure envoyée !' });
        } catch (error) {
          app.get('sentry').captureException(error);
          logger.error(error);
          res.send('Une erreur est survenue lors de l\'envoi de l\'invitation !');
        }
      });
    });

    app.get('/users/listByIdStructure/:id', async (req, res) => {
      const idStructure = req.params.id;
      app.get('mongoClient').then(async db => {
        const users = await db.collection('users').aggregate([
          { '$match': { 'entity.$id': new ObjectId(idStructure) } },
          { '$project': { name: 1, roles: 1, passwordCreated: 1 } }
        ]).toArray();
        res.send(users);
      });
    });

    app.post('/users/choosePassword/:token', async (req, res) => {
      const token = req.params.token;
      const password = req.body.password;
      const typeEmail = req.body.typeEmail;
      const passwordValidation = Joi.string().required().regex(/((?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*]).{12,199})/).error(new Error('Le mot de passe ne correspond pas aux exigences de sécurité.')).validate(password);
      if (passwordValidation.error) {
        res.status(400).json(new BadRequest(passwordValidation.error));
        return;
      }
      const users = await this.find({
        query: {
          token: token,
          $limit: 1,
        }
      });

      if (users.total === 0) {
        res.status(404).send(new NotFound('User not found', {
          token
        }).toJSON());
        return;
      }
      const user = users.data[0];
      app.service('users').patch(user._id,
        {
          password,
          passwordCreated: true,
          passwordCreatedAt: new Date(),
          token: null,
          tokenCreatedAt: null
        }
      );

      if (typeEmail === 'bienvenue') {
        try {
          const nomTemplate = 'bienvenueCompteCandidat';
          const message = emails.getEmailMessageByTemplateName(nomTemplate);
          await message.send(user);
        } catch (err) {
          app.get('sentry').captureException(err);
          logger.error(err);
        }
      }
      if (typeEmail === 'renouvellement') {
        try {
          if (user?.resetPasswordCnil) {
            app.get('mongoClient').then(async db => {
              const userUpdated = await db.collection('users').updateOne(
                {
                  _id: user._id
                },
                {
                  $unset: {
                    resetPasswordCnil: ''
                  }
                }
              );
              if (userUpdated.modifiedCount === 0) {
                app.get('sentry').captureException(new Error(`Erreur lors de la mise à jour du user ${user._id} pour le renouvellement du mot de passe`));
                logger.error(`Erreur lors de la mise à jour du user ${user._id} pour le renouvellement du mot de passe`);
              }
            });
          }
          const templateMail = user.roles.some(role => role === 'conseiller') ? 'renouvellementCompte' : 'renouvellementCompteCandidat';
          const message = emails.getEmailMessageByTemplateName(templateMail);
          await message.send(user);
        } catch (err) {
          app.get('sentry').captureException(err);
          logger.error(err);
        }
      }
      res.send({ roles: user.roles });
    });

    app.post('/users/checkForgottenPasswordEmail', async (req, res) => {
      const username = req.body.username.trim();
      const users = await this.find({
        query: {
          name: username,
          $limit: 1,
        }
      });
      if (users.total === 0) {
        res.status(404).send(new NotFound('Cette adresse e-mail n\'existe pas', {
          username
        }).toJSON());
        return;
      }
      const user = users.data[0];
      let hiddenEmail = '';
      if (user.roles.includes('conseiller') && user.passwordCreated === false) {
        res.status(409).send(new Conflict(`Vous n'avez pas encore activé votre compte. Pour cela, cliquez sur le lien d'activation fourni dans le mail ayant pour objet "Activer votre compte Coop des Conseillers numériques"`, {
          username
        }).toJSON());
        return;
      }
      //Si le user est un conseiller, on renvoie l'email obscurci
      if (user.roles.includes('conseiller')) {
        const hide = t => {
          if (t.length === 0) {
            return '';
          } else if (t.length === 1) {
            return '*'; // a => *
          } else if (t.length === 2) {
            return t.charAt(0) + '*'; // ab => a*
          } else {
            return t.charAt(0) + '*'.repeat(t.length - 2) + t.charAt(t.length - 1); // abcdef => a****f
          }
        };
        let conseiller = await app.service('conseillers').get(user.entity?.oid, { user });
        // conseiller.email : email perso du conseiller
        const regexp = /([^@]+)@([^@]+)[.](\w+)/; // Extraction des trois morceaux du mail
        let match = conseiller.email.match(regexp);
        let premierePartie;
        let domaine;
        let extension;
        if (match && match.length > 3) {
          premierePartie = match[1];
          domaine = match[2];
          extension = match[3];
        } else {
          const err = new Error('Erreur mot de passe oublié, format email invalide');
          logger.error(err);
          app.get('sentry').captureException(err);
          res.status(500).json(new GeneralError('Erreur mot de passe oublié.'));
          return;
        }
        hiddenEmail = `${hide(premierePartie)}@${hide(domaine)}.${extension}`;
      }

      try {
        res.status(200).json({
          hiddenEmail: hiddenEmail,
          successCheckEmail: true
        });
        return;
      } catch (err) {
        logger.error(err);
        app.get('sentry').captureException(err);
        res.status(500).json(new GeneralError('Erreur mot de passe oublié.'));
        return;
      }
    });

    app.post('/users/sendForgottenPasswordEmail', async (req, res) => {
      const username = req.body.username.toLowerCase().trim();
      const users = await this.find({
        query: {
          name: username,
          $limit: 1,
        }
      });

      if (users.total === 0) {
        res.status(404).send(new NotFound('Cette adresse e-mail n\'existe pas', {
          username
        }).toJSON());
        return;
      }
      const user = users.data[0];
      if (!user.roles.some(role => ['candidat', 'conseiller', 'hub_coop'].includes(role))) {
        res.status(403).send(new Forbidden('Error authorization user', {
          username
        }).toJSON());
        return;
      }
      if (user.passwordCreated === false) {
        res.status(400).send(new BadRequest('Error authorization forgottenPassword', {
          username
        }).toJSON());
        return;
      }
      user.token = uuidv4();

      //Si le user est un conseiller, envoyer le mail sur son email perso
      if (user.roles.includes('conseiller')) {
        let conseiller = await app.service('conseillers').get(user.entity?.oid, { user });
        user.persoEmail = conseiller.email;
      }

      try {
        this.Model.updateOne({ _id: user._id }, { $set: { token: user.token, tokenCreatedAt: new Date() } });
        let message;
        if (user?.resetPasswordCnil) {
          message = emails.getEmailMessageByTemplateName('resetMotDePasseCnil');
        } else {
          message = emails.getEmailMessageByTemplateName('motDePasseOublie');
        }
        await message.send(user);
        res.status(200).json({ successResetPassword: true });
        return;
      } catch (err) {
        app.get('sentry').captureException(err);
        res.status(500).json(new GeneralError('Erreur mot de passe oublié.'));
        return;
      }
    });

    app.patch('/users/verify-code', async (req, res) => {
      const db = await app.get('mongoClient');
      const { code, email } = req.body;
      const schema = Joi.object({
        code: Joi.string().required().error(new Error('Le format du code de vérification est invalide')),
        email: Joi.string().trim().email().required().error(new Error('Le format de l\'adresse email est invalide')),
      }).validate(req.body);
      if (schema.error) {
        res.status(400).json(new BadRequest(schema.error));
        return;
      }
      try {
        const verificationEmailEtCode = await db.collection('users').countDocuments({ name: email.toLowerCase().trim(), numberLoginUnblock: Number(code) });
        if (verificationEmailEtCode === 0) {
          res.status(404).send(new Conflict('Erreur: l\'email et le code ne correspondent pas.').toJSON());
          return;
        }
        await db.collection('users')
        .updateOne(
          { name: email },
          { $unset: {
            lastAttemptFailDate: '',
            attemptFail: '',
            numberLoginUnblock: ''
          } }
        );
        res.status(200).json({ messageVerificationCode: 'Vous pouvez désormais vous reconnecter' });
        return;
      } catch (error) {
        logger.error(error);
        app.get('sentry').captureException(error);
        res.status(500).send(new GeneralError('Une erreur s\'est produite, veuillez réessayer plus tard.'));
        return;
      }
    });

    // Monitoring clever
    app.get('/', (req, res) => {
      res.sendStatus(200);
    });
  }
};
