var nano = require('nano'),
	url = require('url'),
    path = require('path'),
    request = require('request');

var couchUrl = process.env.COUCH_URL;
if (couchUrl) {
    // strip trailing slash from to prevent bugs in path matching
    couchUrl = couchUrl.replace(/\/$/, '');
    var parsedUrl = url.parse(couchUrl);
    var baseUrl = couchUrl.substring(0, couchUrl.indexOf('/', 10));
    var luceneUrl = baseUrl.replace('5984', '5985');

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
        var uri = path.join('local', module.exports.settings.db, '_design',
                            module.exports.settings.ddoc, index);
        var url = luceneUrl + '/' + uri;

        if (data.q && !data.limit) {
            data.limit = 1000;
        }
        var opts = { url: url };
        if (data.q) {
            opts.method = 'post';
            opts.form = data;
        } else {
            opts.qs = data;
        }

        request(opts, function(err, response, result) {
            if (err) {
                // the request itself failed
                console.error(err);
                return cb(new Error('Error when making lucene request'));
            }
            try {
                result = JSON.parse(result);
            } catch (e) {
                return cb(e);
            }
            if (data.q && !result.rows) {
                // the query failed for some reason
                return cb(result);
            }
            cb(null, result);
        });
    };
} else if (process.env.TEST_ENV) {
    // Running tests only
    module.exports = {
        use: function() {},
        fti: function() {},
        medic: {
            view: function() {},
            get: function() {},
            insert: function() {},
            fetch: function() {}
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
