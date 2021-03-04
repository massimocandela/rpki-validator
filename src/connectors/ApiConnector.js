
module.exports = function (options) {
    const axios = options.axios;
    this.clientId = options.clientId;
    this.minimumRefreshRateMinutes = 5;

    this.setVRPs = function(){
        throw new Error("You cannot set VRPs with this connector.");
    };

    this.getVRPs = function() {

        return axios({
            method: "get",
            url: options.url,
            responseType: "json"
        })
            .then(data => {
                if (data && data.data.roas) {

                    return data.data.roas;
                }
            });
    };

};