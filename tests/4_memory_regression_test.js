const chai = require("chai");
const {spawnSync} = require("child_process");

const expect = chai.expect;

function runLeakProbe(script) {
    const result = spawnSync(process.execPath, ["--expose-gc", "-e", script], {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 15000
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || `Probe failed with exit code ${result.status}`);
    }

    const lines = result.stdout.trim().split("\n").filter(Boolean);
    return JSON.parse(lines[lines.length - 1]);
}

function getCommonPrelude() {
    return `
        require("@babel/register");
        const RpkiValidator = require("./src/index");
        const countTimers = () => process.getActiveResourcesInfo()
            .filter(resource => resource === "Timeout")
            .length;
        const finish = (payload) => {
            console.log(JSON.stringify(payload));
            process.exit(0);
        };
    `;
}

describe("Memory regression benchmark", function() {
    it("validator instances should release background timers after dispose", function() {
        const payload = runLeakProbe(`
            ${getCommonPrelude()}
            const before = countTimers();
            let validator = new RpkiValidator({
                connector: "external",
                defaultRpkiApi: null
            });
            const afterCreate = countTimers();

            validator.dispose();
            validator = null;
            if (global.gc) {
                global.gc();
            }

            setImmediate(() => {
                if (global.gc) {
                    global.gc();
                }

                finish({before, afterCreate, afterRelease: countTimers()});
            });
        `);

        expect(payload.afterCreate).to.be.at.least(payload.before + 1);
        expect(payload.afterRelease).to.equal(payload.before);
    }).timeout(20000);

    it("advanced stats should release the refresh interval after dispose", function() {
        const payload = runLeakProbe(`
            ${getCommonPrelude()}
            global.fetch = () => Promise.reject(new Error("network disabled for memory test"));

            const before = countTimers();
            let validator = new RpkiValidator({
                connector: "rpkiclient",
                defaultRpkiApi: null
            });

            validator.getAdvancedStats();
            const afterStart = countTimers();

            validator.dispose();
            validator = null;
            if (global.gc) {
                global.gc();
            }

            setImmediate(() => {
                if (global.gc) {
                    global.gc();
                }

                finish({before, afterStart, afterRelease: countTimers()});
            });
        `);

        expect(payload.afterStart).to.be.at.least(payload.before + 1);
        expect(payload.afterRelease).to.equal(payload.before);
    }).timeout(20000);

    it("online validation batches should time out and reject instead of hanging forever", async function() {
        const axios = ({method}) => {
            if (method === "get") {
                return Promise.resolve({data: {data: []}});
            }

            return new Promise(() => {});
        };

        const validator = new (require("../src/index"))({
            connector: "external",
            axios,
            defaultRpkiApi: "https://example.invalid/api",
            timeout: 50
        });

        try {
            const startedAt = Date.now();

            await validator.validate("10.0.0.0/24", 65000, false)
                .then(() => {
                    throw new Error("Validation should have timed out.");
                })
                .catch(error => {
                    expect(Date.now() - startedAt).to.be.lessThan(1000);
                    expect(error.message).to.contain("timed out");
                });

            await validator.validate("10.0.0.0/24", 65000, false)
                .then(() => {
                    throw new Error("Validation should have timed out on retry.");
                })
                .catch(error => {
                    expect(error.message).to.contain("timed out");
                });
        } finally {
            validator.dispose();
        }
    }).timeout(5000);
});