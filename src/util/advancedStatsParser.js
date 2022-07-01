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

    add = (item) => {
        const {type, valid_since, valid_until, file, hash_id, ski, aki} = item;
        const cleanItem = {type, valid_since, valid_until, file};

        this.ids[hash_id] = cleanItem;

        this.type[type] ??= [];
        this.type[type].push(cleanItem);

        if (ski) {
            this.ski[ski] ??= [];
            this.ski[ski].push(cleanItem);
        }

        if (aki) {
            this.aki[aki] ??= [];
            this.aki[aki].push(cleanItem);
        }

        for (let vrp of item?.vrps ?? []) {
            const key = getVrpKey(vrp);
            this.vrps[key] ??= [];
            this.vrps[key].push(cleanItem);
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