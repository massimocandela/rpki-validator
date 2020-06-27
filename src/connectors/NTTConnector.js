let axios = require("axios");
let brembo = require("brembo");

module.exports = function () {

    this.getVRPs = function() {
        const url = brembo.build("https://rpki.gin.ntt.net/", {
            path: ["data", "api", "export.json"]
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
                            origin: roa.asn
                        });
                    }

                    return out;
                }
            });
    };

};