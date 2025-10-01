import RpkiClientConnector from "./RpkiClientConnector";
import brembo from "brembo";
import ExternalConnector from "./ExternalConnector";
import MetaIndex from "../util/advancedStatsParser";

const api = "https://api.packetvis.com/v1/rpki/";

export default class PacketVisConnector extends RpkiClientConnector {
    constructor(options) {
        super({...options, verbose: true, host: brembo.build(options.host ?? api, {path: ["static"]})});
        this.minimumRefreshRateMinutes = 1;
        this.vrpHost = options.host ?? api;

        this.cacheModified = {
            vrps: 0,
            dump: 0
        };

        this.cacheConnector = new ExternalConnector({});
    };

    _setAdvancedStats = () => {
        return new Promise((resolve, reject) => {
            try {
                const fs = require("fs");
                const readline = require("readline");
                const file = ".cache/dump.json";

                if (!fs.existsSync(file)) {
                    return reject(`RPKI cache missing ${file}`);
                }

                const stats = fs.statSync(file);

                if (this.cacheModified.dump >= stats.mtime) {
                    return resolve(); // Already up-to-date
                }

                this.index = new MetaIndex();

                const stream = fs.createReadStream(file);
                const rl = readline.createInterface({
                    input: stream,
                    crlfDelay: Infinity
                });

                const timeout = setTimeout(() => {
                    rl.close();
                    stream.destroy();
                    reject(new Error("Timeout while reading dump.json"));
                }, 300000);

                rl.on("line", (line) => {
                    try {
                        const trimmed = line.trim();
                        if (trimmed.length > 1) {
                            this.index.add(JSON.parse(trimmed));
                        }
                    } catch {
                        // ignore parse errors
                    }
                });

                rl.on("close", () => {
                    clearTimeout(timeout);
                    this.cacheModified.dump = stats.mtime;
                    resolve();
                });

                rl.on("error", (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });

                stream.on("error", (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            } catch (err) {
                reject(err);
            }
        });
    };

    getVRPs = () => {
        try {
            const fs = require("fs"); // Load only for node
            const file = ".cache/vrps.json";

            if (fs.existsSync(file)) {
                const stats = fs.statSync(file);

                if (this.cacheModified.vrps < stats.mtime) {

                    if (((new Date) - stats.mtime) < 30 * 60 * 1000) { // Newer than 30 min

                        const payload = JSON.parse(fs.readFileSync(file, "utf8"));

                        this.cacheConnector.setVRPs(payload.roas);

                        this._applyRpkiClientMetadata(payload?.metadata);
                        this.metadata.lastModified = stats.mtime.toISOString();

                        this.cacheModified.vrps = stats.mtime;

                        return this.cacheConnector.getVRPs();
                    } else {
                        throw new Error(`RPKI cache too old ${file}`);
                    }
                } else {
                    return Promise.reject();
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
        } else if (!this.options?.localConnector) {
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
                timeout: 120000,
                method: "get",
                url,
                headers: {
                    "User-Agent": this.clientId,
                    "Accept-Encoding": "gzip"
                }
            })
                .then(({data}) => data.data);
        } else {
            return Promise.reject("Cannot load index");
        }
    };
}
