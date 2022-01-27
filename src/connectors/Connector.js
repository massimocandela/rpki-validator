export default class Connector {
    constructor(options) {
        this.axios = options.axios;
        this.clientId = options.clientId;
        this.minimumRefreshRateMinutes = 5;
    };

    setVRPs = () => {
        throw new Error("You cannot set VRPs with this connector.");
    };
}