const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const runScenario = (resumeWhileAlive) => {
    const directory = mkdtempSync(join(tmpdir(), "node-swift-executor-"));
    const resumePath = join(directory, "resume");
    const modulePath = resolve(__dirname, "../../../.build/ExecutorShutdown.node");
    try {
        assert.equal(spawnSync("mkfifo", [resumePath]).status, 0);
        const workerSource = `
            const { parentPort } = require("node:worker_threads");
            require(${JSON.stringify(modulePath)}).suspend(
                message => parentPort.postMessage(message), ${JSON.stringify(resumePath)});
            setInterval(() => {}, 1000);
        `;
        const result = spawnSync(process.execPath, ["-e", `
            const { Worker } = require("node:worker_threads");
            const { once } = require("node:events");
            const { writeFileSync } = require("node:fs");
            const run = async () => {
                const worker = new Worker(${JSON.stringify(workerSource)}, { eval: true });
                console.log((await once(worker, "message"))[0]);
                if (${resumeWhileAlive}) {
                    writeFileSync(${JSON.stringify(resumePath)}, "resume");
                    console.log((await once(worker, "message"))[0]);
                }
                await worker.terminate();
                if (!${resumeWhileAlive}) {
                    writeFileSync(${JSON.stringify(resumePath)}, "resume");
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            };
            run().catch(error => { console.error(error); process.exitCode = 1; });
        `], { encoding: "utf8", timeout: 10000 });
        assert.equal(result.signal, null, result.stderr);
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(result.stdout.trim().split("\n"),
            resumeWhileAlive ? ["suspended", "resumed"] : ["suspended"]);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
};

if (process.platform === "win32") {
    console.log("Skipping POSIX FIFO executor teardown test on Windows.");
} else {
    runScenario(true);
    runScenario(false);
}
