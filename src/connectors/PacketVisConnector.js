import RpkiClientConnector from "./RpkiClientConnector";
import brembo from "brembo";

export default class PacketVisConnector extends RpkiClientConnector {
    constructor(options) {
        super({...options, host: "https://api.packetvis.com/v1/rpki/meta/"});
        this.minimumRefreshRateMinutes = 1;
    };

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
