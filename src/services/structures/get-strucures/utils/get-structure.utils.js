const doublon = 'DOUBLON';
const regexpFirstMatchIndex = 1;
const captureCoselecNumberRegexp = /\/coselec (\d+)\//;

const hasDuplicateStatut = structure =>
  structure.statut === doublon;

const isStructureDuplicate = structure =>
  hasDuplicateStatut(structure);

module.exports = {
  isStructureDuplicate
};
