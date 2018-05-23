
/**
 * v1
 *
 * @url https://github.com/SeydX/homebridge-xiamo-alarmswitch
 * @author SeydX <seyd55@outlook.de>
 *
**/

'use strict';

const fs = require('fs');

module.exports = function (homebridge) {
  if(!isConfig(homebridge.user.configPath(), 'platforms', 'AlarmSwitch')) {
    return;
  }
  let AlarmSwitch = require('./src/platform.js')(homebridge);
  homebridge.registerPlatform('homebridge-xiamo-alarmswitch', 'AlarmSwitch', AlarmSwitch, true);
};

function isConfig(configFile, type, name) {
  let config = JSON.parse(fs.readFileSync(configFile));
  if('accessories' === type) {
    let accessories = config.accessories;
    for(const i in accessories) {
      if(accessories[i]['accessory'] === name) {
        return true;
      }
    }
  } else if('platforms' === type) {
    let platforms = config.platforms;
    for(const i in platforms) {
      if(platforms[i]['platform'] === name) {
        return true;
      }
    }
  }
  return false;
}