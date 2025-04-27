import RpkiClientConnector from "./RpkiClientConnector";
import brembo from "brembo";
import ExternalConnector from "./ExternalConnector";
import MetaIndex from "../util/advancedStatsParser";

const api = "http://rpki.local.packetvis.com/v1/rpki/";

export default class PacketVisConnector extends RpkiClientConnector {
    constructor(options) {
        super({...options, verbose: true, host: brembo.build(options.host ?? api, {path: ["static"]})});
        this.minimumRefreshRateMinutes = 1;
        this.vrpHost = options.host ?? api;

        this.cacheConnector = new ExternalConnector({});
    };

    _setAdvancedStats = () => {
        try {
            const fs = require("fs"); // Load only for node
            const file = ".cache/dump.json";

            if (fs.existsSync(file)) {
                const stats = fs.statSync(file);

                if (((new Date) - stats.mtime) < this.advancedStatsRefreshRateMinutes * 60 * 1000) { // Newer last time

                    const payload = JSON.parse(fs.readFileSync(file, "utf8"));

                    this.index = new MetaIndex();
                    const items = payload.split("\n");

                    for (let item of items) {
                        try {
                            const trimmedItem = item.trim();
                            if (trimmedItem.length > 1) {
                                this.index.add(JSON.parse(trimmedItem));
                            }
                        } catch (e) {
                        }
                    }
                }
            } else {
                throw new Error(`RPKI cache missing ${file}`);
            }

        } catch (error) {
            return Promise.reject(error);
        }
    };

    getVRPs = () => {
        try {
            const fs = require("fs"); // Load only for node
            const file = ".cache/vrps.json";

            if (fs.existsSync(file)) {
                const stats = fs.statSync(file);

                if (((new Date) - stats.mtime) < 30 * 60 * 1000) { // Newer than 30 min

                    const payload = JSON.parse(fs.readFileSync(file, "utf8"));

                    this.cacheConnector.setVRPs(payload.roas);

                    this._applyRpkiClientMetadata(payload?.metadata);
                    this.metadata.lastModified = stats.mtime.toISOString();

                    return this.cacheConnector.getVRPs();
                } else {
                    throw new Error(`RPKI cache too old ${file}`);
                }
            } else {
                throw new Error(`RPKI cache missing ${file}`);
            }

        } catch (error) {
            return Promise.reject(error);
        }
    };

    getExpiringElements = (vrp, expires, now) => {
        if (this.index) {
            return Promise.resolve(this.index.getExpiring(vrp, expires, now));
        } else {
            const url = brembo.build(this.vrpHost, {
                path: ["meta", "expiring"],
                params: {
                    prefix: vrp.prefix,
                    asn: vrp.asn,
                    maxlength: vrp.maxLength,
                    expires,
                    client: this.clientId
                }
            });

            return this.axios({
                method: "get",
                url
            })
                .then(({data}) => data.data);
        }
    };
}
