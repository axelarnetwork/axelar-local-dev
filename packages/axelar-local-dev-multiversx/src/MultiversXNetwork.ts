import {
    Account,
    Address, AddressType, AddressValue, ArrayVec, BigUIntType, BigUIntValue,
    CodeMetadata, CompositeValue, ContractFunction,
    ITransactionOnNetwork, List, ResultsParser, ReturnCode,
    SmartContract, StructType, Transaction,
    TransactionWatcher, Tuple, TupleType, VariadicValue
} from '@multiversx/sdk-core/out';
import { AccountOnNetwork, ProxyNetworkProvider, TransactionOnNetwork } from '@multiversx/sdk-network-providers/out';
import { Code } from '@multiversx/sdk-core';
import fs, { promises } from 'fs';
import { Mnemonic, UserSecretKey, UserSigner } from '@multiversx/sdk-wallet/out';
import path from 'path';
import * as os from 'os';
import { MultiversXConfig } from './multiversXNetworkUtils';

// declare type EntryFunctionPayload = {
//     function: string;
//     /**
//      * Type arguments of the function
//      */
//     type_arguments: Array<string>;
//     /**
//      * Arguments of the function
//      */
//     arguments: Array<any>;
// };
//
// interface QueryOptions {
//     start?: number;
//     limit?: number;
// }
export class MultiversXNetwork extends ProxyNetworkProvider {
    public owner: Address;
    public ownerAccount: Account;
    public operatorWallet: Address;
    public gatewayAddress?: Address;
    public authAddress?: Address;
    public gasReceiverAddress?: Address;
    public contractCallSequence: number;
    public payContractCallSequence: number;

    constructor(url: string, gatewayAddress: string | undefined, authAddress: string | undefined, gasReceiverAddress: string | undefined) {
        super(url);
        // WARNING: should not use the same account for production! Account of alice.pem
        this.owner = Address.fromBech32('erd1qyu5wthldzr8wx5c9ucg8kjagg0jfs53s8nr3zpz3hypefsdd8ssycr6th');
        // Address of bob.pem
        this.operatorWallet = Address.fromBech32('erd1spyavw0956vq68xj8y4tenjpq2wd5a9p2c6j8gsz7ztyrnpxrruqzu66jx');
        this.ownerAccount = new Account(this.owner);
        try {
            this.gatewayAddress = gatewayAddress ? Address.fromBech32(gatewayAddress) : undefined;
        } catch (e) {}
        try {
            this.authAddress = authAddress ? Address.fromBech32(authAddress) : undefined;
        } catch (e) {}
        try {
            this.gasReceiverAddress = gasReceiverAddress ? Address.fromBech32(gasReceiverAddress) : undefined;
        } catch (e) {}

        this.contractCallSequence = -1;
        this.payContractCallSequence = -1;

        // this.isGatewayDeployed().then((result) => {
        //     if (result) {
                // this.queryContractCallEvents().then((events) => {
                //     if (events) this.updateContractCallSequence(events);
                // });
                // this.queryPayGasContractCallEvents().then((events) => {
                //     if (events) this.updatePayGasContractCallSequence(events);
                // });
        //     }
        // });
    }

    async isGatewayDeployed(): Promise<boolean> {
        const accountOnNetwork = await this.getAccount(this.owner);
        this.ownerAccount.update(accountOnNetwork);

        if (!this.gatewayAddress || !this.authAddress || !this.gasReceiverAddress) {
            return false;
        }

        try {
            const accountGateway = await this.getAccount(this.gatewayAddress);
            const accountAuth = await this.getAccount(this.authAddress);
            const accountGasReceiver = await this.getAccount(this.gasReceiverAddress);

            if (!accountGateway.code || !accountAuth.code || !accountGasReceiver.code) {
                return false;
            }

            console.log('MultiversX Axelar Gateway is already deployed');

            return true;
        } catch (e) {
            console.error(e);

            return false;
        }
    }

