import {
    Account,
    Address, AddressType,
    AddressValue,
    BigUIntValue,
    BinaryCodec,
    BytesValue,
    CodeMetadata,
    ContractFunction,
    H256Value,
    Interaction,
    List, OptionType, OptionValue,
    ResultsParser,
    ReturnCode,
    SmartContract, StringType,
    StringValue,
    Transaction,
    TransactionWatcher,
    Tuple,
    TypedValue, U8Value, VariadicValue
} from '@multiversx/sdk-core/out';
import { ProxyNetworkProvider } from '@multiversx/sdk-network-providers/out';
import { Code } from '@multiversx/sdk-core';
import fs, { promises } from 'fs';
import { UserSecretKey } from '@multiversx/sdk-wallet/out';
import path from 'path';
import * as os from 'os';
import { MultiversXConfig } from './multiversXNetworkUtils';
import { ContractQueryResponse } from '@multiversx/sdk-network-providers/out/contractQueryResponse';
import createKeccakHash from 'keccak';
import { MultiversXITS } from './its';

const MULTIVERSX_SIGNED_MESSAGE_PREFIX = '\x19MultiversX Signed Message:\n';
const CHAIN_ID = 'multiversx-localnet';

const codec = new BinaryCodec();

export class MultiversXNetwork extends ProxyNetworkProvider {
    public owner: Address;
    public ownerAccount: Account;
    public operatorWallet: Address;
    public gatewayAddress?: Address;
    public authAddress?: Address;
    public gasReceiverAddress?: Address;
    public interchainTokenServiceAddress?: Address;
    public interchainTokenFactoryAddress?: Address;
    public contractAddress?: string;
    public its: MultiversXITS;

    private readonly ownerPrivateKey: UserSecretKey;

    constructor(
        url: string,
        gatewayAddress: string | undefined,
        authAddress: string | undefined,
        gasReceiverAddress: string | undefined,
        interchainTokenServiceAddress: string | undefined,
        interchainTokenFactoryAddress: string | undefined,
        contractAddress: string | undefined = undefined
    ) {
        super(url);
        this.owner = Address.fromBech32('erd1qyu5wthldzr8wx5c9ucg8kjagg0jfs53s8nr3zpz3hypefsdd8ssycr6th'); // alice.pem
        this.operatorWallet = Address.fromBech32('erd1spyavw0956vq68xj8y4tenjpq2wd5a9p2c6j8gsz7ztyrnpxrruqzu66jx'); // bob.pem
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
        try {
            this.interchainTokenServiceAddress = interchainTokenServiceAddress ? Address.fromBech32(
                interchainTokenServiceAddress) : undefined;
        } catch (e) {
        }
        try {
            this.interchainTokenFactoryAddress = interchainTokenFactoryAddress ? Address.fromBech32(
                interchainTokenFactoryAddress) : undefined;
        } catch (e) {
        }

        this.contractAddress = contractAddress;

        const homedir = os.homedir();
        const ownerWalletFile = path.resolve(homedir, 'multiversx-sdk/testwallets/latest/users/alice.pem');

        const file = fs.readFileSync(ownerWalletFile).toString();
        this.ownerPrivateKey = UserSecretKey.fromPem(file);
        this.its = new MultiversXITS(this, interchainTokenServiceAddress as string);
    }

    async isGatewayDeployed(): Promise<boolean> {
        const accountOnNetwork = await this.getAccount(this.owner);
        this.ownerAccount.update(accountOnNetwork);

        if (
            !this.gatewayAddress
            || !this.authAddress
            || !this.gasReceiverAddress
            || !this.interchainTokenServiceAddress
            || !this.interchainTokenFactoryAddress
        ) {
            return false;
        }

        try {
            const accountGateway = await this.getAccount(this.gatewayAddress);
            const accountAuth = await this.getAccount(this.authAddress);
            const accountGasReceiver = await this.getAccount(this.gasReceiverAddress);
            const interchainTokenServiceAddress = await this.getAccount(this.interchainTokenServiceAddress);
            const interchainTokenFactoryAddress = await this.getAccount(this.interchainTokenFactoryAddress);

            if (
                !accountGateway.code
                || !accountAuth.code
                || !accountGasReceiver.code
                || !interchainTokenServiceAddress.code
                || !interchainTokenFactoryAddress.code
            ) {
                return false;
            }

            return true;
        } catch (e) {
            console.error(e);

            return false;
        }
    }

