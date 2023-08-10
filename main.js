'use strict';

/*
 * Created with @iobroker/create-adapter v2.5.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils  = require('@iobroker/adapter-core');
const http   = require('http');
const xml2js = require('xml2js');
const parser = new xml2js.Parser({
    trim: true,
});

// Load your modules here, e.g.:
// const fs = require("fs");

class Tcw181bCm extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'tcw181b-cm',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    Relays = []
    /**
     * Get xml-data and/or set module parameter.
     */
    xmlGetSet(parameter = '') {
        const self = this;

        //console.log('LOAD');
        return new Promise((resolve, reject) => {
            http.get(`http://${this.config.serverIp}/status.xml?${parameter}`, {
                headers: {
                    Accept: 'application/xml',
                },
                timeout: 5000,
            },
            res => {
                let D = '';

                res.setEncoding('utf8');
                res.on('data', xml => {
                    D += xml.toString();
                }).on('end', () => {
                    parser.parseString(D, async function (err, r) {
                        if (err) {
                            self.log.error(err.toString());
                            return;
                        }
                        resolve(r.Monitor);
                    });
                });
            }).on('error', err => {
                self.log.error(err.toString());
                reject(err);
            }).on('timeout', () => {
                self.log.error('HTTP Timeout');
                reject(new Error('HTTP Timeout'));
            });
        });
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        const self = this;
        this.log.debug(`Current IP ${this.config.serverIp}`);
        this.subscribeObjects('serverIp');
        try {
            let xml = await this.xmlGetSet.call(this);

            //console.log(JSON.stringify(xml, null, 2));
            //await this.delObject('digitalinput');

            await this.setObjectNotExists('digitalinput', {
                'type':'channel',
                'common':{
                    'name': {
                        'en': 'Digital input',
                        'de': 'Digitaler Eingang',
                        'ru': 'Цифровой вход',
                        'pt': 'Entrada digital',
                        'nl': 'Digitale input',
                        'fr': 'Entrée numérique',
                        'it': 'Ingresso digitale',
                        'es': 'Entrada digital',
                        'pl': 'Digital dane',
                        'uk': 'Цифровий вхід',
                        'zh-cn': '数字投入'
                    }
                },
                'native':{
                }
            });

            for (const o of ['DigitalInputDescription', 'DigitalInput']) {
                //await this.delObject(`digitalinput.${o}`);
                await self.setObjectNotExists(`digitalinput.${o}`, {
                    'type': 'state',
                    'common': {
                        'role': 'text',
                        'name': o,
                        'type': 'string',
                        'read': true,
                        'write': false
                    },
                    native: {},
                });
                await this.setStateAsync(`digitalinput.${o}`, {val: xml[o][0], ack: true});
            }

            await this.setObjectNotExists('relays', {
                'type':'channel',
                'common':{
                    'name': {
                        "en": "Relay",
                        "de": "Relais",
                        "ru": "Реле",
                        "pt": "Reposição",
                        "nl": "Vertaling:",
                        "fr": "Relay",
                        "it": "Relè",
                        "es": "Relay",
                        "pl": "Relay",
                        "uk": "Реле",
                        "zh-cn": "拖延"
                    }
                },
                'native':{
                }
            });

            for (let i = 1;;i++) {
                let o = `Relay${i}Description`;

                if (xml[o] == undefined)
                    break;

                //await this.delObject(`relays.${o}`);
                await self.setObjectNotExists(`relays.${o}`, {
                    'type': 'state',
                    'common': {
                        'role': 'text',
                        'name': o,
                        'type': 'string',
                        'read': true,
                        'write': false
                    },
                    native: {},
                });
                await this.setStateAsync(`relays.${o}`, {val: xml[o][0], ack: true});

                o = `pw${i}`;
                //await this.delObject(`relays.${o}`);
                await self.setObjectNotExists(`relays.Relay${i}Pw`, {
                    'type': 'state',
                    'common': {
                        'role': 'text',
                        'name': o,
                        'type': 'number',
                        'read': true,
                        'write': false
                    },
                    native: {},
                });
                await this.setStateAsync(`relays.Relay${i}Pw`, {val: parseFloat(xml[o][0]), ack: true});

                o = `Relay${i}`;
                //await this.delObject(`relays.${o}`);
                await self.setObjectNotExists(`relays.${o}`, {
                    'type': 'state',
                    'common': {
                        'role': 'text',
                        'name': o,
                        'type': 'boolean',
                        'read': true,
                        'write': true
                    },
                    native: {},
                });

                this.Relays[i] = xml[o][0];
                await this.setStateAsync(`relays.${o}`, {val: xml[o][0] != 'OFF', ack: true});
                await this.subscribeStates(`relays.${o}`);

                await self.setObjectNotExists(`relays.${o}Pulse`, {
                    'type': 'state',
                    'common': {
                        'role': 'text',
                        'name': o,
                        'type': 'boolean',
                        'read': true,
                        'write': true
                    },
                    native: {},
                });
                await this.setStateAsync(`relays.${o}Pulse`, {val: xml[o][0] == 'in pulse', ack: true});
                await this.subscribeStates(`relays.${o}Pulse`);
            }

            await this.setStateAsync('deviceInfo.online', {val: true, ack: true});
            for (const o of ['Device', 'ID', 'Hostname', 'FW']) {
                await this.setStateAsync(`deviceInfo.${o}`, {val: xml[o][0], ack: true});
            }
        } catch (err) {
            await this.setStateAsync('deviceInfo.online', {val: false, ack: true});
        }


        this.T = setTimeout(polling, this.config.polling);

        async function polling() {
            try {
                let xml = await self.xmlGetSet.call(self);

                await self.setStateAsync('deviceInfo.online', {val: true, ack: true});
                for (let i = 1;;i++) {
                    let o = `Relay${i}`;

                    if (xml[o] == undefined)
                        break;

                    if (self.Relays[i] != xml[o][0]) {
                        let pulseId  = `relays.${o}Pulse`,
                            relayId  = `relays.${o}`;

                        if (xml[o][0] == 'in pulse') {
                            await self.setStateAsync(relayId, {val: self.Relays[i] == 'OFF', ack: true});
                            await self.setStateAsync(pulseId, {val: true, ack: true});
                        } else {
                            await self.setStateAsync(relayId, {val: xml[o][0] != 'OFF', ack: true});
                            await self.setStateAsync(pulseId, {val: false, ack: true});
                        }
                        self.Relays[i] = xml[o][0];
                    }
                }

                self.T = setTimeout(polling, self.config.polling);
            } catch (err) {
                await self.setStateAsync('deviceInfo.online', {val: false, ack: true});
                self.T = setTimeout(polling, 50000);
            }
        }

/*
        // Initialize your adapter here

        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.log.info('config option1: ' + this.config.option1);
        this.log.info('config option2: ' + this.config.option2);

        /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */
/*

        await this.setObjectNotExistsAsync('testVariable', {
            type: 'state',
            common: {
                name: 'testVariable',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: true,
            },
            native: {},
        });
*/
        // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
//        this.subscribeStates('testVariable');
        // You can also add a subscription for multiple states. The following line watches all states starting with "lights."
        // this.subscribeStates('lights.*');
        // Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
        // this.subscribeStates('*');

        /*
            setState examples
            you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
        */
        // the variable testVariable is set to true as command (ack=false)
//        await this.setStateAsync('testVariable', true);

        // same thing, but the value is flagged "ack"
        // ack should be always set to true if the value is received from or acknowledged from the target system
//        await this.setStateAsync('testVariable', { val: true, ack: true });

        // same thing, but the state is deleted after 30s (getState will return null afterwards)
//        await this.setStateAsync('testVariable', { val: true, ack: true, expire: 30 });
        /*
        // examples for the checkPassword/checkGroup functions
        let result = await this.checkPasswordAsync('admin', 'iobroker');
        this.log.info('check user admin pw iobroker: ' + result);

        result = await this.checkGroupAsync('admin', 'admin');
        this.log.info('check group user admin group admin: ' + result);
        */
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);
            if (this.T)
                clearTimeout(T);
            callback();
        } catch (e) {
            callback();
        }
    }

    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    /**
     * Is called if a subscribed object changes
     * @param {string} id
     * @param {ioBroker.Object | null | undefined} obj
     */
    onObjectChange(id, obj) {
        console.log('onObjectChange', id , JSON.stringify(obj));
        if (obj) {
//            this.xmlGetSet.call(this);
            // The object was changed
            this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        } else {
            // The object was deleted
            this.log.info(`object ${id} deleted`);
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    async onStateChange(id, state) {

        if (!state)
            return;
        if (!state.ack) {
            let a = id.match(/.*Relay(\d)$/);
            if (a) {
                await this.xmlGetSet.call(this, `r${a[1]}=${state.val ? 1 : 0}`);
                return;
            }

            a = id.match(/.*Relay(\d)Pulse$/);
            if (a) {
                await this.xmlGetSet.call(this, `pl${a[1]}=1`);
            }
        }
    }

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  * @param {ioBroker.Message} obj
    //  */
    // onMessage(obj) {
    //     if (typeof obj === 'object' && obj.message) {
    //         if (obj.command === 'send') {
    //             // e.g. send email or pushover or whatever
    //             this.log.info('send command');

    //             // Send response in callback if required
    //             if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
    //         }
    //     }
    // }

}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Tcw181bCm(options);
} else {
    // otherwise start the instance directly
    new Tcw181bCm();
}