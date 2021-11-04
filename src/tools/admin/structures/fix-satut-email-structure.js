const { execute } = require('../../utils');

execute(__filename, async ({ db, logger, exit }) => {
  let promises = [];
  let countTotalStructure = 0;
  let countNonMAJStatut = 0;
  let countOKMAJStatut = 0;
  let countNonMAJEmail = 0;
  let countOKMAJEmail = 0;

  const structures = await db.collection('structures').find().toArray();

  structures.forEach(structure => {
    promises.push(new Promise(async resolve => {
      const verifMisesEnRelation = await db.collection('misesEnRelation').findOne({ 'structure.$id': structure._id });
      if (verifMisesEnRelation !== null) {
        //Partie pour mettre à jour le statut
        if (verifMisesEnRelation?.structureObj?.statut !== structure?.statut) {
          await db.collection('misesEnRelation').updateMany(
            { 'structure.$id': structure._id },
            { $set: { 'structureObj.statut': structure.statut }
            });
          countNonMAJStatut++;
        }
        if (verifMisesEnRelation?.structureObj?.statut === structure?.statut) {
          countOKMAJStatut++;
        }
        // Partie pour mettre à jour l'email de contact
        if (verifMisesEnRelation?.structureObj?.contact !== undefined) {
          if (verifMisesEnRelation?.structureObj?.contact.email !== structure.contact.email) {
            await db.collection('misesEnRelation').updateMany(
              { 'structure.$id': structure._id },
              { $set: { 'structureObj.contact.email': structure.contact.email }
              });
            countNonMAJEmail++;
          }
          if (verifMisesEnRelation?.structureObj?.email === structure?.email) {
            countOKMAJEmail++;
          }
        }
      }
      countTotalStructure++;
      resolve();
    }));
  });
  await Promise.all(promises);

  // eslint-disable-next-line max-len
  logger.info(`Il y a en tout ${countTotalStructure} structures, dont ${countNonMAJStatut} n'ont pas le même statut et ${countOKMAJStatut} ont le meme statut dans la collection misesEnRelation`);
  // eslint-disable-next-line max-len
  logger.info(`Il y a en tout ${countTotalStructure} structures, dont ${countNonMAJEmail} n'ont pas le même email de contact et ${countOKMAJEmail} ont le meme email de contact dans la collection misesEnRelation`);
  exit();
});
