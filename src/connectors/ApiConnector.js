module.exports = function (options) {
    const axios = options.axios;
    this.clientId = options.clientId;
    this.minimumRefreshRateMinutes = 5;

    this.setVRPs = function(){
        throw new Error("You cannot set VRPs with this connector.");
    };

    this.getVRPs = function() {
        const url = options.url;

        return axios({
            method: "get",
            url: url,
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
                            expires: roa.expires || null
                        });
                    }
                }

                return out;
            });
    };

};