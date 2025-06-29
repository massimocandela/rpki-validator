export default class Connector {
    constructor(options) {
        this.options = options;
        this.metadata = {};
        this.axios = options.axios;
        this.clientId = options.clientId;
        this.minimumRefreshRateMinutes = 1;
    };

    toStandardTa = (ta) => {
        const TAs = ["afrinic", "apnic", "arin", "lacnic", "ripe"];

        for (let t of TAs) {
            if (ta.includes(t)) {
                return t;
            }
        }

        return ta;
    };

    getAdvancedStats = () => {
        return Promise.reject("Advanced RPKI statistics are not enabled for this provider.");
    };

    getExpiringElements = () => {
        return Promise.reject("Advanced RPKI statistics are not enabled for this provider.");
    };

    setVRPs = () => {
        throw new Error("You cannot set VRPs with this connector.");
    };
}