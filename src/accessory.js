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
    this.error = 0;
    this.reconnect = 0;
    this.morseError = 0;
    
    if (publish) {
      this.addAccessory(parameter);
    } else {
      this.getService(parameter);
    }
  }
  
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // Add Accessories
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  addAccessory (parameter) {
    var accessory;
    let name = parameter.name;
    let type = parameter.type;
    let deviceType;
    let accessoryType;
    let typeName;
    
    if(type == 1){
      typeName = 'ALARM';
    } else if(type == 2){
      typeName = 'VIRTUAL SWITCH';  
    } else {
      typeName = 'PROGRAMMABLE SWITCH';  
    }

    this.logger.info('Publishing new accessory: ' + name + ' [' + typeName + ']');

    accessory = this.accessories[name];
    const uuid = UUIDGen.generate(name);
    
    switch(type){
      case 1: // ALARM
        deviceType = Accessory.Categories.SECURITY_SYSTEM;
        accessoryType = Service.SecuritySystem;
        break;
      case 2: // VIRTUAL SWITCH
        deviceType = Accessory.Categories.SWITCH;
        accessoryType = Service.Switch;
        break;
      case 3: // PROGRAMMABLE SWITCH (fall through)
      default:
        deviceType = Accessory.Categories.PROGRAMMABLE_SWITCH;
        accessoryType = Service.StatelessProgrammableSwitch;
        break;
    }
    
    accessory = new PlatformAccessory(name, uuid, deviceType);
    accessory.addService(accessoryType, name);

    // Setting reachable to true
    accessory.reachable = true;
    accessory.context = {};
    
    accessory.context.type = parameter.type;
    accessory.context.typeName = typeName;
    accessory.context.deviceID = parameter.deviceID;
    accessory.context.model = parameter.model;
    accessory.context.ip = parameter.ip;
    accessory.context.token = parameter.token; 
    accessory.context.resetTimer = parameter.resetTimer; 
    accessory.context.disable = parameter.disable; 
    accessory.context.morseCode = parameter.morseCode; 
    accessory.context.morseArray = [];
    
    switch(type){
      case 1: // ALARM
        accessory.context.lastCurrentAlarmState = 3; //DISARMED
        accessory.context.lastTargetAlarmState = 3; //DISARM
        break;
      case 2: // VIRTUAL SWITCH
        accessory.context.lastSwitchState = false;
        break;
      case 3: // PROGRAMMABLE SWITCH (fall through)
      default:
        break;
    }
    
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
  
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // Services
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//

  getService (accessory) {
    const self = this;
    let type = accessory.context.type;
    let service;
    
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
    
    switch(type){
      case 1: // ALARM
        service = accessory.getService(Service.SecuritySystem);
        service.getCharacteristic(Characteristic.SecuritySystemCurrentState)
          .setProps({
            validValues: [1,3]
          })
          .updateValue(accessory.context.lastCurrentAlarmState);
        service.getCharacteristic(Characteristic.SecuritySystemTargetState)
          .setProps({
            validValues: [1,3]
          })
          .updateValue(accessory.context.lastTargetAlarmState)
          .on('set', self.setAlarm.bind(this, accessory, service));
        break;
      case 2: // VIRTUAL SWITCH
        service = accessory.getService(Service.Switch);
        service.getCharacteristic(Characteristic.On)
          .updateValue(accessory.context.lastSwitchState)
          .on('set', self.setAlarm.bind(this, accessory, service));
        break;
      case 3: // PROGRAMMABLE SWITCH (fall through)
      default:
        service = accessory.getService(Service.StatelessProgrammableSwitch);
        service.getCharacteristic(Characteristic.ProgrammableSwitchEvent)
          .setProps({
            validValues: [0,1],
            maxValue: 1,
            minValue: 0
          })
          .on('set', function(value, callback){
            value == 0 ? self.logger.info(accessory.displayName + ': Activate Event on \'Single Press\'') : self.logger.info(accessory.displayName + ': Activate Event on \'Double Press\'');
            callback();
          });
    }
    
    if (!service.testCharacteristic(Characteristic.LearnAlarm))service.addCharacteristic(Characteristic.LearnAlarm);
    service.getCharacteristic(Characteristic.LearnAlarm)
      .updateValue(false)
      .on('set', self.learnAlarm.bind(this, accessory, service));
    
    this.getSwitchState(accessory, service);
    this.initialTimer(accessory, this.timer);
    if(type == 1 || type == 2) setTimeout(function(){self.getAlarm(accessory, service);},5000); //Wait for connecting to switch first...
    
  }
  
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // Get Switch State
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  
  getSwitchState(accessory, service){
    const self = this;
    let type = accessory.context.type;
    accessory.context.morseArray = JSON.parse(JSON.stringify(accessory.context.morseCode));
    if(!accessory.context.disable){
      miio.device({address: accessory.context.ip, token: accessory.context.token})
        .then(device => {
          self.switchError = 0;
          self.reconnect==0 ? self.logger.info('Connected to Gateway ' + device.miioModel + ' [' + device.id + ']') : self.logger.debug('Reconnected to Gateway ' + device.miioModel + ' [' + device.id + ']');
          if(self.reconnect==0)self.logger.info('Searching for switch with ID:' + accessory.context.deviceID);
          let children = device.children();
          for(const child of children){
            if(child.matches('type:button')&&child.internalId==accessory.context.deviceID){
              self.reconnect==0 ? self.logger.info('Connected to ' + child.miioModel + ' [' + child.internalId + ']') : self.logger.debug('Reconnected to ' + child.miioModel + ' [' + child.internalId + ']');
              self.reconnect = 0;
              child.on('action', action => {
                self.timer = moment().unix();
                switch(action.action){
                  case 'click':
                    self.logger.info(accessory.displayName + ': ' + action.action);
                    if(accessory.context.morseArray[0] == 1){
                      accessory.context.morseArray.splice(0, 1); 
                    } else {
                      if(self.morseError >= 2){
                        self.morseError = 0;
                        self.logger.info('Forgotten your morse code? Hint [' + accessory.context.morseCode + ']');  
                      } else {
                        self.morseError += 1; 
                      }
                      accessory.context.morseArray = JSON.parse(JSON.stringify(accessory.context.morseCode));
                    }
                    break;
                  case 'double_click':
                    self.logger.info(accessory.displayName + ': ' + action.action);
                    if(accessory.context.morseArray[0] == 2){
                      accessory.context.morseArray.splice(0, 1); 
                    } else {
                      if(self.morseError >= 2){
                        self.morseError = 0;
                        self.logger.info('Forgotten your morse code? Hint [' + accessory.context.morseCode + ']');  
                      } else {
                        self.morseError += 1; 
                      }
                      accessory.context.morseArray = JSON.parse(JSON.stringify(accessory.context.morseCode));
                    }
                    break;
                  case 'long_click_press':
                    if(!accessory.context.morseArray.length){
                      if(type == 1){
                        service.getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(3);
                        service.getCharacteristic(Characteristic.SecuritySystemTargetState).setValue(3);  
                      } else if(type == 2){
                        service.getCharacteristic(Characteristic.On).setValue(false);
                      } else {
                        service.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(1);  
                      }
                    } else {
                      if(type == 1){
                        service.getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(1);
                        service.getCharacteristic(Characteristic.SecuritySystemTargetState).setValue(1);  
                      } else if(type == 2){
                        service.getCharacteristic(Characteristic.On).updateValue(true);
                        service.getCharacteristic(Characteristic.On).setValue(true);
                      } else {
                        service.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(0);
                      }
                    }
                    break;
                  case 'long_click_release':
                  default:
                    accessory.context.morseArray = JSON.parse(JSON.stringify(accessory.context.morseCode));
                    break;
                }
              });
            }
          }
          // Restart miio every 30 minutes or so to make sure we are listening to announcements
          setTimeout(function(){
            self.logger.debug('Reconnecting..');
            self.reconnect += 1;
            device.destroy();
            self.getSwitchState(accessory, service);
          }, 10 * 60 * 1000); //10 min
        })
        .catch(err => {
          if(self.switchError > 5){
            self.switchError = 0;
            self.logger.error('An error occured by connecting to gateway, trying again!');
            self.logger.error(err);
            setTimeout(function(){
              self.getSwitchState(accessory, service);
            }, 30000);
          } else {
            self.switchError += 1;
            setTimeout(function(){
              self.getSwitchState(accessory, service);
            }, 15000);
          }
        });
    }
  }
  
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // Get Alarm
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  
  getAlarm(accessory, service){
    const self = this;
    let type = accessory.context.type;
    if(!accessory.context.disable){
      miio.device({address: accessory.context.ip, token: accessory.context.token})
        .then(device => {
          device.call('get_arming', [])
            .then(result => {
              if(result[0] === 'on') {
                if(type == 1){
                  accessory.context.lastTargetAlarmState = 1;
                  accessory.context.lastCurrentAlarmState = 1;
                  service.getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(accessory.context.lastCurrentAlarmState);
                  service.getCharacteristic(Characteristic.SecuritySystemTargetState).updateValue(accessory.context.lastTargetAlarmState);
                } else if(type == 2){
                  accessory.context.lastSwitchState = true;
                  service.getCharacteristic(Characteristic.On).updateValue(accessory.context.lastSwitchState);
                }
              } else if(result[0] === 'off') {
                if(type == 1){
                  accessory.context.lastTargetAlarmState = 3;
                  accessory.context.lastCurrentAlarmState = 3;
                  service.getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(accessory.context.lastCurrentAlarmState);
                  service.getCharacteristic(Characteristic.SecuritySystemTargetState).updateValue(accessory.context.lastTargetAlarmState);
                } else if(type == 2){
                  accessory.context.lastSwitchState = false;
                  service.getCharacteristic(Characteristic.On).updateValue(accessory.context.lastSwitchState);
                }
              } else {
                if(result[0]!='oning'){
                  self.logger.error(accessory.displayName + ': An error occured by getting alarm state!');
                  self.logger.error(result[0]);
                  if(type == 1){
                    service.getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(accessory.context.lastCurrentAlarmState);
                    service.getCharacteristic(Characteristic.SecuritySystemTargetState).updateValue(accessory.context.lastTargetAlarmState);
                  } else if(type == 2){
                    service.getCharacteristic(Characteristic.On).updateValue(accessory.context.lastSwitchState);
                  }
                }
              }
              self.error = 0;
              device.destroy();
              setTimeout(function(){
                self.getAlarm(accessory, service);
              }, 10000);
            })
            .catch(err => {
              self.logger.error(accessory.displayName + ': An error occured by getting alarm state!');
              self.logger.error(err);
              device.destroy();
              if(type == 1){
                service.getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(accessory.context.lastCurrentAlarmState);
                service.getCharacteristic(Characteristic.SecuritySystemTargetState).updateValue(accessory.context.lastTargetAlarmState);
              } else if(type == 2){
                service.getCharacteristic(Characteristic.On).updateValue(accessory.context.lastSwitchState);
              }
              setTimeout(function(){
                self.getAlarm(accessory, service);
              }, 30000);
            });
        })
        .catch(err => {
          if(self.error > 5){
            self.error = 0;
            self.logger.error(accessory.displayName + ': An error occured by connecting to gateway for getting new alarm state!');
            self.logger.error(err);
            setTimeout(function(){
              self.getAlarm(accessory, service);
            }, 60000);
          } else {
            self.error += 1;
            setTimeout(function(){
              self.getAlarm(accessory, service);
            }, 30000);
          }
        });
    }
  }
  
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // Set Alarm
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  
  setAlarm(accessory, service, state, callback){
    const self = this;
    let type = accessory.context.type;
    let val;
    if(type == 1){ // Alarm, 3 = OFF ; 1 = ON
      state == 1 ? val = 'on' : val = 'off';
    } else if(type == 2){ // Virtual Switch, state = ON ; !state = OFF 
      state ? val = 'on' : val = 'off';
    } else { // Programmable Switch, 1 = OFF ; 0 == ON
      state == 0 ? val = 'on' : val = 'off';
    }
    if(!accessory.context.disable){
      miio.device({address: accessory.context.ip, token: accessory.context.token})
        .then(device => {
          device.call('set_arming', [val])
            .then(result => {
              if(result[0] === 'ok') {
                val == 'on' ? self.logger.info(accessory.displayName + ': Alarm activated!') : self.logger.info(accessory.displayName + ': Alarm deactivated!');
                if(type == 1){
                  service.getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(state);
                  accessory.context.lastTargetAlarmState = state;
                  accessory.context.lastCurrentAlarmState = state;
                } else if (type == 2){
                  service.getCharacteristic(Characteristic.On).updateValue(state);
                  accessory.context.lastSwitchState = state;
                }
                callback(null, state);
              } else {
                self.logger.error(accessory.displayName + ': An error occured by setting alarm state!');
                self.logger.error(result[0]);
                if(type == 1){
                  if(state == 1){
                    service.getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(3);
                    accessory.context.lastTargetAlarmState = 3;
                    accessory.context.lastCurrentAlarmState = 3;
                    callback(null, 3);
                  } else {
                    service.getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(1);
                    accessory.context.lastTargetAlarmState = 1;
                    accessory.context.lastCurrentAlarmState = 1;
                    callback(null, 1);
                  }
                } else if (type == 2){
                  if(state){
                    service.getCharacteristic(Characteristic.On).updateValue(false);
                    accessory.context.lastSwitchState = false;
                    callback(null, false);
                  } else {
                    service.getCharacteristic(Characteristic.On).updateValue(true);
                    accessory.context.lastSwitchState = true;
                    callback(null, true);
                  }
                }
              }
            })
            .catch(err => {
              self.logger.error(accessory.displayName + ': An error occured by setting alarm state!');
              self.logger.error(err);
              callback(null);
              setTimeout(function(){
                if(type == 1){
                  if(state == 1){
                    service.getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(3);
                    accessory.context.lastTargetAlarmState = 3;
                    accessory.context.lastCurrentAlarmState = 3;
                  } else {
                    service.getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(1);
                    accessory.context.lastTargetAlarmState = 1;
                    accessory.context.lastCurrentAlarmState = 1;
                  }
                } else if (type == 2){
                  if(state){
                    service.getCharacteristic(Characteristic.On).updateValue(false);
                    accessory.context.lastSwitchState = false;
                  } else {
                    service.getCharacteristic(Characteristic.On).updateValue(true);
                    accessory.context.lastSwitchState = true;
                  }
                }
              }, 500);
            });
        })
        .catch(err => {
          self.logger.error(accessory.displayName + ': An error occured by connecting to gateway for setting new alarm state!');
          self.logger.error(err);
          callback(null);
          setTimeout(function(){
            if(type == 1){
              if(state == 1){
                service.getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(3);
                accessory.context.lastTargetAlarmState = 3;
                accessory.context.lastCurrentAlarmState = 3;
              } else {
                service.getCharacteristic(Characteristic.SecuritySystemCurrentState).updateValue(1);
                accessory.context.lastTargetAlarmState = 1;
                accessory.context.lastCurrentAlarmState = 1;
              }
            } else if (type == 2){
              if(state){
                service.getCharacteristic(Characteristic.On).updateValue(false);
                accessory.context.lastSwitchState = false;
              } else {
                service.getCharacteristic(Characteristic.On).updateValue(true);
                accessory.context.lastSwitchState = true;
              }
            }
          }, 500);
        });
    }
  }
  
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  // Options
  //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//
  
  initialTimer(accessory, timer){
    const self = this;
    let duration = moment().unix()-timer;
    if(!isNaN(duration) && duration > accessory.context.resetTimer-1 && duration < accessory.context.resetTimer+1){
      self.logger.info('No input over ' + accessory.context.resetTimer + ' seconds, resetting...');
      accessory.context.morseArray = JSON.parse(JSON.stringify(accessory.context.morseCode));
      self.timer;
    }
    setTimeout(function(){
      self.initialTimer(accessory, self.timer);
    }, 1000);
  }
  
  learnAlarm(accessory, service, state, callback){
    const self = this;
    if(state){
      self.logger.info(accessory.displayName + ': Start learning...');
    } else {
      self.logger.info(accessory.displayName + ': Stop learning...');
    }
    callback(null, state);
  }
  
}

module.exports = Alarm_Switch;
