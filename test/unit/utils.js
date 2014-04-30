process.env.TEST_ENV = 'hello'; // required for ../../db.js

var _ = require('underscore'),
    db = require('../../db'),
    sinon = require('sinon'),
    utils = require('../../lib/utils');

exports.tearDown = function(callback) {
    if (db.view.restore) {
        db.view.restore();
    }
    callback();
}

exports['updateable returns true when _rev the same'] = function(test) {
    test.ok(utils.updateable({ _rev: '1' }, { _rev: '1', x: 1 }));
    test.done();
}

exports['updateable returns false when _rev different'] = function(test) {
    test.equals(utils.updateable({ _rev: '1' }, { _rev: '2', x: 1 }), false);
    test.equals(utils.updateable({ _rev: '2' }, { _rev: '1', x: 1 }), false);
    test.done();
}

exports['updateable returns false when objects the same'] = function(test) {
    test.equals(utils.updateable({ _rev: '1', x: 1 }, { _rev: '1', x: 1 }), false);
    test.done();
}

exports['getClinicContactName gets name'] = function(test) {
    test.equal(utils.getClinicContactName({
        related_entities: {
            clinic: {
                contact: {
                    name: 'Y'
                }
            }
        }
    }), 'Y');
    test.done();
}

exports['getClinicContactName gets returns health volunteer if miss'] = function(test) {
    test.equals(utils.getClinicContactName({
        related_entities: {
            clinic: { }
        }
    }), 'health volunteer');
    test.done();
}

exports['getClinicContactName gets name if contact'] = function(test) {
    test.equals(utils.getClinicContactName({
        contact: {
            name: 'Y'
        }
    }), 'Y');
    test.done();
}

exports['getClinicName gets returns health volunteer if miss'] = function(test) {
    test.equal(utils.getClinicName({
        related_entities: {
            clinic: { }
        }
    }), 'health volunteer');
    test.done();
}

exports['getClinicName gets name if contact'] = function(test) {
    test.equal(utils.getClinicName({
        name: 'Y'
    }), 'Y');
    test.done();
}

exports['getClinicName gets name'] = function(test) {
    test.equal(utils.getClinicName({
        related_entities: {
            clinic: {
                name: 'Y'
            }
        }
    }), 'Y');
    test.done();
}

exports['getClinicPhone gets phone'] = function(test) {
    test.equal(utils.getClinicPhone({
        related_entities: {
            clinic: {
                contact: {
                    phone: '123'
                }
            }
        }
    }), '123');
    test.done();
}

exports['getClinicPhone gets phone if contact'] = function(test) {
    test.equal(utils.getClinicPhone({
        contact: {
            phone: '123'
        }
    }), '123');
    test.done();
}

exports['addMessage adds uuid'] = function(test) {
    var doc = {},
        message,
        task;

    utils.addMessage(doc, {
        phone: '+1234',
        message: 'xxx'
    });

    test.ok(doc.tasks);
    task = _.first(doc.tasks);

    test.ok(_.isArray(task.messages));
    test.equals(task.state, 'pending');
    test.ok(!!task.state_history);
    test.equals(task.state_history.length, 1);
    test.equals(task.state_history[0].state, 'pending');
    test.ok(!!task.state_history[0].timestamp);

    message = _.first(task.messages);
    test.equals(message.to, '+1234');
    test.equals(message.message, 'xxx');
    test.ok(message.uuid);
    test.done();
}

exports['getRecentForm calls through to db view correctly'] = function(test) {
    
    var formName = 'someForm';
    var clinicId = 'someClinicId';
    var result = [{_id: 'someRowId'}];

    sinon.stub(db, 'view')
        .withArgs(
            'kujua-sentinel', 
            'data_records_by_form_and_clinic', 
            {
                startkey: [formName, clinicId],
                endkey: [formName, clinicId],
                include_docs: true
            }
        )
        .callsArgWith(3, null, { rows: result });

    test.expect(2);
    utils.getRecentForm({
        formName: formName, 
        doc: {
            related_entities: {
                clinic: {
                    _id: clinicId
                }
            }
        }
    }, function(err, data) {
        test.equals(err, null);
        test.equals(data, result);
        test.done();
    });
}

exports['addScheduledMessage creates a new scheduled task'] = function(test) {

    test.expect(9);

    var message = 'xyz';
    var due = new Date();
    var phone = '+123';
    var doc = {};

    utils.addScheduledMessage(doc, {
        message: message,
        due: due,
        phone: phone
    });

    test.equals(doc.scheduled_tasks.length, 1);
    var task = doc.scheduled_tasks[0];
    test.equals(task.due, due.getTime());
    test.equals(task.messages.length, 1);
    test.equals(task.messages[0].to, phone);
    test.equals(task.messages[0].message, message);
    test.equals(task.state, 'scheduled');
    test.equals(task.state_history.length, 1);
    test.equals(task.state_history[0].state, 'scheduled');
    test.ok(!!task.state_history[0].timestamp);

    test.done();
}

