const brembo = require("brembo");

module.exports = function (options) {
    const axios = options.axios;

    this.clientId = options.clientId;

    this.minimumRefreshRateMinutes = 15;

    this.setVRPs = function(){
        throw new Error("You cannot set VRPs with this connector.");
    };

    this.getVRPs = function() {
        const url = brembo.build("https://console.rpki-client.org", {
            path: ["vrps.json"],
            params: {
                client: this.clientId
            }
        });

        return axios({
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
                            maxLength: parseInt(roa.maxLength),
                            asn: parseInt(roa.asn.toString().replace('AS', '')),
                            ta: roa.ta
                        });
                    }

                    return out;
                }
            });
    };

};