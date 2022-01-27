import Connector from "./Connector";

export default class ApiConnector extends Connector {
    constructor(options) {
        super(options);
        this.url = options.url
    };

    getVRPs = () => {
        return this.axios({
            method: "get",
            url: this.url,
            responseType: "json"
        })
            .then(data => {
                const out = [];
                if (data && data.data) {
                    const roas = (data.data.roas && data.data.roas.length) ? data.data.roas : data.data || [];

                    for (let roa of roas) {
                        out.push({
                            prefix: roa.prefix,
                            maxLength: parseInt(roa.maxLength),
                            asn: parseInt(roa.asn.toString().replace("AS", "")),
                            ta: roa.ta,
                            expires: roa.expires || null,
                            notBefore: roa.notBefore || null
                        });
                    }
                }

                return out;
            });
    };

}