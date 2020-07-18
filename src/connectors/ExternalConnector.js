
module.exports = function (options) {

    this.vrps = options.vrps;

    this.getVRPs = function() {
        return Promise.resolve((this.vrps || [])
            .map(i => {
                const origin = i.asn.toString().replace('AS', '');
                const maxLength = parseInt(i.maxLength);
                if (!!i.prefix && isNaN(origin) && isNaN(maxLength)) {
                    throw new Error("Not valid ROA format");
                }
                return {
                    prefix: i.prefix,
                    asn: origin,
                    maxLength
                }
            }));
    };

};