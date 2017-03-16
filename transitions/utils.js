var _ = require('underscore'),
    ids = require('../lib/ids'),
    logger = require('../lib/logger'),
    messages = require('../lib/messages'),
    utils = require('../lib/utils');

var DEFAULT_ID_LENGTH = 5;
var IDS_TO_GENERATE = 5;
var currentIdLength = DEFAULT_ID_LENGTH;

module.exports = {
  /*
    Adds a "message" and "error" of the configured key to the report. This
    indicates something went wrong, and the key indicates what went wrong.
  */
  addRejectionMessage: function(document, reportConfig, errorKey) {
    var foundMessage = {
      doc: document,
      message: 'messages.generic.' + errorKey,
      phone: messages.getRecipientPhone(document, 'from')
    };

    _.each(reportConfig.messages, function(msg) {
      if (msg.event_type === errorKey) {
        foundMessage = {
          doc: document,
          message: messages.getMessage(msg, utils.getLocale(document)),
          phone: messages.getRecipientPhone(document, msg.recipient)
        };
      }
    });

    // A "message" ends up being a doc.task, which is something that is sent to
    // the caller via SMS
    messages.addMessage(foundMessage);
    // An "error" ends up being a doc.error, which is something that is shown
    // on the screen when you view the error. We need both
    messages.addError(foundMessage.doc, foundMessage.message);
  },
  addRegistrationNotFoundError: function(document, reportConfig) {
    module.exports.addRejectionMessage(document, reportConfig, 'registration_not_found');
  },
  isIdUnique: function(db, id, callback){
    utils.getRegistrations({
        db: db,
        id: id
    }, function(err, registrations) {
        if (err) {
            callback(err);
        } else if (registrations.length) {
            callback(null, false);
        } else {
            callback(null, true);
        }
    });
  },
  addUniqueId: function(db, doc, callback) {
    var potentialIds = _.map(Array(IDS_TO_GENERATE), _.partial(ids.generate, currentIdLength));

    utils.getRegistrations({
        db: db,
        ids: potentialIds
    }, function(err, registrations) {
        if (err) {
            return callback(err);
        }

        var uniqueIds = _.reject(potentialIds, function(id) {
          return _.find(registrations, function(registration) {
            return registration.key === id;
          });
        });

        if (!uniqueIds.length) { // id collision, retry
            logger.warn('Could not create a unique id of length ' + currentIdLength + ', increasing by one');
            currentIdLength += 1;
            module.exports.addUniqueId(db, doc, callback);
        } else {
            doc.patient_id = uniqueIds[0];
            callback();
        }
    });
  }
};
