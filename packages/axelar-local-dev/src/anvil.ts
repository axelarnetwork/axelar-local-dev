'use strict';

import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';
import { httpPost } from './utils';

/**
 * Options for spawning an anvil (Foundry) instance. These replace the old
 * ganache `ganacheOptions`. Fields that used to be nested under ganache's
 * `chain`/`wallet`/`fork`/`logging`/`database` are flattened here and mapped to
 * anvil CLI flags in `AnvilBackend.buildArgs`.
 */
export interface AnvilOptions {
    /** `--chain-id` (sets both eth_chainId and net_version). */
    chainId?: number;
    /** `--port`. If omitted a free port is allocated. */
    port?: number;
    /** `--host` (default 127.0.0.1). */
    host?: string;
    /** `--fork-url` (mainnet/testnet forking). */
    forkUrl?: string;
    /** `--fork-block-number` (pin for deterministic forks). */
    forkBlockNumber?: number;
    /** Addresses to impersonate; enables `--auto-impersonate`. */
    unlockedAccounts?: string[];
    /** `--state <path>` (load on start, dump on graceful exit). */
    statePath?: string;
    /** `--hardfork`. */
    hardfork?: string;
    /** `--gas-limit`. */
    gasLimit?: string | number;
    /** `--code-size-limit` (0 => `--disable-code-size-limit`). */
    codeSizeLimit?: number;
    /** `--block-time` (default: instamine, matching ganache). */
    blockTime?: number;
    /** `--quiet` (default true). Set false to see anvil logs. */
    quiet?: boolean;
    /** Escape hatch for arbitrary extra anvil flags. */
    extraArgs?: string[];
}

const READINESS_TIMEOUT_MS = 15000;
const READINESS_INTERVAL_MS = 75;
const STOP_TIMEOUT_MS = 5000;
const START_ATTEMPTS = 3;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Every live backend, so we can guarantee no orphaned anvil processes. */
const backends = new Set<AnvilBackend>();
let cleanupRegistered = false;

function registerGlobalCleanup(): void {
    if (cleanupRegistered) return;
    cleanupRegistered = true;
    const killAll = () => {
        for (const backend of backends) {
            try {
                backend.process?.kill('SIGKILL');
            } catch {
                // best effort
            }
        }
    };
    process.on('exit', killAll);
    // The child shares our process group, so a terminal Ctrl-C already reaches
    // anvil; these handlers cover programmatic/supervisor termination where the
    // 'exit' event would not otherwise fire. Kill children, then re-raise the
    // signal (our once() listener has already been removed) so the default action
    // — or a consumer's own handler — still runs, instead of forcing an exit here.
    const onSignal = (signal: NodeJS.Signals) => {
        killAll();
        process.kill(process.pid, signal);
    };
    process.once('SIGINT', () => onSignal('SIGINT'));
    process.once('SIGTERM', () => onSignal('SIGTERM'));
}

/** Allocate a free TCP port on 127.0.0.1 by binding to port 0 and releasing it. */
export function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const address = srv.address();
            if (address && typeof address === 'object') {
                const { port } = address;
                srv.close(() => resolve(port));
            } else {
                srv.close(() => reject(new Error('Could not determine a free port for anvil')));
            }
        });
    });
}

/**
 * Manages a single anvil child process that backs one local chain. Anvil is a
 * standalone Foundry binary spawned as a child process and driven over JSON-RPC,
 * so — unlike the old in-process ganache module — it is immune to Node ABI
 * breakage and works on modern Node.
 */
export class AnvilBackend {
    public url = '';
    public port = 0;
    public process: ChildProcess | undefined;
    public readonly chainId: number | undefined;
    private stopped = false;

    constructor(private readonly options: AnvilOptions = {}) {
        this.chainId = options.chainId;
    }