    //
    // getOwnerBalance() {
    //     return new CoinClient(this).checkBalance(this.owner);
    // }
    //
    async deployAxelarFrameworkModules(): Promise<MultiversXConfig> {
        console.log(`Deploying the Axelar Gateway for MultiversX... `);

        const contractFolder = path.join(__dirname, '..', 'contracts');

        const homedir = os.homedir();
        const ownerWalletFile = path.resolve(homedir, 'multiversx-sdk/testwallets/latest/users/alice.pem')

        const file = fs.readFileSync(ownerWalletFile).toString();
        const privateKey = UserSecretKey.fromPem(file);

        const axelarAuthAddress = await this.deployAuthContract(contractFolder, privateKey);
        const axelarGatewayAddress = await this.deployGatewayContract(contractFolder, privateKey, axelarAuthAddress);
        await this.changeContractOwner(axelarAuthAddress, axelarGatewayAddress, privateKey);

        const axelarGasReceiverAddress = await this.deployGasReceiverContract(contractFolder, privateKey);

        return {
            axelarAuthAddress,
            axelarGatewayAddress,
            axelarGasReceiverAddress,
        };
    }

    private async deployAuthContract(contractFolder: string, privateKey: UserSecretKey): Promise<string> {
        const buffer = await promises.readFile(contractFolder + '/auth.wasm');

        const code = Code.fromBuffer(buffer);
        const authContract = new SmartContract();

        const authTransaction = authContract.deploy({
            deployer: this.owner,
            code,
            codeMetadata: new CodeMetadata(true, true, false, false),
            initArguments: [
                Tuple.fromItems([
                    List.fromItems([new AddressValue(this.operatorWallet)]),
                    List.fromItems([new BigUIntValue(1)]),
                    new BigUIntValue(1),
                ])
            ],
            gasLimit: 50_000_000,
            chainID: 'localnet',
        });
        authTransaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.signAndSendTransaction(authTransaction, privateKey);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not deploy Axelar Auth contract...`);
        }

        const axelarAuthAddress = SmartContract.computeAddress(authTransaction.getSender(), authTransaction.getNonce());
        console.log(`Auth contract deployed at ${axelarAuthAddress} with transaction ${authTransaction.getHash()}`);

        return axelarAuthAddress.bech32();
    }

    private async deployGatewayContract(contractFolder: string, privateKey: UserSecretKey, axelarAuthAddress: string): Promise<string> {
        const buffer = await promises.readFile(contractFolder + '/gateway.wasm');

        const code = Code.fromBuffer(buffer);
        const gatewayContract = new SmartContract();

        const gatewayTransaction = gatewayContract.deploy({
            deployer: this.owner,
            code,
            codeMetadata: new CodeMetadata(true, true, false, false),
            initArguments: [
                new AddressValue(Address.fromBech32(axelarAuthAddress)),
                new AddressValue(Address.fromBech32('erd1qqqqqqqqqqqqqpgq7ykazrzd905zvnlr88dpfw06677lxe9w0n4suz00uh')), // TODO: This is currently not used
            ],
            gasLimit: 50_000_000,
            chainID: 'localnet',
        });
        gatewayTransaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.signAndSendTransaction(gatewayTransaction, privateKey);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not deploy Axelar Gateway contract...`);
        }

        const axelarGatewayAddress = SmartContract.computeAddress(gatewayTransaction.getSender(), gatewayTransaction.getNonce());
        console.log(`Gateway contract deployed at ${axelarGatewayAddress} with transaction ${gatewayTransaction.getHash()}`);

        return axelarGatewayAddress.bech32();
    }

    private async changeContractOwner(contractAddress: string, newOwner: string, privateKey: UserSecretKey): Promise<void> {
        const contract = new SmartContract({ address: Address.fromBech32(contractAddress) });

        const transaction = contract.call({
            caller: this.owner,
            func: new ContractFunction('ChangeOwnerAddress'),
            gasLimit: 6_000_000,
            args: [new AddressValue(Address.fromBech32(newOwner))],
            chainID: 'localnet',
        });
        transaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.signAndSendTransaction(transaction, privateKey);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not change owner of Axelar Gateway contract...`);
        }

        console.log('Changed contract owner of Auth contract...');
    }

    private async deployGasReceiverContract(contractFolder: string, privateKey: UserSecretKey): Promise<string> {
        const buffer = await promises.readFile(contractFolder + '/gas-service.wasm');

        const code = Code.fromBuffer(buffer);
        const authContract = new SmartContract();

        const gasReceiverTransaction = authContract.deploy({
            deployer: this.owner,
            code,
            codeMetadata: new CodeMetadata(true, true, false, false),
            initArguments: [
                new AddressValue(this.owner)
            ],
            gasLimit: 50_000_000,
            chainID: 'localnet',
        });
        gasReceiverTransaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.signAndSendTransaction(gasReceiverTransaction, privateKey);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not deploy Axelar Auth contract...`);
        }

        const axelarGasReceiverAddress = SmartContract.computeAddress(gasReceiverTransaction.getSender(), gasReceiverTransaction.getNonce());
        console.log(`Gas Receiver contract deployed at ${axelarGasReceiverAddress} with transaction ${gasReceiverTransaction.getHash()}`);

        return axelarGasReceiverAddress.bech32();
    }

    async signAndSendTransaction(transaction: Transaction, privateKey: UserSecretKey): Promise<ReturnCode> {
        const signature = privateKey.sign(transaction.serializeForSigning())
        transaction.applySignature(signature);

        await this.sendTransaction(transaction);

        const transactionOnNetwork = await new TransactionWatcher(this).awaitCompleted(transaction);
        const { returnCode } = new ResultsParser().parseUntypedOutcome(transactionOnNetwork);

        return returnCode;
    }
    //
    // updateContractCallSequence(events: any[]) {
    //     const lastSequence = this.getLatestEventSequence(events);
    //     if (lastSequence !== null) {
    //         this.contractCallSequence = lastSequence;
    //     }
    // }
    //
    // updatePayGasContractCallSequence(events: any[]) {
    //     const lastSequence = this.getLatestEventSequence(events);
    //     if (lastSequence !== null) {
    //         this.payContractCallSequence = lastSequence;
    //     }
    // }
    //
    // queryContractCallEvents(options?: QueryOptions) {
    //     const _options = options || { start: this.contractCallSequence === -1 ? 0 : this.contractCallSequence + 1, limit: 100 };
    //     return this.getEventsByEventHandle(
    //         this.resourceAddress,
    //         `${this.resourceAddress}::gateway::OutgoingContractCallsState`,
    //         'events',
    //         _options
    //     );
    // }
    //
    // queryPayGasContractCallEvents(options?: QueryOptions) {
    //     const _options = options || { start: this.payContractCallSequence === -1 ? 0 : this.payContractCallSequence + 1, limit: 100 };
    //     return this.getEventsByEventHandle(
    //         this.resourceAddress,
    //         `${this.resourceAddress}::axelar_gas_service::GasServiceEventStore`,
    //         'native_gas_paid_for_contract_call_events',
    //         _options
    //     );
    // }
    //
    // public async approveContractCall(
    //     commandId: Uint8Array,
    //     sourceChain: string,
    //     sourceAddress: string,
    //     destinationAddress: string,
    //     payloadHash: Uint8Array
    // ) {
    //     const tx = await this.submitTransactionAndWait(this.owner.address(), {
    //         function: `${this.resourceAddress}::gateway::approve_contract_call`,
    //         type_arguments: [],
    //         arguments: [commandId, sourceChain, sourceAddress, destinationAddress, payloadHash],
    //     });
    //     return {
    //         hash: tx.hash,
    //         success: tx.success,
    //         vmStatus: tx.vm_status,
    //     };
    // }
    //
    // public async execute(commandId: Uint8Array, destinationAddress: string, payload: Uint8Array) {
    //     const tx = await this.submitTransactionAndWait(this.owner.address(), {
    //         function: `${destinationAddress}::execute`,
    //         type_arguments: [],
    //         arguments: [commandId, payload],
    //     });
    //
    //     return {
    //         hash: tx.hash,
    //         success: tx.success,
    //         vmStatus: tx.vm_status,
    //     };
    // }
    //
    // private getLatestEventSequence = (events: any[]) => {
    //     if (events.length == 0) return null;
    //
    //     return parseInt(events[events.length - 1].sequence_number);
    // };
    //
    // static getResourceAccountAddress(sourceAddress: MaybeHexString, seed: MaybeHexString): HexString {
    //     seed = HexString.ensure(seed);
    //     const source = BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex(sourceAddress));
    //     const bytes = new Uint8Array([...source, ...seed.toUint8Array(), 255]);
    //     const hash = sha3Hash.create();
    //     hash.update(bytes);
    //
    //     return HexString.fromUint8Array(hash.digest());
    // }
}
