import brembo from "brembo";
import Connector from "./Connector";

export default class CloudflareConnector extends Connector {
    constructor(options) {
        super(options);
        this.minimumRefreshRateMinutes = 20;
    };

    toStandardTa = (ta) => {
        return ta.replace("Cloudflare - ", "").toLowerCase();
    };

    getVRPs = () => {
        const url = brembo.build("https://rpki.cloudflare.com", {
            path: ["rpki.json"]
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
                                ta: this.toStandardTa(roa.ta)
                            };
                        });
                }
            });
    };

}