    async deployContract(contractCode: string, initArguments: TypedValue[]): Promise<string> {
        const homedir = os.homedir();
        const ownerWalletFile = path.resolve(homedir, 'multiversx-sdk/testwallets/latest/users/alice.pem');

        const file = fs.readFileSync(ownerWalletFile).toString();
        const privateKey = UserSecretKey.fromPem(file);

        const buffer = await promises.readFile(contractCode);

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

        const contractAddress = SmartContract.computeAddress(
            deployTransaction.getSender(),
            deployTransaction.getNonce()
        );

        return contractAddress.bech32();
    }

    async deployAxelarFrameworkModules(): Promise<MultiversXConfig> {
        console.log(`Deploying the Axelar Gateway for MultiversX... `);

        const contractFolder = path.join(__dirname, '..', 'contracts');

        const axelarAuthAddress = await this.deployAuthContract(contractFolder);
        const axelarGatewayAddress = await this.deployGatewayContract(contractFolder, axelarAuthAddress);
        await this.changeContractOwner(axelarAuthAddress, axelarGatewayAddress);

        const axelarGasReceiverAddress = await this.deployGasReceiverContract(contractFolder);

        const baseTokenManager = await this.deployBaseTokenManager(contractFolder);
        const interchainTokenServiceAddress = await this.deployInterchainTokenService(
            contractFolder,
            axelarGatewayAddress,
            axelarGasReceiverAddress,
            baseTokenManager
        );
        const interchainTokenFactoryAddress = await this.deployInterchainTokenFactory(
            contractFolder,
            interchainTokenServiceAddress
        );

        this.gatewayAddress = Address.fromBech32(axelarGatewayAddress);
        this.authAddress = Address.fromBech32(axelarAuthAddress);
        this.gasReceiverAddress = Address.fromBech32(axelarGasReceiverAddress);
        this.interchainTokenServiceAddress = Address.fromBech32(interchainTokenServiceAddress);
        this.interchainTokenFactoryAddress = Address.fromBech32(interchainTokenFactoryAddress);
        this.its = new MultiversXITS(this, interchainTokenServiceAddress);

        return {
            axelarAuthAddress,
            axelarGatewayAddress,
            axelarGasReceiverAddress,
            interchainTokenServiceAddress,
            interchainTokenFactoryAddress
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
                    List.fromItems([new H256Value(Buffer.from(this.operatorWallet.hex(), 'hex'))]),
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
            throw new Error(`Could not deploy Axelar Auth contract... ${authTransaction.getHash()}`);
        }

        const axelarAuthAddress = SmartContract.computeAddress(authTransaction.getSender(), authTransaction.getNonce());
        console.log(`Auth contract deployed at ${axelarAuthAddress} with transaction ${authTransaction.getHash()}`);

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
                new StringValue(CHAIN_ID)
            ],
            gasLimit: 50_000_000,
            chainID: 'localnet'
        });
        gatewayTransaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.signAndSendTransaction(gatewayTransaction);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not deploy Axelar Gateway contract... ${gatewayTransaction.getHash()}`);
        }

        const axelarGatewayAddress = SmartContract.computeAddress(
            gatewayTransaction.getSender(),
            gatewayTransaction.getNonce()
        );
        console.log(`Gateway contract deployed at ${axelarGatewayAddress} with transaction ${gatewayTransaction.getHash()}`);

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
            throw new Error(`Could not change owner of Axelar Gateway contract... ${transaction.getHash()}`);
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
            throw new Error(`Could not deploy Axelar Gas Receiver contract... ${gasReceiverTransaction.getHash()}`);
        }

        const axelarGasReceiverAddress = SmartContract.computeAddress(
            gasReceiverTransaction.getSender(),
            gasReceiverTransaction.getNonce()
        );
        console.log(`Gas Receiver contract deployed at ${axelarGasReceiverAddress} with transaction ${gasReceiverTransaction.getHash()}`);

        return axelarGasReceiverAddress.bech32();
    }

    // This is a custom version of the token manager with ESDT issue cost set for localnet (5000000000000000000 / 5 EGLD)
    private async deployBaseTokenManager(contractFolder: string): Promise<string> {
        const buffer = await promises.readFile(contractFolder + '/token-manager.wasm');

        const code = Code.fromBuffer(buffer);
        const contract = new SmartContract();

        // Deploy parameters don't matter since they will be overwritten
        const tokenManagerTransaction = contract.deploy({
            deployer: this.owner,
            code,
            codeMetadata: new CodeMetadata(true, true, false, false),
            initArguments: [
                new AddressValue(this.owner),
                new U8Value(2),
                new H256Value(Buffer.from('01b3d64c8c6530a3aad5909ae7e0985d4438ce8eafd90e51ce48fbc809bced39', 'hex')),
                Tuple.fromItems([
                    new OptionValue(new OptionType(new AddressType()), new AddressValue(this.owner)),
                    new OptionValue(new OptionType(new StringType()), new StringValue('EGLD'))
                ])
            ],
            gasLimit: 50_000_000,
            chainID: 'localnet'
        });
        tokenManagerTransaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.signAndSendTransaction(tokenManagerTransaction);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not deploy Axelar Token Manager contract... ${tokenManagerTransaction.getHash()}`);
        }

        const address = SmartContract.computeAddress(
            tokenManagerTransaction.getSender(),
            tokenManagerTransaction.getNonce()
        );
        console.log(`Base Token Manager contract deployed at ${address} with transaction ${tokenManagerTransaction.getHash()}`);

        return address.bech32();
    }

    private async deployInterchainTokenService(
        contractFolder: string,
        gateway: string,
        gasService: string,
        baseTokenManager: string
    ): Promise<string> {
        const buffer = await promises.readFile(contractFolder + '/interchain-token-service.wasm');

        const code = Code.fromBuffer(buffer);
        const contract = new SmartContract();

        const itsTransaction = contract.deploy({
            deployer: this.owner,
            code,
            codeMetadata: new CodeMetadata(true, true, false, false),
            initArguments: [
                new AddressValue(Address.fromBech32(gateway)),
                new AddressValue(Address.fromBech32(gasService)),
                new AddressValue(Address.fromBech32(baseTokenManager)),
                new AddressValue(this.owner),
                new StringValue('multiversx'),
                VariadicValue.fromItemsCounted(), // empty trusted chains
                VariadicValue.fromItemsCounted()
            ],
            gasLimit: 200_000_000,
            chainID: 'localnet'
        });
        itsTransaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.signAndSendTransaction(itsTransaction);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not deploy Axelar Interchain Token Service contract... ${itsTransaction.getHash()}`);
        }

        const address = SmartContract.computeAddress(
            itsTransaction.getSender(),
            itsTransaction.getNonce()
        );
        console.log(`Interchain Token Service contract deployed at ${address} with transaction ${itsTransaction.getHash()}`);

        return address.bech32();
    }

    private async deployInterchainTokenFactory(contractFolder: string, interchainTokenService: string): Promise<string> {
        const buffer = await promises.readFile(contractFolder + '/interchain-token-factory.wasm');

        const code = Code.fromBuffer(buffer);
        const contract = new SmartContract();
        const itsAddress = Address.fromBech32(interchainTokenService);

        const factoryTransaction = contract.deploy({
            deployer: this.owner,
            code,
            codeMetadata: new CodeMetadata(true, true, false, false),
            initArguments: [
                new AddressValue(itsAddress)
            ],
            gasLimit: 200_000_000,
            chainID: 'localnet'
        });
        factoryTransaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        let returnCode = await this.signAndSendTransaction(factoryTransaction);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not deploy Axelar Interchain Token Factory contract... ${factoryTransaction.getHash()}`);
        }

        const address = SmartContract.computeAddress(
            factoryTransaction.getSender(),
            factoryTransaction.getNonce()
        );
        console.log(`Interchain Token Factory contract deployed at ${address} with transaction ${factoryTransaction.getHash()}`);

        const itsContract = new SmartContract({ address: itsAddress });
        // Set interchain token factory contract on its
        const transaction = itsContract.call({
            caller: this.owner,
            func: new ContractFunction('setInterchainTokenFactory'),
            gasLimit: 50_000_000,
            args: [
                new AddressValue(address)
            ],
            chainID: 'localnet'
        });

        transaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        returnCode = await this.signAndSendTransaction(transaction);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not set Axelar ITS address on Axelar Interchain Token Factory... ${transaction.getHash()}`);
        }

        return address.bech32();
    }

    async setInterchainTokenServiceTrustedAddress(chainName: string, address: string) {
        console.log(`Registerring ITS for ${chainName} for MultiversX`);
        const itsContract = new SmartContract({ address: this.interchainTokenServiceAddress });
        const transaction = itsContract.call({
            caller: this.owner,
            func: new ContractFunction('setTrustedAddress'),
            gasLimit: 50_000_000,
            args: [
                new StringValue(chainName),
                new StringValue(address)
            ],
            chainID: 'localnet'
        });

        transaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.signAndSendTransaction(transaction);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not call setTrustedAddress on MultiversX ITS contract form ${chainName}... ${transaction.getHash()}`);
        }
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

        const transactionOnNetwork = await new TransactionWatcher({
            getTransaction: async (hash: string) => { return await this.getTransaction(hash, true); }
        }).awaitCompleted(transaction);
        const { returnCode } = new ResultsParser().parseUntypedOutcome(transactionOnNetwork);

        return returnCode;
    }

    async callContract(address: string, func: string, args: TypedValue[] = []): Promise<ContractQueryResponse> {
        const contract = new SmartContract({
            address: new Address(address)
        });

        const query = new Interaction(contract, new ContractFunction(func), args).buildQuery();

        return await super.queryContract(query);
    }

    public async executeGateway(
        commandName: string,
        commandId: string,
        sourceChain: string,
        sourceAddress: string,
        destinationAddress: string,
        payloadHash: string
    ) {
        // Remove 0x added by Ethereum for hex strings
        commandId = commandId.startsWith('0x') ? commandId.substring(2) : commandId;

        const gatewayContract = new SmartContract({ address: this.gatewayAddress as Address });

        const approveContractCallData = Tuple.fromItems([
            new StringValue(sourceChain),
            new StringValue(sourceAddress),
            new AddressValue(Address.fromBech32(destinationAddress)),
            new H256Value(Buffer.from(payloadHash, 'hex'))
        ]);
        const encodedApproveContractCallData = codec.encodeTopLevel(approveContractCallData);

        const executeData = Tuple.fromItems([
            new StringValue(CHAIN_ID),
            List.fromItems([new H256Value(Buffer.from(commandId, 'hex'))]),
            List.fromItems([new StringValue(commandName)]),
            List.fromItems([
                new BytesValue(encodedApproveContractCallData)
            ])
        ]);
        const encodedExecuteData = codec.encodeTopLevel(executeData);

        const proof = this.generateProof(encodedExecuteData);
        const encodedProof = codec.encodeTopLevel(proof);

        const transaction = gatewayContract.call({
            caller: this.owner,
            func: new ContractFunction('execute'),
            gasLimit: 50_000_000,
            args: [
                Tuple.fromItems([
                    new BytesValue(encodedExecuteData),
                    new BytesValue(encodedProof)
                ])
            ],
            chainID: 'localnet'
        });

        const accountOnNetwork = await this.getAccount(this.owner);
        this.ownerAccount.update(accountOnNetwork);

        transaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.signAndSendTransaction(transaction);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not execute MultiversX Gateway transaction... ${transaction.getHash()}`);
        }

        return transaction;
    }

    public async executeContract(
        commandId: string,
        destinationContractAddress: string,
        sourceChain: string,
        sourceAddress: string,
        payloadHex: string,
        value: string = '0'
    ): Promise<Transaction> {
        // Remove 0x added by Ethereum for hex strings
        commandId = commandId.startsWith('0x') ? commandId.substring(2) : commandId;

        const contract = new SmartContract({ address: Address.fromBech32(destinationContractAddress) });

        const transaction = contract.call({
            caller: this.owner,
            func: new ContractFunction('execute'),
            gasLimit: 200_000_000,
            args: [
                new H256Value(Buffer.from(commandId, 'hex')),
                new StringValue(sourceChain),
                new StringValue(sourceAddress),
                new BytesValue(Buffer.from(payloadHex, 'hex'))
            ],
            value,
            chainID: 'localnet'
        });

        const accountOnNetwork = await this.getAccount(this.owner);
        this.ownerAccount.update(accountOnNetwork);

        transaction.setNonce(this.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.signAndSendTransaction(transaction);

        if (!returnCode.isSuccess()) {
            throw new Error(`Could not call MultiversX contract execute endpoint... ${transaction.getHash()}`);
        }

        return transaction;
    }

    private generateProof(encodedData: Buffer) {
        const messageHashData = Buffer.concat([
            Buffer.from(MULTIVERSX_SIGNED_MESSAGE_PREFIX),
            encodedData
        ]);

        const messageHash = createKeccakHash('keccak256').update(messageHashData).digest('hex');

        const homedir = os.homedir();
        const operatorWalletFile = path.resolve(homedir, 'multiversx-sdk/testwallets/latest/users/bob.pem');

        const file = fs.readFileSync(operatorWalletFile).toString();

        const signature = UserSecretKey.fromPem(file).sign(Buffer.from(messageHash, 'hex'));

        return Tuple.fromItems([
            List.fromItems([new H256Value(Buffer.from(this.operatorWallet.hex(), 'hex'))]),
            List.fromItems([new BigUIntValue(1)]),
            new BigUIntValue(1),
            List.fromItems([new H256Value(signature)])
        ]);
    }
}
