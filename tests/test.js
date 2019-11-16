/*
 * 	BSD 3-Clause License
 *
 * Copyright (c) 2019, NTT Ltd.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 *  Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 *  Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 *  Neither the name of the copyright holder nor the names of its
 *   contributors may be used to endorse or promote products derived from
 *   this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

var chai = require("chai");
var chaiSubset = require('chai-subset');
chai.use(chaiSubset);
var expect = chai.expect;
var rpki = require("../index");
var fs = require("fs");

var asyncTimeout = 20000;

const prefixList = JSON.parse(fs.readFileSync("tests/test.json", "utf8"));
const single = { // It must be in the vrp list
    prefix: "103.114.191.0/24",
    maxLength: 24,
    asn: 0
};

const uncovered = {
    prefix: "203.126.124.0/21",
    asn: "9404"
};
const first100 = prefixList.slice(0, 10);
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
                    expect(list.filter(i => i === true).length).to.equal(5000);
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

            const prefix = single.prefix.split("/")[0] + "/" + (single.maxLength + 1);
            rpki.validate(prefix, single.asn, verbose)
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
            const prefix = single.prefix.split("/")[0] + "/" + (single.maxLength + 1);

            const list = [
                rpki.validate(single.prefix, single.asn, verbose),
                rpki.validate(single.prefix, uncovered.asn, verbose),
                rpki.validate(prefix, single.asn, verbose),
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

    describe("preCached", function () {

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

            const prefix = single.prefix.split("/")[0] + "/" + (single.maxLength + 1);
            rpki.validate(prefix, single.asn, verbose)
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
            const prefix = single.prefix.split("/")[0] + "/" + (single.maxLength + 1);

            const list = [
                rpki.validate(single.prefix, single.asn, verbose),
                rpki.validate(single.prefix, uncovered.asn, verbose),
                rpki.validate(prefix, single.asn, verbose),
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


        it("multiple - 5000", function(done) {

            Promise.all(first5000.map(i => rpki.validate(i.prefix, i.asn, false)))
                .then((list) => {
                    expect(list.filter(i => i === true).length).to.equal(5000);
                    done();
                })
        }).timeout(asyncTimeout);

    });

});
