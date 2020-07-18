
module.exports = function (options) {

    this.vrps = options.vrps;

    this.getVRPs = function() {
        return Promise.resolve((this.vrps || [])
            .map(i => {
                if (!!i.prefix && isNaN(i.origin) && isNaN(i.maxLength)) {
                    throw new Error("Not valid ROA format");
                }
                return {
                    prefix: i.prefix,
                    origin: i.asn,
                    maxLength: i.maxLength
                }
            }));
    };

};