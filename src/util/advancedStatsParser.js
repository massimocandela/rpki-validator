function getVrpKey(vrp) {
    return `${vrp.prefix}-${vrp.asid ?? vrp.asn}-${vrp.maxlen ?? vrp.maxLength}`;
}

function getManifestKey(file) {
    return file.split("/").slice(-2).join("-");
}

export default class MetaIndex {
    ids = {};
    type = {};
    vrps = {};
    ski = {};
    aki = {};
    manifests = {};
    metadata = {};


    constructor() {}

    _pushIndex = (index, key, id) => {
        if (!key || !id) {
            return;
        }

        if (!index[key]) {
            index[key] = [id];
        } else {
            index[key].push(id);
        }
    };

    _uniqueIds = (ids) => {
        if (!ids || !ids.length) {
            return [];
        }

        const seen = new Set();
        const out = [];

        for (let id of ids) {
            if (id && !seen.has(id)) {
                seen.add(id);
                out.push(id);
            }
        }

        return out;
    };

    _idsToItems = (ids) => {
        const unique = this._uniqueIds(ids);

        if (!unique.length) {
            return [];
        }

        const out = [];
        for (let id of unique) {
            const item = this.ids[id];
            if (item) {
                out.push(item);
            }
        }

        return out;
    };

    destroy = () => {
        this.ids = {};
        this.type = {};
        this.vrps = {};
        this.ski = {};
        this.aki = {};
        this.manifests = {};
        this.metadata = {};
    };

    add = (item) => {
        if (!item.type) {
            return false; // Skip line
        }

        if (item.type === "metadata") {
            this.metadata = item;
        } else {
            try {
                this._add(item);
            } catch (e) {
                return false; // Skip malformed line
            }
        }
    };

    _add = ({type, valid_since, valid_until, file, hash_id, ski, aki, vrps = [], manifest}) => {
        const item = {type, valid_since, valid_until, file, hash_id, ski, aki, manifest: manifest ? getManifestKey(manifest) : undefined};

        this.ids[hash_id] = item;

        if (type === "manifest") {
            const manifestKey = getManifestKey(file);
            this.manifests[manifestKey] = hash_id;
        } else {
            this._pushIndex(this.type, type, hash_id);
            this._pushIndex(this.ski, ski, hash_id);
            this._pushIndex(this.aki, aki, hash_id);

            for (let vrp of vrps) {
                const key = getVrpKey(vrp);
                this._pushIndex(this.vrps, key, hash_id);
            }
        }
    };

    get = (id) => {
        return this.ids[id];
    };

    getByType = (type) => {
        return this._idsToItems(this.type[type]);
    };

    getVRPs = (vrp) => {
        return this._idsToItems(this.vrps[getVrpKey(vrp)]);
    };

    getParents = (data) => {
        if (!Array.isArray(data)) {
            data = [data];
        }

        const parentIds = [];

        for (let item of data) {
            const skiIds = this._getSki(item?.aki) || [];

            for (let id of skiIds) {
                if (id && id !== item.hash_id) {
                    parentIds.push(id);
                }
            }
        }

        return this._idsToItems(parentIds);
    };

    getStructure = (vrp) => {
        const tree = [];
        let count = 100;
        let item = this.getVRPs(vrp);

        while (item.length && count > 0) {
            tree.push(item);
            item = this.getParents(item);
            count--;
        }

        return tree.flat().map(i => {
            const manifestId = i.manifest ? this.manifests[i.manifest] : undefined;
            const manifest = manifestId ? this.ids[manifestId] : undefined;

            return {
                ...i,
                manifest
            };
        });
    };

    getFlattenStructure = (vrp) => {
        const items = this.getStructure(vrp);
        const manifests = [];
        for (let item of items) {
            if (item.manifest) {
                manifests.push(item.manifest);
                delete item.manifest;
            }
        }

        return [...items, ...manifests];
    };

    getExpiring = (vrp, expires, now) => {
        return this.getFlattenStructure(vrp)
            .filter(i => {
                return i.valid_until === expires && (!i.valid_since || !now || i.valid_since <= now);
            });
    };

    getChildren = (data) => {
        if (!Array.isArray(data)) {
            data = [data];
        }

        const childIds = [];

        for (let item of data) {
            const akiIds = this._getAki(item?.ski) || [];
            childIds.push(...akiIds);
        }

        return this._idsToItems(childIds);
    };

    _getSki = (ski) => {
        if (ski) {
            return this.ski[ski];
        } else {
            return null;
        }
    };

    _getAki = (aki) => {
        if (aki) {
            return this.aki[aki];
        } else {
            return null;
        }
    };
}