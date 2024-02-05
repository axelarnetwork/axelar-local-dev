import {
    Account,
    Address,
    AddressValue,
    BigUIntValue,
    BinaryCodec,
    BytesValue,
    CodeMetadata,
    ContractFunction,
    H256Value,
    Interaction,
    List,
    ResultsParser,
    ReturnCode,
    SmartContract,
    StringValue,
    Transaction,
    TransactionWatcher,
    Tuple,
    TypedValue
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

        this.contractAddress = contractAddress;

        const homedir = os.homedir();
        const ownerWalletFile = path.resolve(homedir, 'multiversx-sdk/testwallets/latest/users/alice.pem');

        const file = fs.readFileSync(ownerWalletFile).toString();
        this.ownerPrivateKey = UserSecretKey.fromPem(file);
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
                new StringValue(CHAIN_ID),
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
            throw new Error(`Could not deploy Axelar Auth contract... ${gasReceiverTransaction.getHash()}`);
        }

        const axelarGasReceiverAddress = SmartContract.computeAddress(
            gasReceiverTransaction.getSender(),
            gasReceiverTransaction.getNonce()
        );
        console.log(`Gas Receiver contract deployed at ${axelarGasReceiverAddress} with transaction ${gasReceiverTransaction.getHash()}`);

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
        payloadHash: string,
    ) {
        const gatewayContract = new SmartContract({ address: this.gatewayAddress as Address });

        const approveContractCallData = Tuple.fromItems([
            new StringValue(sourceChain),
            new StringValue(sourceAddress),
            new AddressValue(Address.fromBech32(destinationAddress)),
            new H256Value(Buffer.from(payloadHash, 'hex')),
        ]);
        const encodedApproveContractCallData = codec.encodeTopLevel(approveContractCallData);

        const executeData = Tuple.fromItems([
            new StringValue(CHAIN_ID),
            List.fromItems([new H256Value(Buffer.from(commandId, 'hex'))]),
            List.fromItems([new StringValue(commandName)]),
            List.fromItems([
                new BytesValue(encodedApproveContractCallData),
            ]),
        ]);
        const encodedExecuteData = codec.encodeTopLevel(executeData);

        console.log('Command id', commandId);
        console.log('MultiversX execute data', executeData);

        const proof = this.generateProof(encodedExecuteData);
        const encodedProof = codec.encodeTopLevel(proof);

        console.log('MultiversX execute proof', encodedProof.toString('hex'));

        const transaction = gatewayContract.call({
            caller: this.owner,
            func: new ContractFunction('execute'),
            gasLimit: 50_000_000,
            args: [
                Tuple.fromItems([
                    new BytesValue(encodedExecuteData),
                    new BytesValue(encodedProof),
                ]),
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
                new BytesValue(Buffer.from(payloadHex, 'hex'))
            ],
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

        console.log('Data hash', messageHash);
        console.log('Signature', signature.toString('hex'));

        return Tuple.fromItems([
            List.fromItems([new H256Value(Buffer.from(this.operatorWallet.hex(), 'hex'))]),
            List.fromItems([new BigUIntValue(1)]),
            new BigUIntValue(1),
            List.fromItems([new H256Value(signature)]),
        ]);
    }
}
