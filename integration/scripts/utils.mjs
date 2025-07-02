// @ts-check
import { execa } from "execa";
import fs from "fs/promises";

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
