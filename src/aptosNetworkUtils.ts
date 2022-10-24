import { AptosNetwork } from './AptosNetwork';

export let aptosNetwork: AptosNetwork;

export async function createAptosNetwork(ownerPrivateKey: string, rpcUrl: string = 'http://localhost:8080') {
    aptosNetwork = new AptosNetwork(rpcUrl, ownerPrivateKey);
    const tx1 = await aptosNetwork.deployGasService();
    console.log('Deployed AxelarGasService on Aptos', tx1);
    const tx2 = await aptosNetwork.deployGateway();
    console.log('Deployed AxelarGateway on Aptos', tx2);
}
