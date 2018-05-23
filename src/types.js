'use strict';

const inherits = require('util').inherits;

module.exports = {
  registerWith: function (hap) {
    const Characteristic = hap.Characteristic;
    /// /////////////////////////////////////////////////////////////////////////
    // LearnAlarm Characteristic
    /// /////////////////////////////////////////////////////////////////////////
    Characteristic.LearnAlarm = function() {
      Characteristic.call(this, 'Learn Code', 'c5f8ace3-c31e-404d-99f1-a11e467cd1fd');
      this.setProps({
        format: Characteristic.Formats.BOOL,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
      });
      this.value = this.getDefaultValue();
    };
    inherits(Characteristic.LearnAlarm, Characteristic);
    Characteristic.LearnAlarm.UUID = 'c5f8ace3-c31e-404d-99f1-a11e467cd1fd';
  }
};
