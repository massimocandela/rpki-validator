import brembo from "brembo";
import Connector from "./Connector";
import MetaIndex from "../util/advancedStatsParser";

export default class RpkiClientConnector extends Connector {
    constructor(options) {
        super(options);

        this.metadata = {};
        this.index = null;

        this.host = this.options.host ?? "https://console.rpki-client.org";
        this.dumpModified = null;
        this.minimumRefreshRateMinutes = 5;
    };

    getAdvancedStats = () => {
        if (!this.setAdvancedStatsTimer) {
            this.setAdvancedStatsTimer = setInterval(this._setAdvancedStats, 2 * 3600 * 1000);
            this._setAdvancedStats();
        }

        if (this.index) {
            return Promise.resolve(this.index);
        } else {
            return Promise.reject("Index not ready");
        }
    }

    _setAdvancedStats = () => {
        const url = brembo.build(this.host, {
            path: ["dump.json"],
            params: {
                client: this.clientId
            }
        });

        const headers = {};
        if (this.dumpModified) {
            headers["If-Modified-Since"] = this.dumpModified.toUTCString();
        }

        return this.axios({
            method: "get",
            url,
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        })
            .then(({data}) => {
                this.dumpModified = new Date();
                this.index = new MetaIndex();
                const items = data.split('\n');

                for (let item of items) {
                    try {
                        const trimmedItem = item.trim();
                        if (trimmedItem.length > 1) {
                            this.index.add(JSON.parse(trimmedItem));
                        }
                    } catch (e) {
                    }
                }

                return this.index;
            });
    };

    getVRPs = () => {
        const url = brembo.build(this.host, {
            path: ["vrps.json"],
            params: {
                client: this.clientId
            }
        });

        const headers = {};
        if (this.metadata?.buildtime) {
            headers["If-Modified-Since"] = new Date(this.metadata.buildtime).toUTCString();
        }

        return this.axios({
            method: "get",
            url,
            headers,
            responseType: "json"
        })
            .then(data => {
                if (data && data.data && data.data.roas) {
                    const roas = data.data.roas;
                    const metadata = data.data?.metadata;

                    this.metadata = {
                        buildmachine: metadata?.buildmachine,
                        buildtime: metadata?.buildtime, // if modified since
                        elapsedtime: metadata?.elapsedtime
                    };

                    const out = [];

                    for (let roa of roas) {
                        out.push({
                            prefix: roa.prefix,
                            maxLength: roa.maxLength,
                            asn: parseInt(roa.asn.toString().replace('AS', '')),
                            ta: roa.ta,
                            expires: roa.expires || null
                        });
                    }

                    return out;
                }
            })
            .catch(error => {
                if (error.response.status !== 304) {
                    return Promise.reject(error);
                }

                return null;
            });
    };

    getExpiringElements = (vrp, expires, now) => {
        return this.getAdvancedStats()
            .then(index => index.getExpiring(vrp, expires, now));
    }
}
