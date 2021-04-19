let { delay } = require('../../../../utils');

module.exports = async (db, logger, emails, action, options = {}) => {

  let stats = {
    total: 0,
    sent: 0,
    error: 0,
  };

  let cursor = await db.collection('users').find({
    ...action.getQuery(),
  });
  if (options.limit) {
    cursor.limit(options.limit);
  }
  cursor.batchSize(10);

  while (await cursor.hasNext()) {
    let admin = await cursor.next();
    logger.info(`Sending email to admin user ${admin.name}`);

    stats.total++;
    try {
      let message = emails.getEmailMessageByTemplateName('creationCompteAdmin');
      await message.send(admin);

      if (options.delay) {
        await delay(options.delay);
      }
      stats.sent++;
    } catch (err) {
      logger.error(err);
      stats.error++;
    }
  }
  return stats;
};
