import brembo from "brembo";
import Connector from "./Connector";

export default class RIPEConnector extends Connector {
    constructor(options) {
        super(options);
        this.minimumRefreshRateMinutes = 10;
    };

    getVRPs = () => {
        const url = brembo.build("https://stat.ripe.net/", {
            path: ["data", "rpki-roas", "data.json"]
        });

        return this.axios({
            method: "get",
            url,
            timeout: 120000,
            responseType: "json",
            headers: {
                "User-Agent": this.clientId,
                "Accept-Encoding": "gzip"
            }
        })
            .then(data => {
                if (data && data.data && data.data.data && data.data.data.roas) {

                    return data.data.data.roas
                        .map(roa => {
                            return {
                                prefix: roa.prefix,
                                maxLength: parseInt(roa.maxLength),
                                asn: parseInt(roa.asn),
                                ta: this.toStandardTa(roa.ta?.toLowerCase())
                            };
                        });
                }
            });
    };
}
