import brembo from "brembo";
import Connector from "./Connector";
import MetaIndex from "../util/advancedStatsParser";

export default class RpkiClientConnector extends Connector {
    constructor(options) {
        super(options);

        this.metadata = {};
        this.index = null;

        this.host = this.options.host ?? "https://console.rpki-client.org";
    };

    getAdvancedStats = () => {

        if (this.index) {
            return Promise.resolve(this.index);
        }

        if (!this.setAdvancedStatsTimer) {
            this.setAdvancedStatsTimer = setInterval(this._setAdvancedStats, 2 * 3600 * 1000);
        }

        return this._setAdvancedStats();
    }

    _setAdvancedStats = () => {
        const url = brembo.build(this.host, {
            path: ["dump.json"],
            params: {
                client: this.clientId
            }
        });

        return this.axios({
            method: "get",
            url,
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        })
            .then(({data}) => {
                const metaIndex = new MetaIndex();
                const items = data.split('\n');

                for (let item of items) {
                    try {
                        const trimmedItem = item.trim();
                        if (trimmedItem.length > 1) {
                            metaIndex.add(JSON.parse(trimmedItem));
                        }
                    } catch (e) {
                    }
                }

                this.index = metaIndex;

                return metaIndex;
            });
    };

    getVRPs = () => {
        const url = brembo.build(this.host, {
            path: ["vrps.json"],
            params: {
                client: this.clientId
            }
        });

        return this.axios({
            method: "get",
            url,
            responseType: "json"
        })
            .then(data => {
                if (data && data.data && data.data.roas) {
                    const roas = data.data.roas;

                    this.metadata = {
                        buildmachine: data.data.buildmachine,
                        buildtime: data.data.buildtime,
                        elapsedtime: data.data.elapsedtime
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
            });
    };

    getExpiringElements = (vrp, expires, now) => {
        return this.getAdvancedStats()
            .then(index => index.getExpiring(vrp, expires, now));
    }
}
