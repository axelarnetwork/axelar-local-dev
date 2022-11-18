import { AptosAccount, AptosClient, CoinClient, HexString, TxnBuilderTypes, BCS, MaybeHexString } from 'aptos';
import fs from 'fs';
import path from 'path';
import { sha3_256 as sha3Hash } from "@noble/hashes/sha3";

interface QueryOptions {
    start?: number;
    limit?: number;
}
export class AptosNetwork extends AptosClient {
    public owner: AptosAccount;
    public contractCallSequence: number;
    public payContractCallSequence: number;
    public resourceAddress: MaybeHexString;

    constructor(nodeUrl: string) {
        super(nodeUrl);
        // WARNING: should not use the same account for production!
        this.owner = new AptosAccount(new HexString('0x2a6f6988be264385fbfd552b8aa93451c6aac25d85786dd473fe7159f9320425').toUint8Array());
        this.contractCallSequence = -1;
        this.payContractCallSequence = -1;
        this.resourceAddress = '0xe2a20d8c426eb04d882e20e78399b24123905d9f1adf95a292832805965e263a';
    }

    async deploy(modulePath: string, compiledModules: string[], seed: MaybeHexString | undefined = undefined) {
        const packageMetadata = fs.readFileSync(path.join(modulePath, 'package-metadata.bcs'));
        const moduleDatas = compiledModules.map((module: string) => {
            return fs.readFileSync(path.join(modulePath, 'bytecode_modules', module));
        });
        
        let txHash;
        
        if(seed) {
            const data = await this.generateTransaction(this.owner.address(), {
                function: `0x1::resource_account::create_resource_account_and_publish_package`,
                type_arguments: [],
                arguments: [
                    HexString.ensure(seed).toUint8Array(), 
                    packageMetadata,
                    moduleDatas,
                ],
            });
            
            const bcsTxn = await this.signTransaction(this.owner, data);
            txHash = (await this.submitTransaction(bcsTxn)).hash;


        } else {
            txHash = await this.publishPackage(
                this.owner,
                new HexString(packageMetadata.toString('hex')).toUint8Array(),
                moduleDatas.map((moduleData: any) => new TxnBuilderTypes.Module(new HexString(moduleData.toString('hex')).toUint8Array()))
            );
        }

        const tx: any = await this.waitForTransactionWithResult(txHash);
        if (tx.vm_status !== 'Executed successfully') {
            console.log(`Error: ${tx.vm_status}`);
        }
        return tx;
    }

    getOwnerBalance() {
        return new CoinClient(this).checkBalance(this.owner);
    }

    deployAxelarFrameworkModules() {
        return this.deploy(path.join(__dirname, '../../aptos/modules/axelar-framework/build/AxelarFramework'), [
            'axelar_gas_service.mv',
            'address_utils.mv',
            'gateway.mv',
        ], '0x1234');
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
            this.resourceAddress,
            `${this.resourceAddress}::gateway::OutgoingContractCallsState`,
            'events',
            _options
        );
    }

    queryPayGasContractCallEvents(options?: QueryOptions) {
        const _options = options || { start: this.payContractCallSequence === -1 ? 0 : this.payContractCallSequence + 1, limit: 100 };
        return this.getEventsByEventHandle(
            this.resourceAddress,
            `${this.resourceAddress}::axelar_gas_service::GasServiceEventStore`,
            'native_gas_paid_for_contract_call_events',
            _options
        );
    }

    public async approveContractCall(
        commandId: Uint8Array,
        sourceChain: string,
        sourceAddress: string,
        destinationAddress: string,
        payloadHash: Uint8Array
    ) {
        const data = await this.generateTransaction(this.owner.address(), {
            function: `${this.resourceAddress}::gateway::approve_contract_call`,
            type_arguments: [],
            arguments: [commandId, sourceChain, sourceAddress, destinationAddress, payloadHash],
        });
        const bcsTxn = await this.signTransaction(this.owner, data);
        const pendingTxn = await this.submitTransaction(bcsTxn);

        const tx: any = await this.waitForTransactionWithResult(pendingTxn.hash);

        return {
            hash: pendingTxn.hash,
            success: tx.success,
            vmStatus: tx.vm_status,
        };
    }

    public async execute(
        commandId: Uint8Array,
        destinationAddress: string,
        payload: Uint8Array
    ) {
        const data = await this.generateTransaction(this.owner.address(), {
            function: `${destinationAddress}::execute`,
            type_arguments: [],
            arguments: [commandId, payload],
        });
        const bcsTxn = await this.signTransaction(this.owner, data);
        const pendingTxn = await this.submitTransaction(bcsTxn);

        const tx: any = await this.waitForTransactionWithResult(pendingTxn.hash, { checkSuccess: true });

        return {
            hash: pendingTxn.hash,
            success: tx.success,
            vmStatus: tx.vm_status,
        };
    }

    private getLatestEventSequence = (events: any[]) => {
        if (events.length == 0) return null;

        return parseInt(events[events.length - 1].sequence_number);
    };

    static getResourceAccountAddress(sourceAddress: MaybeHexString, seed: MaybeHexString): HexString {
        seed = HexString.ensure(seed);
        const source = BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex(sourceAddress));
        const bytes = new Uint8Array([...source, ...seed.toUint8Array(), 255]);
        const hash = sha3Hash.create();
        hash.update(bytes);

        return HexString.fromUint8Array(hash.digest());
    }
}
