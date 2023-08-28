import {
    Account,
    Address, AddressType, AddressValue, ArrayVec, BigUIntType, BigUIntValue, BinaryCodec, BytesValue,
    CodeMetadata, CompositeValue, ContractFunction, H256Value, Interaction,
    ITransactionOnNetwork, List, ResultsParser, ReturnCode,
    SmartContract, StringValue, StructType, Transaction,
    TransactionWatcher, Tuple, TupleType, TypedValue, VariadicValue
} from '@multiversx/sdk-core/out';
import { AccountOnNetwork, ProxyNetworkProvider, TransactionOnNetwork } from '@multiversx/sdk-network-providers/out';
import { Code } from '@multiversx/sdk-core';
import fs, { promises } from 'fs';
import { Mnemonic, UserSecretKey, UserSigner } from '@multiversx/sdk-wallet/out';
import path from 'path';
import * as os from 'os';
import { MultiversXConfig } from './multiversXNetworkUtils';
import { ContractQueryResponse } from '@multiversx/sdk-network-providers/out/contractQueryResponse';
import createKeccakHash from "keccak";

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
    public contractAddress?: string;

    private readonly ownerPrivateKey: UserSecretKey;

    constructor(
        url: string,
        gatewayAddress: string | undefined,
        authAddress: string | undefined,
        gasReceiverAddress: string | undefined,
        contractAddress: string | undefined = undefined
    ) {
        super(url);
        // WARNING: should not use the same account for production! Account of alice.pem
        this.owner = Address.fromBech32('erd1qyu5wthldzr8wx5c9ucg8kjagg0jfs53s8nr3zpz3hypefsdd8ssycr6th');
        // Address of bob.pem
        this.operatorWallet = Address.fromBech32('erd1spyavw0956vq68xj8y4tenjpq2wd5a9p2c6j8gsz7ztyrnpxrruqzu66jx');
        this.ownerAccount = new Account(this.owner);
        try {
            this.gatewayAddress = gatewayAddress ? Address.fromBech32(gatewayAddress) : undefined;
        } catch (e) {
        }
        try {
            this.authAddress = authAddress ? Address.fromBech32(authAddress) : undefined;
        } catch (e) {
        }
        try {
            this.gasReceiverAddress = gasReceiverAddress ? Address.fromBech32(gasReceiverAddress) : undefined;
        } catch (e) {
        }

        this.contractAddress = contractAddress;

        const homedir = os.homedir();
        const ownerWalletFile = path.resolve(homedir, 'multiversx-sdk/testwallets/latest/users/alice.pem');

        const file = fs.readFileSync(ownerWalletFile).toString();
        this.ownerPrivateKey = UserSecretKey.fromPem(file);

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

    async deployContract(contract: string, initArguments: TypedValue[]): Promise<string> {
        const homedir = os.homedir();
        const ownerWalletFile = path.resolve(homedir, 'multiversx-sdk/testwallets/latest/users/alice.pem');

        const file = fs.readFileSync(ownerWalletFile).toString();
        const privateKey = UserSecretKey.fromPem(file);

        const buffer = await promises.readFile(contract);

        const code = Code.fromBuffer(buffer);
        const authContract = new SmartContract();

        const deployTransaction = authContract.deploy({
            deployer: this.owner,
            code,
            codeMetadata: new CodeMetadata(true, true, false, false),
            initArguments,
            gasLimit: 50_000_000,
            chainID: 'localnet'
        });
        deployTransaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.signAndSendTransaction(deployTransaction, privateKey);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not deploy Contract...`);
        }

        const contractAddress = SmartContract.computeAddress(deployTransaction.getSender(), deployTransaction.getNonce());

        return contractAddress.bech32();
    }

    //
    // getOwnerBalance() {
    //     return new CoinClient(this).checkBalance(this.owner);
    // }
    //
    async deployAxelarFrameworkModules(): Promise<MultiversXConfig> {
        console.log(`Deploying the Axelar Gateway for MultiversX... `);

        const contractFolder = path.join(__dirname, '..', 'contracts');

        const axelarAuthAddress = await this.deployAuthContract(contractFolder);
        const axelarGatewayAddress = await this.deployGatewayContract(contractFolder, axelarAuthAddress);
        await this.changeContractOwner(axelarAuthAddress, axelarGatewayAddress);

        const axelarGasReceiverAddress = await this.deployGasReceiverContract(contractFolder);

        return {
            axelarAuthAddress,
            axelarGatewayAddress,
            axelarGasReceiverAddress
        };
    }

    private async deployAuthContract(contractFolder: string): Promise<string> {
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
                    new BigUIntValue(1)
                ])
            ],
            gasLimit: 50_000_000,
            chainID: 'localnet'
        });
        authTransaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.signAndSendTransaction(authTransaction);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not deploy Axelar Auth contract...`);
        }

        const axelarAuthAddress = SmartContract.computeAddress(authTransaction.getSender(), authTransaction.getNonce());
        console.log(`Auth contract deployed at ${ axelarAuthAddress } with transaction ${ authTransaction.getHash() }`);

        return axelarAuthAddress.bech32();
    }

    private async deployGatewayContract(contractFolder: string, axelarAuthAddress: string): Promise<string> {
        const buffer = await promises.readFile(contractFolder + '/gateway.wasm');

        const code = Code.fromBuffer(buffer);
        const gatewayContract = new SmartContract();

        const gatewayTransaction = gatewayContract.deploy({
            deployer: this.owner,
            code,
            codeMetadata: new CodeMetadata(true, true, false, false),
            initArguments: [
                new AddressValue(Address.fromBech32(axelarAuthAddress)),
                new AddressValue(Address.fromBech32('erd1qqqqqqqqqqqqqpgq7ykazrzd905zvnlr88dpfw06677lxe9w0n4suz00uh')) // TODO: This is currently not used
            ],
            gasLimit: 50_000_000,
            chainID: 'localnet'
        });
        gatewayTransaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.signAndSendTransaction(gatewayTransaction);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not deploy Axelar Gateway contract...`);
        }

        const axelarGatewayAddress = SmartContract.computeAddress(gatewayTransaction.getSender(), gatewayTransaction.getNonce());
        console.log(`Gateway contract deployed at ${ axelarGatewayAddress } with transaction ${ gatewayTransaction.getHash() }`);

        return axelarGatewayAddress.bech32();
    }

    private async changeContractOwner(contractAddress: string, newOwner: string): Promise<void> {
        const contract = new SmartContract({ address: Address.fromBech32(contractAddress) });

        const transaction = contract.call({
            caller: this.owner,
            func: new ContractFunction('ChangeOwnerAddress'),
            gasLimit: 6_000_000,
            args: [new AddressValue(Address.fromBech32(newOwner))],
            chainID: 'localnet'
        });
        transaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.signAndSendTransaction(transaction);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not change owner of Axelar Gateway contract...`);
        }

        console.log('Changed contract owner of Auth contract...');
    }

    private async deployGasReceiverContract(contractFolder: string): Promise<string> {
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
            chainID: 'localnet'
        });
        gasReceiverTransaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.signAndSendTransaction(gasReceiverTransaction);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not deploy Axelar Auth contract...`);
        }

        const axelarGasReceiverAddress = SmartContract.computeAddress(gasReceiverTransaction.getSender(), gasReceiverTransaction.getNonce());
        console.log(`Gas Receiver contract deployed at ${ axelarGasReceiverAddress } with transaction ${ gasReceiverTransaction.getHash() }`);

        return axelarGasReceiverAddress.bech32();
    }

    async signAndSendTransaction(transaction: Transaction, privateKey: UserSecretKey = this.ownerPrivateKey): Promise<ReturnCode> {
        const signature = privateKey.sign(transaction.serializeForSigning());
        transaction.applySignature(signature);

        try {
            await this.sendTransaction(transaction);
        } catch (e) {
            console.error('Could not send MultiversX transaction', transaction.getHash());

            return ReturnCode.Unknown;
        }

        const transactionOnNetwork = await new TransactionWatcher(this).awaitCompleted(transaction);
        const { returnCode } = new ResultsParser().parseUntypedOutcome(transactionOnNetwork);

        return returnCode;
    }

    async callContract(address: string, func: string, args: any[] = []): Promise<ContractQueryResponse> {
        const contract = new SmartContract({
            address: new Address(address)
        });

        const query = new Interaction(contract, new ContractFunction(func), args).buildQuery();

        return await super.queryContract(query);
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
    public async executeGateway(
        commandName: string,
        commandId: string,
        sourceChain: string,
        sourceAddress: string,
        destinationAddress: string,
        payloadHash: string,
        sourceTxHash: string,
        sourceTxIndex: number,
    ) {
        const gatewayContract = new SmartContract({ address: this.gatewayAddress as Address });

        const nestedData = Tuple.fromItems([
            new StringValue(sourceChain),
            new StringValue(sourceAddress),
            new AddressValue(Address.fromBech32(destinationAddress)),
            new BytesValue(Buffer.from(payloadHash, 'hex')),
            new StringValue(sourceTxHash),
            new BigUIntValue(sourceTxIndex),
        ]);
        const encodedNestedData = new BinaryCodec().encodeTopLevel(nestedData);

        const executeData = Tuple.fromItems([
            List.fromItems([new StringValue(commandId)]),
            List.fromItems([new StringValue(commandName)]),
            List.fromItems([
                new BytesValue(encodedNestedData),
            ])
        ]);

        const proof = this.generateProof(executeData);

        const transaction = gatewayContract.call({
            caller: this.owner,
            func: new ContractFunction('execute'),
            gasLimit: 50_000_000,
            args: [
                executeData,
                proof,
            ],
            chainID: 'localnet'
        });

        const accountOnNetwork = await this.getAccount(this.owner);
        this.ownerAccount.update(accountOnNetwork);

        transaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.signAndSendTransaction(transaction);

        console.log(`Executed MultiversX gateway transaction: ${transaction.getHash()}`);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not execute MultiversX Gateway transaction...`);
        }

        return transaction;
    }

    public async executeContract(
        commandId: string,
        destinationContractAddress: string,
        sourceChain: string,
        sourceAddress: string,
        payloadHex: string
    ): Promise<Transaction> {
        const contract = new SmartContract({ address: Address.fromBech32(destinationContractAddress) });

        const transaction = contract.call({
            caller: this.owner,
            func: new ContractFunction('execute'),
            gasLimit: 50_000_000,
            args: [
                new StringValue(commandId),
                new StringValue(sourceChain),
                new StringValue(sourceAddress),
                new BytesValue(Buffer.from(payloadHex, 'hex')),
            ],
            chainID: 'localnet'
        });

        const accountOnNetwork = await this.getAccount(this.owner);
        this.ownerAccount.update(accountOnNetwork);

        transaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.signAndSendTransaction(transaction);

        console.log(`Executing MultiversX call contract transaction: ${transaction.getHash()}`);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not call MultiversX contract execute endpoint...`);
        }

        return transaction;
    }

    private generateProof(executeData: Tuple) {
        const encodedData = new BinaryCodec().encodeTopLevel(executeData);

        const dataHash = createKeccakHash('keccak256').update(encodedData).digest('hex');

        const homedir = os.homedir();
        const operatorWalletFile = path.resolve(homedir, 'multiversx-sdk/testwallets/latest/users/bob.pem');

        const file = fs.readFileSync(operatorWalletFile).toString();

        const signature = UserSecretKey.fromPem(file).sign(Buffer.from(dataHash, 'hex'));

        return Tuple.fromItems([
            List.fromItems([new AddressValue(this.operatorWallet)]),
            List.fromItems([new BigUIntValue(1)]),
            new BigUIntValue(1),
            List.fromItems([new H256Value(signature)]),
        ]);
    }

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
