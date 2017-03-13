var _ = require('underscore');

var addCheckDigit = function(digits) {
  var digitArray = digits.split('');

  var offset = digitArray.length + 1;
  var total = _.reduce(digitArray, function(sum, digit, index) {
    return sum + (Number(digit) * (offset - index));
  }, 0);
  var result = total % 11;
  digitArray.push(result === 10 ? 0 : result);

  return digitArray.join('');
};

module.exports = {
    /*
      Generates a random N digit ID. The last ID is a checksum digit
    */
    generate: function(length) {
      if (length && typeof length !== 'number') {
        throw new Error('generate requires that you pass it a length 0 < x < 14');
      }

      if (length >= 14) {
        // TODO: when we support a million billion patients per installation change
        //       the algorithm to support it ;-)
        throw new Error('WARNING: id length of ' + length + ' is too long');
      }

      var randomDigits = String(Math.random() * 10).replace('.','');

      return addCheckDigit(randomDigits.substring(0, length - 1));
    },
    /*
      Returns true if id passes checksum check. This does not mean it's valid
      in the system, just that it's potentially valid
    */
    // TOOD: actually use this somewhere (we go to the trouble of generating a
    //       checksum digit but we never actually bother to use it)
    //       https://github.com/medic/medic-webapp/issues/3223
    check: function(id) {
      return id === addCheckDigit(id.substring(0, id.length - 1));
    }
};
