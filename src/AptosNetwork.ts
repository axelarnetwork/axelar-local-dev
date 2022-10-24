import { AptosAccount, AptosClient, HexString, TxnBuilderTypes } from 'aptos';
import fs from 'fs';
import path from 'path';
// const { privateKey } = require("../secret.json");

export class AptosNetwork extends AptosClient {
    public owner: AptosAccount;

    constructor(nodeUrl: string, privateKey?: string) {
        super(nodeUrl);
        this.owner = new AptosAccount(new HexString(privateKey || '').toUint8Array());
    }

    private async deploy(contractName: string) {
        const modulePath = `../aptos/modules/${contractName}/build/${contractName}`;
        const packageMetadata = fs.readFileSync(path.join(__dirname, modulePath, 'package-metadata.bcs'));
        const moduleData = fs.readFileSync(path.join(__dirname, modulePath, 'bytecode_modules', `${contractName}.mv`));

        const txnHash = await this.publishPackage(this.owner, new HexString(packageMetadata.toString('hex')).toUint8Array(), [
            new TxnBuilderTypes.Module(new HexString(moduleData.toString('hex')).toUint8Array()),
        ]);

        await this.waitForTransaction(txnHash, { checkSuccess: true });

        return txnHash;
    }

    deployGateway() {
        return this.deploy('axelar_gateway');
    }

    deployGasService() {
        return this.deploy('axelar_gas_service');
    }
}
