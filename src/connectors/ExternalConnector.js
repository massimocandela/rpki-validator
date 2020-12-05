
module.exports = function (options) {

    this.vrps = [];

    this.minimumRefreshRateMinutes = 0;

    this.setVRPs = function(vrps){
        this.vrps = (vrps || [])
            .map(i => {
                const origin = i.asn.toString().replace('AS', '');
                const maxLength = i.maxLength;
                if (!!i.prefix && isNaN(origin) && isNaN(maxLength)) {
                    throw new Error("Not valid ROA format");
                }
                return {
                    prefix: i.prefix,
                    asn: parseInt(origin),
                    maxLength: parseInt(maxLength),
                    ta: i.ta || ""
                }
            })
    };

    this.getVRPs = function() {
        return Promise.resolve(this.vrps);
    };

};