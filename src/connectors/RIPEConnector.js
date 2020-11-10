const brembo = require("brembo");

module.exports = function (options) {
    const axios = options.axios;

    this.clientId = options.clientId;

    this.minimumRefreshRateMinutes = 15;

    this.setVRPs = function(){
        throw new Error("You cannot set VRPs with this connector.");
    };

    this.toStandardTa = function (ta) {
        const taComponents = ta.split(" ");
        return ((taComponents.length) ? taComponents[0] : "").toLowerCase();
    };

    this.getVRPs = function() {
        const url = brembo.build("https://stat.ripe.net/", {
            path: ["data", "rpki-roas", "data.json"],
            params: {
                validator: "ripenccv3",
                client: this.clientId
            }
        });

        return axios({
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
                            maxLength: roa.maxLength,
                            asn: roa.asn.toString(),
                            ta: this.toStandardTa(roa.ta)
                        });
                    }

                    return out;
                }
            });
    };

};