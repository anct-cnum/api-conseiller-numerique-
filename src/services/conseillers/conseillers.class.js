const { Service } = require('feathers-mongodb');
const { NotFound, Conflict, GeneralError, NotAuthenticated, Forbidden, BadRequest } = require('@feathersjs/errors');
const { ObjectId } = require('mongodb');
const logger = require('../../logger');
const decode = require('jwt-decode');
const aws = require('aws-sdk');
const multer = require('multer');
const fileType = require('file-type');
const crypto = require('crypto');
const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
const Joi = require('joi');

exports.Conseillers = class Conseillers extends Service {
  constructor(options, app) {
    super(options);

    let db;
    app.get('mongoClient').then(mongoDB => {
      db = mongoDB;
    });

    const upload = multer();

    app.get('mongoClient').then(db => {
      this.Model = db.collection('conseillers');
    });

    app.get('/conseillers/verifyCandidateToken/:token', async (req, res) => {
      const token = req.params.token;
      const conseillers = await this.find({
        query: {
          emailConfirmationKey: token,
          $limit: 1,
        }
      });

      if (conseillers.total === 0) {
        res.status(404).send(new NotFound('Conseiller not found', {
          token
        }).toJSON());
        return;
      }

      res.send({ isValid: true, conseiller: conseillers.data[0] });
    });

    app.get('/conseillers/verifySondageToken/:token', async (req, res) => {
      const token = req.params.token;
      const conseillers = await this.find({
        query: {
          sondageToken: token,
          $limit: 1,
        }
      });

      if (conseillers.total === 0) {
        res.status(404).send(new NotFound('Désolé mais le lien est invalide.', {
          token
        }).toJSON());
        return;
      }

      const sondage = new Promise(async resolve => {
        const p = new Promise(async resolve => {
          app.get('mongoClient').then(db => {
            let sondage = db.collection('sondages').countDocuments(
              {
                'conseiller.$id': conseillers.data[0]._id
              });
            resolve(sondage);
          });
        });
        resolve(p);
      });
      const result = await sondage;
      if (result > 0) {
        res.status(409).send(new NotFound('Sondage déjà répondu.', {
          token
        }).toJSON());
        return;
      }

      res.send({ isValid: true, conseiller: conseillers.data[0] });
    });

    app.post('/conseillers/createSexeAge', async (req, res) => {

      if (req.feathers?.authentication === undefined) {
        res.status(401).send(new NotAuthenticated('User not authenticated'));
      }

      let userId = decode(req.feathers.authentication.accessToken).sub;
      const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });

      if (!user?.roles.includes('conseiller') && !user?.roles.includes('candidat')) {
        res.status(403).send(new Forbidden('User not authorized', {
          userId: userId
        }).toJSON());
        return;
      }

      let conseiller = await this.find({
        query: {
          _id: new ObjectId(user.entity.oid),
          $limit: 1,
        }
      });

      if (conseiller.total === 0) {
        res.status(404).send(new NotFound('Ce compte n\'existe pas ! Vous allez être déconnecté.').toJSON());
        return;
      }

      const minDate = dayjs().subtract(99, 'year');
      const maxDate = dayjs().subtract(18, 'year');
      const sexe = req.body.sexe;
      const dateDeNaissance = new Date(req.body.dateDeNaissance);

      const schema = Joi.object({
        dateDeNaissance: Joi.date().required().min(minDate).max(maxDate)
        .error(new Error('La date de naissance est invalide')),
        sexe: Joi.string().required().error(new Error('Le sexe est invalide')),
      }).validate(req.body);

      if (schema.error) {
        res.status(400).send(new BadRequest('Erreur : ' + schema.error).toJSON());
      }

      if (sexe === '' || dateDeNaissance === '') {
        res.status(400).send(new BadRequest('Erreur : veuillez remplir tous les champs obligatoires (*) du formulaire.').toJSON());
        return;
      }

      try {
        await this.patch(new ObjectId(user.entity.oid),
          { $set: {
            sexe: sexe,
            dateDeNaissance: dateDeNaissance
          } });
      } catch (error) {
        app.get('sentry').captureException(error);
        logger.error(error);
        res.status(409).send(new Conflict('La mise à jour a échoué, veuillez réessayer.').toJSON());
      }

      res.send({ isUpdated: true });
    });

    app.post('/conseillers/cv', upload.single('file'), async (req, res) => {

      if (req.feathers?.authentication === undefined) {
        res.status(401).send(new NotAuthenticated('User not authenticated'));
      }
      //Verification role candidat
      let userId = decode(req.feathers.authentication.accessToken).sub;
      const candidatUser = await db.collection('users').findOne({ _id: new ObjectId(userId) });
      if (!candidatUser?.roles.includes('candidat')) {
        res.status(403).send(new Forbidden('User not authorized', {
          userId: userId
        }).toJSON());
        return;
      }

      const cvFile = req.file;
      if (cvFile === undefined) {
        res.status(400).send(new BadRequest('Erreur : cv non envoyé').toJSON());
        return;
      }
      //verification type PDF (ne pas faire confiance qu'au mime/type envoyé)
      const allowedExt = ['pdf'];
      const allowedMime = ['application/pdf'];
      let detectingFormat = await fileType.fromBuffer(cvFile.buffer);

      if (!allowedExt.includes(detectingFormat.ext) || !allowedMime.includes(cvFile.mimetype) || !allowedMime.includes(detectingFormat.mime)) {
        res.status(400).send(new BadRequest('Erreur : format de CV non autorisé').toJSON());
        return;
      }

      //Verification taille CV (limite configurée dans variable env cv_file_max_size)
      let sizeCV = ~~(cvFile.size / (1024 * 1024)); //convertion en Mo
      if (sizeCV >= app.get('cv_file_max_size')) {
        res.status(400).send(new BadRequest('Erreur : Taille du CV envoyé doit être inférieure à ' + app.get('cv_file_max_size') + ' Mo').toJSON());
        return;
      }

      //Nom du fichier avec id conseiller + extension fichier envoyé
      let nameCVFile = candidatUser.entity.oid + '.' + detectingFormat.ext;

      //Vérification existance conseiller avec cet ID pour sécurité
      let conseiller = await db.collection('conseillers').findOne({ _id: new ObjectId(candidatUser.entity.oid) });
      if (conseiller === null) {
        res.status(404).send(new NotFound('Conseiller not found', {
          conseillerId: candidatUser.entity.oid
        }).toJSON());
        return;
      }

      //Chiffrement du CV
      const cryptoConfig = app.get('crypto');
      let key = crypto.createHash('sha256').update(cryptoConfig.key).digest('base64').substr(0, 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(cryptoConfig.algorithm, key, iv);
      const bufferCrypt = Buffer.concat([iv, cipher.update(cvFile.buffer), cipher.final()]);

      //initialisation AWS
      const awsConfig = app.get('aws');
      aws.config.update({ accessKeyId: awsConfig.access_key_id, secretAccessKey: awsConfig.secret_access_key });
      const ep = new aws.Endpoint(awsConfig.endpoint);
      const s3 = new aws.S3({ endpoint: ep });

      //Suprresion de l'ancien CV si présent dans S3 et dans MongoDb
      if (conseiller.cv?.file) {
        let paramsDelete = { Bucket: awsConfig.cv_bucket, Key: conseiller.cv.file };
        // eslint-disable-next-line no-unused-vars
        s3.deleteObject(paramsDelete, function(error, data) {
          if (error) {
            logger.error(error);
            app.get('sentry').captureException(error);
            res.status(500).send(new GeneralError('La suppression du cv a échoué.').toJSON());
          }
        });

        try {
          await db.collection('conseillers').updateOne({ '_id': conseiller._id },
            { $unset: {
              cv: ''
            } });
          await db.collection('misesEnRelation').updateMany({ 'conseiller.$id': conseiller._id },
            { $unset: {
              'conseillerObj.cv': ''
            } });
        } catch (error) {
          app.get('sentry').captureException(error);
          logger.error(error);
          res.status(500).send(new GeneralError('La suppression du CV dans MongoDb a échoué').toJSON());
        }
      }

      let params = { Bucket: awsConfig.cv_bucket, Key: nameCVFile, Body: bufferCrypt };
      // eslint-disable-next-line no-unused-vars
      s3.putObject(params, function(error, data) {
        if (error) {
          logger.error(error);
          app.get('sentry').captureException(error);
          res.status(500).send(new GeneralError('Le dépôt du cv a échoué, veuillez réessayer plus tard.').toJSON());
        } else {
          //Insertion du cv dans MongoDb
          try {
            const cv = {
              file: nameCVFile,
              extension: detectingFormat.ext,
              date: new Date()
            };

            db.collection('conseillers').updateMany({ email: conseiller.email },
              { $set: {
                cv: cv
              } });
            db.collection('misesEnRelation').updateMany({ 'conseillerObj.email': conseiller.email },
              { $set: {
                'conseillerObj.cv': cv
              } });
          } catch (error) {
            app.get('sentry').captureException(error);
            logger.error(error);
            res.status(500).send(new GeneralError('La mise à jour du CV dans MongoDB a échoué').toJSON());
          }

          res.send({ isUploaded: true });
        }
      });
    });

    app.get('/conseillers/:id/cv', async (req, res) => {
      if (req.feathers?.authentication === undefined) {
        res.status(401).send(new NotAuthenticated('User not authenticated'));
      }

      //Verification rôle candidat / structure / admin pour accéder au CV : si candidat alors il ne peut avoir accès qu'à son CV
      let userId = decode(req.feathers.authentication.accessToken).sub;
      const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
      // eslint-disable-next-line max-len
      if (!(user?.roles.includes('candidat') && req.params.id.toString() === user?.entity.oid.toString()) && !user?.roles.includes('structure') && !user?.roles.includes('admin')) {
        res.status(403).send(new Forbidden('User not authorized', {
          userId: userId
        }).toJSON());
        return;
      }

      //Verification existence du conseiller associé
      let conseiller = await db.collection('conseillers').findOne({ _id: new ObjectId(req.params.id) });
      if (conseiller === null) {
        res.status(404).send(new NotFound('Conseiller not found', {
          conseillerId: user.entity.oid
        }).toJSON());
        return;
      }

      //Verification existence CV du conseiller
      if (!conseiller.cv?.file) {
        res.status(404).send(new NotFound('CV not found for this conseiller', {
          conseillerId: user.entity.oid
        }).toJSON());
        return;
      }

      //Récupération du CV crypté
      const awsConfig = app.get('aws');
      aws.config.update({ accessKeyId: awsConfig.access_key_id, secretAccessKey: awsConfig.secret_access_key });
      const ep = new aws.Endpoint(awsConfig.endpoint);
      const s3 = new aws.S3({ endpoint: ep });

      let params = { Bucket: awsConfig.cv_bucket, Key: conseiller.cv.file };/*  */
      s3.getObject(params, function(error, data) {
        if (error) {
          logger.error(error);
          app.get('sentry').captureException(error);
          res.status(500).send(new GeneralError('La récupération du cv a échoué.').toJSON());
        } else {
          //Dechiffrement du CV (le buffer se trouve dans data.Body)
          const cryptoConfig = app.get('crypto');
          let key = crypto.createHash('sha256').update(cryptoConfig.key).digest('base64').substr(0, 32);
          const iv = data.Body.slice(0, 16);
          data.Body = data.Body.slice(16);
          const decipher = crypto.createDecipheriv(cryptoConfig.algorithm, key, iv);
          const bufferDecrypt = Buffer.concat([decipher.update(data.Body), decipher.final()]);

          res.send(bufferDecrypt);
        }
      });
    });

    app.post('/conseillers/statistiquesPDF', async (req, res) => {

      app.get('mongoClient').then(async db => {

        const accessToken = req.feathers?.authentication?.accessToken;

        if (req.feathers?.authentication === undefined) {
          res.status(401).send(new NotAuthenticated('User not authenticated'));
        }
        let userId = decode(accessToken).sub;
        const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
        if (!user?.roles.includes('conseiller')) {
          res.status(403).send(new Forbidden('User not authorized', {
            userId: userId
          }).toJSON());
          return;
        }

        const dateDebut = new Date(req.body.datesStatsPDF.dateDebut).getTime();
        const dateFin = new Date(req.body.datesStatsPDF.dateFin).getTime();
        user.role = user.roles[0];
        user.pdfGenerator = true;
        delete user.roles;
        delete user.password;

        /** Ouverture d'un navigateur en headless afin de générer le PDF **/
        try {
          const browser = await puppeteer.launch();

          browser.on('targetchanged', async target => {
            const targetPage = await target.page();
            const client = await targetPage.target().createCDPSession();
            await client.send('Runtime.evaluate', {
              expression: `localStorage.setItem('user', '{"accessToken":"${accessToken}",` +
              `"authentication":{` +
                `"strategy":"local",` +
                `"accessToken":"${accessToken}"},` +
              `"user":${JSON.stringify(user)}}')`
            });
          });

          const page = await browser.newPage();

          await Promise.all([
            page.goto(app.get('espace_coop_hostname') + '/statistiques', { waitUntil: 'networkidle0' }),
          ]);

          await page.focus('#datePickerDebutPDF');
          await page.keyboard.type(dateDebut.toString());

          await page.focus('#datePickerFinPDF');
          await page.keyboard.type(dateFin.toString());

          await page.click('#chargePDF');
          await page.waitForTimeout(500);

          let pdf;
          await Promise.all([
            page.addStyleTag({ content: '#burgerMenu { display: none} .no-print { display: none }' }),
            pdf = page.pdf({ format: 'A4', printBackground: true })
          ]);

          await browser.close();

          res.contentType('application/pdf');
          pdf.then(buffer => res.send(buffer));
          return;
        } catch (error) {
          app.get('sentry').captureException(error);
          logger.error(error);
          return res.status(500).send(new GeneralError('Une erreur est survenue lors de la création du PDF, veuillez réessayer.').toJSON());
        }
      });
    });

    app.get('/conseillers/:id/employeur', async (req, res) => {

      const accessToken = req.feathers?.authentication?.accessToken;
      if (req.feathers?.authentication === undefined) {
        res.status(401).send(new NotAuthenticated('User not authenticated'));
      }
      let userId = decode(accessToken).sub;
      const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
      if (!user?.roles.includes('admin')) {
        res.status(403).send(new Forbidden('User not authorized', {
          userId: userId
        }).toJSON());
        return;
      }

      const id = req.params.id;
      const conseillers = await this.find({
        query: {
          _id: id,
          $limit: 1,
        }
      });

      if (conseillers.total === 0) {
        res.status(404).send(new NotFound('Conseiller not found', {
          id
        }).toJSON());
        return;
      }

      const miseEnRelation = await db.collection('misesEnRelation').findOne({
        'conseiller.$id': new ObjectId(id),
        'statut': 'finalisee'
      });

      if (miseEnRelation === null) {
        res.status(404).send(new NotFound('Structure not found', {
          id
        }).toJSON());
        return;
      }
      res.send({ nomStructure: miseEnRelation.structureObj.nom });
    });
  }
};
