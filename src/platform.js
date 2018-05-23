'use strict';

const miio = require('miio');
const Device = require('./accessory.js');
const packageFile = require('../package.json');
const LogUtil = require('../lib/LogUtil.js');

const pluginName = 'homebridge-xiaomi-alarmswitch';
const platformName = 'AlarmSwitch';

var HomebridgeAPI;

module.exports = function (homebridge) {
  HomebridgeAPI = homebridge;
  return AlarmSwitch;
};

function AlarmSwitch (log, config, api) {
  //if (!api||!config) return;
  //if (!config.ip||!config.token)throw new Error('Please check your config.json!');

  // HB
  const self = this;
  this.log = log;
  this.logger = new LogUtil(null, log);
  this.accessories = [];
  this.config = config;
  this.switches = config.switches||{};

  // STORAGE
  this.storage = require('node-persist');
  this.storage.initSync({
    dir: HomebridgeAPI.user.persistPath()
  });
  
  if (api) {
    if (api.version < 2.2) {
      throw new Error('Unexpected API version. Please update your homebridge!');
    }
    self.logger.info('**************************************************************');
    self.logger.info('                                   AlarmSwitch v'+packageFile.version+' by SeydX');
    self.logger.info('GitHub: https://github.com/SeydX/'+pluginName);
    self.logger.info('                                      Email: seyd55@outlook.de');
    self.logger.info('**************************************************************');
    self.logger.info('start success...');
    this.api = api;
    this.api.on('didFinishLaunching', self.didFinishLaunching.bind(this));
  }
}

AlarmSwitch.prototype = {

  didFinishLaunching: function(){
    const self = this;
    if(!this.config.ip||!this.config.token){
      this.logger.warn('No ip address and/or no token could be found in config.json, looking in storage..');
      self.getIpAndToken(function (err, data) {
        if(err){
          self.logger.error('An error occured by getting ip adresse and token, trying again...');
          self.logger.error(err);
          setTimeout(function(){
            self.didFinishLaunching();
          }, 10000);
        } else {
          self.initPlatform(data);
        }
      }); 
    } else {
      this.logger.info('Ip adresse and token found in config.json! Skip requesting...');
      this.initPlatform({'ip':this.config.ip,'token':this.config.token});
    }
  },
  
  getIpAndToken: function(callback){
    const self = this;
    if(!this.storage.getItem('XiaomiGateway')){
      this.logger.warn('No gateway information in storage, requesting...');
      const browser = miio.browse({
        cacheTime: 300 // 5 minutes. Default is 1800 seconds (30 minutes)
      });
      browser.on('available', device => {
        if(!device.token)callback(device.id + ' hides his token! Please put ip adresse and token manually in config.json!');
        self.logger.info('Found new gateway, storing gateway information...');
        self.storage.setItem('XiaomiGateway', {'ip':device.address,'token':device.token.toString('hex')});
        callback(null, {'ip':device.address,'token':device.token.toString('hex')});
      });
      browser.on('unavailable', reg => {
        callback('Gateway not available at the moment! Error:', reg);
      });
    } else {
      this.logger.info('Gateway information found in storage, skip requesting...');
      callback(null, this.storage.getItem('XiaomiGateway'));
    }
  },
  
  initPlatform: function(data){
    let parameter = {};
    for(const id of Object.keys(this.switches)) {
      if(!this.switches[id].disable){
        let skip = false;
        for (const i in this.accessories) {
          if (this.accessories[i].context.deviceID == id) {
            skip = true;
          }
        }
        if (!skip) {
          parameter['name'] = this.config.name + ' ' + id;
          parameter['deviceID'] = id;
          parameter['model'] = 'lumi.switch';
          parameter['ip'] = data.ip;
          parameter['token'] = data.token;
          parameter['disable'] = this.switches[id].disable||false;
          parameter['resetTimer'] = this.switches[id].resetTimer||10;
          parameter['singleClick'] = this.switches[id].singleClick||1;
          parameter['doubleClick'] = this.switches[id].doubleClick||1;
          new Device(this, parameter, true);
        }
      } else {
        for (const i in this.accessories) {
          if (this.accessories[i].context.model == 'lumi.switch'&&this.accessories[i].context.deviceID==id) {
            this.removeAccessory(this.accessories[i]);
          }
        }
      }
    }
    if(!Object.keys(this.switches).length){
      for (const i in this.accessories) {
        if (this.accessories[i].context.model == 'lumi.switch') {
          this.removeAccessory(this.accessories[i]);
        }
      }
    }
  },

  configureAccessory: function (accessory) {
    this.logger.info('Configuring accessory from cache: ' + accessory.displayName);
    accessory.reachable = true;     
    if(this.config.ip&&this.config.token){
      //Refresh ip and token from config
      accessory.context.ip = this.config.ip;
      accessory.context.token = this.config.token;
    } else if(this.storage.getItem('XiaomiGateway')){
      //Refresh ip and token from storage
      accessory.context.ip = this.storage.getItem('XiaomiGateway').ip;
      accessory.context.token = this.storage.getItem('XiaomiGateway').token;
    }
    for(const id of Object.keys(this.switches)) {
      if(id == accessory.context.deviceID){
        accessory.context.singleClick = this.switches[id].singleClick||1;
        accessory.context.doubleClick = this.switches[id].doubleClick||1;
        accessory.context.resetTimer = this.switches[id].resetTimer||10;
        accessory.context.disable = this.switches[id].disable;
      }
    }
    this.accessories[accessory.displayName] = accessory;
    new Device(this, accessory, false);
  },

  removeAccessory: function (accessory) {
    if (accessory) {
      this.logger.warn('Removing accessory: ' + accessory.displayName + '. No longer configured.');
      this.api.unregisterPlatformAccessories(pluginName, platformName, [accessory]);
      delete this.accessories[accessory.displayName];
    }
  }

};
