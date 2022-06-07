function getVrpKey(vrp) {
    return `${vrp.prefix}-${vrp.asid ?? vrp.asn}-${vrp.maxlen ?? vrp.maxLength}`;
}

export default class MetaIndex {
    hashes = {};
    type = {};
    vrps = {};
    ski = {};
    aki = {};
    constructor() {}

    add = (item) => {
        this.hashes[item["hash_id"]] = item;

        this.type[item.type] ??= [];
        this.type[item.type].push(item);

        this.ski[item["ski"]] ??= [];
        this.ski[item["ski"]].push(item);

        this.aki[item["aki"]] ??= [];
        this.aki[item["aki"]].push(item);

        for (let vrp of item.vrps ?? []) {
            const key = getVrpKey(vrp);
            this.vrps[key] ??= [];
            this.vrps[key].push(item);
        }
    }

    getSky = (ski) => {
        return this.ski[ski];
    }

    getAki = (aki) => {
        return this.aki[aki];
    }

    getHash = (hash) => {
        return this.hashes[hash];
    }

    getType = (type) => {
        return this.type[type];
    }

    getVRP = (vrp) => {
        return this.vrps[getVrpKey(vrp)];
    }

    getParent = (data) => {
        if (!Array.isArray(data)) {
            data = [data];
        }

        return data.map(i => this.getSky(i.aki)).flat();
    }

    getChildren = (data) => {
        if (!Array.isArray(data)) {
            data = [data];
        }

        return data.map(i => this.getAki(i.ski)).flat();
    }
}