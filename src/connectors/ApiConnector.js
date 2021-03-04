const brembo = require("brembo");

module.exports = function (options) {
    const axios = options.axios;
    this.clientId = options.clientId;
    this.minimumRefreshRateMinutes = 5;

    this.setVRPs = function(){
        throw new Error("You cannot set VRPs with this connector.");
    };

    this.getVRPs = function() {

        const params = brembo.parse(options.url).params
        const url = brembo.build(options.url.split("?")[0], {
            params: Object.assign({ client: this.clientId }, params)
        });

        return axios({
            method: "get",
            url: url,
            responseType: "json"
        })
            .then(data => {
                const out = [];
                if (data && data.data && data.data.roas && data.data.roas.length) {

                    for (let roa of data.data.roas) {
                        out.push({
                            prefix: roa.prefix,
                            maxLength: parseInt(roa.maxLength),
                            asn: parseInt(roa.asn.toString().replace("AS", "")),
                            ta: roa.ta
                        });
                    }
                }

                return out;
            });
    };

};