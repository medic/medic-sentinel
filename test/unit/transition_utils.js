const sinon = require('sinon'),
      testUtils = require('../test_utils');

const transitionUtils = require('../../transitions/utils.js');

const mockDb = (idFilterLogicFn) => {
  return { medic: { view: sinon.spy((db, view, options, callback) => {

    const ids = options.keys.slice(0);

    const toReturn = {
      rows: idFilterLogicFn(ids).map(id => {return {key: id};})
    };

    callback(null, toReturn);
  })}};
};

exports.tearDown = callback => {
    testUtils.restore([
    ]);

    transitionUtils._clearCache();

    callback();
};

module.exports['addUniqueId sets an id onto a doc'] = test => {
  const doc = {};

  let potentialIds;
  const db = mockDb((ids) => {
    potentialIds = ids;
    return [];
  });

  transitionUtils.addUniqueId(db, doc, (err, result) => {
    if (err) {
      test.fail('addUniqueId shouldnt error');
    }
    if (result) {
      test.fail('addUniqueId shouldnt return a result, it should set a value on the passed doc');
    }

    test.ok(doc.patient_id, 'patient_id should be set');
    test.ok(potentialIds.includes(doc.patient_id), 'patient_id should come from the generated ids');
    test.done();
  });
};

module.exports['addUniqueId doesnt use ids that are already used by the DB'] = test => {
  const doc = {};

  let idToUse;
  const db = mockDb(ids => {
    idToUse = ids.pop();
    return ids;
  });

  transitionUtils.addUniqueId(db, doc, (err, result) => {
    if (err) {
      test.fail('addUniqueId shouldnt error');
    }
    if (result) {
      test.fail('addUniqueId shouldnt return a result, it should set a value on the passed doc');
    }

    test.equal(doc.patient_id, idToUse);
    test.done();
  });
};

module.exports['addUniqueId retries with a longer id if it only generates duplicates'] = function(test) {
  const doc = {};

  let potentialIds;
  const db = mockDb(ids => {
    if (ids[0].length === 4) {
      return ids;
    }
    potentialIds = ids;
    return [];
  });

  transitionUtils.addUniqueId(db, doc, (err, result) => {
    if (err) {
      test.fail('addUniqueId shouldnt error');
    }
    if (result) {
      test.fail('addUniqueId shouldnt return a result, it should set a value on the passed doc');
    }

    test.ok(doc.patient_id, 'patient_id should be set');
    test.equal(doc.patient_id.length, 5);
    test.ok(potentialIds.includes(doc.patient_id), 'patient_id should come from the generated ids');
    test.done();
  });
};
