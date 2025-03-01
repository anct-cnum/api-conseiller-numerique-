const { program } = require('commander');
const { execute } = require('../../utils');
const { ObjectID } = require('mongodb');

execute(__filename, async ({ db, logger, exit }) => {

  program.option('-t, --type <type>', 'type: REGION ou GIP ou DEPARTEMENT ou EPCI ou COLLECTIVITE ou COMMUNE ou PRIVATE');
  program.option('-i, --id <id>', 'id: id PG de la structure');
  program.helpOption('-e', 'HELP command');
  program.parse(process.argv);

  let id = ~~program.id;
  let type = program.type;

  if (id === 0 || !type) {
    exit('Paramètres invalides. Veuillez préciser un id et un type');
    return;
  } else if (!['REGION', 'GIP', 'DEPARTEMENT', 'EPCI', 'COLLECTIVITE', 'COMMUNE', 'PRIVATE'].includes(type)) {
    exit('Type invalide. Veuillez préciser un type qui est égal à REGION ou GIP ou DEPARTEMENT ou EPCI ou COLLECTIVITE ou COMMUNE ou PRIVATE');
    return;
  }

  const structure = await db.collection('structures').findOne({ idPG: id });

  if (structure === null) {
    exit('id PG inconnu dans MongoDB');
    return;
  }

  await db.collection('structures').updateOne({ idPG: id }, { $set: { type: type } });

  await db.collection('misesEnRelation').updateMany({ 'structureObj._id': new ObjectID(structure._id) }, { $set: { 'structureObj.type': type } });

  logger.info(`Type mis à jour pour la structure avec l'idPG: ${structure.idPG} qui avait un type à l'origine ${structure.type} mis à jour avec ${type}`);
  exit();
});
