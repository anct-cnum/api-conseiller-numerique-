const axios = require('axios');
const CSVToJSON = require('csvtojson');
const fs = require('fs');
const { Pool } = require('pg');
const { program } = require('commander');
program.version('0.0.1');

program
  .option('-t, --token <token>', 'token api entreprise')
  .option('-c, --csv <path>', 'CSV file path')

program.parse(process.argv);

const pool = new Pool();

// Vérifie un siren avec l'API Entreprise
const checkSiren = async (siren) => {

  const url = `https://entreprise.api.gouv.fr/v2/entreprises/${siren}`;

  const params =  {
    token: program.token,
    context: 'cnum',
    recipient: 'cnum',
    object: 'checkSiret',
  };

  try {
    const res = await axios.get(url, { params: params });
    return res.data.entreprise;
  } catch (err) {
    throw err;
  }
};

// CSV LimeSurvey
const readCSV = async (filePath) => {
  try {
    const users = await CSVToJSON().fromFile(filePath);
    return users;
  } catch (err) {
    throw err;
  }
};

const updateDB = async (email, entreprise) => {
  //const { rows } = await pool.query('SELECT * FROM djapp_hostorganization WHERE contact_email = $1', [email])
  const { rows } = await pool.query('SELECT NOW() AS DATE');
  //console.dir(rows);
}

readCSV(program.csv).then(async (replies) => {
  for (const reply of replies) {
    const siret = reply['Quel est votre numéro SIRET ?'].replace(/\s/g,'');
    const id = reply['ID de la réponse'];
    const email = reply['Pouvez-vous nous rappeler l’adresse mail avec laquelle vous avez reçu ce message ?'];

    if (/\d{14}/.test(siret)) {
      const siren = siret.substring(0,9);

      try {
        const result = await checkSiren(siren);
        // result.siret_siege_social
        // result.raison_sociale
        console.log(`OK ${id} ${siret} ${result.raison_sociale}`);
        await updateDB(email,result);
      } catch (error) {
        console.log(error);
      }
    } else {
      console.log(`KO ${id} ${siret}`);
    }
  }
}).catch((error) => {console.log(error.message);});

