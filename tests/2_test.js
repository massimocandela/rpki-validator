const chai = require("chai");
const chaiSubset = require('chai-subset');
const expect = chai.expect;
const rpkiValidator = require("../src/index");
chai.use(chaiSubset);

const rpki = new rpkiValidator({
    connector: "api",
    url: "https://stat.ripe.net/data/rpki-roas/data.json?validator=ripenccv3"
});

const single = { // It must be in the vrp list
    prefix: "218.103.58.0/23",
    maxLength: 24,
    asn: "4515"
};


describe("Generic API Connector", function () {

    const verbose = true;

    it("single valid - loading VRP list", function(done) {
        rpki.preCache()
            .then(() => {
                return rpki.validate(single.prefix, single.asn, verbose)
                    .then(result => {
                        expect(result).to
                            .containSubset({
                                valid: true,
                                reason: null
                            });
                        done();
                    })
                    .catch(done);
            })
            .catch(done);
    })
        .timeout(120000);
});