    async start(): Promise<this> {
        registerGlobalCleanup();
        const host = this.options.host ?? '127.0.0.1';

        let lastError: unknown;
        const fixedPort = this.options.port != null;
        for (let attempt = 0; attempt < START_ATTEMPTS; attempt++) {
            const port = this.options.port ?? (await getFreePort());
            try {
                await this.spawnAndWait(host, port);
                return this;
            } catch (error) {
                lastError = error;
                await this.killProcess();
                // A fixed, caller-supplied port cannot be retried on a fresh port.
                if (fixedPort) break;
            }
        }
        throw new Error(
            `Failed to start anvil after ${fixedPort ? 1 : START_ATTEMPTS} attempt(s): ${
                lastError instanceof Error ? lastError.message : String(lastError)
            }`
        );
    }

    private async spawnAndWait(host: string, port: number): Promise<void> {
        const args = this.buildArgs(host, port);
        const child = spawn('anvil', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        this.process = child;
        this.port = port;
        this.url = `http://${host}:${port}`;
        backends.add(this);

        let stderr = '';
        child.stderr?.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        const prematureExit = new Promise<never>((_, reject) => {
            child.once('error', (err: Error) => {
                reject(new Error(`Failed to spawn 'anvil': ${err.message}. Is Foundry installed? Run 'foundryup'.`));
            });
            child.once('exit', (code, signal) => {
                reject(new Error(`anvil exited during startup (code=${code}, signal=${signal}). ${stderr.trim()}`));
            });
        });

        try {
            await Promise.race([this.waitForReady(this.url), prematureExit]);
        } finally {
            child.removeAllListeners('error');
            child.removeAllListeners('exit');
        }
    }

    private async waitForReady(url: string): Promise<void> {
        const deadline = Date.now() + READINESS_TIMEOUT_MS;
        const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] });
        while (Date.now() < deadline) {
            try {
                const res = await httpPost(url, body);
                if (res.status === 200) {
                    const json = JSON.parse(res.body);
                    if (json && json.result) return;
                }
            } catch {
                // anvil not accepting connections yet
            }
            await sleep(READINESS_INTERVAL_MS);
        }
        throw new Error(`anvil did not become ready at ${url} within ${READINESS_TIMEOUT_MS}ms`);
    }

    private buildArgs(host: string, port: number): string[] {
        const o = this.options;
        const args: string[] = ['--host', host, '--port', String(port)];
        if (o.chainId != null) args.push('--chain-id', String(o.chainId));
        if (o.quiet !== false) args.push('--quiet');
        if (o.forkUrl) {
            args.push('--fork-url', o.forkUrl);
            if (o.forkBlockNumber != null) args.push('--fork-block-number', String(o.forkBlockNumber));
        }
        if (o.statePath) args.push('--state', o.statePath);
        if (o.unlockedAccounts && o.unlockedAccounts.length > 0) args.push('--auto-impersonate');
        if (o.hardfork) args.push('--hardfork', o.hardfork);
        if (o.gasLimit != null) args.push('--gas-limit', String(o.gasLimit));
        if (o.codeSizeLimit != null) {
            if (o.codeSizeLimit === 0) args.push('--disable-code-size-limit');
            else args.push('--code-size-limit', String(o.codeSizeLimit));
        }
        if (o.blockTime != null) args.push('--block-time', String(o.blockTime));
        if (o.extraArgs) args.push(...o.extraArgs);
        return args;
    }

    private killProcess(): Promise<void> {
        const child = this.process;
        backends.delete(this);
        this.process = undefined;
        if (!child || child.exitCode != null || child.signalCode != null) return Promise.resolve();
        return new Promise((resolve) => {
            child.once('exit', () => resolve());
            try {
                child.kill('SIGKILL');
            } catch {
                resolve();
            }
        });
    }

    /**
     * Gracefully stop anvil. SIGTERM first (so `--state` is dumped on exit),
     * escalating to SIGKILL if it does not exit within the timeout.
     */
    async stop(): Promise<void> {
        const child = this.process;
        if (!child || this.stopped) {
            backends.delete(this);
            return;
        }
        this.stopped = true;
        await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve();
            };
            const timer = setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                } catch {
                    // already gone
                }
                finish();
            }, STOP_TIMEOUT_MS);
            child.once('exit', finish);
            try {
                child.kill('SIGTERM');
            } catch {
                finish();
            }
        });
        backends.delete(this);
        this.process = undefined;
    }
}
