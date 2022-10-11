export default class Connector {
    constructor(options) {
        this.options = options;
        this.axios = options.axios;
        this.clientId = options.clientId;
        this.minimumRefreshRateMinutes = 5;
    };

    getAdvancedStats = () => {
        return Promise.reject("This method is not implemented for this provider");
    };

    setVRPs = () => {
        throw new Error("You cannot set VRPs with this connector.");
    };
}