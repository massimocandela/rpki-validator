import RpkiClientConnector from "./RpkiClientConnector";
import brembo from "brembo";
import ExternalConnector from './ExternalConnector';

const defaultHost = "http://rpki.local.packetvis.com/v1/rpki/static/";
const hosts = [
    defaultHost,
    "https://console.rpki-client.org/"
];
const api = "https://api.packetvis.com/v1/rpki/meta/";
export default class PacketVisConnector extends RpkiClientConnector {
    constructor(options) {
        super({...options, host: defaultHost});
        this.minimumRefreshRateMinutes = 1;

        this.cacheConnector = new ExternalConnector({});

        this.selectServer();
        setInterval(this.selectServer, 15 * 60 * 1000);
    };

    selectServer = () => {
        Promise.all(hosts
            .map(host => {
                return this.axios({
                    method: "HEAD",
                    url: brembo.build(host, {path: ["vrps.json"]}),
                    responseType: "json"
                })
                    .then(data => {
                        const lastModified = data?.headers["last-modified"] ? new Date(data?.headers["last-modified"]) : null;

                        if (!lastModified || new Date().getTime() - lastModified.getTime() >  40 * 60 * 1000) {
                            return false;
                        } else {
                            return host;
                        }
                    })
                    .catch(() => false);
            }))
            .then(hosts => hosts.filter(i => !!i))
            .then(availableHosts => {
                if (availableHosts.includes(defaultHost)) {
                    this.host = defaultHost;
                } else if (availableHosts[0]){
                    console.log("Switching to RPKI server:", availableHosts[0]);

                    this.host = availableHosts[0];
                } else {
                    console.log("Cannot connect to any RPKI data server. Probably a problem with this host.");
                }
            });
    }

    getVRPs = () => {
        try {
            const fs = require('fs');
            const file = ".cache/vrps.json";

            if (fs.existsSync(file)) {
                const stats = fs.statSync(file);

                if (((new Date) - stats.mtime) < 15 * 60 * 1000) { // Newer than 15 min
                    this.cacheConnector.setVRPs(JSON.parse(fs.readFileSync(file, 'utf8')).roas);

                    return this.cacheConnector.getVRPs();
                } else {
                    throw new Error("Cache too old, switching to remote");
                }
            }

        } catch (error) {
            console.log(error);
            return this._getVRPs();
        }
    }


    getExpiringElements = (vrp, expires, now) => {
        if (this.metaIndex) {
            return Promise.resolve(this.metaIndex.getExpiring(vrp, expires, now));
        } else {
            const url = brembo.build(api, {
                path: ["expiring"],
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
    }
}
