var config = require('./config'),
    logger = require('./lib/logger'),
    arg = process.argv[2];

if (arg === 'debug') {
    logger.info('setting loglevel to %s.', arg);
    logger.transports.Console.level = arg;
}

if (process.env.TEST_ENV) {
    logger.info('TEST_ENV is set, server does not run in test mode.');
    return;
}

console.log('Node Version:', process.version);
var version = process.versions.node.match(/(\d)+\.(\d)+\.(\d)+/)[1];
if (Number(version[1] <= 4)) {
  // 5 seems to be where the majority of ES6 was added without flags.
  // Seems safeist to not allow api to run
  throw new Error('Node version ' + process.version + ' is not supported');
}
if (Number(version[1]) < 6 && Number(version[2]) < 10) {
  logger.warn('This node version may not be supported');
}

config.init(function(err) {
    if (err) {
        logger.error('Error loading config: ', err);
        process.exit(1);
    }
    logger.info('loaded config.');
    if (!arg) {
        logger.transports.Console.level = config.get('loglevel');
        logger.debug('loglevel is %s.', logger.transports.Console.level);
    }
    logger.info('attaching transitions...');
    require('./transitions').attach();
    require('./schedule').checkSchedule();
    logger.info('startup complete.');
});
