'use strict';

const moment = require('moment');
const miio = require('miio');
const HomeKitTypes = require('./types.js');
const LogUtil = require('../lib/LogUtil.js');

var Accessory, Service, Characteristic, UUIDGen, PlatformAccessory;

const pluginName = 'homebridge-xiaomi-alarmswitch';
const platformName = 'AlarmSwitch';

class Alarm_Switch {
  constructor (platform, parameter, publish) {

    // HB
    PlatformAccessory = platform.api.platformAccessory;
    Accessory = platform.api.hap.Accessory;
    Service = platform.api.hap.Service;
    Characteristic = platform.api.hap.Characteristic;
    UUIDGen = platform.api.hap.uuid;
    HomeKitTypes.registerWith(platform.api.hap);

    this.platform = platform;
    this.log = platform.log;
    this.logger = new LogUtil(null, platform.log);
    this.api = platform.api;
    this.config = platform.config;
    this.accessories = platform.accessories;
    this.timer;
    this.shortCount = 0;
    this.doubleCount = 0;
    
    if (publish) {
      this.addAccessory(parameter);
    } else {
      this.getService(parameter);
    }
  }
  
  /********************************************************************************************************************************************************/
  /********************************************************************************************************************************************************/
  /********************************************************************* ADD ACCESSORY ********************************************************************/
  /********************************************************************************************************************************************************/
  /********************************************************************************************************************************************************/

  addAccessory (parameter) {
    var accessory;
    let name = parameter.name;

    this.logger.info('Publishing new accessory: ' + name);

    accessory = this.accessories[name];
    const uuid = UUIDGen.generate(name);

    accessory = new PlatformAccessory(name, uuid, Accessory.Categories.SWITCH);
    accessory.addService(Service.Switch, name);

    // Setting reachable to true
    accessory.reachable = true;
    accessory.context = {};
    
    accessory.context.deviceID = parameter.deviceID;
    accessory.context.model = parameter.model;
    accessory.context.ip = parameter.ip;
    accessory.context.token = parameter.token; 
    accessory.context.resetTimer = parameter.resetTimer; 
    accessory.context.singleClick = parameter.singleClick; 
    accessory.context.doubleClick = parameter.doubleClick;
    accessory.context.disable = parameter.disable; 
    accessory.context.lastMainState = false;
    
    accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Name, parameter.name)
      .setCharacteristic(Characteristic.Identify, parameter.name)
      .setCharacteristic(Characteristic.Manufacturer, 'SeydX')
      .setCharacteristic(Characteristic.Model, parameter.model)
      .setCharacteristic(Characteristic.SerialNumber, parameter.deviceID)
      .setCharacteristic(Characteristic.FirmwareRevision, require('../package.json').version);

    // Publish
    this.platform.api.registerPlatformAccessories(pluginName, platformName, [accessory]);

    // Cache
    this.accessories[name] = accessory;

    // Get services
    this.getService(accessory);
  }
  
  /********************************************************************************************************************************************************/
  /********************************************************************************************************************************************************/
  /********************************************************************* SERVICES *************************************************************************/
  /********************************************************************************************************************************************************/
  /********************************************************************************************************************************************************/

  getService (accessory) {
    const self = this;
    
    //Refresh AccessoryInformation
    accessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Name, accessory.displayName)
      .setCharacteristic(Characteristic.Identify, accessory.displayName)
      .setCharacteristic(Characteristic.Manufacturer, 'SeydX')
      .setCharacteristic(Characteristic.Model, accessory.context.model)
      .setCharacteristic(Characteristic.SerialNumber, accessory.context.deviceID)
      .setCharacteristic(Characteristic.FirmwareRevision, require('../package.json').version);

    accessory.on('identify', function (paired, callback) {
      self.logger.info(accessory.displayName + ': Hi!');
      callback();
    });
    
    let service = accessory.getService(Service.Switch);
    
    service.getCharacteristic(Characteristic.On)
      .updateValue(accessory.context.lastMainState)
      .on('set', function(state, callback) {
        self.logger.info(accessory.displayName + ': ' + state);
        accessory.context.lastMainState = state;
        callback(null, state);
      });
    
    /*if (!service.testCharacteristic(Characteristic.LearnAlarm))service.addCharacteristic(Characteristic.LearnAlarm);
    service.getCharacteristic(Characteristic.LearnAlarm)
      .updateValue(false)
      .on('set', self.learnAlarm.bind(this, accessory, service));*/
    
    this.getSwitchState(accessory, service);
    
  }
  
  getSwitchState(accessory, service){
    const self = this;
    if(!accessory.context.disable){
      miio.device({address: accessory.context.ip, token: accessory.context.token})
        .then(device => {
          self.logger.info('Connected to Gateway ' + device.miioModel + ' [' + device.id + ']');
          self.logger.info('Searching for switch with ID:' + accessory.context.deviceID);
          self.initialTimer(accessory, self.timer);
          let children = device.children();
          for(const child of children){
            if(child.matches('type:button')&&child.internalId==accessory.context.deviceID){
              self.logger.info('Connected to ' + child.miioModel + ' [' + child.internalId + ']');
              child.on('action', action => {
                self.timer = moment().unix();
                switch(action.action){
                  case 'click':
                    self.shortCount += 1;
                    self.logger.info(accessory.displayName + ': ' + action.action);
                    break;
                  case 'double_click':
                    self.doubleCount += 1;
                    self.logger.info(accessory.displayName + ': ' + action.action);
                    break;
                  case 'long_click_press':
                    if(self.shortCount == accessory.context.singleClick && self.doubleCount == accessory.context.doubleClick){
                      service.getCharacteristic(Characteristic.On).setValue(false);
                      //service.getCharacteristic(Characteristic.On).updateValue(false)
                    } else {
                      //if(!service.getCharacteristic(Characteristic.LearnAlarm).value){
                      service.getCharacteristic(Characteristic.On).setValue(true);
                      //service.getCharacteristic(Characteristic.On).updateValue(true)
                      //}
                    }
                    break;
                  case 'long_click_release':
                  default:
                    self.shortCount = 0;
                    self.doubleCount = 0;
                    break;
                }
              });
            }
          }
        })
        .catch(err => {
          self.logger.error('An error occured by connecting to gateway, trying again!');
          self.logger.error(err);
          setTimeout(function(){
            self.getSwitchState(accessory, service);
          }, 10000);
        });
    }
  }
  
  initialTimer(accessory, timer){
    const self = this;
    let duration = moment().unix()-timer;
    if(!isNaN(duration) && duration > accessory.context.resetTimer-1 && duration < accessory.context.resetTimer+1){
      self.logger.info('No input over ' + accessory.context.resetTimer + ' seconds, resetting...');
      self.shortCount = 0;
      self.doubleCount = 0;
      self.timer;
    }
    setTimeout(function(){
      self.initialTimer(accessory, self.timer);
    }, 1000);
  }
  
  /*learnAlarm(accessory, service, state, callback){
    const self = this;
    if(state){
      self.logger.info("Start learning...")
    } else {
      self.logger.info("Stop learning...")
    }
    callback(null, state)
  }*/
  
}

module.exports = Alarm_Switch;
