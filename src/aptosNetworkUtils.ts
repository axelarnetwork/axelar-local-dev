import { FaucetClient } from 'aptos';
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
    aptosNetwork = new AptosNetwork(nodeUrl);

    // fund the account with faucet
    const faucet = new FaucetClient(nodeUrl, faucetUrl);

    // fund the deployer address
    await faucet.fundAccount(aptosNetwork.owner.address(), 1e10);

    // deploy axelar framework modules
    const txHash = await aptosNetwork.deployAxelarFrameworkModules();
    console.log('Deployed Axelar Framework modules:', txHash);

    // update the sequence number
    await aptosNetwork.updateContractCallSequence();
    console.log('Seq CallContract', aptosNetwork.contractCallSequence);

    await aptosNetwork.updatePayGasContractCallSequence();
    console.log('Seq PayGas', aptosNetwork.payContractCallSequence);

    return aptosNetwork;
}
