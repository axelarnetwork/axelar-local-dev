import { AptosNetwork } from './AptosNetwork';

export async function createAptosNetwork(ownerPrivateKey: string, rpcUrl: string = 'http://localhost:8080') {
    const client = new AptosNetwork(rpcUrl, ownerPrivateKey);
    const tx1 = await client.deployGasService();
    console.log('Deployed AxelarGasService on Aptos', tx1);
    const tx2 = await client.deployGateway();
    console.log('Deployed AxelarGateway on Aptos', tx2);
}
