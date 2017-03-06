var _ = require('underscore'),
    ids = require('../lib/ids'),
    logger = require('../lib/logger'),
    messages = require('../lib/messages'),
    utils = require('../lib/utils');

module.exports = {
  addRegistrationNotFoundMessage: function(document, reportConfig) {
    var not_found_msg,
      default_msg = {
        doc: document,
        message: 'sys.registration_not_found',
        phone: messages.getRecipientPhone(document, 'from')
      };
    _.each(reportConfig.messages, function(msg) {
      if (msg.event_type === 'registration_not_found') {
        not_found_msg = {
          doc: document,
          message: messages.getMessage(msg, utils.getLocale(document)),
          phone: messages.getRecipientPhone(document, msg.recipient)
        };
      }
    });
    if (not_found_msg) {
      messages.addMessage(not_found_msg);
      messages.addError(not_found_msg.doc, not_found_msg.message);
    } else {
      messages.addMessage(default_msg);
      messages.addError(default_msg.doc, default_msg.message);
    }
  },
  addUniqueId: function(db, doc, callback) {
    var id = ids.generate(doc._id);

    utils.getRegistrations({
        db: db,
        id: id
    }, function(err, registrations) {
        if (err) {
            callback(err);
        } else if (registrations.length) { // id collision, retry
            logger.warn('Registration ID ' + id + ' is not unique, retrying...');
            module.exports.addUniqueId(db, doc, callback);
        } else {
            doc.patient_id = id;
            callback();
        }
    });
  }
};
