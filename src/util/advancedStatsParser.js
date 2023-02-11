function getVrpKey(vrp) {
    return `${vrp.prefix}-${vrp.asid ?? vrp.asn}-${vrp.maxlen ?? vrp.maxLength}`;
}

function makeUnique(arr) {
    const uniq = {};

    if (!!arr) {
        for (let item of arr) {
            uniq[item.id] = item;
        }
    }

    return Object.values(uniq);
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

    destroy = () => {
        this.ids = {};
        this.type = {};
        this.vrps = {};
        this.ski = {};
        this.aki = {};
        this.manifests = {};
        this.metadata = {};
    }

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
                return true; // Skip malformed line
            }
        }
    }

    _add = ({type, valid_since, valid_until, file, hash_id, ski, aki, vrps=[], manifest}) => {
        const item = {type, valid_since, valid_until, file, hash_id, ski, aki, manifest: manifest ? getManifestKey(manifest): undefined};

        this.ids[hash_id] = item;

        if (type === "manifest") {
            const manifestKey = getManifestKey(file);
            this.manifests[manifestKey] = item;
        } else {

            this.type[type] = this.type[type] || [];
            this.type[type].push(this.ids[hash_id]);

            if (ski) {
                this.ski[ski] = this.ski[ski] || [];
                this.ski[ski].push(this.ids[hash_id]);
            }

            if (aki) {
                this.aki[aki] = this.aki[aki] || [];
                this.aki[aki].push(this.ids[hash_id]);
            }

            for (let vrp of vrps) {
                const key = getVrpKey(vrp);
                this.vrps[key] = this.vrps[key] || [];
                this.vrps[key].push(this.ids[hash_id]);
            }
        }
    }

    get = (id) => {
        return this.ids[id];
    }

    getByType = (type) => {
        return this.type[type];
    }

    getVRPs = (vrp) => {
        return makeUnique(this.vrps[getVrpKey(vrp)]);
    }

    getParents = (data) => {
        if (!Array.isArray(data)) {
            data = [data];
        }

        return makeUnique(data.map(i => this._getSki(i.aki)?.filter(p => i.hash_id !== p.hash_id)).flat().filter(i => !!i));
    }

    getStructure = (vrp) => {
        const tree  = [];
        let count = 100;
        let item = makeUnique(this.vrps[getVrpKey(vrp)]);

        while (item.length && count > 0) {
            tree.push(item);
            item = this.getParents(item);
            count--;
        }


        return tree.flat().map(i => ({...i, manifest: i.manifest ? this.manifests[i.manifest] : undefined}));
    }

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
    }

    getExpiring = (vrp, expires, now) => {
        return this.getFlattenStructure(vrp)
            .filter(i => {
                return i.valid_until === expires && (!i.valid_since || !now || i.valid_since <= now);
            });
    }

    getChildren = (data) => {
        if (!Array.isArray(data)) {
            data = [data];
        }

        return makeUnique(data.map(i => this._getAki(i.ski)).flat());
    }

    _getSki = (ski) => {
        if (ski) {
            return this.ski[ski];
        } else {
            return null;
        }
    }

    _getAki = (aki) => {
        if (aki) {
            return this.aki[aki];
        } else {
            return null;
        }
    }
}