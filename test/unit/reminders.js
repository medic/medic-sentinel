var _ = require('underscore'),
    moment = require('moment'),
    sinon = require('sinon'),
    config = require('../../config'),
    reminders = require('../../schedule/reminders');

exports.setUp = function(callback) {
    process.env.TEST_ENV = true;
    callback();
};

exports['reminders#execute is function'] = function(test) {
    test.ok(_.isFunction(reminders.execute));
    test.done();
}

exports['config with no schedules calls callback'] = function(test) {
    sinon.stub(config, 'get').returns([]);
    sinon.stub(reminders, 'runSchedule').throws();
    reminders.execute({}, function(err) {
        test.equals(err, null);
        reminders.runSchedule.restore();
        config.get.restore();
        test.done();
    });
};

exports['config with three matching schedule calls runSchedule thrice'] = function(test) {
    var runSchedule;

    sinon.stub(config, 'get').returns([ {}, {}, {} ]);
    runSchedule = sinon.stub(reminders, 'runSchedule').callsArgWith(2, null);
    reminders.execute({}, function(err) {
        test.equals(err, null);
        test.equals(runSchedule.callCount, 3);

        runSchedule.restore();
        config.get.restore();

        test.done();
    });
};

exports['runSchedule calls sendReminder when valid'] = function(test) {
    var sendReminders,
        matchSchedule;

    matchSchedule = sinon.stub(reminders, 'matchSchedule').callsArgWith(1, null, moment());
    sendReminders = sinon.stub(reminders, 'sendReminders').callsArgWith(2, null);

    reminders.runSchedule({}, {}, function(err) {
        test.equals(err, null);
        test.equals(sendReminders.callCount, 1);
        matchSchedule.restore();
        sendReminders.restore();
        test.done();
    });
};

exports['runSchedule does not create document when no match'] = function(test) {
    var sendReminders,
        matchSchedule;

    matchSchedule = sinon.stub(reminders, 'matchSchedule').callsArgWith(1, null, false);
    sendReminders = sinon.stub(reminders, 'sendReminders').callsArgWith(2, null);

    reminders.runSchedule({}, {}, function(err) {
        test.equals(err, null);
        test.equals(sendReminders.callCount, 0);
        matchSchedule.restore();
        sendReminders.restore();
        test.done();
    });
};

exports['matches schedule with moment if in last hour'] = function(test) {
    var ts = moment().startOf('hour');

    reminders.matchSchedule({
        cron: moment().format('0 HH * * *') // will generate cron job matching the current hour
    }, function(err, matches) {
        test.equals(err, null);
        test.ok(matches);
        test.equals(matches.valueOf(), ts.valueOf());
        test.done();
    });
}

exports['runSchedule decorates schedule with moment if found'] = function(test) {
    var sendReminders,
        matchSchedule
        now = moment();

    matchSchedule = sinon.stub(reminders, 'matchSchedule').callsArgWith(1, null, now);
    sendReminders = sinon.stub(reminders, 'sendReminders').callsArgWith(2, null);

    reminders.runSchedule({}, {}, function(err) {
        var schedule = sendReminders.getCall(0).args[0];

        test.ok(schedule.moment);
        test.equals(schedule.moment.valueOf(), now.valueOf());

        matchSchedule.restore();
        sendReminders.restore();
        test.done();
    });
};

exports['does not match schedule if in next minute'] = function(test) {
    var now = moment();

    reminders.matchSchedule({
        cron: (now.minutes() + 1) + ' ' + now.format('HH * * *') // will generate cron job matching the current hour but 1 minute into future
    }, function(err, matches) {
        test.equals(err, null);
        test.equals(matches, false);
        test.done();
    });
}

exports['does not match if previous to schedule'] = function(test) {
    var now = moment().subtract(2, 'hours');

    reminders.matchSchedule({
        cron: now.format('59 HH * * *') // will generate cron job matching the previous hour
    }, function(err, matches) {
        test.equals(err, null);
        test.equals(matches, false);
        test.done();
    });
};

exports['sendReminders calls getClinics'] = function(test) {
    var getClinics = sinon.stub(reminders, 'getClinics').callsArgWith(2, null);

    reminders.sendReminders({}, {}, function(err) {
        test.ok(getClinics.called);
        getClinics.restore();
        test.equals(err, null);
        test.done();
    });
};

exports['getClinics calls db.view'] = function(test) {
    var db = {
        view: function() {}
    };
    sinon.stub(db, 'view').callsArgWith(3, null, {
        rows: [
            {
                doc: {
                    id: 'xxx'
                }
            }
        ]
    });

    reminders.getClinics({}, db, function(err, clinics) {
        test.ok(_.isArray(clinics));
        test.equals(clinics.length, 1);
        test.equals(_.first(clinics).id, 'xxx');
        test.ok(db.view.called);
        test.done();
    });
}