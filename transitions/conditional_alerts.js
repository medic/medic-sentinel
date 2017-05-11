var config = require('../config'),
    _ = require('underscore'),
    messages = require('../lib/messages'),
    utils = require('../lib/utils'),
    async = require('async'),
    vm = require('vm');

module.exports = {
    _getConfig: function() {
        return _.extend({}, config.get('alerts'));
    },
    _hasRun: function(doc) {
        // Avoid running forever. Also ignores the error state
        // (doc.transitions.conditional_alerts.ok) of the previous run.
        return Boolean(
            doc &&
            doc.transitions &&
            doc.transitions.conditional_alerts
        );
    },
    _runCondition: function(condition, context) {
        try {
            return Promise.resolve(vm.runInNewContext(condition, context));
        } catch(e) {
            return Promise.reject(e.message);
        }
    },
    _evaluateCondition: function(doc, alert) {
        var context = { doc: doc };
        if (alert.condition.indexOf(alert.form) === -1) {
            return module.exports._runCondition(alert.condition, context);
        }
        return new Promise((resolve, reject) => {
            utils.getRecentForm({ doc: doc, formName: alert.form }, function(err, rows) {
                if (err) {
                    return reject(err);
                }
                rows = _.sortBy(rows, function(row) {
                    return row.reported_date;
                });
                context[alert.form] = function(i) {
                    var row = rows[rows.length - 1 - i];
                    return row ? row.doc : row;
                };
                return module.exports._runCondition(alert.condition, context);
            });
        });
    },
    filter: function(doc) {
        var self = module.exports;
        return Boolean(
            doc &&
            doc.form &&
            doc.type === 'data_record' &&
            !self._hasRun(doc)
        );
    },
    onMatch: function(change, db, audit, cb) {
        var doc = change.doc,
            config = module.exports._getConfig(),
            updated = false;

        async.each(
            _.values(config),
            function(alert, callback) {
                if (alert.form !== doc.form) {
                    return callback();
                }
                module.exports._evaluateCondition(doc, alert)
                    .then(result => {
                        if (!result) {
                            return;
                        }
                        return messages.getRecipientPhone(
                            doc, 
                            alert.recipient, 
                            alert.recipient
                        )
                        .then(phone => {
                            return messages.addMessage({
                                doc: doc,
                                phone: phone,
                                message: alert.message
                            });
                        })
                        .then(() => {
                            updated = true;
                            callback();
                        });
                    })
                    .catch(callback);
            }, 
            function(err) {
                cb(err, updated);
            }
        );

    }
};
