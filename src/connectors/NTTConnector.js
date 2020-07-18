const axios = require("axios");
const brembo = require("brembo");

module.exports = function (options) {
    if (options && options.httpsAgent) {
        axios.defaults.httpsAgent = options.httpsAgent;
    }

    axios.defaults.timeout = 180000;

    this.clientId = options.clientId;

    this.getVRPs = function() {
        const url = brembo.build("https://rpki.gin.ntt.net/", {
            path: ["api", "export.json"],
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
                            maxLength: roa.maxLength,
                            asn: roa.asn.toString().replace('AS', '')
                        });
                    }

                    return out;
                }
            });
    };

};