const { permanenceDetailsFromStructureId, permanenceDetails } = require('./permanence-details.core');
const { ObjectID } = require('mongodb');

describe('détails de la permanence avec l\'identifiant de la structure', () => {
  it('devrait retourner le détail de la permanence', async () => {
    const permanenceRepository = {
      getStructureById: () => ({
        nom: 'Aide rurale',
        contact: {
          email: 'john.doe@aide-rurale.net',
          telephone: '0423456897'
        },
        coordonneesInsee: {
          type: 'Point',
          coordinates: [
            3.158667,
            46.987344
          ]
        },
        insee: {
          etablissement: {
            adresse: {
              numero_voie: '12',
              type_voie: 'RUE',
              nom_voie: 'DE LA PLACE',
              complement_adresse: null,
              code_postal: '87100',
              localite: 'LIMOGES',
              code_insee_localite: '87085',
              cedex: null
            }
          }
        }
      }),
      getCnfs: () => [
        {
          prenom: 'Christelle',
          nom: 'Bateau',
        },
        {
          prenom: 'Charles',
          nom: 'Desmoulins',
        }
      ]
    };

    const structureId = '62a46ca2af2829d3cd298305';

    const expectedPermanenceDetails = {
      adresse: '12 RUE DE LA PLACE, 87100 LIMOGES',
      nom: 'Aide rurale',
      email: 'john.doe@aide-rurale.net',
      telephone: '04 23 45 68 97',
      coordinates: [3.158667, 46.987344],
      nombreCnfs: 2,
      cnfs: [
        {
          prenom: 'Christelle',
          nom: 'Bateau',
        },
        {
          prenom: 'Charles',
          nom: 'Desmoulins',
        }
      ]
    };

    const details = await permanenceDetailsFromStructureId(structureId, permanenceRepository);

    expect(details).toStrictEqual(expectedPermanenceDetails);
  });

  it('devrait retourner le détail de la permanence sans information insee', async () => {
    const permanenceRepository = {
      getStructureById: () => ({
        nom: 'Aide rurale',
        contact: {
          email: 'john.doe@aide-rurale.net',
          telephone: '04 23 45 68 97'
        }
      }),
      getCnfs: () => [
        {
          prenom: 'Christelle',
          nom: 'Bateau',
        },
        {
          prenom: 'Charles',
          nom: 'Desmoulins',
        }
      ]
    };

    const structureId = '62a46ca2af2829d3cd298305';

    const expectedPermanenceDetails = {
      nom: 'Aide rurale',
      email: 'john.doe@aide-rurale.net',
      telephone: '04 23 45 68 97',
      nombreCnfs: 2,
      cnfs: [
        {
          prenom: 'Christelle',
          nom: 'Bateau',
        },
        {
          prenom: 'Charles',
          nom: 'Desmoulins',
        }
      ]
    };

    const details = await permanenceDetailsFromStructureId(structureId, permanenceRepository);

    expect(details).toStrictEqual(expectedPermanenceDetails);
  });

  it('devrait retourner le détail de la permanence sans information de contact', async () => {
    const permanenceRepository = {
      getStructureById: () => ({
        nom: 'Aide rurale',
        insee: {
          etablissement: {
            adresse: {
              numero_voie: '12',
              type_voie: 'RUE',
              nom_voie: 'DE LA PLACE',
              complement_adresse: null,
              code_postal: '87100',
              localite: 'LIMOGES',
              code_insee_localite: '87085',
              cedex: null
            }
          }
        }
      }),
      getCnfs: () => [
        {
          prenom: 'Christelle',
          nom: 'Bateau',
        },
        {
          prenom: 'Charles',
          nom: 'Desmoulins',
        }
      ]
    };

    const structureId = '62a46ca2af2829d3cd298305';

    const expectedPermanenceDetails = {
      adresse: '12 RUE DE LA PLACE, 87100 LIMOGES',
      nom: 'Aide rurale',
      nombreCnfs: 2,
      cnfs: [
        {
          prenom: 'Christelle',
          nom: 'Bateau',
        },
        {
          prenom: 'Charles',
          nom: 'Desmoulins',
        }
      ]
    };

    const details = await permanenceDetailsFromStructureId(structureId, permanenceRepository);

    expect(details).toStrictEqual(expectedPermanenceDetails);
  });

  it('devrait retourner le détail de la permanence sans téléphone', async () => {
    const permanenceRepository = {
      getStructureById: () => ({
        nom: 'Aide rurale',
        contact: {
          email: 'john.doe@aide-rurale.net'
        },
        insee: {
          etablissement: {
            adresse: {
              numero_voie: '12',
              type_voie: 'RUE',
              nom_voie: 'DE LA PLACE',
              complement_adresse: null,
              code_postal: '87100',
              localite: 'LIMOGES',
              code_insee_localite: '87085',
              cedex: null
            }
          }
        }
      }),
      getCnfs: () => [
        {
          prenom: 'Christelle',
          nom: 'Bateau',
        },
        {
          prenom: 'Charles',
          nom: 'Desmoulins',
        }
      ]
    };

    const structureId = '62a46ca2af2829d3cd298305';

    const expectedPermanenceDetails = {
      adresse: '12 RUE DE LA PLACE, 87100 LIMOGES',
      nom: 'Aide rurale',
      email: 'john.doe@aide-rurale.net',
      nombreCnfs: 2,
      cnfs: [
        {
          prenom: 'Christelle',
          nom: 'Bateau',
        },
        {
          prenom: 'Charles',
          nom: 'Desmoulins',
        }
      ]
    };

    const details = await permanenceDetailsFromStructureId(structureId, permanenceRepository);

    expect(details).toStrictEqual(expectedPermanenceDetails);
  });

  it('devrait retourner le détail de la permanence sans email', async () => {
    const permanenceRepository = {
      getStructureById: () => ({
        nom: 'Aide rurale',
        contact: {
          telephone: '0423456897'
        },
        insee: {
          etablissement: {
            adresse: {
              numero_voie: '12',
              type_voie: 'RUE',
              nom_voie: 'DE LA PLACE',
              complement_adresse: null,
              code_postal: '87100',
              localite: 'LIMOGES',
              code_insee_localite: '87085',
              cedex: null
            }
          }
        }
      }),
      getCnfs: () => [
        {
          prenom: 'Christelle',
          nom: 'Bateau',
        },
        {
          prenom: 'Charles',
          nom: 'Desmoulins',
        },
        {
          prenom: 'Amélie',
          nom: 'Dumont',
        }
      ]
    };

    const structureId = '62a46ca2af2829d3cd298305';

    const expectedPermanenceDetails = {
      adresse: '12 RUE DE LA PLACE, 87100 LIMOGES',
      nom: 'Aide rurale',
      telephone: '04 23 45 68 97',
      nombreCnfs: 3,
      cnfs: [
        {
          prenom: 'Christelle',
          nom: 'Bateau',
        },
        {
          prenom: 'Charles',
          nom: 'Desmoulins',
        },
        {
          prenom: 'Amélie',
          nom: 'Dumont',
        }
      ]
    };

    const details = await permanenceDetailsFromStructureId(structureId, permanenceRepository);

    expect(details).toStrictEqual(expectedPermanenceDetails);
  });
});

