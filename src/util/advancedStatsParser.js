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

export default class MetaIndex {
    ids = {};
    type = {};
    vrps = {};
    ski = {};
    aki = {};
    constructor() {}

    destroy = () => {
        this.ids = {};
        this.type = {};
        this.vrps = {};
        this.ski = {};
        this.aki = {};
    }

    add = ({type, valid_since, valid_until, file, hash_id, ski, aki}) => {
        const item = {type, valid_since, valid_until, file, hash_id, ski, aki};

        this.ids[hash_id] = item;

        this.type[type] ??= [];
        this.type[type].push(this.ids[hash_id]);

        if (ski) {
            this.ski[ski] ??= [];
            this.ski[ski].push(this.ids[hash_id]);
        }

        if (aki) {
            this.aki[aki] ??= [];
            this.aki[aki].push(this.ids[hash_id]);
        }

        for (let vrp of item?.vrps ?? []) {
            const key = getVrpKey(vrp);
            this.vrps[key] ??= [];
            this.vrps[key].push(this.ids[hash_id]);
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