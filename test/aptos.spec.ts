import { HexString } from 'aptos';
import { AptosNetwork } from '../src/aptos';

describe.skip('aptos', () => {
    const client = new AptosNetwork('http://localhost:8080');

    it('should be able to deploy axelar framework modules', async () => {
        console.log("Owner's balance before deployment: ", await client.getOwnerBalance());
        const tx = await client.deployAxelarFrameworkModules();
        expect(tx.success).toBeTruthy();
    });

    it('should be able to call approve_contract_call', async () => {
        const commandId = new HexString('0x350f78556f96ae42254e3a639bf1808695ada7509fcbce72217e477664ec4d6b').toUint8Array();
        const payloadHash = new HexString('0x3202c028a4832bd0c3a59e1eee55d53a225f0a94cee17b16183eed85265c48cb').toUint8Array();
        const args = [
            'ethereum',
            '0xD62F0cF0801FAC878F66ebF316AB42DED01F25D8',
            '0x8ac1b8ff9583ac8e661c7f0ee462698c57bb7fc454f587e3fa25a57f9406acc0::hello_world',
        ];
        const tx = await client.approveContractCall(commandId, args[0], args[1], args[2], payloadHash);
        expect(tx.success).toBeTruthy();
    });

    // it('should be able to call validate_contract_call', async () => {
    //     const commandId = new HexString('0x350f78556f96ae42254e3a639bf1808695ada7509fcbce72217e477664ec4d6b').toUint8Array();
    //     const payloadHash = new HexString('0x3202c028a4832bd0c3a59e1eee55d53a225f0a94cee17b16183eed85265c48cb').toUint8Array();
    //     const args = [
    //         'ethereum',
    //         '0xD62F0cF0801FAC878F66ebF316AB42DED01F25D8',
    //         '0x8ac1b8ff9583ac8e661c7f0ee462698c57bb7fc454f587e3fa25a57f9406acc0::hello_world',
    //     ];
    //     const tx = await client.approveContractCall(commandId, args[0], args[1], args[2], payloadHash);
    //     // console.log(tx.vmStatus);
    //     // expect(tx.success).toBeTruthy();
    // });
});
