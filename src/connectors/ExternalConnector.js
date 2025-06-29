import {validateVRP} from "net-validations";
import Connector from "./Connector";

export default class ExternalConnector extends Connector {
    constructor(options) {
        super(options);
        this.minimumRefreshRateMinutes = 0;
        this.vrps = [];
    };

    setVRPs = (vrps) => {
        vrps = (vrps || [])
            .map(item => {
                const origin = item.asn.toString().replace("AS", "");
                const maxLength = item.maxLength;
                if (!!item.prefix && isNaN(origin) && isNaN(maxLength)) {
                    throw new Error("Not valid ROA format");
                }

                return {
                    prefix: item.prefix,
                    asn: parseInt(origin),
                    maxLength: parseInt(maxLength),
                    ta: this.toStandardTa(item.ta?.toLowerCase() ?? ""),
                    expires: item.expires || null,
                    notBefore: item.notBefore || null
                };
            });

        this.vrps = vrps
            .filter(item => {
                try {
                    validateVRP(item);
                    return true;
                } catch (e) {
                    // Skip malformed vrp
                    return false;
                }
            });
    };

    getVRPs = () => {
        return Promise.resolve(this.vrps);
    };
}