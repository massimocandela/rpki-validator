import brembo from "brembo";
import Connector from "./Connector";

export default class RpkiClientConnector extends Connector {
    constructor(options) {
        super(options);
    };

    getVRPs = () => {
        const url = brembo.build("https://console.rpki-client.org", {
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

}
