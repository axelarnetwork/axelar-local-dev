import { HexString, TxnBuilderTypes } from 'aptos';
import { createAptosNetwork } from '../aptos';
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
const { keccak256, toUtf8Bytes } = ethers.utils;

describe.skip('aptos', () => {
    let client: any;

    it('should be able to deploy axelar framework modules', async () => {
        client = await createAptosNetwork();
    });

    it('should be able to call approve_contract_call', async () => {
        const commandId = new HexString('0x350f78556f96ae42254e3a639bf1808695ada7509fcbce72217e477664ec4d7b').toUint8Array();
        const payloadHash = new HexString('0x3202c028a4832bd0c3a59e1eee55d53a225f0a94cee17b16183eed85265c48cb').toUint8Array();
        const args = [
            'ethereum',
            '0xD62F0cF0801FAC878F66ebF316AB42DED01F25D8',
            '0x8ac1b8ff9583ac8e661c7f0ee462698c57bb7fc454f587e3fa25a57f9406acc0::hello_world',
        ];
        const tx = await client.approveContractCall(commandId, args[0], args[1], args[2], payloadHash);
        expect(tx.success).toBeTruthy();
    });

    it('should be able to call validate_contract_call', async () => {
        const compiledModules = ['hello_world.mv'];
        const modulePath = '../aptos/modules/test/build/HelloWorld';
        const packageMetadata = fs.readFileSync(path.join(__dirname, modulePath, 'package-metadata.bcs'));
        const moduleDatas = compiledModules.map((module) => {
            return fs.readFileSync(path.join(__dirname, modulePath, 'bytecode_modules', module));
        });
        const pubTxHash = await client.publishPackage(
            client.owner,
            packageMetadata,
            moduleDatas.map((moduleData) => new TxnBuilderTypes.Module(new HexString(moduleData.toString('hex')).toUint8Array()))
        );
        const pubTx: any = await client.waitForTransactionWithResult(pubTxHash);
        if (pubTx.vm_status !== 'Executed successfully') {
            console.log(`Error: ${pubTx.vm_status}`);
        }

        const commandId = new HexString('0x350f78556f96ae42254e3a639bf1808695ada7509fcbce72217e477664ec4163').toUint8Array();
        const toSend = 'Hello Test World!';
        const payload = toUtf8Bytes(toSend);
        const payloadHash = new HexString(keccak256(payload)).toUint8Array();
        const args = [
            'ethereum',
            '0xD62F0cF0801FAC878F66ebF316AB42DED01F25D8',
            '0x8ac1b8ff9583ac8e661c7f0ee462698c57bb7fc454f587e3fa25a57f9406acc0',
        ];
        const approveTx = await client.approveContractCall(commandId, args[0], args[1], args[2], payloadHash);

        if (!approveTx.success) {
            console.log(`Error: ${approveTx.vmStatus}`);
        }
        const tx = await client.submitTransactionAndWait(client.owner.address(), {
            function: `${client.owner.address()}::hello_world::execute`,
            type_arguments: [],
            arguments: [commandId, payload],
        });

        if (tx.vm_status !== 'Executed successfully') {
            console.log(`Error: ${tx.vm_status}`);
        }

        const resources = await client.getAccountResources(client.owner.address());
        const resourceType = `${client.owner.address().hex()}::hello_world::MessageHolder`;
        const resource = resources.find((r: any) => r.type === resourceType);
        const resourceData: any = resource?.data;
        const message = resourceData?.message;
        expect(message).toEqual(toSend);
    });
});
