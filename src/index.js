import realAxios from "redaxios";
import brembo from "brembo";
import RIPEConnector from "./connectors/RIPEConnector";
import NTTConnector from "./connectors/NTTConnector";
import CloudflareConnector from "./connectors/CloudflareConnector";
import RpkiClientConnector from "./connectors/RpkiClientConnector";
import ExternalConnector from "./connectors/ExternalConnector";
import ApiConnector from "./connectors/ApiConnector";
import LongestPrefixMatch from "longest-prefix-match";
import {validateAS, validatePrefix, validateVRP} from "net-validations";
import PacketVisConnector from "./connectors/PacketVisConnector";

const defaultRpkiApi = "https://rpki.massimocandela.com/api/v1";
const providers = ["rpkiclient", "ntt", "ripe", "cloudflare", "packetvis"]; // The first provider is the default one

class RpkiValidator {
    static providers = providers;
    #axios;
    #connectors;
    #connector;
    #validationTimer;
    #longestPrefixMatch;
    #options;
    #queue;
    #onlineValidatorStatus;
    #lastMetadata = {};

    constructor(options) {
        const defaults = {
            timeout: 30000,
            advancedStatsRefreshRateMinutes: 120,
            connector: providers[0],
            httpsAgent: null,
            axios: null,
            clientId: "rpki-validator_js",
            defaultRpkiApi
        };

        this.#longestPrefixMatch = new LongestPrefixMatch();
        this.#options = Object.assign({}, defaults, options);

        if (!this.#options.axios) {
            this.#options.axios = realAxios;
            if (this.#options.httpsAgent) {
                this.#options.axios.defaults.httpsAgent = options.httpsAgent;
            }
            this.#options.axios.defaults.timeout = this.#options.timeout;
        }

        this.#axios = this.#options.axios;

        this.#options.axios.defaults ??= {};
        this.#options.axios.defaults.headers ??= {};
        this.#options.axios.defaults.headers.common ??= {};

        this.#options.axios.defaults.headers.common = {
            ...(this.#options.axios.defaults.headers.common || {}),
            "User-Agent": defaults.clientId,
            "Accept-Encoding": "gzip"
        };

        this.#queue = {};
        this.preCached = false;
        this.#lastMetadata = {};
        this.#connectors = {
            ripe: RIPEConnector,
            ntt: NTTConnector,
            cloudflare: CloudflareConnector,
            rpkiclient: RpkiClientConnector,
            packetvis: PacketVisConnector,
            external: ExternalConnector,
            api: ApiConnector
        };

        this.setConnector(this.#options.connector);

        if (!this.#connector) {
            throw new Error("The specified connector is not valid");
        }

        this.#validationTimer = setInterval(this.#validateBundle, 500);

        this.getApiStatus()
            .catch(() => {}); // Nothing
    };

    getAdvancedStats = () => {
        return this.#connector.getAdvancedStats();
    };

