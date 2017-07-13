const vm = require('vm'),
      _ = require('underscore'),
      async = require('async'),
      config = require('../config'),
      lineage = require('../lib/lineage'),
      logger = require('../lib/logger'),
      messages = require('../lib/messages'),
      utils = require('../lib/utils'),
      transitionUtils = require('./utils'),
      NAME = 'multi_form_alerts',
      BATCH_SIZE = 100;

const getAlertConfig = () => config.get('multi_form_alerts');

/* Returned list does not include the change.doc. */
const fetchReports = (latestTimestamp, timeWindowInDays, formTypes, options) => {
  return utils.getReportsWithinTimeWindow(latestTimestamp, timeWindowInDays, options)
    .then((reports) => {
      if (formTypes && formTypes.length) {
        return reports.filter((report) => report.form && formTypes.includes(report.form));
      }
      return reports;
    })
    .then(lineage.hydrateDocs);
};

const countReports = (reports, latestReport, script) => {
  return reports.filter((report) => {
    const context = { report: report, latestReport: latestReport };
    try {
      return script.runInNewContext(context);
    } catch(err) {
      logger.error(`Could not eval "isReportCounted" function for (report=${context.report._id}, latestReport=${context.latestReport._id}). Report will not be counted. Error: ${err.message}`);
      return false;
    }
  });
};

const generateMessages = (recipients, messageTemplate, countedReports) => {
  let isLatestReportChanged = false;
  const phones = getPhones(recipients, countedReports);
  phones.forEach((phone) => {
    if (phone.error) {
      logger.error(phone.error);
      messages.addError(countedReports[0], phone.error);
      isLatestReportChanged = true;
      return;
    }
    messages.addMessage({
      doc: countedReports[0],
      phone: phone,
      message: messageTemplate,
      options: {countedReports: countedReports}
    });
    isLatestReportChanged = true;
  });
  return isLatestReportChanged;
};

// Recipients format examples:
// [
//    '+254777888999',
//    'countedReports[0].contact.parent.parent.contact.phone',   // returns string
//    'countedReports[0].contact.parent.parent.alertRecipients', // returns string array
//    'countedReports.map((report) => report.contact.phone)'     // returns string array
// ]
const getPhones = (recipients, countedReports) => {
  return _.uniq(getPhonesWithDuplicates(recipients, countedReports));
};

const getPhonesWithDuplicates = (recipients, countedReports) => {
  const getPhonesOneRecipient = (recipient, countedReports) => {
    if (!recipient) {
      return [];
    }

    if (/^\+[0-9]+$/.exec(recipient)) {
      return [recipient];
    }

    const context = { countedReports: countedReports };
    try {
      const evaled = vm.runInNewContext(recipient, context);
      if (_.isString(evaled)) {
        return [evaled];
      }
      if (_.isArray(evaled)) {
        return evaled.map((shouldBeAString) => {
          if (!_.isString(shouldBeAString)) {
            return { error: `multi_form_alerts : one of the phone numbers for "${recipient}"` +
              ` is not a string. Message will not be sent. Found : ${JSON.stringify(shouldBeAString)}` };
          }
          return shouldBeAString;
        });
      }
      return { error: `multi_form_alerts : phone number for "${recipient}"` +
        ` is not a string or array of strings. Message will not be sent. Found: "${JSON.stringify(evaled)}"` };
    } catch(err) {
      return { error: `multi_form_alerts : Could not find a phone number for "${recipient}". ` +
        `Message will not be sent. Error: "${err.message}"` };
    }
  };

  if (!recipients) {
    return [];
  }

  if (_.isArray(recipients)) {
    return _.flatten(
      recipients.map(_.partial(getPhonesOneRecipient, _, countedReports)));
  }

  return getPhonesOneRecipient(recipients, countedReports);
};

const validateConfig = (alert) => {
  if (!alert.isReportCounted ||
      !alert.numReportsThreshold ||
      !alert.message ||
      !alert.recipients ||
      !alert.timeWindowInDays) {
    throw new Error(`Bad config for multi_form_alerts. Expecting fields isReportCounted, ` +
      `numReportsThreshold, message, recipients, timeWindowInDays. Found ${JSON.stringify(alert)}`);
  }
  alert.timeWindowInDays = parseInt(alert.timeWindowInDays);
  if (isNaN(alert.timeWindowInDays)) {
    throw new Error('Bad config for multi_form_alerts. Expecting "timeWindowInDays" to be an integer. ' +
      'E.g "timeWindowInDays": "3"');
  }
  alert.numReportsThreshold = parseInt(alert.numReportsThreshold);
  if (isNaN(alert.numReportsThreshold)) {
    throw new Error('Bad config for multi_form_alerts. Expecting "numReportsThreshold" to be an integer. ' +
      'E.g "numReportsThreshold": "3"');
  }
  if(!_.isArray(alert.recipients)) {
    throw new Error('Bad config for multi_form_alerts. Expecting "recipients" to be an array of strings. ' +
      'E.g "recipients": ["+9779841452277", "countedReports[0].contact.phone"]');
  }
  if (alert.forms && (!_.isArray(alert.forms))) {
    alert.forms = null;
    logger.warn('Bad config for multi_form_alerts. Expecting "forms" to be an array of form codes. Continuing without "forms", since it\'s optional.');
  }
};

const count = (alert, latestReport) => {
  return new Promise((resolve, reject) => {
    const script = vm.createScript(`(${alert.isReportCounted})(report, latestReport)`);
    let total = countReports([ latestReport ], latestReport, script);
    let skip = 0;
    async.doWhilst(
      callback => {
        const options = { skip: skip, limit: BATCH_SIZE };
        fetchReports(latestReport.reported_date - 1, alert.timeWindowInDays, alert.forms, options)
          .then(fetched => callback(null, fetched))
          .catch(callback);
      },
      fetched => {
        const countedReports = countReports(fetched, latestReport, script);
        total = total.concat(countedReports);
        skip += BATCH_SIZE;
        return fetched.length === BATCH_SIZE;
      },
      err => {
        if (err) {
          return reject(err);
        }
        resolve(total);
      }
    );
  });
};

/* Return true if the doc has been changed. */
const runOneAlert = (alert, latestReport) => {
  if (alert.forms && alert.forms.length && !alert.forms.includes(latestReport.form)) {
    return Promise.resolve(false);
  }
  return count(alert, latestReport).then(total => {
    if (total.length >= alert.numReportsThreshold) {
      return generateMessages(alert.recipients, alert.message, total);
    }
    return false;
  });
};

const onMatch = (change, db, audit, callback) => {
  const latestReport = change.doc;
  const alertConfig = getAlertConfig();
  const errors = [];
  let docNeedsSaving = false;
  let promiseSeries = Promise.resolve();
  alertConfig.forEach((alert) => {
    promiseSeries = promiseSeries.then(() => {
      validateConfig(alert);
      return runOneAlert(alert, latestReport)
        .then(isDocChangedByOneAlert => {
          docNeedsSaving = docNeedsSaving || isDocChangedByOneAlert;
        })
        .catch(errors.push);
    });
  });
  promiseSeries.then(() => {
    if (errors.length) {
      return callback(errors, true);
    }
    callback(null, docNeedsSaving);
  })
  .catch((err) => {
    callback(err, false);
  });
};

module.exports = {
  filter: doc => !!(
    doc &&
    doc.form &&
    doc.type === 'data_record' &&
    !transitionUtils.hasRun(doc, NAME)
  ),
  onMatch: onMatch
};
