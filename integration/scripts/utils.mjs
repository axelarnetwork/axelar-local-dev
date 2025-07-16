// @ts-check
import {
  boardSlottingMarshaller,
  makeBoardRemote,
} from "@agoric/internal/src/marshal.js";
import { execa } from "execa";
import fs from "fs/promises";
import { makeVStorage } from "./vstorage.mjs";

export const fetchFromVStorage = async (vStorageUrl) => {
  const response = await fetch(vStorageUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch: ${response.status} ${response.statusText}`,
    );
  }

  const { value } = await response.json();

  const rawValue = JSON.parse(value)?.values?.[0];
  if (!rawValue) {
    throw new Error("Missing expected data in vStorage response");
  }

  const bodyString = JSON.parse(rawValue).body;
  return JSON.parse(bodyString.slice(1));
};

export const writeOfferToFile = async ({ OFFER_FILE, offer }) => {
  await fs.writeFile(OFFER_FILE, JSON.stringify(offer, null, 2));
  console.log(`Written ${OFFER_FILE}`);
};

/**
 * A generic polling function.
 *
 * @typedef {Object} pollingParams
 * @property {() => Promise<boolean>} checkFn - The async function that returns true when the condition is met.
 * @property {number} pollIntervalMs - Polling interval in milliseconds.
 * @property {number} maxWaitMs - Max wait time in milliseconds.
 * @returns {Promise<boolean>} - Resolves true if condition met, false if timeout.
 */
export const poll = async ({ checkFn, pollIntervalMs, maxWaitMs }) => {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    try {
      const result = await checkFn();
      if (result) return true;
    } catch (err) {
      console.error("Polling error:", err);
    }

    console.log(`Waiting ${pollIntervalMs / 1000} seconds...`);
    await new Promise((res) => setTimeout(res, pollIntervalMs));
  }

  return false;
};

export const checkVStorage = async ({ vStorageUrl, valueToFind }) => {
  try {
    const pollIntervalMs = 5000; // 5 seconds
    const maxWaitMs = 2 * 60 * 1000; // 2 minutes

    const found = await poll({
      checkFn: async () => {
        const data = await fetchFromVStorage(vStorageUrl);

        for (const val of data) {
          if (val[0] === valueToFind) {
            return true;
          }
        }

        return false;
      },
      pollIntervalMs,
      maxWaitMs,
    });

    if (found) {
      console.log(`✅ Test passed: ${valueToFind} was found.`);
    } else {
      console.error(`❌ Test failed: ${valueToFind} was not found.`);
      process.exit(1);
    }
  } catch (error) {
    console.error("Failed to fetch or parse vStorage data:", error);
    process.exit(1);
  }
};

/**
 * Run a command inside the 'agoric' container.
 *
 * @param {string} command - Shell command to execute.
 * @param {Object} [options]
 * @param {boolean} [options.captureOutput=false] - If true, captures stdout/stderr instead of streaming.
 * @returns {Promise<{ stdout?: string, stderr?: string }|void>}
 */
export const runCommand = async (command, { captureOutput = false } = {}) => {
  try {
    const result = await execa(`docker exec agoric ${command}`, {
      shell: true,
      stdio: captureOutput ? "pipe" : "inherit",
    });

    return captureOutput
      ? { stdout: result.stdout, stderr: result.stderr }
      : undefined;
  } catch (err) {
    console.error("❌ ERROR:", err);
    process.exit(1);
  }
};

export const executeWalletAction = async ({ OFFER_FILE, FROM_ADDRESS }) => {
  const cmd = `agd tx swingset wallet-action "$(cat ${OFFER_FILE})" \
    --allow-spend \
    --from=${FROM_ADDRESS} \
    --keyring-backend=test \
    --chain-id=agoriclocal -y`;

  return runCommand(cmd);
};

export const validateEvmAddress = (address) => {
  if (typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`Invalid EVM wallet address: ${address}`);
  }
};

export const processWalletOffer = async ({
  offer,
  OFFER_FILE,
  CONTAINER_PATH,
  FROM_ADDRESS,
}) => {
  console.log("Writing offer to file...");
  await writeOfferToFile({ offer, OFFER_FILE });

  console.log("Copy offer file in container");
  await execa(`docker cp ${OFFER_FILE} agoric:${CONTAINER_PATH}`, {
    shell: true,
    stdio: "inherit",
  });

  console.log("Executing wallet action...");
  await executeWalletAction({ OFFER_FILE, FROM_ADDRESS });
};

const storageHelper = {
  parseCapData: (txt) => {
    /** @type {{ value: string }} */
    const { value } = txt;
    assert(typeof value === "string", typeof value);
    const specimen = JSON.parse(value);
    const { blockHeight, values } = specimen;
    assert(values, `empty values in specimen ${value}`);
    const capDatas = storageHelper.parseMany(values);
    return { blockHeight, capDatas };
  },
  unserializeTxt: (txt, ctx) => {
    const { capDatas } = storageHelper.parseCapData(txt);
    return capDatas.map((capData) =>
      boardSlottingMarshaller(ctx.convertSlotToVal).fromCapData(capData),
    );
  },
  /** @param {string[]} capDataStrings array of stringified capData */
  parseMany: (capDataStrings) => {
    assert(capDataStrings && capDataStrings.length);
    /** @type {{ body: string, slots: string[] }[]} */
    const capDatas = capDataStrings.map((s) => JSON.parse(s));
    for (const capData of capDatas) {
      assert(typeof capData === "object" && capData !== null);
      assert("body" in capData && "slots" in capData);
      assert(typeof capData.body === "string");
      assert(Array.isArray(capData.slots));
    }
    return capDatas;
  },
};
harden(storageHelper);
export const makeAgoricNames = async (ctx, vstorage) => {
  /** @type {Record<string, string>} */
  const reverse = {};
  const entries = await Promise.all(
    ["brand", "instance", "vbankAsset"].map(async (kind) => {
      const content = await vstorage.readLatest(
        `published.agoricNames.${kind}`,
      );
      const parts = storageHelper.unserializeTxt(content, ctx).at(-1);
      for (const [name, remote] of parts) {
        if ("getBoardId" in remote) {
          reverse[/** @type {string} */ (remote.getBoardId())] = name;
        }
      }
      return [kind, Object.fromEntries(parts)];
    }),
  );
  return { ...Object.fromEntries(entries), reverse };
};

export const makeFromBoard = () => {
  const cache = new Map();
  const convertSlotToVal = (boardId, iface) => {
    if (cache.has(boardId)) {
      return cache.get(boardId);
    }
    const val = makeBoardRemote({ boardId, iface });
    cache.set(boardId, val);
    return val;
  };
  return harden({ convertSlotToVal });
};

/**
 * @typedef {Object} PrepareOfferParams
 * @property {string} instanceName - The instance name to get from AgoricNames.
 * @property {string} source - Source of the invitation: 'contract' | 'continuing'.
 * @property {string} [publicInvitationMaker] - Used for public invitations.
 * @property {string} [invitationMakerName] - Used for contract invitations.
 * @property {string} [brandName] - Required if giving an amount.
 * @property {bigint} [amount] - Required if giving something.
 * @property {any[]} [invitationArgs] - Arguments for the invitation (e.g. method, params).
 * @property {Object} [offerArgs] - OfferArgs
 * @property {string} [previousOffer] - For continuing invitations.
 * @property {boolean} [emptyProposal] - If true, skips constructing the give section.
 * @property {(x: any) => any} [hardenFn] - Optionally override the harden function.
 */

/**
 * Prepares a hardened offer object with all required CapData format.
 * @param {PrepareOfferParams} params
 * @returns {Promise<any>} CapData object ready to be written or sent to wallet.
 */
export const prepareOffer = async ({
  instanceName,
  source,
  publicInvitationMaker,
  invitationMakerName,
  brandName,
  amount,
  invitationArgs,
  previousOffer,
  offerArgs = {},
  emptyProposal = false,
}) => {
  if (!instanceName) throw new Error("instanceName is required");
  if (!source) throw new Error("source is required");

  const LOCAL_CONFIG = {
    rpcAddrs: ["http://localhost/agoric-rpc"],
    chainName: "agoriclocal",
  };

  const vstorage = makeVStorage({ fetch }, LOCAL_CONFIG);
  const fromBoard = makeFromBoard();
  const { brand, instance } = await makeAgoricNames(fromBoard, vstorage);

  const offerId = `offer-${Date.now()}`;

  const invitationSpec = {
    ...(invitationMakerName && { invitationMakerName }),
    ...(publicInvitationMaker && { publicInvitationMaker }),
    source,
    instance: instance[instanceName],
    ...(invitationArgs && { invitationArgs }),
    ...(previousOffer && { previousOffer }),
  };

  const proposal =
    emptyProposal || !amount || !brandName
      ? {}
      : {
          give: {
            [brandName]: {
              brand: brand[brandName],
              value: amount,
            },
          },
        };

  const body = {
    method: "executeOffer",
    offer: {
      id: offerId,
      invitationSpec,
      offerArgs: { ...offerArgs },
      proposal,
    },
  };

  const marshaller = boardSlottingMarshaller(fromBoard.convertSlotToVal);
  return marshaller.toCapData(harden(body));
};
