const _ = require('underscore'),
      ids = require('../lib/ids'),
      logger = require('../lib/logger'),
      messages = require('../lib/messages'),
      utils = require('../lib/utils');

const DEFAULT_ID_LENGTH = 5,
      MAX_IDS_TO_CACHE = 100;

// Developers NB: if you set the cache size too high it will take forever
// or potentially be impossible to actually generate enough unique randomly
// generated ids.
if (MAX_IDS_TO_CACHE * 10 > Math.pow(10, DEFAULT_ID_LENGTH)) {
  throw new Error('MAX_IDS_TO_CACHE too high compared to DEFAULT_ID_LENGTH');
}

console.log('Initialing utils and id cache');
let idCache = new Set(),
    currentIdLength = DEFAULT_ID_LENGTH;
/*
 * Given a collection of ids return an array of those not used already
 */
const findUnusedIds = (db, ids, callback) => {
  if (ids instanceof Set) {
    ids = [...ids];
  }

  db.medic.view('medic', 'registered_patients', {
    keys: ids
  }, (err, results) => {
    if (err) {
      return callback(err);
    }

    const uniqueIds = _.reject(ids, id => {
      return _.find(results.rows, registration => registration.key === id);
    });

    callback(null, uniqueIds);
  });
};

const replenishCache = (db, callback) => {
  logger.debug('replenishCache called');
  const freshIds = new Set();
  do {
    freshIds.add(ids.generate(currentIdLength));
  } while (freshIds.size < MAX_IDS_TO_CACHE);

  findUnusedIds(db, freshIds, (err, uniqueIds) => {
    if (err) {
      return callback(err);
    }

    idCache = new Set(uniqueIds);
    callback(null, idCache.size);
  });
};

module.exports = {
  _clearCache: () => { idCache = new Set(); },
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
    db.medic.view('medic', 'registered_patients', {
      key: id
    }, (err, registrations) => {
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
    if (!idCache.size) {
      return replenishCache(db, (err, newCacheSize) => {
        if (err) {
          return callback(err);
        }

        if (!newCacheSize) {
          logger.warn('Could not create a unique id of length ' + currentIdLength + ', increasing length');
          currentIdLength += 1;
        }

        return module.exports.addUniqueId(db, doc, callback);
      });
    }

    const nextId = idCache.values().next().value;
    doc.patient_id = nextId;
    idCache.delete(nextId);
    callback();
  }
};
