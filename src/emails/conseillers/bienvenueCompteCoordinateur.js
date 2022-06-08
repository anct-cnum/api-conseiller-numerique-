module.exports = (db, mailer) => {

  const templateName = 'bienvenueCompteCoordinateur';
  const { utils } = mailer;

  let render = () => {
    return mailer.render(__dirname, templateName, { });
  };

  return {
    templateName,
    render,
    send: async (email, id) => {

      let onSuccess = async () => {
        await db.collection('users').updateOne(
          { '_id': id },
          { $set: { 'mailCoordinateurSent': true } });
      };

      let onError = async err => {
        utils.setSentryError(err);
      };
      return mailer.createMailer().sendEmail(
        email,
        {
          subject: 'Bienvenue sur votre espace Admin Coop',
          body: await render(),
        },
      )
      .then(onSuccess)
      .catch(onError);
    },
  };
};