    getApiStatus = () => {
        return new Promise((resolve, reject) => {
            if (!this.#onlineValidatorStatus) {

                if (!this.#options.defaultRpkiApi) {
                    return reject();
                }

                const url = brembo.build(this.#options.defaultRpkiApi, {
                    path: ["status"],
                    params: {
                        client: this.#options.clientId
                    }
                });

                const tmr = setTimeout(() => {
                    this.#onlineValidatorStatus = {warning: true};
                    resolve(this.#onlineValidatorStatus);
                }, 2000);

                setTimeout(() => {this.#onlineValidatorStatus = null;}, 60 * 60 * 1000);

                this.#axios({
                    url,
                    responseType: "json",
                    method: "get",
                    timeout: 2000
                })
                    .then(data => {
                        this.#onlineValidatorStatus = data.data;
                    })
                    .catch(() => {
                        this.#onlineValidatorStatus = {warning: true};
                    })
                    .then(() => {
                        clearTimeout(tmr);
                        resolve(this.#onlineValidatorStatus);
                    });
            } else {
                resolve(this.#onlineValidatorStatus);
            }
        });
    };

    setConnector = (name) => {
        if (!this.#connectors[name]) {
            throw new Error("The specified connector is not valid");
        }

        this.#options.connector = name;
        this.empty();
        this.#connector = new this.#connectors[name](this.#options);
    };

    getAvailableConnectors = () => {
        return this.getApiStatus()
            .then(data => {
                const workingConnectors = (data.data || []).filter(i => !i.warning).map(i => i.name);

                if (workingConnectors.length) {
                    return workingConnectors;
                } else {
                    return Promise.reject();
                }
            });
    };

    validateFromCacheSync = (prefix, origin, verbose) => {
        const roas = this.#getPrefixMatches(prefix);

        if (roas.length === 0) {
            return this.#createOutput(null, null, verbose, null);
        } else {
            const covering = roas.map(i => {
                return {
                    prefix: i.prefix,
                    maxLength: i.maxLength,
                    asn: i.asn,
                    ta: i.ta || "",
                    expires: i.expires || null,
                    notBefore: i.notBefore || null
                };
            });

            return this.#checkCoveringROAs(origin, prefix, covering, verbose);
        }
    };

    preCache = (everyMinutes) => {
        if (everyMinutes !== this.refreshVrpEveryMinutes) {
            this.refreshVrpEveryMinutes = everyMinutes;
            if (everyMinutes) {
                if (everyMinutes < this.#connector.minimumRefreshRateMinutes) {
                    return Promise.reject(new Error(`The VRP list can be updated at most once every ${this.#connector.minimumRefreshRateMinutes} minutes.`));
                }

                if (this.cacheTimer) {
                    clearInterval(this.cacheTimer);
                }

                this.cacheTimer = setInterval(() => {
                    this.preChachePromise = this.#getValidatedPrefixes(true)
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
            this.preChachePromise = this.#getValidatedPrefixes();
        }

        return this.preChachePromise;
    };

    historicValidation = (timestamp, prefix, origin, verbose) => {
        if (this.#options.connector !== "external") {
            return Promise.reject("the historic validation works only with the external connector");
        }
    };

    validate = (prefix, origin, verbose) => {
        try {
            if (origin == null || origin === "") {
                throw new Error("Origin AS missing");
            }
            origin = parseInt(origin.toString().replace("AS", ""));

            validateAS(origin);
            validatePrefix(prefix);

            if (this.preCached) {
                return this.#validateFromCache(prefix, origin, verbose);
            } else {
                return this.#validateOnline(prefix, origin, verbose);
            }
        } catch (error) {
            return Promise.reject(error);
        }
    };

    setVRPs = (vrps) => {
        return this.#connector.setVRPs(vrps);
    };

    empty = () => {
        this.preCached = false;
        this.#lastMetadata = {};
        delete this.refreshVrpEveryMinutes;
        delete this.preChachePromise;

        if (this.cacheTimer) {
            clearInterval(this.cacheTimer);
        }
        this.#longestPrefixMatch.reset();
    };

    getVRPs = () => {
        return this.#connector.getVRPs();
    };

    getData = () => {
        return this.#longestPrefixMatch.getData();
    };

    toArray = () => {
        return this.#longestPrefixMatch.toArray();
    };

    getLength = () => {
        return this.#longestPrefixMatch.length;
    };

    getMetadata = () => {
        return this.#lastMetadata;
    };


    //-- private methods
    #setMetadata = (metadata = {}) => {
        this.#lastMetadata = {
            ...this.#lastMetadata,
            ...metadata
        };
    };

    #validateFromCache = (prefix, origin, verbose) =>
        Promise.resolve(this.validateFromCacheSync(prefix, origin, verbose));

    #getKey = (prefix, origin) => {
        return "a" + [prefix, origin]
            .join("AS")
            .replace(/\./g, "_")
            .replace(/\:/g, "_")
            .replace(/\//g, "_");
    };

    #validateOnline = (prefix, origin, verbose) => {
        if (this.#options.defaultRpkiApi) {
            const key = this.#getKey(prefix, origin);

            if (!this.#queue[key]) {
                const promise = new Promise((resolve, reject) => {
                    this.#queue[key] = {
                        prefix,
                        origin,
                        key,
                        resolve,
                        reject,
                        verbose
                    };
                });

                this.#queue[key].promise = promise;
            }

            return this.#queue[key].promise;
        } else {
            return Promise.reject("An online validator is not available. Please specify a defaultRpkiApi.");
        }
    };

    #createOutput = (sameOrigin, validLength, verbose, covering) => {
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

    #validateBundle = () => {
        const items = Object.values(this.#queue);

        if (items.length) {

            const url = brembo.build(this.#options.defaultRpkiApi, {
                path: ["validate"],
                params: {
                    validator: this.#options.connector,
                    client: this.#options.clientId
                }
            });

            return this.#axios({
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
                            const key = this.#getKey(result.prefix, result.asn);

                            if (result.valid === null) {

                                output = this.#createOutput(null, null, this.#queue[key].verbose, null);
                                this.#queue[key].resolve(output);

                            } else if (result.valid) {

                                const covering = result.covering;
                                output = this.#createOutput(true, true, this.#queue[key].verbose, covering);
                                this.#queue[key].resolve(output);

                            } else {

                                const covering = result.covering;

                                output = this.#checkCoveringROAs(this.#queue[key]["origin"],
                                    this.#queue[key]["prefix"],
                                    covering,
                                    this.#queue[key].verbose
                                );
                                this.#queue[key].resolve(output);
                            }
                            delete this.#queue[key];
                        }
                    }
                })
                .catch(error => {
                    for (let item of items) {
                        if (this.#queue[item.key]) {
                            this.#queue[item.key].reject(error);
                            delete this.#queue[item.key];
                        }
                    }
                });
        }
    };

    #checkCoveringROAs = (origin, prefix, covering, verbose) => {
        const sameAsRoas = covering.filter(roa => roa.asn === parseInt(origin));
        const sameOrigin = sameAsRoas.length > 0;
        const validLength = sameAsRoas.some(roa => parseInt(prefix.split("/")[1]) <= roa.maxLength);

        return this.#createOutput(sameOrigin, validLength, verbose, covering);
    };

    #getValidatedPrefixes = (force) => {
        if (!force && this.preCached) {
            return new Promise((resolve, reject) => {
                resolve(true);
            });
        } else {
            const now = new Date();

            this.#setMetadata({lastAttempt: now});

            return this.#connector
                .getVRPs()
                .then(list => {
                    if (list) {
                        this.preCached = true;

                        const newBuild = this.#connector?.metadata?.buildtime ? Date.parse(this.#connector?.metadata?.buildtime) : null;
                        const currentBuild = this.#lastMetadata?.buildtime ? Date.parse(this.#lastMetadata?.buildtime) : null;

                        if (!!newBuild && (now.getTime() - newBuild) > 2 * 60 * 60 * 1000) {
                            return Promise.reject("The new vrp data is older than 2 hours");
                        } else if (newBuild && currentBuild) {
                            if (newBuild < currentBuild) {
                                return Promise.reject("The new vrp data is older than the previous one");
                            } else if (newBuild === currentBuild) {
                                return Promise.resolve(true);
                            }
                        }

                        this.#setMetadata({lastUpdate: now, vrps: list.length});
                        this.#setMetadata(this.#connector?.metadata);
                        this.#longestPrefixMatch.reset();

                        for (let vrp of list) {
                            try {
                                validateVRP(vrp);
                                this.#longestPrefixMatch.addPrefix(vrp.prefix, vrp);
                            } catch (error) {
                                // Just skip the insert
                            }
                        }

                        return Promise.resolve(true);
                    } else {
                        return Promise.reject("VRPs not found");
                    }
                });
        }
    };

    #getPrefixMatches = (prefix) => {
        return this.#longestPrefixMatch.getMatch(prefix, true) || [];
    };

    getExpiringElements = (vrp, expires, now) => {
        return this.#connector.getExpiringElements(vrp, expires, now);
    };
}

module.exports = RpkiValidator;