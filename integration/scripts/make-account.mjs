#!/usr/bin/env node
// @ts-check
import "./lockdown.mjs";
import {
  fetchFromVStorage,
  poll,
  prepareOffer,
  processWalletOffer,
  validateEvmAddress,
} from "./utils.mjs";

const OFFER_FILE = "offer.json";
const CONTAINER_PATH = `/usr/src/${OFFER_FILE}`;
const FROM_ADDRESS = "agoric1rwwley550k9mmk6uq6mm6z4udrg8kyuyvfszjk";
const vStorageUrl = `http://localhost/agoric-lcd/agoric/vstorage/data/published.wallet.${FROM_ADDRESS}`;
const { makeAccount } = process.env;
const { log, error } = console;

try {
  if (makeAccount) {
    log("--- Creating and Monitoring LCA ---");

    log("Preparing offer...");
    const offer = await prepareOffer({
      publicInvitationMaker: "createAndMonitorLCA",
      instanceName: "axelarGmp",
      brandName: "BLD",
      amount: 1n,
      source: "contract",
    });

    await processWalletOffer({
      offer,
      OFFER_FILE,
      CONTAINER_PATH,
      FROM_ADDRESS,
    });
  } else {
    log("--- Getting EVM Smart Wallet Address ---");

    const methodName = "getRemoteAddress";
    const invitationArgs = harden([methodName, []]);

    log(`Fetching previous offer from ${vStorageUrl}.current`);
    const { offerToUsedInvitation } = await fetchFromVStorage(
      `${vStorageUrl}.current`,
    );
    const previousOffer = offerToUsedInvitation[0][0];
    log(`Previous offer found: ${JSON.stringify(previousOffer)}`);

    log("Preparing offer...");
    const offer = await prepareOffer({
      invitationMakerName: "makeEVMTransactionInvitation",
      instanceName: "axelarGmp",
      emptyProposal: true,
      source: "continuing",
      invitationArgs,
      previousOffer,
    });

    await processWalletOffer({
      offer,
      OFFER_FILE,
      CONTAINER_PATH,
      FROM_ADDRESS,
    });

    const pollIntervalMs = 5000; // 5 seconds
    const maxWaitMs = 2 * 60 * 1000; // 2 minutes
    const valid = await poll({
      checkFn: async () => {
        log(`Fetching offer result from ${vStorageUrl}`);
        const offerData = await fetchFromVStorage(vStorageUrl);
        log(`Offer data received: ${JSON.stringify(offerData)}`);

        let smartWalletAddress;
        try {
          smartWalletAddress = offerData?.status?.result;
        } catch (err) {
          log("Failed to parse offerData.status.result as JSON:", err);
        }

        log(`Validating smart wallet address: ${smartWalletAddress}`);
        validateEvmAddress(smartWalletAddress);

        log(`Smart wallet address: ${smartWalletAddress}`);
        return true;
      },
      pollIntervalMs,
      maxWaitMs,
    });

    if (valid) {
      console.log(`✅ Test passed`);
    } else {
      console.error(`❌ Test failed`);
      process.exit(1);
    }
  }
} catch (err) {
  error("ERROR:", err.shortMessage || err.message);
  process.exit(1);
}
