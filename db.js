var nano = require('nano'),
	url = require('url'),
    path = require('path'),
    request = require('request');

var couchUrl = process.env.COUCH_URL;
var ftiUrl = process.env.FTI_URL;

if (couchUrl) {
    // strip trailing slash from to prevent bugs in path matching
    couchUrl = couchUrl.replace(/\/$/, '');
    var baseUrl = couchUrl.substring(0, couchUrl.indexOf('/', 10));
    var parsedUrl = url.parse(couchUrl);

    ftiUrl = ftiUrl || baseUrl.replace('5984', '5986');

    module.exports = nano(baseUrl);
    module.exports.medic = nano(couchUrl);

    var dbName = parsedUrl.path.replace('/','');
    module.exports.settings = {
        protocol: parsedUrl.protocol,
        port: parsedUrl.port,
        host: parsedUrl.hostname,
        db: dbName,
        auditDb: dbName + '-audit',
        ddoc: 'medic'
    };

    if (parsedUrl.auth) {
        var index = parsedUrl.auth.indexOf(':');
        module.exports.settings.username = parsedUrl.auth.substring(0, index);
        module.exports.settings.password = parsedUrl.auth.substring(index + 1);
    }

    module.exports.fti = function(index, data, cb) {
        var uri = ftiUrl + '/' + path.join('/_fti/local', module.exports.settings.db,
                                           '_design', module.exports.settings.ddoc, index);
        request({ url: uri, qs: data }, function(err, response, result) {
            if (!err) {
                try {
                    result = JSON.parse(result);
                } catch (e) {
                    cb(e);
                }
            }
            cb(err, result);
        });
    };
    module.exports.config = function(cb) {
        module.exports.request({ path: '/_config' }, cb);
    };
} else if (process.env.TEST_ENV) {
    // Running tests only
    module.exports = {
        fti: function() {},
        medic: {
            view: function() {},
            get: function() {},
            insert: function() {}
        },
        settings: {}
    };
} else {
    console.log(
        'Please define a COUCH_URL in your environment e.g. \n' +
        'export COUCH_URL="http://admin:123qwe@localhost:5984/medic"\n' +
        'If you are running tests use TEST_ENV=1 in your environment.\n'
    );
    process.exit(1);
}
