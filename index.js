"use strict";
	
const AsyncLock = require('async-lock'),
    lock = new AsyncLock({}),
	exec = require("child_process").exec;

let Accessory, Service, Characteristic, UUIDGen;

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
	    this.lastFanSpeed = 1;
	    this.isFanOn = false;

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
	    	  .value = this.isFanOn;

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
		  .value = this.lastFanSpeed;

	}

	// set the fan state 0-3 indicating a on/off or a speed
	// if you leave newSpeed blank then the last speed will be used.
	// null dosen't equal false or 0 so safe to use ==
	_fanSetState(onOff, newSpeed, callback) {
		if(newSpeed == 0) {
			onOff == false;
			newSpeed = null;
		}
		if(onOff == true && newSpeed == null) {
			// no new speed set use last used setting
			newSpeed = this.lastFanSpeed;
		}

		if(onOff == false && this.isFanOn == true) {
			// turning fan off ignore newSpeed
			this.isFanOn = false;
			this.sendCommand(FAN_OFF, callback);
			return;
		}
		if(newSpeed > 0 && (!this.isFanOn  || newSpeed != this.lastFanSpeed)) {
			// turning fan on some speed
			var speed = FAN_LOW;
			switch(newSpeed) {
				case 1:
					speed = FAN_LOW;
					break;
				case 2:
					speed = FAN_MED;
					break;
				case 3:
					speed = FAN_HIGH;
					break;
			}
			this.lastFanSpeed = newSpeed;
			this.isFanOn = true;
			this.sendCommand(speed, callback);
			return;
		}
		// just call callback nothing to do here :)
		callback(null);
	}

	fanStatusSpeed(callback) {
		callback(null, this.lastFanSpeed);
	}

	fanChangeSpeed(value, callback) {
		this._fanSetState(null, value, callback);
	}

	_debugValues(text, newValue) {
		this.log(`ON/OFF: ${this.isFanOn} SPEED: ${this.lastFanSpeed} ${text}: ${newValue}`);
	}


	// this is setting the fan off/ slow
	fanChange(value, callback) {
		this._fanSetState(value, null, callback);
	}

	getFanStatus(callback) {
		this._debugValues("getFanStatus");
		callback(null, this.isFanOn);
	}

	lightChange(value, callback) {
		this.light = value;
		this.sendCommand(value ? LIGHT_ON : LIGHT_OFF, callback);
	}

	lightStatus(callback) {
		callback(null, this.light);
	}

	sendCommand(command, callback) {
		var self = this;
		// Promise mode
		lock.acquire("rf-fans-send", function(cb) {

			console.log(`SENDING COMMAND TO ${self.accessory.context.name} as ${command & self.getMask()}`);
			// TODO move this to some form of config!
			// TODO also listen for incoming commands to update state
		  exec(`/usr/local/bin/send ${command & self.getMask()}`, function (error, stdout, stderr) {
		    // Error detection
		    if (error) {
		      self.log("Failed to run command");
		      self.log(stderr);
		    }  // end if err!
		    setTimeout(() => {
		    	cb();
		    }, 150); // end setTimeout
		  }); // end EXEC!
		}, function() {
    	    callback(null);
		});	

	}

	getMask() {
		// var arr = [true, true, true, true];
		if(!this.mask) {
			console.log("SETTING MASK!");
			var mask = 0xfff,
				arr = this.accessory.context.switches;

			for(let i = 0; i < 4; i++) {
				mask = mask ^ (arr[i] << (3-i)+4 )
			}
			this.mask = mask;
			console.log("SETTING MASK! " + mask);
		}

		return this.mask;

	}

}

