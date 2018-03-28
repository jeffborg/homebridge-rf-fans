"use strict";

var exec = require("child_process").exec;

var Accessory, Service, Characteristic, UUIDGen;

module.exports = function(homebridge) {
  
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform("homebridge-rf-fans", "RfFans", RfFansPlatform, true);
}

class RfFansPlatform {
	constructor(log, config, api) {
		this.log = log;

    	var platform = this;
 	    this.config = config;
 	    console.log(config);
		this.accessories = [];
		this.remotes = config.remotes || [];
		
		// this.log("RFFANS CONSTRUCTOR" + arguments);
	  // this.timeout = config["timeout"] || 1000;
	    
	  // this.devices = config["devices"];
	    	  
	  // this.log("RfFans Platform Plugin Version " + this.getVersion());
	 if (api) {
	      // Save the API object as plugin needs to register new accessory via this object
	      this.api = api;

	      // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories.
	      // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
	      // Or start discover new accessories.
	      this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
		}

	}

	didFinishLaunching() {
		// this.log("did finish launching!");
	  // Add or update accessories defined in config.json
	  for (var i in this.remotes) this.addAccessory(this.remotes[i]);
	}

	// new plugin methos
	configureAccessory(accessory) {
		// console.log("CONFIGURE ACCESSORY", accessory);
		//wrap in other object
		new RfFansAccessory(accessory, this.log);
		this.accessories[accessory.context.name] = accessory;
	}

	addAccessory(config) {
		// console.log("ACCESSORIES!");
		// console.log(this.accessories)
		// console.log("ACCESSORIES!");

		  // this.log("Add Accessory", config);
			var accessoryObject = this.accessories[config.name];

			if(!accessoryObject) {

		  	  let uuid = UUIDGen.generate(config.name);
		  	  // console.log(uuid);
		      accessoryObject = new Accessory(config.name, uuid);
		      accessoryObject.context = config;

			  var accessory = new RfFansAccessory(accessoryObject, this.log);
	 		this.accessories[accessoryObject.context.name] = accessory;
			  this.api.registerPlatformAccessories("homebridge-rf-fans", "RfFans", [accessoryObject]);

		}




		  // var platform = this;
		  // var uuid;

		  // uuid = UUIDGen.generate(accessoryName);

		  // var newAccessory = new Accessory(accessoryName, uuid);
		  // newAccessory.on('identify', function(paired, callback) {
		  //   platform.log(accessory.displayName, "Identify!!!");
		  //   callback();
		  // });
		  // // Plugin can save context on accessory to help restore accessory in configureAccessory()
		  // // newAccessory.context.something = "Something"
		  
		  // // Make sure you provided a name for service, otherwise it may not visible in some HomeKit apps
		  // newAccessory.addService(Service.Lightbulb, "Test Light")
		  // 
		  // .on('set', function(value, callback) {
		  //   platform.log(accessory.displayName, "Light -> " + value);
		  //   callback();
		  // });

		}

}


const LIGHT_ON = 0xafe,
	LIGHT_OFF = 0x2ff,
	FAN_OFF = 0xaf1,
	FAN_LOW = 0xafd,
	FAN_MED = 0xafb,
	FAN_HIGH = 0xaf7;

class RfFansAccessory {
	constructor(accessory, log) {
	    this.log = log;
	    this.accessory = accessory;
	    this.light = false;
	    this.fanStatus = 0;

	    if(!this.accessory.getService(Service.Lightbulb)) {
	    	this.accessory.addService(Service.Lightbulb, "Light");
	    }
	    this.accessory.getService(Service.Lightbulb)
		    .getCharacteristic(Characteristic.On)
	        .on('set',  this.lightChange.bind(this))
	        .on('get', this.lightStatus.bind(this))
	        .value = this.light;

	    if(!this.accessory.getService(Service.Fan)) {
	    	this.accessory.addService(Service.Fan, "Fan");
	    }
	    // set the fan on/ off
	    var fanService = this.accessory.getService(Service.Fan)

    	 fanService.getCharacteristic(Characteristic.On)
	    	  .on('get', this.getFanStatus.bind(this))
	    	  .on('set', this.fanChange.bind(this))
	    	  .value = (this.fanStatus>0);

	   	if(!fanService.getCharacteristic(Characteristic.RotationSpeed)) {
	   		fanService.addCharacteristic(Characteristic.RotationSpeed);
	   	}
	    fanService
		  .getCharacteristic(Characteristic.RotationSpeed)
        	.setProps({
                minValue: 0,
                maxValue: 3,
                minStep: 1
            })
		  .on('get', this.fanStatusSpeed.bind(this))
		  .on('set', this.fanChangeSpeed.bind(this))
		  .value = this.fanStatus;

	}

	fanStatusSpeed(callback) {
		callback(null, this.fanStatus);
	}

	fanChangeSpeed(value, callback) {
		this.fanStatus = value;
		var speed = FAN_OFF;
		switch(value) {
			case 1:
				speed = FAN_LOW;
				break;
			case 2:
				speed = FAN_MED;
				break;
			case 3:
				speed = FAN_HIGH;
		}
		this.sendCommand(speed, callback);
	}


	// this is setting the fan off/ slow
	fanChange(value, callback) {
		this.fanStatus = value ? 1 : 0;
		this.sendCommand(value ? FAN_LOW : FAN_OFF, callback);
	}

	getFanStatus(callback) {
		callback(null, this.fanStatus > 0);
	}

	lightChange(value, callback) {
		this.light = value;
		this.sendCommand(value ? LIGHT_ON : LIGHT_OFF, callback);
	}

	lightStatus(callback) {
		callback(null, this.light);
	}

	sendCommand(command, callback) {
		console.log(`SENDING COMMAND TO ${this.accessory.context.name} as ${command ^ this.getMask()}`);
		var self = this;
		// TODO move this to some form of config!
		// TODO also listen for incoming commands to update state
	  exec(`/usr/local/bin/send ${command}`, function (error, stdout, stderr) {
	    // Error detection
	    if (error) {
	      self.log("Failed to run command");
	      self.log(stderr);
	    } 
        callback();
	  });

	}

	getMask() {
		// var arr = [true, true, true, true];
		if(!this.mask) {
			var mask = 0xfff,
				arr = this.accessory.context.switches;

			for(let i = 0; i < 4; i++) {
				mask = mask ^ (arr[i] << (3-i)+4 )
			}
			this.mask = mask;
		}

		return this.mask;

	}

}

