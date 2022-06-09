function getVrpKey(vrp) {
    return `${vrp.prefix}-${vrp.asid ?? vrp.asn}-${vrp.maxlen ?? vrp.maxLength}`;
}

export default class MetaIndex {
    ids = {};
    type = {};
    vrps = {};
    ski = {};
    aki = {};
    constructor() {}

    add = (item) => {
        item["id"] = item["hash_id"];
        delete item["hash_id"];

        this.ids[item["id"]] = item;

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

    get = (id) => {
        return this.ids[id];
    }

    getByType = (type) => {
        return this.type[type];
    }

    getVRPs = (vrp) => {
        return this.#makeUnique(this.vrps[getVrpKey(vrp)]);
    }

    getParents = (data) => {
        if (!Array.isArray(data)) {
            data = [data];
        }

        return this.#makeUnique(data.map(i => this.#getSki(i.aki)).flat().filter(i => !!i));
    }

    getChildren = (data) => {
        if (!Array.isArray(data)) {
            data = [data];
        }

        return this.#makeUnique(data.map(i => this.#getAki(i.ski)).flat());
    }

    #makeUnique = (arr) => {
        const uniq = {};

        for (let item of arr) {
            uniq[item.id] = item;
        }

        return Object.values(uniq);
    }

    #getSki = (ski) => {
        if (ski) {
            return this.ski[ski];
        } else {
            return null;
        }
    }

    #getAki = (aki) => {
        return this.aki[aki];
    }
}