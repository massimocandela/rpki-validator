const axios = require("axios");
const brembo = require("brembo");

module.exports = function (options) {
    if (options && options.httpsAgent) {
        axios.defaults.httpsAgent = options.httpsAgent;
    }
    axios.defaults.timeout = 180000;

    this.clientId = options.clientId;

    this.minimumRefreshRateMinutes = 15;

    this.setVRPs = function(){
        throw new Error("You cannot set VRPs with this connector.");
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
                            asn: roa.asn.toString()
                        });
                    }

                    return out;
                }
            });
    };

};