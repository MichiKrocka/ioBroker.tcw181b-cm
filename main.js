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
    /**
     * Get xml-data and/or set module parameter.
     */
    xmlGetSet(parameter = '') {
        const self = this;

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
            const xml = await this.xmlGetSet.call(this);

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
                        //'uk': 'Цифровий вхід',
                        'zh-cn': '数字投入'
                    }
                },
                'native':{
                }
            });

            for (const o of ['DigitalInputDescription', 'DigitalInput']) {
                await this.setObjectNotExists(`digitalinput.${o}`, {
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
                        'en': 'Relay',
                        'de': 'Relais',
                        'ru': 'Реле',
                        'pt': 'Reposição',
                        'nl': 'Vertaling:',
                        'fr': 'Relay',
                        'it': 'Relè',
                        'es': 'Relay',
                        'pl': 'Relay',
                        //'uk': 'Реле',
                        'zh-cn': '拖延'
                    }
                },
                'native':{
                }
            });
            this.Relays = [];

            for (let i = 1;;i++) {
                let o = `Relay${i}Description`;

                if (xml[o] == undefined)
                    break;

                await this.setObjectNotExists(`relays.${o}`, {
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
                await this.setObjectNotExists(`relays.Relay${i}Delay`, {
                    'type': 'state',
                    'common': {
                        'role': 'text',
                        'name': `Relay${i}Delay`,
                        'type': 'number',
                        'read': true,
                        'write': false,
                        'min': 0,
                        'step': 1,
                        'unit': 's'
                    },
                    native: {},
                });
                await this.setStateAsync(`relays.Relay${i}Delay`, {val: parseFloat(xml[o][0]), ack: true});

                o = `Relay${i}`;
                await this.setObjectNotExists(`relays.${o}`, {
                    'type': 'state',
                    'common': {
                        'role': 'text',
                        'name': `${o}State`,
                        'type': 'boolean',
                        'read': true,
                        'write': true
                    },
                    native: {},
                });

                this.Relays[i] = xml[o][0];
                await this.setStateAsync(`relays.${o}`, {val: xml[o][0] != 'OFF', ack: true});
                await this.subscribeStates(`relays.${o}`);

                await this.setObjectNotExists(`relays.${o}Pulse`, {
                    'type': 'state',
                    'common': {
                        'role': 'text',
                        'name': `${o}Pulse`,
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
                const xml = await self.xmlGetSet.call(self);

                await self.setStateAsync('deviceInfo.online', {val: true, ack: true});
                for (let i = 1;;i++) {
                    const o = `Relay${i}`;

                    if (xml[o] == undefined)
                        break;

                    if (self.Relays[i] != xml[o][0]) {
                        const pulseId  = `relays.${o}Pulse`,
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
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            if (this.T)
                clearTimeout(this.T);
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
            //this.xmlGetSet.call(this);
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