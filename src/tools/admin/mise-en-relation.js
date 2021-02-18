#!/usr/bin/env node
'use strict';

const { execute } = require('../utils');
const { program } = require('commander');
const { DBRef } = require('mongodb');
const configuration = require('@feathersjs/configuration');
const feathers = require('@feathersjs/feathers');

program.parse(process.argv);

execute(async ({ db, logger }) => {
  const app = feathers().configure(configuration());
  const connection = app.get('mongodb');
  const database = connection.substr(connection.lastIndexOf('/') + 1);

  // Pour chaque structure, générer ses mises en relation
  const miseEnRelation = async (s, c) => {
    logger.debug(c.nom);
    logger.debug(c.dist.calculated);

    // Respecte la distance max du conseiller
    if (c.dist.calculated > c.distanceMax) {
      return;
    }

    // xxx Vérifie les dates de dispo

    const filter = {
      'structure.$id': s._id,
      'conseiller.$id': c._id
    };

    // Insere seulement si pas encore de mise en relation
    const updateDoc = {
      $set: {
        structure: new DBRef('structures', s._id, database),
        conseiller: new DBRef('conseillers', c._id, database),
      },
      $setOnInsert: {
        statut: 'nouvelle',
        createdAt: new Date(),
        conseillerCreatedAt: c.createdAt,
        distance: c.dist.calculated
      }
    };

    const options = { upsert: true };

    await db.collection('misesEnRelation').updateOne(filter, updateDoc, options);
  };

  const creation = async s => {
    logger.debug(`Nom : ${s.nom}`);
    logger.debug(`Lieu : ${JSON.stringify(s.location)}`);
 
    // On recherche les candidats dans un périmètre autour de la structure
    // classés par distance

    const match = await db.collection('conseillers').aggregate([{
      '$geoNear': {
        'near': s.location,
        'distanceField': 'dist.calculated',
        'maxDistance': 500000,
        'query': {},
        'num': 500, // xxx use $limit
        'spherical': false
      }
    }]);

    let c;
    while ((c = await match.next())) {
      await miseEnRelation(s, c);
    }
  };

  // Chercher les structures pour lesquelles on doit créer des mises ne relation
  const match = await db.collection('structures').find({ statut: 'CREEE' }); // xxx 'PREFET'

  let s;
  while ((s = await match.next())) {
    await creation(s);
  }
});
