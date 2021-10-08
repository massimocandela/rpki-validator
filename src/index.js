const realAxios = require("axios");
const brembo = require("brembo");
const RIPEConnector = require("./connectors/RIPEConnector");
const NTTConnector = require("./connectors/NTTConnector");
const CloudflareConnector = require("./connectors/CloudflareConnector");
const RpkiClientConnector = require("./connectors/RpkiClientConnector");
const ExternalConnector = require("./connectors/ExternalConnector");
const ApiConnector = require("./connectors/ApiConnector");
const ip = require("ip-sub");
const LongestPrefixMatch = require("longest-prefix-match");
const { validatePrefix, validateAS, validateVRP } = require("net-validations");

const RpkiValidator = function (options) {
    const defaults = {
        connector: "rpkiclient",
        httpsAgent: null,
        axios: null,
        clientId: "rpki-validator_js"
    };

    this.longestPrefixMatch = new LongestPrefixMatch();
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

    this.connectors = {
        ripe: new RIPEConnector(this.options),
        ntt: new NTTConnector(this.options),
        cloudflare: new CloudflareConnector(this.options),
        rpkiclient: new RpkiClientConnector(this.options),
        external: new ExternalConnector(this.options),
        api: new ApiConnector(this.options),
    };

    this.connector = this.connectors[this.options.connector];

    if (!this.connector) {
        throw new Error("The specified connector is not valid");
    }

    this._getPrefixMatches = (prefix) => {
        const af = ip.getAddressFamily(prefix);
        const binaryPrefix = ip.applyNetmask(prefix, af);

        return this.longestPrefixMatch._getMatch(binaryPrefix, af, true) || [];
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
                    ta: i.ta || "",
                    expires: i.expires || null
                };
            })

            return this.checkCoveringROAs(origin, prefix, covering, verbose);
        }
    };

    this._validateFromCache = (prefix, origin, verbose) =>
        Promise.resolve(this.validateFromCacheSync(prefix, origin, verbose));

    this._getKey = (prefix, origin) => {
        return "a" + [prefix, origin]
            .join("AS")
            .replace(/\./g, "_")
            .replace(/\:/g, "_")
            .replace(/\//g, "_");
    };

    this._validateOnline = (prefix, origin, verbose) => {
        const key = this._getKey(prefix, origin);

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
                        this.longestPrefixMatch.reset();

                        for (let vrp of list) {
                            try {
                                validateVRP(vrp);
                                this.longestPrefixMatch.addPrefix(vrp.prefix, vrp);
                            } catch (error) {
                                // Just skip the insert
                            }
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
                    return Promise.reject(new Error(`The VRP list can be updated at most once every ${this.connector.minimumRefreshRateMinutes} minutes.`));
                }

                if (this.cacheTimer) {
                    clearInterval(this.cacheTimer);
                }

                this.cacheTimer = setInterval(() => {
                    this.preChachePromise = this.getValidatedPrefixes(true)
                        .catch(() => {
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

    this.historicValidation = (timestamp, prefix, origin, verbose) => {
        if (this.options.connector !== "external") {
            return Promise.reject("the historic validation works only with the external connector");
        }
    };

    this.validate = (prefix, origin, verbose) => {
        if (origin == null || origin === "") {
            throw new Error("Origin AS missing");
        }
        origin = parseInt(origin.toString().replace("AS", ""));

        validateAS(origin);
        validatePrefix(prefix);

        if (this.preCached) {
            return this._validateFromCache(prefix, origin, verbose);
        } else {
            return this._validateOnline(prefix, origin, verbose);
        }
    };

    this._validateBundle = () => {
        const items = Object.values(this.queue);

        if (items.length) {

            const url = brembo.build("https://rpki.massimocandela.com", {
                path: ["api", "v1", "validate"],
                params: {
                    client: this.options.clientId
                }
            });

            return axios({
                url,
                responseType: "json",
                method: "post",
                data: items
                    .map(i => {
                        return {
                            prefix: i.prefix,
                            asn: i.origin
                        };
                    })
            })
                .then(data => {
                    const results = data.data;

                    if (results.length) {
                        let output;
                        for (let result of results) {
                            const key = this._getKey(result.prefix, result.asn);

                            if (result.valid === null) {

                                output = this.createOutput(null, null, this.queue[key].verbose, null);
                                this.queue[key].resolve(output);

                            } else if (result.valid) {

                                const covering = result.covering;
                                output = this.createOutput(true, true, this.queue[key].verbose, covering);
                                this.queue[key].resolve(output);

                            } else {

                                const covering = result.covering;

                                output = this.checkCoveringROAs(this.queue[key]["origin"],
                                    this.queue[key]["prefix"],
                                    covering,
                                    this.queue[key].verbose
                                );
                                this.queue[key].resolve(output);
                            }
                            delete this.queue[key];
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
        this.longestPrefixMatch.reset();
    };

    this.getVrps = function () {
        return this.connector.getVRPs();
    };

    this.getData = function () {
        return this.longestPrefixMatch.getData();
    };

    this.toArray = function () {
        return this.longestPrefixMatch.toArray();
    };

    this.validationTimer = setInterval(this._validateBundle, 500);
};


module.exports = RpkiValidator;





