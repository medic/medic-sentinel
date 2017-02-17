var _ = require('underscore');

exports.restore = function(objs) {
  _.each(objs, function(obj) {
    if (obj.restore) {
      obj.restore();
    }
  });
};
