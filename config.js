const _ = require('underscore'),
      follow = require('follow'),
      db = require('./db'),
      logger = require('./lib/logger'),
      defaults = require('./defaults'),
      translations = {},
      SETTINGS_PATH = '_design/medic/_rewrite/app_settings/medic';

let config = require('./defaults');

const loadTranslations = function() {
  const options = {
    startkey: [ 'translations', false ],
    endkey: [ 'translations', true ],
    include_docs: true
  };
  db.medic.view('medic-client', 'doc_by_type', options, function(err, result) {
    if (err) {
      logger.error('Error loading translations - starting up anyway', err);
      return;
    }
    result.rows.forEach(function(row) {
      translations[row.doc.code] = row.doc.values;
    });
  });
};

const initFeed = function() {
  // Use since=now on ddoc listener so we don't replay an old change.
  const feed = new follow.Feed({ db: process.env.COUCH_URL, since: 'now' });
  feed.on('change', function(change) {
    if (change.id === '_design/medic') {
      logger.info('Reloading configuration');
      initConfig(function(err) {
        if (err) {
          console.error('Error loading configuration. Exiting...');
          process.exit(0);
        }
      });
    } else if (change.id.indexOf('messages-') === 0) {
      logger.info('Detected translations change - reloading');
      loadTranslations();
    }
  });
  feed.follow();
};

const initConfig = function(callback) {
  db.medic.get(SETTINGS_PATH, function(err, data) {
    if (err) {
      return callback(err);
    }
    _.defaults(data.settings, defaults);
    config = data.settings;
    logger.debug(
      'Reminder messages allowed between %s:%s and %s:%s',
      config.schedule_morning_hours,
      config.schedule_morning_minutes,
      config.schedule_evening_hours,
      config.schedule_evening_minutes
    );
    callback();
  });
};

module.exports = {
  _initConfig: initConfig,
  _initFeed: initFeed,
  get: function(key) {
    return config[key];
  },
  getTranslations: function() {
    return translations;
  },
  init: function(callback) {
    initFeed();
    loadTranslations();
    initConfig(callback);
  }
};
