import brembo from "brembo";
import Connector from "./Connector";

export default class RIPEConnector extends Connector{
    constructor(options) {
        super(options);
        this.minimumRefreshRateMinutes = 10;
    };

    toStandardTa = (ta) => {
        const taComponents = ta.split(" ");
        return ((taComponents.length) ? taComponents[0] : "").toLowerCase();
    };

    getVRPs = () => {
        const url = brembo.build("https://stat.ripe.net/", {
            path: ["data", "rpki-roas", "data.json"]
        });

        return this.axios({
            method: "get",
            url,
            responseType: "json"
        })
            .then(data => {
                if (data && data.data && data.data.data && data.data.data.roas) {
                    const roas = data.data.data.roas;
                    const out = [];

                    for (let roa of roas) {
                        out.push({
                            prefix: roa.prefix,
                            maxLength: parseInt(roa.maxLength),
                            asn: parseInt(roa.asn),
                            ta: this.toStandardTa(roa.ta)
                        });
                    }

                    return out;
                }
            });
    };
}
