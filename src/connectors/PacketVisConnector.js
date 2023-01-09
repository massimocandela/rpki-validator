import RpkiClientConnector from "./RpkiClientConnector";

export default class PacketVisConnector extends RpkiClientConnector {
    constructor(options) {
        super({...options, host: "https://api.packetvis.com/v1/rpki/meta/"});
    };
}