exports['obsoleteScheduledMessages clears overdue tasks'] = function(test) {

    test.expect(7);

    var type = 'abc';
    var doc = {
        scheduled_tasks: [
            {
                type: type,
                due: 999,
                state: 'scheduled',
                group: 'a'
            }, {
                type: type,
                due: new Date().valueOf(),
                state: 'scheduled',
                group: 'b'
            }, {
                type: 'othertype',
                due: 999,
                state: 'scheduled',
                group: 'c'
            }
        ]
    };

    var changed = utils.obsoleteScheduledMessages(doc, type, 1000);

    test.equals(changed, true);
    test.equals(doc.scheduled_tasks.length, 3);
    test.equals(doc.scheduled_tasks[0].state, 'cleared');
    test.equals(doc.scheduled_tasks[0].state_history[0].state, 'cleared');
    test.ok(!!doc.scheduled_tasks[0].state_history[0].timestamp);
    test.equals(doc.scheduled_tasks[1].state, 'scheduled');
    test.equals(doc.scheduled_tasks[2].state, 'scheduled');

    test.done();
}

exports['obsoleteScheduledMessages appends to state_history'] = function(test) {

    test.expect(8);

    var type = 'abc';
    var scheduledTimestamp = 998;
    var doc = {
        scheduled_tasks: [{
            type: type,
            due: 999,
            state: 'scheduled',
            group: 'a',
            state_history: [{
                state: 'scheduled',
                timestamp: scheduledTimestamp
            }]
        }]
    };

    var changed = utils.obsoleteScheduledMessages(doc, type, 1000);

    test.equals(changed, true);
    test.equals(doc.scheduled_tasks.length, 1);
    test.equals(doc.scheduled_tasks[0].state, 'cleared');
    test.equals(doc.scheduled_tasks[0].state_history.length, 2);
    test.equals(doc.scheduled_tasks[0].state_history[0].state, 'scheduled');
    test.equals(doc.scheduled_tasks[0].state_history[0].timestamp, scheduledTimestamp);
    test.equals(doc.scheduled_tasks[0].state_history[1].state, 'cleared');
    test.ok(!!doc.scheduled_tasks[0].state_history[1].timestamp);

    test.done();
}

exports['obsoleteScheduledMessages clears groups of obsolete messages'] = function(test) {

    test.expect(9);

    var type = 'abc';
    var group = 'a';
    var doc = {
        scheduled_tasks: [
            {
                type: type,
                due: 999,
                state: 'scheduled',
                group: group
            }, {
                type: type,
                due: new Date().valueOf(),
                state: 'scheduled',
                group: group
            }, {
                type: 'othertype',
                due: 999,
                state: 'scheduled',
                group: 'othergroup'
            }
        ]
    };

    var changed = utils.obsoleteScheduledMessages(doc, type, 1);

    test.equals(changed, true);
    test.equals(doc.scheduled_tasks.length, 3);
    test.equals(doc.scheduled_tasks[0].state, 'cleared');
    test.equals(doc.scheduled_tasks[0].state_history[0].state, 'cleared');
    test.ok(!!doc.scheduled_tasks[0].state_history[0].timestamp);
    test.equals(doc.scheduled_tasks[1].state, 'cleared');
    test.equals(doc.scheduled_tasks[1].state_history[0].state, 'cleared');
    test.ok(!!doc.scheduled_tasks[1].state_history[0].timestamp);
    test.equals(doc.scheduled_tasks[2].state, 'scheduled');

    test.done();
}

exports['clearScheduledMessages clears all matching tasks'] = function(test) {

    test.expect(6);

    var type = 'xyz';
    var doc = {
        scheduled_tasks: [
            {
                type: type,
                state: 'scheduled'
            }, {
                type: 'miss',
                state: 'scheduled'
            }
        ]
    };

    utils.clearScheduledMessages(doc, [type, 'othertype']);

    test.equals(doc.scheduled_tasks.length, 2);
    test.equals(doc.scheduled_tasks[0].state, 'cleared');
    test.equals(doc.scheduled_tasks[0].state_history.length, 1);
    test.equals(doc.scheduled_tasks[0].state_history[0].state, 'cleared');
    test.ok(!!doc.scheduled_tasks[0].state_history[0].timestamp);
    test.equals(doc.scheduled_tasks[1].state, 'scheduled');
    test.done();
}

exports['unmuteScheduledMessages schedules all muted tasks'] = function(test) {

    test.expect(5);

    var doc = {
        scheduled_tasks: [
            {
                due: Date.now().valueOf() + 1000,
                state: 'muted'
            }, {
                due: Date.now().valueOf() - 1000,
                state: 'muted'
            }
        ]
    };

    utils.unmuteScheduledMessages(doc);

    test.equals(doc.scheduled_tasks.length, 1);
    test.equals(doc.scheduled_tasks[0].state, 'scheduled');
    test.equals(doc.scheduled_tasks[0].state_history.length, 1);
    test.equals(doc.scheduled_tasks[0].state_history[0].state, 'scheduled');
    test.ok(!!doc.scheduled_tasks[0].state_history[0].timestamp);
    test.done();
}

exports['muteScheduledMessages mutes all scheduled tasks'] = function(test) {

    test.expect(5);

    var doc = {
        scheduled_tasks: [
            {
                state: 'scheduled'
            }
        ]
    };

    utils.muteScheduledMessages(doc);

    test.equals(doc.scheduled_tasks.length, 1);
    test.equals(doc.scheduled_tasks[0].state, 'muted');
    test.equals(doc.scheduled_tasks[0].state_history.length, 1);
    test.equals(doc.scheduled_tasks[0].state_history[0].state, 'muted');
    test.ok(!!doc.scheduled_tasks[0].state_history[0].timestamp);
    test.done();
}
