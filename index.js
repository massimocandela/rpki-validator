let axios = require("axios");
let brembo = require("brembo");
let ip = require("ip-sub");
const RadixTrie = require("radix-trie-js");

const RpkiValidator = function () {
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

    this._getPrefixMatches = (prefix) => {
        const roas = this._getRoas(prefix) || [];

        for (let roa of roas) {
            const binaryPrefix = ip.getNetmask(prefix);
            if (roa.binaryPrefix === binaryPrefix || ip.isSubnetBinary(roa.binaryPrefix, binaryPrefix)) {
                return roas;
            }
        }

        return null;
    };

    this.validateFromCacheSync = (prefix, origin, verbose) => {
        const roas = this._getPrefixMatches(prefix);

        if (roas === null) {
            return this.createOutput(null, null, verbose, null);
        }  else {
            const sameAsRoas = roas.filter(roa => roa.origin.toString() === origin);
            const sameOrigin = sameAsRoas.length > 0;
            const validLength = sameAsRoas.some(roa => parseInt(prefix.split("/")[1]) <= roa.maxLength);
            return this.createOutput(sameOrigin, validLength, verbose, roas.map(i => {
                return {
                    prefix: i.prefix,
                    maxLength: i.maxLength,
                    origin: i.origin
                };
            }));
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
                    if (list) {
                        this.preCached = true;
                        this.roas = {
                            v4: new RadixTrie(),
                            v6: new RadixTrie()
                        };

                        for (let roa of list) {
                            this._addRoa(roa.prefix, roa);
                        }

                        return true;
                    } else {
                        return false;
                    }
                });
        }
    };

    this.preCache = (everyMinutes) => {
        if (everyMinutes) {
            if (everyMinutes < 15) {
                throw new Error("The VRP list can be updated at most once every 15 minutes.");
            }

            if (this.cacheTimer) {
                clearInterval(this.cacheTimer);
            }

            this.cacheTimer = setInterval(() => {
                this.getValidatedPrefixes(true)
            }, everyMinutes * 60 * 1000);
        } else {
            if (this.cacheTimer) {
                clearInterval(this.cacheTimer);
            }
        }
        return this.getValidatedPrefixes();
    };

    this.validate = (prefix, origin, verbose) => {
        if (origin == null) {
            throw new Error("Origin AS missing");
        }

        if (prefix == null || typeof(prefix) !== "string" || !ip.isValidPrefix(prefix)) {
            throw new Error("Prefix missing or not valid");
        }


        if (this.preCached) {
            return this._validateFromCache(prefix, origin, verbose);
        } else {
            return this._validateOnline(prefix, origin, verbose);
        }
    };

    this._getRoas = (prefix) => {
        const isV4 = (prefix.indexOf(":") === -1);
        const binaryNetmask = ip.getNetmask(prefix);

        if (isV4) {
            const key = binaryNetmask.slice(0, this.keySizes.v4);
            return this.roas.v4.get(key);
        } else {
            const key = binaryNetmask.slice(0, this.keySizes.v6);
            return this.roas.v6.get(key);
        }
    };

    this._addRoa = (prefix, value) => {
        const isV4 = (prefix.indexOf(":") === -1);
        const binaryNetmask = ip.getNetmask(prefix);
        value.binaryPrefix = binaryNetmask;

        if (isV4) {
            const key = binaryNetmask.slice(0, this.keySizes.v4);
            if (!this.roas.v4.has(key)) {
                this.roas.v4.add(key, []);
            }
            this.roas.v4.get(key).push(value);
        } else {
            const key = binaryNetmask.slice(0, this.keySizes.v6);
            if (!this.roas.v6.has(key)) {
                this.roas.v6.add(key, []);
            }
            this.roas.v6.get(key).push(value);
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
                                            origin: i.asn,
                                            prefix: i.prefix.prefix,
                                            maxLength: i.prefix.maxLength
                                        };
                                    });
                                output = this.createOutput(true, true, this.queue[alias].verbose, covering);
                                this.queue[alias].resolve(output);

                            } else {

                                let sameOrigin, validLength;
                                const covering = results[alias].covering
                                    .map(i => {
                                        return {
                                            origin: i.asn,
                                            prefix: i.prefix.prefix,
                                            maxLength: i.prefix.maxLength
                                        };
                                    });

                                try {
                                    sameOrigin = this.queue[alias]["origin"] == results[alias].covering[0]["asn"];
                                } catch(e) {
                                    sameOrigin = false;
                                }

                                try {
                                    validLength = parseInt(this.queue[alias]["prefix"].split("/")[1]) <= results[alias].covering[0]["prefix"]["maxLength"];
                                } catch(e) {
                                    validLength = false;
                                }
                                output = this.createOutput(sameOrigin, validLength, this.queue[alias].verbose, covering);
                                this.queue[alias].resolve(output);
                            }
                            delete this.queue[alias];
                        }
                    }
                })
        }
    };

    setInterval(this._validateBundle, 500);
};


module.exports = new RpkiValidator();





