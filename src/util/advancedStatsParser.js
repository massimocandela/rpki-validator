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

    constructor() {}

    destroy = () => {
        this.ids = {};
        this.type = {};
        this.vrps = {};
        this.ski = {};
        this.aki = {};
        this.manifests = {};
    }

    add = ({type, valid_since, valid_until, file, hash_id, ski, aki, vrps=[], manifest}) => {
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

        return makeUnique(data.map(i => this._getSki(i.aki)).flat().filter(i => !!i));
    }

    getStructure = (vrp) => {
        const tree  = [];
        let item = makeUnique(this.vrps[getVrpKey(vrp)]);

        while (item.length) {
            tree.push(item);
            item = this.getParents(item);
        }


        return tree.flat().map(i => ({...i, manifest: i.manifest ? this.manifests[i.manifest] : undefined}));
    }

    getFlattenStructure = (vrp) => {
        const items = this.getStructure(vrp);
        const out = [];
        for (let item of items) {
            if (item.manifest) {
                out.push(item.manifest);
                delete item.manifest;
            }
            out.push(item);
        }

        return out;
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