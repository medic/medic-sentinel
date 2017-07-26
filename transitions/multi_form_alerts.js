const vm = require('vm'),
      _ = require('underscore'),
      async = require('async'),
      config = require('../config'),
      lineage = require('../lib/lineage'),
      logger = require('../lib/logger'),
      messages = require('../lib/messages'),
      utils = require('../lib/utils'),
      transitionUtils = require('./utils'),
      TRANSITION_NAME = 'multi_form_alerts',
      BATCH_SIZE = 100,
      requiredFields = [
        'isReportCounted',
        'name',
        'numReportsThreshold',
        'message',
        'recipients',
        'timeWindowInDays'
      ];

const getAlertConfig = () => config.get(TRANSITION_NAME);

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

const generateMessages = (alert, phones, countedReports) => {
  let isLatestReportChanged = false;
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
      message: alert.message,
      templateContext: {
        countedReports: countedReports,
        alertName: alert.name,
        numReportsThreshold: alert.numReportsThreshold,
        timeWindowInDays: alert.timeWindowInDays
      },
      taskFields: {
        type: 'alert',
        alert_name: alert.name,
        countedReports: countedReports.map(report => report._id)
      }
    });
    isLatestReportChanged = true;
  });
  return isLatestReportChanged;
};

// Recipients format examples:
// [
//    '+254777888999',
//    'countedReport.contact.parent.parent.contact.phone',   // returns string
//    'countedReport.contact.parent.parent.alertRecipients', // returns string array
// ]
const getPhones = (recipients, countedReport) => {
  return _.uniq(getPhonesWithDuplicates(recipients, countedReport));
};

const getPhonesWithDuplicates = (recipients, countedReport) => {
  const getPhonesOneRecipient = (recipient, countedReport) => {
    if (!recipient) {
      return [];
    }

    if (/^\+[0-9]+$/.exec(recipient)) {
      return [recipient];
    }

    const context = { countedReport: countedReport };
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
      recipients.map(_.partial(getPhonesOneRecipient, _, countedReport)));
  }

  return getPhonesOneRecipient(recipients, countedReport);
};

const validateConfig = () => {
  const alertConfig = getAlertConfig();
  const errors = [];
  alertConfig.forEach((alert, idx) => {
    requiredFields.forEach(field => {
      if (!alert[field]) {
        errors.push(`Alert number ${idx}, expecting fields: ${requiredFields.join(', ')}`);
      }
    });
    alert.timeWindowInDays = parseInt(alert.timeWindowInDays);
    if (isNaN(alert.timeWindowInDays)) {
      errors.push(`Alert "${alert.name}", expecting "timeWindowInDays" to be an integer, eg: "timeWindowInDays": "3"`);
    }
    alert.numReportsThreshold = parseInt(alert.numReportsThreshold);
    if (isNaN(alert.numReportsThreshold)) {
      errors.push(`Alert "${alert.name}", expecting "numReportsThreshold" to be an integer, eg: "numReportsThreshold": "3"`);
    }
    if(!_.isArray(alert.recipients)) {
      errors.push(`Alert "${alert.name}", expecting "recipients" to be an array of strings, eg: "recipients": ["+9779841452277", "countedReports[0].contact.phone"]`);
    }
    if (alert.forms && (!_.isArray(alert.forms))) {
      alert.forms = null;
      logger.warn(`Bad config for ${TRANSITION_NAME}, alert "${alert.name}". Expecting "forms" to be an array of form codes. Continuing without "forms", since it\'s optional.`);
    }
  });

  const names = alertConfig.map(alert => alert.name);
  if (_.uniq(names).length !== names.length) {
    errors.push(`Alert names should be unique. Found names: ${names}`);
  }

  if (errors.length) {
    logger.error(`Validation failed for ${TRANSITION_NAME} transition`);
    logger.error(errors.join('\n'));
    throw new Error(`Validation failed for ${TRANSITION_NAME} transition`);
  }
};

/**
 * Returns { countedReports, phones }.
 */
const getCountedReportsAndPhones = (alert, latestReport) => {
  return new Promise((resolve, reject) => {
    const script = vm.createScript(`(${alert.isReportCounted})(report, latestReport)`);
    let skip = 0;
    let countedReports = [];
    let phones = [];
    async.doWhilst(
      callback => {
        getCountedReportsAndPhonesBatch(script, latestReport, alert, skip)
          .then(output => {
            countedReports = countedReports.concat(output.countedReports);
            phones = phones.concat(output.phones);
            callback(null, output.numFetched);
          })
          .catch(callback);
      },
      numFetched => {
        skip += BATCH_SIZE;
        return numFetched === BATCH_SIZE;
      },
      err => {
        if (err) {
          return reject(err);
        }
        resolve({ countedReports: countedReports, phones: _.uniq(phones) });
      }
    );
  });
};

/**
 * Returns Promise({ numFetched, countedReports, phones }) for the db batch with skip value.
 */
const getCountedReportsAndPhonesBatch = (script, latestReport, alert, skip) => {
  const options = { skip: skip, limit: BATCH_SIZE };
  const output = { countedReports: [ latestReport ] };
  return fetchReports(latestReport.reported_date - 1, alert.timeWindowInDays, alert.forms, options)
    .then(fetched => {
      output.numFetched = fetched.length;
      output.countedReports = output.countedReports.concat(countReports(fetched, latestReport, script));
    })
    .then(() => {
      output.phones = [];
      output.countedReports.forEach(countedReport => {
        const phonesForReport = getPhones(alert.recipients, countedReport);
        output.phones = output.phones.concat(phonesForReport);
      });
      output.phones = _.uniq(output.phones);
      return output;
    });
};

/* Return true if the doc has been changed. */
const runOneAlert = (alert, latestReport) => {
  if (alert.forms && alert.forms.length && !alert.forms.includes(latestReport.form)) {
    return Promise.resolve(false);
  }
  return getCountedReportsAndPhones(alert, latestReport).then(output => {
    if (output.countedReports.length >= alert.numReportsThreshold) {
      return generateMessages(alert, output.phones, output.countedReports);
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
  alertConfig.forEach(alert => {
    promiseSeries = promiseSeries.then(() => {
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
    !transitionUtils.hasRun(doc, TRANSITION_NAME)
  ),
  onMatch: onMatch,
  init: validateConfig
};
