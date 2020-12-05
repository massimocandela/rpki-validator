const realAxios = require("axios");
const brembo = require("brembo");
const ripeConnector = require("./connectors/RIPEConnector");
const nttConnector = require("./connectors/NTTConnector");
const cloudflareConnector = require("./connectors/CloudflareConnector");
const externalConnector = require("./connectors/ExternalConnector");
const ip = require("ip-sub");
const RadixTrie = require("radix-trie-js");

const RpkiValidator = function (options) {
    const defaults = {
        connector: "ntt",
        httpsAgent: null,
        axios: null,
        clientId: "rpki-validator_js"
    };

    this.options = Object.assign({}, defaults, options);

    if (!this.options.axios) {
        this.options.axios = realAxios;
        if (this.options.httpsAgent) {
            this.options.axios.defaults.httpsAgent = options.httpsAgent;
        }
        this.options.axios.defaults.timeout = 180000;
    }
    const axios = this.options.axios;

    this.queue = {};
    this.preCached = false;
    this.roas = {
        v4 : new RadixTrie(),
        v6 : new RadixTrie()
    };

    this.keySizes = {
        v4: 12,
        v6: 24
    };

    this.connectors = {
        ripe: new ripeConnector(this.options),
        ntt: new nttConnector(this.options),
        cloudflare: new cloudflareConnector(this.options),
        external: new externalConnector(this.options),
    };

    this.connector = this.connectors[this.options.connector];

    if (!this.connector) {
        throw new Error("The specified connector is not valid");
    }

    this._getPrefixMatches = (prefix) => {
        const af = ip.getAddressFamily(prefix);
        const binaryPrefix = ip.getNetmask(prefix, af);
        const roas = this._getRoas(binaryPrefix, af) || [];

        return roas.filter(roa => roa.binaryPrefix === binaryPrefix || ip.isSubnetBinary(roa.binaryPrefix, binaryPrefix));
    };

    this.validateFromCacheSync = (prefix, origin, verbose) => {
        const roas = this._getPrefixMatches(prefix);

        if (roas.length === 0) {
            return this.createOutput(null, null, verbose, null);
        }  else {
            const covering = roas.map(i => {
                return {
                    prefix: i.prefix,
                    maxLength: i.maxLength,
                    asn: i.asn,
                    ta: i.ta || ""
                };
            })

            return this.checkCoveringROAs(origin, prefix, covering, verbose);
        }
    };

    this._validateFromCache = (prefix, origin, verbose) =>
        Promise.resolve(this.validateFromCacheSync(prefix, origin, verbose));

    this._validateOnline = (prefix, origin, verbose) => {
        const key = "a" + [prefix, origin]
            .join("AS")
            .replace(/\./g, "_")
            .replace(/\:/g, "_")
            .replace(/\//g, "_");

        if (!this.queue[key]) {
            const promise = new Promise((resolve, reject) => {
                this.queue[key] = {
                    prefix,
                    origin,
                    key,
                    resolve,
                    reject,
                    verbose
                };
            });

            this.queue[key].promise = promise;
        }

        return this.queue[key].promise;

    };


    this.createOutput = (sameOrigin, validLength, verbose, covering) => {
        let valid = sameOrigin && validLength;
        let reason = (!sameOrigin) ? "Not valid origin" :
            ((!validLength) ? "Not valid prefix length" : null);

        if (sameOrigin === null && validLength === null) {
            reason = "No ROA available for this prefix";
            valid = null;
        }

        if (verbose) {
            return {
                valid,
                reason,
                covering: covering || []
            };
        } else {
            return valid;
        }
    };

    this.getValidatedPrefixes = (force) => {
        if (!force && this.preCached) {
            return new Promise((resolve, reject) => {
                resolve(true);
            });
        } else {
            return this.connector
                .getVRPs()
                .then(list => {
                    if (list) {
                        this.preCached = true;
                        this.roas = {
                            v4: new RadixTrie(),
                            v6: new RadixTrie()
                        };

                        for (let roa of list) {
                            this._addRoa(roa);
                        }

                        return true;
                    } else {
                        return false;
                    }
                });
        }
    };

    this.preCache = (everyMinutes) => {
        if (everyMinutes !== this.refreshVrpEveryMinutes) {
            this.refreshVrpEveryMinutes = everyMinutes;
            if (everyMinutes) {
                if (everyMinutes < this.connector.minimumRefreshRateMinutes) {
                    return Promise.reject(new Error(`The VRP list can be updated at most once every ${this.connector.minimumRefreshRateSeconds} minutes.`));
                }

                if (this.cacheTimer) {
                    clearInterval(this.cacheTimer);
                }

                this.cacheTimer = setInterval(() => {
                    this.preChachePromise = this.getValidatedPrefixes(true)
                        .catch(error => {
                            console.log(error);
                            return false;
                        });
                }, everyMinutes * 60 * 1000);
            } else {
                if (this.cacheTimer) {
                    clearInterval(this.cacheTimer);
                }
            }
        }

        if (!this.preChachePromise) {
            this.preChachePromise = this.getValidatedPrefixes();
        }

        return this.preChachePromise;
    };

    this.validate = (prefix, origin, verbose) => {
        if (origin == null) {
            throw new Error("Origin AS missing");
        }
        origin = parseInt(origin.toString().replace("AS", ""));

        if (prefix == null || typeof(prefix) !== "string" || !ip.isValidPrefix(prefix)) {
            throw new Error("Prefix missing or not valid");
        }


        if (this.preCached) {
            return this._validateFromCache(prefix, origin, verbose);
        } else {
            return this._validateOnline(prefix, origin, verbose);
        }
    };

    this._getRoas = (binaryNetmask, af) => {
        if (af === 4) {
            return this.roas.v4.get(binaryNetmask.slice(0, this.keySizes.v4));
        } else {
            return this.roas.v6.get(binaryNetmask.slice(0, this.keySizes.v6));
        }
    };

    this._addRoa = (roa) => {
        const prefix = roa.prefix;
        const af = ip.getAddressFamily(prefix);
        roa.binaryPrefix = ip.getNetmask(prefix, af);

        if (af === 4) {
            const key = roa.binaryPrefix.slice(0, this.keySizes.v4);
            if (!this.roas.v4.has(key)) {
                this.roas.v4.add(key, []);
            }
            this.roas.v4.get(key).push(roa);
        } else {
            const key = roa.binaryPrefix.slice(0, this.keySizes.v6);
            if (!this.roas.v6.has(key)) {
                this.roas.v6.add(key, []);
            }
            this.roas.v6.get(key).push(roa);
        }
    };

    this._validateBundle = () => {
        const items = Object.values(this.queue);
        if (items.length) {
            const bundledValidationRequests = {
                query: 'query {' +
                    items
                        .filter(item => !item.ongoing)
                        .map(item => {
                            item.ongoing = true;
                            return `${item.key}:validation(prefix:"${item.prefix}", asn:${item.origin}) {state, covering { asn, prefix { prefix, maxLength } }}`;
                        })
                        .join("") + '}'
            };

            const url = brembo.build("https://rpki.cloudflare.com/", {
                path: ["api", "graphql"],
                params: {
                    client: this.options.clientId
                }
            });

            return axios({
                url,
                responseType: "json",
                method: "post",
                data: bundledValidationRequests
            })
                .then(data => {
                    const results = data.data.data;

                    if (results) {
                        const aliases = Object.keys(results);
                        let output;
                        for (let alias of aliases) {

                            if (results[alias].state === 'NotFound') {

                                output = this.createOutput(null, null, this.queue[alias].verbose, null);
                                this.queue[alias].resolve(output);

                            } else if (results[alias].state === 'Valid') {

                                const covering = results[alias].covering
                                    .map(i => {
                                        return {
                                            asn: i.asn,
                                            prefix: i.prefix.prefix,
                                            maxLength: i.prefix.maxLength
                                        };
                                    });
                                output = this.createOutput(true, true, this.queue[alias].verbose, covering);
                                this.queue[alias].resolve(output);

                            } else {

                                // let sameOrigin, validLength;
                                const covering = results[alias].covering
                                    .map(i => {
                                        return {
                                            asn: i.asn,
                                            prefix: i.prefix.prefix,
                                            maxLength: i.prefix.maxLength
                                        };
                                    });

                                output = this.checkCoveringROAs(this.queue[alias]["origin"],
                                    this.queue[alias]["prefix"],
                                    covering,
                                    this.queue[alias].verbose
                                );
                                this.queue[alias].resolve(output);
                            }
                            delete this.queue[alias];
                        }
                    }
                })
                .catch(error => {
                    for (let item of items) {
                        if (this.queue[item.key]) {
                            this.queue[item.key].reject(error);
                            delete this.queue[item.key];
                        }
                    }
                });
        }
    };

    this.checkCoveringROAs = function (origin, prefix, covering, verbose) {
        const sameAsRoas = covering.filter(roa => roa.asn === parseInt(origin));
        const sameOrigin = sameAsRoas.length > 0;
        const validLength = sameAsRoas.some(roa => parseInt(prefix.split("/")[1]) <= roa.maxLength);

        return this.createOutput(sameOrigin, validLength, verbose, covering);
    };

    this.setVRPs = function(vrps) {
        return this.connector.setVRPs(vrps);
    };

    this.destroy = function() {
        if (this.validationTimer) {
            clearInterval(this.validationTimer);
        }
        if (this.cacheTimer) {
            clearInterval(this.cacheTimer);
        }
        this.roas = null;
    };

    this.getVrps = function () {
        return this.connector.getVRPs();
    };

    this.getRadixTrie = function () {
        return this.roas;
    }

    this.validationTimer = setInterval(this._validateBundle, 500);
};


module.exports = RpkiValidator;





