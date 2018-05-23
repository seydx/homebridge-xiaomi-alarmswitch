# homebridge-xiaomi-alarmswitch v1.1

Homebridge dynamic platform plugin for Xiaomi Aqara Switches with morse code functionality

[![npm](https://img.shields.io/npm/v/homebridge-xiaomi-alarmswitch.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-xiaomi-alarmswitch)
[![npm](https://img.shields.io/npm/dt/homebridge-xiaomi-alarmswitch.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-xiaomi-alarmswitch)
[![GitHub last commit](https://img.shields.io/github/last-commit/SeydX/homebridge-xiaomi-alarmswitch.svg?style=flat-square)](https://github.com/SeydX/homebridge-xiaomi-alarmswitch)

This homebridge plugin exposes Xiaomi Aqara switches setted in config.json as switch accessory to HomeKit with **morse code** functionality! 


## What means 'morse code'?

Well, i'm using this switch for activating/deactivating my house alarm. Normally i need to single click on the button for activating the alarm and double click for deactivating. But this seems not to be secure. Because of this, i have created this plugin to give these switches a special functionality!.

[Plugin in action](https://www.dropbox.com/s/y2i19sba0881pxj/Video%2022.05.18%2C%2009%2011%2008.mov?dl=0)


## Compatible switches

![](https://raw.githubusercontent.com/SeydX/homebridge-xiaomi-alarmswitch/master/images/Buttonv1.jpg)
![](https://raw.githubusercontent.com/SeydX/homebridge-xiaomi-alarmswitch/master/images/Buttonv2.jpg)


## Token and switch/device ID

In order to work without any problems, this plugin uses the "miio" module for discovering and storing the gateway information in your persist folder. Because of this, it is not temporarely important to set the ip adress and/or token in the config.json file. But it is recommended if you have multiple gateways to choose a specific gateway!

The switch/device id from the switch that want to be "enhanced" with this plugin, need to be discovered manually! In order to do that, please install miio!

```
sudo npm i -g miio@latest
```

After installing miio, type following command in your terminal

```
miio discover
```

This will list all your connected devices! Thi plugin works only with the **lumi.switch** . In my case, it looks like so:
```
Device ID: 123a45678bc901
Model info: lumi.switch
Address: Owned by miio:12345678
Token: Automatic via parent device
Support: At least basic
```

The **Device ID** must be setted in config.json! Otherwise the plugin can not expose switches to HomeKit! (see example-config below)



## Installation instructions

After [Homebridge](https://github.com/nfarina/homebridge) has been installed:

 ```sudo npm install -g homebridge-xiaomi-alarmswitch@latest```
 
 
 ## Example config.json

 ```
{
  "bridge": {
      ...
  },
  "platforms": [
    {
      "platform":"AlarmSwitch",
      "name":"Alarm Switch",
      "switches":{
        "123a45678bc901":{
          "disable":false,
          "resetTimer":10,
          "singleClick":1,
          "doubleClick":2
        }
      }
    }
  ]
}
```

 ## Advanced config.json

 ```
{
  "bridge": {
      ...
  },
  "platforms": [
    {
      "platform":"AlarmSwitch",
      "name":"Alarm Switch",
      "ip":"192.168.1.1",
      "token":"abcdefghijklmon123456789",
      "switches":{
        "123a45678bc901":{
          "disable":false,
          "resetTimer":10,
          "singleClick":1,
          "doubleClick":2
        },
        "124a45678bc902":{
          "disable":false,
          "resetTimer":15,
          "singleClick":2,
          "doubleClick":3
        }
      }
    }
  ]
}
```
See [Example Config](https://github.com/SeydX/homebridge-xiaomi-alarmswitch/edit/master/example-config.json) for more details.


## Functionality
- You can give every switch a value for a **single click** and for a **double click**
- The **long click** acts only for **confirmation** (after giving the morse code) or setting the switch on (if no code is given)
- **Example**: singleClick = 1 and doubleClick = 2 (see example-config below), this means that after entering the 1x "single click" and 2x "double click" (order does not matter) and then confirm it with a "long click", the switch will turn off, after entering a "long click" again, the switch will turn on.


## Options

| Attributes | Required | Usage |
|------------|----------|-------|
| platform | Yes | Must be **AlarmSwitch**  |
| name | no | Name for the switch. Will be used as part of the accessory name.  |
| ip | no | IP adresse from the Gateway (if no setted in config, the plugin will automatically find the ip)  |
| token | no | Token from the Gateway (if no setted in config, the plugin will automatically find the token)  |
| switches.disable | no | If disable = true, the switch will be removed from HomeKit (Default: false)  |
| switches.resetTimer | no | Timer (in seconds) for resetting the switch if no input is detected (Default: 10) |
| switches.singleClick | no | Amount of single clicks (Default: 1) |
| switches.disable | no | Amount of double clicks (Default: 1) |

See [Example Config](https://github.com/SeydX/homebridge-tado-platform/edit/master/example-config.json) for more details.



## Supported clients

This plugin has been verified to work with the following apps on iOS 11.3.1:

* Apple Home
* All 3rd party apps like Elgato Eve etc.


## Known issues / TODO

**Issues**
///

**TODO**
- [ ] "Learn Code" Function
- [ ] Prorammable switch
- [ ] Option to set also the order of clicks


## Contributing

You can contribute to this homebridge plugin in following ways:

- [Report issues](https://github.com/SeydX/homebridge-xiaomi-alarmswitch/issues) and help verify fixes as they are checked in.
- Review the [source code changes](https://github.com/SeydX/homebridge-xiaomi-alarmswitch/pulls).
- Contribute bug fixes.
- Contribute changes to extend the capabilities

Pull requests are accepted.
