import brembo from "brembo";
import Connector from "./Connector";
import MetaIndex from "../util/advancedStatsParser";

export default class RpkiClientConnector extends Connector {
    constructor(options) {
        super(options);

        this.index = null;
        this.host = this.options.host ?? "https://console.rpki-client.org";
        this.dumpModified = null;
        this.minimumRefreshRateMinutes = 5;
        this.advancedStatsRefreshRateMinutes = Math.max(10, this.options.advancedStatsRefreshRateMinutes);
    };

    getAdvancedStats = () => {
        if (!this.setAdvancedStatsTimer) {
            this.setAdvancedStatsTimer = setInterval(() => {
                this._advancedStatsPromise = this._setAdvancedStats();
            }, this.advancedStatsRefreshRateMinutes * 60 * 1000);
            this._advancedStatsPromise = this._setAdvancedStats();
        }

        return this._advancedStatsPromise;
    };


    fetchAndParseGz = (url) => {
        const headers = {
            "User-Agent": this.clientId,
            ...(this.dumpModified ? { "If-Modified-Since": this.dumpModified.toUTCString() } : {})
        };

        return fetch(url, { headers })
            .then(res => {
                this.dumpModified = new Date(res.headers.get("last-modified"));
                const stream = res.body
                    .pipeThrough(new DecompressionStream("gzip"))
                    .pipeThrough(new TextDecoderStream());
                const reader = stream.getReader();

                this.index = new MetaIndex();
                let buffer = "";

                const process = (result) => {
                    if (result.done) {
                        buffer.split("\n").forEach(l => {
                            if (l.trim().length > 1) try { this.index.add(JSON.parse(l)); } catch {}
                        });
                        return this.index;
                    }

                    buffer += result.value;
                    const parts = buffer.split("\n");
                    buffer = parts.pop();
                    parts.forEach(l => {
                        if (l.trim().length > 1) try { this.index.add(JSON.parse(l)); } catch {}
                    });

                    return reader.read().then(process);
                };

                return reader.read().then(process);
            });
    };

    _setAdvancedStats = () => {
        const url = brembo.build(this.host, {
            path: ["dump.json.gz"]
        });

        return this.fetchAndParseGz(url)
            .then(() => this.index);
    };

    _applyRpkiClientMetadata = (metadata = {}) => {
        this.metadata = {
            buildmachine: metadata?.buildmachine,
            buildtime: metadata?.buildtime ? new Date(metadata?.buildtime).toISOString() : null, // used for if-modified-since
            elapsedtime: metadata?.elapsedtime
        };
    };

    getVRPs = () => {
        const url = brembo.build(this.host, {
            path: ["vrps.json"],
            params: {
                client: this.clientId
            }
        });

        return this.axios({
            method: "get",
            url,
            responseType: "json",
            headers: {
                "User-Agent": this.clientId,
                "Accept-Encoding": "gzip",
                ...this.metadata?.lastModified ? {"If-Modified-Since": new Date(this.metadata.lastModified).toUTCString()} : {}
            }
        })
            .then(data => {
                if (data && data.data && data.data.roas) {
                    const roas = data.data.roas;
                    const metadata = data.data?.metadata;
                    const headers = data.headers;

                    this._applyRpkiClientMetadata(metadata);
                    this.metadata.lastModified = headers["last-modified"] ? new Date(headers["last-modified"]).toISOString() : null;

                    return roas
                        .map(roa => {
                            return {
                                prefix: roa.prefix,
                                maxLength: roa.maxLength,
                                asn: parseInt(roa.asn.toString().replace("AS", "")),
                                ta: this.toStandardTa(roa.ta?.toLowerCase()),
                                expires: roa.expires || null
                            };
                        });
                }
            })
            .catch(error => {
                if (error.response?.status !== 304) {
                    return Promise.reject(error);
                }

                return null;
            });
    };

    getExpiringElements = (vrp, expires, now) => {
        return this.getAdvancedStats()
            .then(index => index.getExpiring(vrp, expires, now));
    };
}
