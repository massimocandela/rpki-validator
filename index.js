let axios = require("axios");
let brembo = require("brembo");
let ip = require("ip-sub");

const RpkiValidator = function () {
    this.queue = {};

    this._getPrefixMatch = (prefix) => {
        for (let key in this.queue) {
            const roa = this.queue[key];
            const roaPrefix = roa.prefix;

            if (roaPrefix === prefix || ip.isSubnet(roaPrefix, prefix)) {
                return roa;
            }

            return null;
        }
    };

    this._validateFromCache = (prefix, origin, verbose) => {
        return new Promise((resolve, reject) => {
            const roa = this._getPrefixMatch(prefix);
            if (roa) {
                const sameOrigin = roa.origin.toString() === origin;
                const validLength = roa.maxLength <= parseInt(prefix.split("/")[1]);

                resolve(this.createOutput(sameOrigin, validLength, verbose));
            } else {
                const output = this.createOutput(false, false, verbose);
                output.reason = null;
                resolve(output);
            }
        });
    };

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

    this.createOutput = (sameOrigin, validLength, verbose) => {
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
                reason
            }
        } else {
            return valid;
        }
    };

    this.getValidatedPrefixes = (force) => {
        if (!force && this.roas) {
            return Object.values(this.roas);
        } else {
            const url = brembo.build("https://stat.ripe.net/", {
                path: ["data", "rpki-roas", "data.json"],
                params: {
                    validator: "ripenccv3"
                }
            });

            return axios({
                method: "get",
                url,
                responseType: "json"
            })
                .then(data => {
                    if (data && data.data && data.data.data && data.data.data.roas) {
                        const roas = data.data.data.roas;
                        const out = [];

                        for (let roa of roas) {
                            out.push({
                                prefix: roa.prefix,
                                maxLength: roa.maxLength,
                                origin: roa.asn
                            });
                        }

                        return out;
                    }
                })
                .then(list => {
                    this.roas = {};

                    for (let roa of list) {
                        this.roas[roa.prefix] = roa;
                    }

                    return list;
                });
        }
    };

    this.preCache = (everyMinutes) => {
        if (everyMinutes) {
            if (everyMinutes < 15) {
                throw new Error("The VRP list can be updated at most once every 15 minutes.");
                if (this.cacheTimer) {
                    clearInterval(this.cacheTimer);
                }

                this.cacheTimer = setInterval(() => {
                    this.getValidatedPrefixes(true)
                }, everyMinutes * 60 * 1000);
            }
        } else {
            if (this.cacheTimer) {
                clearInterval(this.cacheTimer);
            }
        }
        return this.getValidatedPrefixes().then(() => true);
    };

    this.validate = (prefix, origin, verbose) => {
        if (!origin) {
            throw new Error("Origin AS missing");
        }

        if (!prefix || typeof(prefix) !== "string" || !ip.isValidPrefix(prefix)) {
            throw new Error("Prefix missing or not valid");
        }


        if (this.roas) {
            return this._validateFromCache(prefix, origin, verbose);
        } else {
            return this._validateOnline(prefix, origin, verbose);
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
                            return `${item.key}:validation(prefix:"${item.prefix}", asn:${item.origin}) {state}`;
                        })
                        .join("") + '}'
            };

            const url = brembo.build("https://rpki.cloudflare.com/", {
                path: ["api", "graphql"],
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
                                output = this.createOutput(null, null, this.queue[alias].verbose);
                                this.queue[alias].resolve(output);
                            } else if (results[alias].state === 'Valid') {
                                output = this.createOutput(true, true, this.queue[alias].verbose);
                                this.queue[alias]
                                    .resolve(output);
                            } else {
                                output = this.createOutput(false, false, this.queue[alias].verbose);
                                output.reason = null;
                                this.queue[alias]
                                    .resolve(output);
                            }
                            delete this.queue[alias];
                        }
                    }
                })
        }
    };

    setTimeout(this._validateBundle, 5000);
};


module.exports = new RpkiValidator();





