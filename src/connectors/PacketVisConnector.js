import RpkiClientConnector from "./RpkiClientConnector";
import brembo from "brembo";

const defaultHost = "http://68ab0f0.packetvis.com/v1/rpki/static/";
const hosts = [
    defaultHost,
    "https://console.rpki-client.org/"
];
export default class PacketVisConnector extends RpkiClientConnector {
    constructor(options) {
        super({...options, host: defaultHost});
        this.minimumRefreshRateMinutes = 1;

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
                    this.host = availableHosts[0];
                } else {
                    console.log("Cannot connect to any RPKI data server. Probably a problem with this host.");
                }
            });
    }


    getExpiringElements = (vrp, expires, now) => {
        if (this.metaIndex) {
            return Promise.resolve(this.metaIndex.getExpiring(vrp, expires, now));
        } else {
            const url = brembo.build(this.host, {
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
