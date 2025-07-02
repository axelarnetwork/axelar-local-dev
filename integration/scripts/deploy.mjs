// @ts-check
import { runCommand } from "./utils.mjs";

const CHAINID = "agoriclocal";
const GAS_ADJUSTMENT = "1.2";
const SIGN_BROADCAST_OPTS = `--keyring-backend=test --chain-id=${CHAINID} --gas=auto --gas-adjustment=${GAS_ADJUSTMENT} --yes -b block`;
const walletName = "gov1";

const extractFromPlan = async ({ jqCmd, planFile }) => {
  const fullCmd = `jq -r '${jqCmd}' ${planFile}`;
  const output = await runCommand(fullCmd, {
    captureOutput: true,
  });
  return output?.stdout;
};

const setBundles = async ({ planFile }) => {
  const sourceKey = ".bundles[].fileName";

  const result = await extractFromPlan({ jqCmd: sourceKey, planFile });
  const bundleFiles = result
    ?.split("\n")
    .filter(Boolean)
    .map((line) => `${line}`);
  return bundleFiles;
};

const installBundles = async ({ bundles }) => {
  for (const b of bundles) {
    let cmd = `echo 'Installing ${b}' && ls -sh '${b}' && agd tx swingset install-bundle --compress '@${b}' --from ${walletName} -bblock ${SIGN_BROADCAST_OPTS}`;
    console.log(`Executing installation for bundle ${b}`);
    await runCommand(`bash -c "${cmd}"`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
};

const acceptProposal = async ({ script, permit }) => {
  console.log(`Submitting proposal to evaluate ${script}`);

  const submitCommand = `agd tx gov submit-proposal swingset-core-eval ${permit} ${script} --title='Install ${script}' --description='Evaluate ${script}' --deposit=10000000ubld --from ${walletName} ${SIGN_BROADCAST_OPTS} -o json`;
  await runCommand(submitCommand);

  await new Promise((resolve) => setTimeout(resolve, 5000));

  const queryCmd = `agd query gov proposals --output json | jq -c '[.proposals[] | if .proposal_id == null then .id else .proposal_id end | tonumber] | max'`;

  const result = await runCommand(`bash -c "${queryCmd}"`, {
    captureOutput: true,
  });
  const proposalId = result?.stdout;

  console.log(`Voting on proposal ID ${proposalId}`);
  await runCommand(
    `agd tx gov vote ${proposalId} yes --from=validator ${SIGN_BROADCAST_OPTS}`,
  );

  console.log(`Fetching details for proposal ID ${proposalId}`);
  const detailsCommand = `agd query gov proposals --output json | jq -c '.proposals[] | select(.proposal_id == "${proposalId}" or .id == "${proposalId}") | [.proposal_id or .id, .voting_end_time, .status]'`;
  await runCommand(detailsCommand);
};

export const deployContract = async ({ planFile, dir }) => {
  try {
    const scriptName = await extractFromPlan({ jqCmd: ".script", planFile });
    const script = `${dir}/${scriptName}`;
    const permitName = await extractFromPlan({ jqCmd: ".permit", planFile });
    const permit = `${dir}/${permitName}`;

    const bundles = await setBundles({ planFile });

    console.log("script:", script);
    console.log("permit:", permit);
    console.log("bundles:", bundles);

    await installBundles({ bundles });
    await acceptProposal({ permit, script });
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
};
