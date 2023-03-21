import { FaucetClient } from 'aptos';
import { evmRelayer } from '../relay';
import { AptosNetwork } from './AptosNetwork';

export let aptosNetwork: AptosNetwork;

export interface AptosNetworkConfig {
    nodeUrl: string;
    faucetUrl: string;
}

export async function createAptosNetwork(config?: AptosNetworkConfig) {
    const { nodeUrl, faucetUrl } = config || {
        nodeUrl: 'http://localhost:8080',
        faucetUrl: 'http://localhost:8081',
    };
    const loadingAptosNetwork = new AptosNetwork(nodeUrl);

    // fund the account with faucet
    const faucet = new FaucetClient(nodeUrl, faucetUrl);

    // fund the deployer address
    await faucet.fundAccount(loadingAptosNetwork.owner.address(), 1e10);

    // deploy axelar framework modules
    const tx = await loadingAptosNetwork.deployAxelarFrameworkModules();
    console.log('Deployed Axelar Framework modules:', tx.hash);

    // update the sequence number
    const callContractEvents = await loadingAptosNetwork.queryContractCallEvents({ limit: 1000 });
    loadingAptosNetwork.updateContractCallSequence(callContractEvents);

    const payGasEvents = await loadingAptosNetwork.queryPayGasContractCallEvents({ limit: 1000 });
    loadingAptosNetwork.updatePayGasContractCallSequence(payGasEvents);
    aptosNetwork = loadingAptosNetwork;
    return aptosNetwork;
}

export async function loadAptosNetwork(nodeUrl: string = 'http://localhost:8080') {
    aptosNetwork = new AptosNetwork(nodeUrl);
}