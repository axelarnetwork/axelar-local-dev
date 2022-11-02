import { AptosAccount, AptosClient, CoinClient, HexString, TxnBuilderTypes } from 'aptos';
import fs from 'fs';
import path from 'path';

interface QueryOptions {
    start?: number;
    limit?: number;
}
export class AptosNetwork extends AptosClient {
    public owner: AptosAccount;
    public contractCallSequence: number;
    public payContractCallSequence: number;

    constructor(nodeUrl: string) {
        super(nodeUrl);
        // WARNING: should not use the same account for production!
        this.owner = new AptosAccount(new HexString('0x2a6f6988be264385fbfd552b8aa93451c6aac25d85786dd473fe7159f9320425').toUint8Array());
        this.contractCallSequence = -1;
        this.payContractCallSequence = -1;
    }

    private async deploy(modulePath: string, compiledModules: string[]) {
        const packageMetadata = fs.readFileSync(path.join(__dirname, modulePath, 'package-metadata.bcs'));
        const moduleDatas = compiledModules.map((module: string) => {
            return fs.readFileSync(path.join(__dirname, modulePath, 'bytecode_modules', module));
        });

        const txnHash = await this.publishPackage(
            this.owner,
            new HexString(packageMetadata.toString('hex')).toUint8Array(),
            moduleDatas.map((moduleData: any) => new TxnBuilderTypes.Module(new HexString(moduleData.toString('hex')).toUint8Array()))
        );

        const tx: any = await this.waitForTransactionWithResult(txnHash);

        if (tx.vm_status !== 'Executed successfully') {
            console.log(tx.vm_status);
        }

        return tx;
    }

    getOwnerBalance() {
        return new CoinClient(this).checkBalance(this.owner);
    }

    deployAxelarFrameworkModules() {
        return this.deploy('../../aptos/modules/axelar-framework/build/AxelarFramework', [
            'axelar_gas_service.mv',
            'executable_registry.mv',
            'gateway.mv',
        ]);
    }

    updateContractCallSequence(events: any[]) {
        const lastSequence = this.getLatestEventSequence(events);
        if (lastSequence !== null) {
            this.contractCallSequence = lastSequence;
        }
    }

    updatePayGasContractCallSequence(events: any[]) {
        const lastSequence = this.getLatestEventSequence(events);
        if (lastSequence !== null) {
            this.payContractCallSequence = lastSequence;
        }
    }

    queryContractCallEvents(options?: QueryOptions) {
        const _options = options || { start: this.contractCallSequence === -1 ? 0 : this.contractCallSequence + 1, limit: 100 };
        return this.getEventsByEventHandle(
            this.owner.address(),
            `${this.owner.address()}::axelar_gateway::GatewayEventStore`,
            'contract_call_events',
            _options
        );
    }

    queryPayGasContractCallEvents(options?: QueryOptions) {
        const _options = options || { start: this.payContractCallSequence === -1 ? 0 : this.payContractCallSequence + 1, limit: 100 };
        return this.getEventsByEventHandle(
            this.owner.address(),
            `${this.owner.address()}::axelar_gas_service::GasServiceEventStore`,
            'native_gas_paid_for_contract_call_events',
            _options
        );
    }

    private getLatestEventSequence = (events: any[]) => {
        if (events.length == 0) return null;

        return parseInt(events[events.length - 1].sequence_number);
    };
}
