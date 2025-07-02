#!/usr/bin/env node
// @ts-check
import { deployContract } from "./deploy.mjs";
import { checkVStorage, runCommand } from "./utils.mjs";
const { log } = console;

const SDK_REPO = "https://github.com/Agoric/agoric-sdk.git";
const SDK_DIR = "/usr/src/agoric-sdk-cp";
const PLAN_FILE_DIR = "/usr/src/upgrade-test-scripts";
const vbankAssetUrl =
  "http://localhost/agoric-lcd/agoric/vstorage/data/published.agoricNames.vbankAsset";
const AXL_DENOM =
  "ibc/2CC0B1B7A981ACC74854717F221008484603BB8360E81B262411B0D830EDE9B0";
const agoricNamesUrl =
  "http://localhost/agoric-lcd/agoric/vstorage/data/published.agoricNames.instance";
const contractName = "axelarGmp";
const assets = JSON.stringify([
  {
    denom: AXL_DENOM,
    issuerName: "AXL",
    decimalPlaces: 6,
  },
]);

log("Step 1: Check SDK directory");
const output = await runCommand(`[ -d ${SDK_DIR} ] && echo EXISTS || true`, {
  captureOutput: true,
});

const sdkExists = output?.stdout?.trim() === "EXISTS";
log("sdkExists:", sdkExists);

if (!sdkExists) {
  log("Clone agoric-sdk with --depth=1...");
  await runCommand(`bash -c "git clone --depth=1 ${SDK_REPO} ${SDK_DIR}"`);

  log("Install dependencies...");
  await runCommand(`bash -c "cd ${SDK_DIR} && yarn install"`);

  log("Build agoric-sdk...");
  await runCommand(`bash -c "cd ${SDK_DIR} && yarn build"`);
} else {
  log("✅ Agoric SDK already exists. Skipping clone, install, and build.");
}

log("Step 2: Generate bundles for AXL token");
await runCommand(
  `agoric run /usr/src/agoric-sdk-cp/multichain-testing/src/register-interchain-bank-assets.builder.js --assets='${assets}'`,
);

log("Step 3: Register AXL in vBank assets");
await deployContract({
  dir: PLAN_FILE_DIR,
  planFile: `${PLAN_FILE_DIR}/eval-register-interchain-bank-assets-plan.json`,
});

log("Step 4: Verify AXL registration from vStorage");
await checkVStorage({ vStorageUrl: vbankAssetUrl, valueToFind: AXL_DENOM });

log("Step 5: Build AxelarGmp contract");
await runCommand(
  `bash -c "cd ${SDK_DIR}/packages/orchestration && yarn esbuild:axelar"`,
);

// Make sure relayer is connected at this point b/w axelar and agoric
log("Step 6: Generate bunldes for AxelarGmp contract");
await runCommand(
  `agoric run ${SDK_DIR}/packages/builders/scripts/orchestration/axelar-gmp.build.js --net=localhost --peer=axelar:connection-0:channel-0:uaxl`,
);

log("Step 7: Deploy AxelarGmp contract");
await deployContract({
  dir: PLAN_FILE_DIR,
  planFile: `${PLAN_FILE_DIR}/startAxelarGmp-plan.json`,
});

log("Step 8: Verify AxelarGmp deployment from vStorage");
await checkVStorage({ vStorageUrl: agoricNamesUrl, valueToFind: contractName });

log("✅ All steps completed");
