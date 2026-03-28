const chai = require("chai");
const expect = chai.expect;
const MetaIndex = require("../src/util/advancedStatsParser").default;

describe("MetaIndex", function () {
    it("stores index entries as hash IDs and resolves object outputs", function () {
        const index = new MetaIndex();

        index.add({
            type: "manifest",
            hash_id: "m1",
            file: "/repo/rpki/ta/file.mft",
            valid_since: 1,
            valid_until: 999
        });

        index.add({
            type: "cer",
            hash_id: "p1",
            file: "/repo/rpki/ta/parent.cer",
            ski: "ca-ski",
            aki: "root-ski",
            valid_since: 1,
            valid_until: 200
        });

        index.add({
            type: "roa",
            hash_id: "r1",
            file: "/repo/rpki/ta/child.roa",
            ski: "leaf-ski",
            aki: "ca-ski",
            manifest: "/repo/rpki/ta/file.mft",
            valid_since: 10,
            valid_until: 100,
            vrps: [
                {prefix: "83.231.128.0/17", asn: 2914, maxLength: 17},
                {prefix: "83.231.128.0/17", asn: 2914, maxLength: 17}
            ]
        });

        const vrpKey = "83.231.128.0/17-2914-17";

        expect(index.vrps[vrpKey]).to.deep.equal(["r1", "r1"]);
        expect(index.type.roa).to.deep.equal(["r1"]);
        expect(index.ski["leaf-ski"]).to.deep.equal(["r1"]);
        expect(index.aki["ca-ski"]).to.deep.equal(["r1"]);
        expect(index.manifests["ta-file.mft"]).to.equal("m1");

        const vrpItems = index.getVRPs({prefix: "83.231.128.0/17", asn: 2914, maxLength: 17});
        expect(vrpItems.length).to.equal(1);
        expect(vrpItems[0].hash_id).to.equal("r1");

        const parents = index.getParents(vrpItems[0]);
        expect(parents.length).to.equal(1);
        expect(parents[0].hash_id).to.equal("p1");

        const children = index.getChildren(parents[0]);
        expect(children.length).to.equal(1);
        expect(children[0].hash_id).to.equal("r1");

        const structure = index.getStructure({prefix: "83.231.128.0/17", asn: 2914, maxLength: 17});
        const child = structure.find(i => i.hash_id === "r1");
        expect(child).to.not.equal(undefined);
        expect(child.manifest).to.not.equal(undefined);
        expect(child.manifest.hash_id).to.equal("m1");

        const flattened = index.getFlattenStructure({prefix: "83.231.128.0/17", asn: 2914, maxLength: 17});
        expect(flattened.some(i => i.hash_id === "m1")).to.equal(true);
        expect(flattened.some(i => i.hash_id === "r1")).to.equal(true);

        const expiring = index.getExpiring({prefix: "83.231.128.0/17", asn: 2914, maxLength: 17}, 100, 50);
        expect(expiring.some(i => i.hash_id === "r1")).to.equal(true);
    });
});
