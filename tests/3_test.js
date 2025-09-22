const chai = require("chai");
const chaiSubset = require("chai-subset");
const expect = chai.expect;
const RpkiValidator = require("../src/index");
chai.use(chaiSubset);

const rpki = new RpkiValidator();

const single = { // It must be in the vrp list
    prefix: "218.103.58.0/23",
    maxLength: 24,
    asn: "4515"
};


describe("Advanced stats", function () {

    const verbose = true;

    it("roa", function (done) {
        rpki.getAdvancedStats()
            .then(index => {
                expect(!!Object.keys(index.vrps).find(i => i === "83.231.128.0/17-2914-17")).to.equal(true);
                done();
            })
            .catch(console.log);
    })
        .timeout(320000);
});
