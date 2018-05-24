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
      this.logger.warn('No ip address and/or no token could be found in config, looking in storage..');
      self.getIpAndToken(function (err, data) {
        if(err){
          self.logger.error('An error occured by getting ip adresse and token, trying again...');
          self.logger.error(err);
          setTimeout(function(){
            self.didFinishLaunching();
          }, 10000);
        } else {
          !Object.keys(self.switches).length ? self.getDeviceID(data) : self.initPlatform(data);
        }
      }); 
    } else {
      if(!Object.keys(this.switches).length){
        self.getDeviceID({'ip':this.config.ip,'token':this.config.token});
      } else {
        this.logger.info('IP adress and token found in config! Skip requesting...');
        this.initPlatform({'ip':this.config.ip,'token':this.config.token});
      }
    }
  },
  
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // Get Gateway & Switch info
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  
  getIpAndToken: function(callback){
    const self = this;
    if(!this.storage.getItem('XiaomiGateway')){
      this.logger.warn('No gateway information in storage, requesting...');
      const browser = miio.browse({
        cacheTime: 300
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
  
  getDeviceID: function(data){
    const self = this;
    const deviceArray = [];
    this.logger.warn('Can not find any switches in config! Searching...');
    miio.device({ address: data.ip, token: data.token })
      .then(device => {
        self.logger.info('Connected to Gateway ' + device.miioModel + ' [' + device.id + ']. Searching devices...');
        const children = device.children();
        for(const child of children){
          if(child.matches('type:button')&&child.miioModel.match('lumi.switch')){
            deviceArray.push(child.internalId);
          }
        }
        if(deviceArray.length){
          self.logger.info('Found ' + deviceArray.length + ' switch(es)!');
          self.logger.info('Please add the Device ID(s) from the switch(es) you want to control in your config.json and restart homebridge!');
          for(const ids in deviceArray){
            self.logger.info('(' + ids + ') Device ID: ' + deviceArray[ids]);
          }
          self.log('**************************************************************');
          self.log('                                                              ');
          self.log('    Example config.json                                       ');
          self.log('                                                              ');
          self.log('    {                                                         ');
          self.log('      "platform":"AlarmSwitch",                               ');
          self.log('      "name":"%s",                                            ', self.config.name||'Alarm');
          self.log('      "ip":"%s",                                              ', data.ip);
          self.log('      "token":"%s",                                           ', data.token);
          self.log('      "switches":{                                            ');
          self.log('          "%s":{                                              ', deviceArray[0]);
          self.log('               "type": 1,                                     ');
          self.log('               "disable":false,                               ');
          self.log('               "resetTimer":10,                               ');
          self.log('               "singleClick":1,                               ');
          self.log('               "doubleClick":2                                ');
          self.log('          }                                                   ');
          self.log('      }                                                       ');
          self.log('    }                                                         ');
          self.log('                                                              ');
          self.log('**************************************************************');
          self.logger.info('Closing connection...');
        } else {
          self.logger.warn('Can not find any connected switches!');
          self.logger.warn('Closing current connection for trying again...');
          setTimeout(function(){
            self.logger.info('Reconnecting...');
            self.getDeviceID(data);
          }, 10000);
        }
        device.destroy();
      })
      .catch(err => {
        self.logger.error('An error occured by searching devices! Trying again...');
        self.logger.error(err);
        setTimeout(function(){
          self.logger.info('Reconnecting...');
          self.getDeviceID(data);
        }, 10000);
      });
  },
  
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // Init Platform
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  
  initPlatform: function(data){
    let parameter = {};
    for(const id of Object.keys(this.switches)) {
      if(!this.switches[id].disable){
        let skip = false;
        for (const i in this.accessories) {
          if (this.accessories[i].context.deviceID == id&&this.accessories[i].context.type == this.switches[id].type) {
            skip = true;
          }
          if (this.accessories[i].context.deviceID == id&&this.accessories[i].context.type != this.switches[id].type) {
            this.removeAccessory(this.accessories[i]);
          }
        }
        if (!skip) {
          parameter['name'] = this.config.name + ' ' + id;
          parameter['deviceID'] = id;
          parameter['ip'] = data.ip;
          parameter['token'] = data.token;
          if(this.switches[id].type < 1||this.switches[id].type > 3)this.switches[id].type = 1;
          parameter['type'] = this.switches[id].type||1;
          parameter['model'] = 'lumi.alarm';
          parameter['disable'] = this.switches[id].disable||false;
          parameter['resetTimer'] = this.switches[id].resetTimer||10;
          parameter['singleClick'] = this.switches[id].singleClick||1;
          parameter['doubleClick'] = this.switches[id].doubleClick||1;
          new Device(this, parameter, true);
        }
      } else {
        for (const i in this.accessories) {
          if (this.accessories[i].context.deviceID==id) {
            this.removeAccessory(this.accessories[i]);
          }
        }
      }
    }
    if(!Object.keys(this.switches).length){
      for (const i in this.accessories) {
        if (this.accessories[i].context.model == 'lumi.alarm') {
          this.removeAccessory(this.accessories[i]);
        }
      }
    }
  },
  
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // Configure Accessories
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  configureAccessory: function (accessory) {
    this.logger.info('Configuring accessory from cache: ' + accessory.displayName + ' [' + accessory.context.typeName + ']');
    let skip = false;
    //Refresh Context  
    accessory.reachable = true;   
    if(this.config.ip&&this.config.token){
      accessory.context.ip = this.config.ip;
      accessory.context.token = this.config.token;
    } else if(this.storage.getItem('XiaomiGateway')){
      accessory.context.ip = this.storage.getItem('XiaomiGateway').ip;
      accessory.context.token = this.storage.getItem('XiaomiGateway').token;
    }
    for(const id of Object.keys(this.switches)) {
      if(id == accessory.context.deviceID){	 
        skip = true;    
        accessory.context.singleClick = this.switches[id].singleClick||1;
        accessory.context.doubleClick = this.switches[id].doubleClick||1;
        accessory.context.resetTimer = this.switches[id].resetTimer||10;
        if(this.switches[id].type!=accessory.context.type){
          accessory.context.disable = true;
        } else {
          accessory.context.disable = this.switches[id].disable||false;
        }
      }
      if(!skip){
        accessory.context.disable = true;
      }
    }
    if(!Object.keys(this.switches).length){
      accessory.context.disable = true;
    }
    this.accessories[accessory.displayName] = accessory;
    new Device(this, accessory, false);
  },
  
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // Remove Accessories
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  removeAccessory: function (accessory) {
    if (accessory) {
      this.logger.warn('Removing accessory: ' + accessory.displayName + ' [' + accessory.context.typeName + ']. No longer configured.');
      this.api.unregisterPlatformAccessories(pluginName, platformName, [accessory]);
      delete this.accessories[accessory.displayName];
    }
  }

};
