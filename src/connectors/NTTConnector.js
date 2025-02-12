import Connector from "./Connector";
import brembo from "brembo";

export default class NTTConnector extends Connector {
    constructor(options) {
        super(options);
        this.minimumRefreshRateMinutes = 15;
    };

    getVRPs = () => {
        const url = brembo.build("https://rpki.gin.ntt.net/", {
            path: ["api", "export.json"],
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

                    return data.data.roas
                        .map(roa => {
                            return {
                                prefix: roa.prefix,
                                maxLength: parseInt(roa.maxLength),
                                asn: parseInt(roa.asn.toString().replace("AS", "")),
                                ta: roa.ta,
                                expires: roa.expires || null
                            };
                        });
                }
            });
    };
}
