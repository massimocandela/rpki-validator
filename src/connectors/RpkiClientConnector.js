import brembo from "brembo";
import Connector from "./Connector";
import MetaIndex from "../util/advancedStatsParser";

export default class RpkiClientConnector extends Connector {
    constructor(options) {
        super(options);

        this.metadata = {};
        this.metaIndex = null;
        this.metaIndexPromise = null;

        this.host = this.options.host ?? "https://console.rpki-client.org";

        setInterval(() => {
            if (this.metaIndex) {
                this.metaIndex.destroy();
                this.metaIndex = null;
            }
        }, 2 * 60 * 60 * 1000);
    };

    getAdvancedStats = () => {
        if (this.metaIndex) {
            return Promise.resolve(this.metaIndex);
        } else {
            const url = brembo.build(this.host, {
                path: ["dump.json"],
                params: {
                    client: this.clientId
                }
            });

            this.metaIndexPromise = this.axios({
                method: "get",
                url,
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            })
                .then(({data}) => {
                    this.metaIndex?.destroy();
                    this.metaIndex = new MetaIndex();
                    const items = data.split('\n');

                    for (let item of items) {
                        try {
                            const trimmedItem = item.trim();
                            if (trimmedItem.length > 1) {
                                this.metaIndex.add(JSON.parse(trimmedItem));
                            }
                        } catch (e) {
                        }
                    }

                    return this.metaIndex;
                });

            return this.metaIndexPromise;
        }
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
