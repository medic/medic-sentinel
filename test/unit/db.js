var db = require('../../db');

var fakeFelix = function(dbStub) {
    return {
        createClient: function() {
            return {
                db: function() {
                    return dbStub;
                }
            };
        }
    };
};

var runViewTest = function(test, testObj) {
    test.expect(2);
    var felix = fakeFelix({
        view: function(design, view, query, cb) {
            cb(testObj.err, testObj.result);
        }
    });
    db.makeDbForTesting(felix).view(null, null, null, function(err, result) {
        test.deepEqual(err, testObj.expectedErr);
        test.deepEqual(result, testObj.expectedResult);
        test.done();
    });
};

var runGetDocTest = function(test, testObj) {
    test.expect(2);
    var felix = fakeFelix({
        getDoc: function(id, doc, cb) {
            cb(testObj.err, testObj.result);
        }
    });
    db.makeDbForTesting(felix).getDoc(null, null, function(err, result) {
        test.deepEqual(err, testObj.expectedErr);
        test.deepEqual(result, testObj.expectedResult);
        test.done();
    });
};

exports.setUp = function(callback) {
    process.env.TEST_ENV = true;
    callback();
};

exports.tearDown = function(callback) {
    callback();
};

exports['when felix view query returns (undefined, result), we pass it on to callback'] = function(test) {
    runViewTest(test,
    {
        err: undefined,
        result: { aaa: 'bbb' },
        expectedErr: undefined,
        expectedResult: { aaa: 'bbb' }
    });
};

exports['when felix getDoc query returns (undefined, result), we pass it on to callback'] = function(test) {
    runGetDocTest(test,
    {
        err: undefined,
        result: { aaa: 'bbb' },
        expectedErr: undefined,
        expectedResult: { aaa: 'bbb' }
    });
};

exports['when felix view query returns (err, undefined), we pass it on to callback'] = function(test) {
    runViewTest(test,
    {
        err: { aaa: 'bbb' },
        result: undefined,
        expectedErr: { aaa: 'bbb' },
        expectedResult: undefined
    });
};

exports['when felix getDoc query returns (err, undefined), we pass it on to callback'] = function(test) {
    runGetDocTest(test,
    {
        err: { aaa: 'bbb' },
        result: undefined,
        expectedErr: { aaa: 'bbb' },
        expectedResult: undefined
    });
};

exports['when felix view query returns (undefined, undefined), we return error in callback'] = function(test) {
    test.expect(2);
    var felix = fakeFelix({
        view: function(design, view, query, cb) {
            cb(undefined, undefined);
        }
    });
    db.makeDbForTesting(felix).view(null, null, null, function(err, result) {
        test.ok(!!err);
        test.equals(result, undefined);
        test.done();
    });
};

exports['when felix getDoc query returns (undefined, undefined), we return error in callback'] = function(test) {
    test.expect(2);
    var felix = fakeFelix({
        getDoc: function(id, doc, cb) {
            cb(undefined, undefined);
        }
    });
    db.makeDbForTesting(felix).getDoc(null, null, function(err, result) {
        test.ok(!!err);
        test.equals(result, undefined);
        test.done();
    });
};
