const chai = require("chai");
const chaiSubset = require('chai-subset');
const expect = chai.expect;
const rpkiValidator = require("../src/index");
const fs = require("fs");
chai.use(chaiSubset);

const asyncTimeout = 120000;

const rpki = new rpkiValidator();

const prefixList = JSON.parse(fs.readFileSync("tests/test.json", "utf8"));
const single = { // It must be in the vrp list
    prefix: "218.103.58.0/23",
    maxLength: 24,
    asn: "4515"
};
const singleNotValidLength = {
    prefix: "213.74.5.0/26",
    maxLength: 24,
    asn: "34984"
};

const uncovered = {
    prefix: "203.126.124.0/21",
    asn: 9404
};

const singleNotValidLengthExternal = {
    prefix: "213.7.5.0/26",
    asn: "1234"
};

const singleValidLengthExternal = {
    prefix: "213.7.5.0/24",
    asn: 1234
};

const first100 = prefixList.slice(0, 100);
const first5000 = prefixList.slice(0, 5000);

describe("Tests", function() {

    describe("Online", function () {
        const verbose = false;

        it("single valid", function(done) {
            rpki.validate(single.prefix, single.asn, verbose)
                .then(result => {
                    expect(result).to.equal(true);
                    done();
                })
                .catch(console.log);

        }).timeout(asyncTimeout);

        it("single not valid - origin", function(done) {
            rpki.validate(single.prefix, uncovered.asn, verbose)
                .then(result => {
                    expect(result).to.equal(false);
                    done();
                })
                .catch(console.log);

        }).timeout(asyncTimeout);

        it("single not valid - prefix length", function(done) {

            const prefix = single.prefix.split("/")[0] + "/" + (single.maxLength + 1);
            rpki.validate(prefix, single.asn, verbose)
                .then(result => {
                    expect(result).to.equal(false);
                    done();
                })
                .catch(console.log);

        }).timeout(asyncTimeout);

        it("single not covered", function(done) {
            rpki.validate(uncovered.prefix, uncovered.asn, verbose)
                .then(result => {
                    expect(result).to.equal(null);
                    done();
                })
                .catch(console.log);

        }).timeout(asyncTimeout);

        it("multiple mixed", function(done) {
            const prefix = single.prefix.split("/")[0] + "/" + (single.maxLength + 1);

            const list = [
                rpki.validate(single.prefix, single.asn, verbose),
                rpki.validate(single.prefix, uncovered.asn, verbose),
                rpki.validate(prefix, single.asn, verbose),
                rpki.validate(uncovered.prefix, uncovered.asn, verbose)
            ];


            Promise.all(list)
                .then(([a, b, c, d]) => {

                    expect(a).to.equal(true);
                    expect(b).to.equal(false);
                    expect(c).to.equal(false);
                    expect(d).to.equal(null);
                    done();
                })
                .catch(console.log);

        }).timeout(asyncTimeout);

        it("multiple - 100", function(done) {

            Promise.all(first100.map(i => rpki.validate(i.prefix, i.asn, false)))
                .then((list) => {
                    expect(list.length).to.equal(100);
                    done();
                })
                .catch(console.log);
        }).timeout(asyncTimeout);

    });

    describe("Online verbose", function () {
        const verbose = true;

        it("single valid", function(done) {
            rpki.validate(single.prefix, single.asn, verbose)
                .then(result => {
                    expect(result).to
                        .containSubset({
                            valid: true,
                            reason: null
                        });
                    done();
                })
                .catch(console.log);

        }).timeout(asyncTimeout);

        it("single not valid - origin", function(done) {
            rpki.validate(single.prefix, uncovered.asn, verbose)
                .then(result => {
                    expect(result).to
                        .containSubset({
                            valid: false,
                            reason: "Not valid origin"
                        });
                    done();
                })
                .catch(console.log);

        }).timeout(asyncTimeout);

        it("single not valid - prefix length", function(done) {

            rpki.validate(singleNotValidLength.prefix, singleNotValidLength.asn, verbose)
                .then(result => {
                    expect(result).to
                        .containSubset({
                            valid: false,
                            reason: "Not valid prefix length"
                        });
                    done();
                })
                .catch(console.log);

        }).timeout(asyncTimeout);

        it("single not covered", function(done) {
            rpki.validate(uncovered.prefix, uncovered.asn, verbose)
                .then(result => {
                    expect(result).to
                        .containSubset({
                            valid: null,
                            reason: "No ROA available for this prefix"
                        });
                    done();
                })
                .catch(console.log);

        }).timeout(asyncTimeout);

        it("multiple mixed", function(done) {
            const list = [
                rpki.validate(single.prefix, single.asn, verbose),
                rpki.validate(single.prefix, uncovered.asn, verbose),
                rpki.validate(singleNotValidLength.prefix, singleNotValidLength.asn, verbose),
                rpki.validate(uncovered.prefix, uncovered.asn, verbose)
            ];

            Promise.all(list)
                .then(([a, b, c, d]) => {

                    expect(a).to
                        .containSubset({
                            valid: true,
                            reason: null
                        });

                    expect(b).to
                        .containSubset({
                            valid: false,
                            reason: "Not valid origin"
                        });

                    expect(c).to
                        .containSubset({
                            valid: false,
                            reason: "Not valid prefix length"
                        });

                    expect(d).to
                        .containSubset({
                            valid: null,
                            reason: "No ROA available for this prefix"
                        });

                    done();
                })
                .catch(console.log);

        }).timeout(asyncTimeout);

    });

    describe("Pre Cached mixed", function () {

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
                        .catch(console.log);
                })
                .catch(console.log);
        }).timeout(120000);

        it("single valid - string origin", function(done) {
            rpki.preCache()
                .then(() => {
                    return rpki.validate(single.prefix, `AS${single.asn}`, verbose)
                        .then(result => {
                            expect(result).to
                                .containSubset({
                                    valid: true,
                                    reason: null
                                });
                            done();
                        })
                        .catch(console.log);
                })
                .catch(console.log);
        }).timeout(120000);

        it("single valid - integer origin", function(done) {
            rpki.preCache()
                .then(() => {
                    return rpki.validate(single.prefix, 4515, verbose)
                        .then(result => {
                            expect(result).to
                                .containSubset({
                                    valid: true,
                                    reason: null
                                });
                            done();
                        })
                        .catch(console.log);
                })
                .catch(console.log);
        }).timeout(120000);

        it("single not valid - two ROAs", function(done) {
            rpki.preCache()
                .then(() => {
                    return rpki.validate("82.112.100.0/24", "2914", verbose)
                        .then(result => {

                            expect(result).to
                                .containSubset({
                                    valid: true,
                                    reason: null
                                });

                            expect(result.covering).to
                                .eql([
                                    { prefix: '82.112.96.0/19', maxLength: 19, asn: '2914' },
                                    { prefix: '82.112.100.0/24', maxLength: 24, asn: '2914' }
                                ]);
                            done();
                        })
                        .catch(console.log);
                })
                .catch(console.log);
        }).timeout(asyncTimeout);

        it("single not valid - 23.11.254.0/23", function(done) {
            rpki.preCache()
                .then(() => {
                    return rpki.validate("23.11.254.0/23", uncovered.asn, verbose)
                        .then(result => {
                            expect(result).to
                                .containSubset({
                                    valid: null,
                                    reason: "No ROA available for this prefix"
                                });
                            done();
                        })
                        .catch(console.log);
                })
                .catch(console.log);
        }).timeout(asyncTimeout);

        it("single not valid - origin", function(done) {
            rpki.preCache()
                .then(() => {
                    return rpki.validate(single.prefix, uncovered.asn, verbose)
                        .then(result => {
                            expect(result).to
                                .containSubset({
                                    valid: false,
                                    reason: "Not valid origin"
                                });
                            done();
                        })
                        .catch(console.log);
                })
                .catch(console.log);
        }).timeout(asyncTimeout);

        it("single not valid - prefix length", function(done) {

            rpki.preCache()
                .then(() => {
                    rpki.validate(singleNotValidLength.prefix, singleNotValidLength.asn, verbose)
                        .then(result => {
                            expect(result).to
                                .containSubset({
                                    valid: false,
                                    reason: "Not valid prefix length"
                                });
                            done();
                        })
                        .catch(console.log);
                })
                .catch(console.log);
        }).timeout(asyncTimeout);

        it("single not covered", function(done) {
            rpki.preCache()
                .then(() => {
                    rpki.validate(uncovered.prefix, uncovered.asn, verbose)
                        .then(result => {
                            expect(result).to
                                .containSubset({
                                    valid: null,
                                    reason: "No ROA available for this prefix"
                                });
                            done();
                        })
                        .catch(console.log);
                })
                .catch(console.log);
        }).timeout(asyncTimeout);

        it("multiple mixed (4 validations)", function(done) {

            rpki.preCache()
                .then(() => {
                    const list = [
                        rpki.validate(single.prefix, single.asn, verbose),
                        rpki.validate(single.prefix, uncovered.asn, verbose),
                        rpki.validate(singleNotValidLength.prefix, singleNotValidLength.asn, verbose),
                        rpki.validate(uncovered.prefix, uncovered.asn, verbose)
                    ];

                    Promise.all(list)
                        .then(([a, b, c, d]) => {

                            expect(a).to
                                .containSubset({
                                    valid: true,
                                    reason: null
                                });

                            expect(b).to
                                .containSubset({
                                    valid: false,
                                    reason: "Not valid origin"
                                });

                            expect(c).to
                                .containSubset({
                                    valid: false,
                                    reason: "Not valid prefix length"
                                });

                            expect(d).to
                                .containSubset({
                                    valid: null,
                                    reason: "No ROA available for this prefix"
                                });

                            done();
                        })
                        .catch(console.log);
                })
                .catch(console.log);
        }).timeout(asyncTimeout);

        it("multiple (5000 validations)", function(done) {

            rpki.preCache()
                .then(() => {
                    Promise.all(first5000.map(i => rpki.validate(i.prefix, i.asn, false)))
                        .then((list) => {
                            expect(list.length).to.equal(5000);
                            done();
                        })
                        .catch(console.log);
                })
                .catch(console.log);
        }).timeout(asyncTimeout);

    });

    describe("External VRPs", function () {

        const rpki2 = new rpkiValidator({ connector: "external" });

        rpki2.setVRPs([{
            prefix: "213.7.5.0/24",
            maxLength: 24,
            asn: "1234"
        }]);

        it("wingle valid", function(done) {
            rpki2.preCache()
                .then(() => {
                    return rpki2.validate(singleValidLengthExternal.prefix, singleValidLengthExternal.asn, false)
                        .then(result => {
                            expect(result).to.equal(true);
                            done();
                        });
                })
                .catch(console.log);
        }).timeout(asyncTimeout);

        it("invalid - prefix length", function(done) {
            rpki2.preCache()
                .then(() => {
                    return rpki2.validate(singleNotValidLengthExternal.prefix, singleNotValidLengthExternal.asn, false)
                        .then(result => {
                            expect(result).to.equal(false);
                            done();
                        });
                })
                .catch(console.log);
        }).timeout(asyncTimeout);

        it("invalid - origin", function(done) {
            rpki2.preCache()
                .then(() => {
                    return rpki2.validate(singleValidLengthExternal.prefix, "4321", false)
                        .then(result => {
                            expect(result).to.equal(false);
                            done();
                        });
                })
                .catch(console.log);
        }).timeout(asyncTimeout);

    });
});
