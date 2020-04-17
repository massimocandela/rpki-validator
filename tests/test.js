var chai = require("chai");
var chaiSubset = require('chai-subset');
chai.use(chaiSubset);
var expect = chai.expect;
var rpki = require("../index");
var fs = require("fs");

var asyncTimeout = 10000;

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
    asn: "9404"
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
                });

        }).timeout(asyncTimeout);

        it("single not valid - origin", function(done) {
            rpki.validate(single.prefix, uncovered.asn, verbose)
                .then(result => {
                    expect(result).to.equal(false);
                    done();
                });
        }).timeout(asyncTimeout);

        it("single not valid - prefix length", function(done) {

            const prefix = single.prefix.split("/")[0] + "/" + (single.maxLength + 1);
            rpki.validate(prefix, single.asn, verbose)
                .then(result => {
                    expect(result).to.equal(false);
                    done();
                });
        }).timeout(asyncTimeout);

        it("single not covered", function(done) {
            rpki.validate(uncovered.prefix, uncovered.asn, verbose)
                .then(result => {
                    expect(result).to.equal(null);
                    done();
                });
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
                });

        }).timeout(asyncTimeout);

        it("multiple - 100", function(done) {

            Promise.all(first100.map(i => rpki.validate(i.prefix, i.asn, false)))
                .then((list) => {
                    expect(list.length).to.equal(100);
                    done();
                })
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
                });

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
                });
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
                });
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
                });
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
                });

        }).timeout(asyncTimeout);

    });

    describe("Pre Cached mixed", function () {

        const verbose = true;

        it("single valid - loading VRP list", function(done) {
            rpki.preCache()
                .then(() => {
                    rpki.validate(single.prefix, single.asn, verbose)
                        .then(result => {
                            expect(result).to
                                .containSubset({
                                    valid: true,
                                    reason: null
                                });
                            done();
                        });
                });
        }).timeout(120000);

        it("single not valid - origin", function(done) {
            rpki.preCache()
                .then(() => {
                    rpki.validate(single.prefix, uncovered.asn, verbose)
                        .then(result => {
                            expect(result).to
                                .containSubset({
                                    valid: false,
                                    reason: "Not valid origin"
                                });
                            done();
                        });
                });
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
                        });
                });
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
                        });
                });
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
                        });
                });
        }).timeout(asyncTimeout);

        it("multiple (5000 validations)", function(done) {

            rpki.preCache()
                .then(() => {
                    Promise.all(first5000.map(i => rpki.validate(i.prefix, i.asn, false)))
                        .then((list) => {
                            expect(list.length).to.equal(5000);
                            done();
                        });
                });

        }).timeout(asyncTimeout);

    });
});
