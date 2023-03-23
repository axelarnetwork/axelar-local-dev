import { FaucetClient } from "aptos";
import { AptosNetwork } from "./AptosNetwork";

export let aptosNetwork: AptosNetwork;

export interface AptosNetworkConfig {
	nodeUrl: string;
	faucetUrl: string;
}

export async function createAptosNetwork(config?: AptosNetworkConfig) {
	const nodeUrl = config?.nodeUrl || "http://localhost:8080";
	const faucetUrl = config?.faucetUrl || "http://localhost:8081";
	const loadingAptosNetwork = new AptosNetwork(nodeUrl);

	// fund the account with faucet
	const faucet = new FaucetClient(nodeUrl, faucetUrl);

	// fund the deployer address
	await faucet.fundAccount(loadingAptosNetwork.owner.address(), 1e10);

	// Check if whether the gateway is deployed
	const isGatewayDeployed = await loadingAptosNetwork.isGatewayDeployed();

	// Deploy axelar framework modules, skip if already deployed
	if (!isGatewayDeployed) {
		const tx = await loadingAptosNetwork
			.deployAxelarFrameworkModules()
			.catch((e: any) => {
				console.error(e);
			});
		console.log("Deployed Axelar Framework modules:", tx.hash);
	}

	// update the sequence number
	const callContractEvents = await loadingAptosNetwork.queryContractCallEvents({
		limit: 1000,
	});
	loadingAptosNetwork.updateContractCallSequence(callContractEvents);

	const payGasEvents = await loadingAptosNetwork.queryPayGasContractCallEvents({
		limit: 1000,
	});
	loadingAptosNetwork.updatePayGasContractCallSequence(payGasEvents);
	aptosNetwork = loadingAptosNetwork;
	return aptosNetwork;
}

export async function loadAptosNetwork(nodeUrl = "http://localhost:8080") {
	aptosNetwork = new AptosNetwork(nodeUrl);
}
