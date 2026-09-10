/**
 * Developer convenience: start a local Sui network for the harness.
 *
 * This is deliberately a script rather than something initSui does. The flag
 * it needs, --force-regenesis, resets local Sui state, and a library should
 * not do that as a side effect of being imported.
 */
import { spawn } from 'child_process';

const args = ['start', '--with-faucet', '--force-regenesis'];

console.log('Starting a local Sui network.');
console.log('Note: --force-regenesis resets local Sui network state under ~/.sui.');
console.log(`  sui ${args.join(' ')}`);

const child = spawn('sui', args, { stdio: 'inherit', env: { ...process.env, RUST_LOG: 'off,sui_node=info' } });

child.on('error', (error) => {
    console.error(`could not run 'sui'. Is the pinned CLI on PATH? Cause: ${error.message}`);
    process.exit(1);
});

child.on('exit', (code) => process.exit(code ?? 0));
