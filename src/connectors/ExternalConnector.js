const {validateVRP} = require("net-validations");

module.exports = function (options) {

    this.vrps = [];

    this.minimumRefreshRateMinutes = 0;

    this.setVRPs = function(vrps){
        vrps = (vrps || [])
            .map(item => {
                const origin = item.asn.toString().replace('AS', '');
                const maxLength = item.maxLength;
                if (!!item.prefix && isNaN(origin) && isNaN(maxLength)) {
                    throw new Error("Not valid ROA format");
                }

                return {
                    prefix: item.prefix,
                    asn: parseInt(origin),
                    maxLength: parseInt(maxLength),
                    ta: item.ta || "",
                    expires: item.expires || null,
                    notBefore: item.notBefore || null,
                }
            });

        this.vrps = vrps.filter(item => {
            try {
                validateVRP(item);
                return true;
            } catch(e) {
                // Skip malformed vrp
                return false
            }
        });
    };

    this.getVRPs = function() {
        return Promise.resolve(this.vrps);
    };

};