describe('détails de la permanence avec l\'identifiant de la permanence', () => {
  it('devrait retourner le détail de la permanence', async () => {
    const permanence = {
      nomEnseigne: 'CCAS des HERBIERS',
      numeroTelephone: '0653658996',
      email: 'structure@mailgenerique.com',
      adresse: {
        numeroRue: '6',
        rue: 'RUE DU TOURNIQUET',
        codePostal: '85500',
        ville: 'LES HERBIERS'
      },
      location: {
        type: 'Point',
        coordinates: [
          -1.0134,
          46.8691
        ],
      },
      horaires: [
        {
          matin: [
            '8:00',
            '12:30'
          ],
          apresMidi: [
            '13:30',
            '18:00'
          ]
        },
        {
          matin: [
            '8:00',
            '12:30'
          ],
          apresMidi: [
            '13:30',
            '18:00'
          ]
        },
        {
          matin: [
            '8:00',
            '12:30'
          ],
          apresMidi: [
            '13:30',
            '18:00'
          ]
        },
        {
          matin: [
            '8:00',
            '12:30'
          ],
          apresMidi: [
            '13:30',
            '18:00'
          ]
        },
        {
          matin: [
            '8:00',
            '12:30'
          ],
          apresMidi: [
            '13:30',
            '18:00'
          ]
        },
        {
          matin: [
            'Fermé',
            'Fermé'
          ],
          apresMidi: [
            'Fermé',
            'Fermé'
          ]
        },
        {
          matin: [
            'Fermé',
            'Fermé'
          ],
          apresMidi: [
            'Fermé',
            'Fermé'
          ]
        }
      ],
      typeAcces: 'libre',
      conseillers: [
        {
          prenom: 'Christelle',
          nom: 'Bateau',
        }
      ],
      siteWeb: 'https://ccas-des-herbiers.com',
    };

    const expectedPermanenceDetails = {
      adresse: '6 RUE DU TOURNIQUET, 85500 LES HERBIERS',
      coordinates: [
        -1.0134,
        46.8691
      ],
      nom: 'CCAS des HERBIERS',
      email: 'structure@mailgenerique.com',
      telephone: '06 53 65 89 96',
      siteWeb: 'https://ccas-des-herbiers.com',
      typeAcces: 'libre',
      openingHours: [
        '8h00 - 12h30 | 13h30 - 18h00',
        '8h00 - 12h30 | 13h30 - 18h00',
        '8h00 - 12h30 | 13h30 - 18h00',
        '8h00 - 12h30 | 13h30 - 18h00',
        '8h00 - 12h30 | 13h30 - 18h00'
      ],
      nombreCnfs: 1,
      cnfs: [
        {
          prenom: 'Christelle',
          nom: 'Bateau',
        }
      ]
    };

    const details = await permanenceDetails(permanence);

    expect(details).toStrictEqual(expectedPermanenceDetails);
  });

  it('devrait retourner le détail de la permanence sans horaires', async () => {
    const permanence = {
      nomEnseigne: 'CCAS des HERBIERS',
      numeroTelephone: '0653658996',
      email: 'structure@mailgenerique.com',
      adresse: {
        numeroRue: '6',
        rue: 'RUE DU TOURNIQUET',
        codePostal: '85500',
        ville: 'LES HERBIERS'
      },
      location: {
        type: 'Point',
        coordinates: [
          -1.0134,
          46.8691
        ],
      },
      typeAcces: 'libre',
      conseillers: [
        {
          prenom: 'Christelle',
          nom: 'Bateau',
        }
      ],
      siteWeb: 'https://ccas-des-herbiers.com',
    };

    const expectedPermanenceDetails = {
      adresse: '6 RUE DU TOURNIQUET, 85500 LES HERBIERS',
      coordinates: [
        -1.0134,
        46.8691
      ],
      nom: 'CCAS des HERBIERS',
      email: 'structure@mailgenerique.com',
      telephone: '06 53 65 89 96',
      siteWeb: 'https://ccas-des-herbiers.com',
      typeAcces: 'libre',
      openingHours: [],
      nombreCnfs: 1,
      cnfs: [
        {
          prenom: 'Christelle',
          nom: 'Bateau',
        }
      ]
    };

    const details = await permanenceDetails(permanence);

    expect(details).toStrictEqual(expectedPermanenceDetails);
  });

  it('devrait retourner le détail de la permanence sans conseillers', async () => {
    const permanence = {
      nomEnseigne: 'CCAS des HERBIERS',
      numeroTelephone: '0653658996',
      email: 'structure@mailgenerique.com',
      adresse: {
        numeroRue: '6',
        rue: 'RUE DU TOURNIQUET',
        codePostal: '85500',
        ville: 'LES HERBIERS'
      },
      location: {
        type: 'Point',
        coordinates: [
          -1.0134,
          46.8691
        ],
      },
      typeAcces: 'libre',
      siteWeb: 'https://ccas-des-herbiers.com',
    };

    const expectedPermanenceDetails = {
      adresse: '6 RUE DU TOURNIQUET, 85500 LES HERBIERS',
      coordinates: [
        -1.0134,
        46.8691
      ],
      nom: 'CCAS des HERBIERS',
      email: 'structure@mailgenerique.com',
      telephone: '06 53 65 89 96',
      siteWeb: 'https://ccas-des-herbiers.com',
      typeAcces: 'libre',
      openingHours: [],
      nombreCnfs: 0,
      cnfs: []
    };

    const details = await permanenceDetails(permanence);

    expect(details).toStrictEqual(expectedPermanenceDetails);
  });

  it('devrait retourner le détail de la permanence sans informations de contact', async () => {
    const permanence = {
      nomEnseigne: 'CCAS des HERBIERS',
      adresse: {
        numeroRue: '6',
        rue: 'RUE DU TOURNIQUET',
        codePostal: '85500',
        ville: 'LES HERBIERS'
      },
      location: {
        type: 'Point',
        coordinates: [
          -1.0134,
          46.8691
        ],
      },
      typeAcces: 'libre'
    };

    const expectedPermanenceDetails = {
      adresse: '6 RUE DU TOURNIQUET, 85500 LES HERBIERS',
      coordinates: [
        -1.0134,
        46.8691
      ],
      nom: 'CCAS des HERBIERS',
      typeAcces: 'libre',
      openingHours: [],
      nombreCnfs: 0,
      cnfs: []
    };

    const details = await permanenceDetails(permanence);

    expect(details).toStrictEqual(expectedPermanenceDetails);
  });
});
