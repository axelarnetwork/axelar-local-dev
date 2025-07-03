import { logger, Network } from '@axelar-network/axelar-local-dev';
import { MultiversXNetwork } from './MultiversXNetwork';
import {
    Address,
    AddressValue,
    BigUIntValue,
    BytesValue,
    ContractFunction,
    H256Value,
    Interaction,
    ResultsParser,
    SmartContract,
    StringValue,
    TokenTransfer,
    U8Value,
} from '@multiversx/sdk-core/out';

export class MultiversXITS {
    private readonly client;
    private readonly itsContract;
    private readonly itsFactoryContract;

    constructor(client: MultiversXNetwork, itsContract: string, itsFactoryContract: string) {
        this.client = client;
        this.itsContract = itsContract;
        this.itsFactoryContract = itsFactoryContract;
    }

    async getValidTokenIdentifier(tokenId: string): Promise<string | null> {
        // Remove 0x added by Ethereum for hex strings
        tokenId = tokenId.startsWith('0x') ? tokenId.substring(2) : tokenId;

        try {
            const result = await this.client.callContract(this.itsContract, 'validTokenIdentifier', [
                new H256Value(Buffer.from(tokenId, 'hex')),
            ]);

            const parsedResult = new ResultsParser().parseUntypedQueryResponse(result);

            return parsedResult.values[0].toString();
        } catch (e) {
            return null;
        }
    }

    async interchainTokenId(address: Address, salt: string): Promise<string> {
        // Remove 0x added by Ethereum for hex strings
        salt = salt.startsWith('0x') ? salt.substring(2) : salt;

        const result = await this.client.callContract(this.itsFactoryContract, 'interchainTokenId', [
            new AddressValue(address),
            new H256Value(Buffer.from(salt, 'hex')),
        ]);

        const parsedResult = new ResultsParser().parseUntypedQueryResponse(result);

        return parsedResult.values[0].toString('hex');
    }

    async deployInterchainToken(salt: string, name: string, symbol: string, decimals: number, amount: number, minter: Address) {
        // Remove 0x added by Ethereum for hex strings
        salt = salt.startsWith('0x') ? salt.substring(2) : salt;

        const contract = new SmartContract({ address: Address.fromBech32(this.itsFactoryContract) });
        const args = [
            new H256Value(Buffer.from(salt, 'hex')),
            new StringValue(name),
            new StringValue(symbol),
            new U8Value(decimals),
            new BigUIntValue(amount),
            new AddressValue(minter),
        ];
        const transaction = new Interaction(contract, new ContractFunction('deployInterchainToken'), args)
            .withSender(this.client.owner)
            .withChainID('localnet')
            .withGasLimit(300_000_000)
            .buildTransaction();

        const accountOnNetwork = await this.client.getAccount(this.client.owner);
        this.client.ownerAccount.update(accountOnNetwork);

        transaction.setNonce(this.client.ownerAccount.getNonceThenIncrement());

        // First transaction deploys token manager
        let returnCode = await this.client.signAndSendTransaction(transaction);
        if (!returnCode.isSuccess()) {
            return false;
        }

        // Second transaction deploys token
        transaction.setValue('5000000000000000000'); // 5 EGLD for ESDT issue cost on localnet
        transaction.setNonce(this.client.ownerAccount.getNonceThenIncrement());

        returnCode = await this.client.signAndSendTransaction(transaction);
        if (!returnCode.isSuccess()) {
            return false;
        }

        // Third transaction mints tokens
        transaction.setValue('0');
        transaction.setNonce(this.client.ownerAccount.getNonceThenIncrement());

        returnCode = await this.client.signAndSendTransaction(transaction);

        return returnCode.isSuccess();
    }

    async deployRemoteInterchainToken(chainName: string, salt: string, minter: Address, destinationChain: string, fee: number) {
        // Remove 0x added by Ethereum for hex strings
        salt = salt.startsWith('0x') ? salt.substring(2) : salt;

        const contract = new SmartContract({ address: Address.fromBech32(this.itsFactoryContract) });
        const args = [
            new StringValue(chainName),
            new H256Value(Buffer.from(salt, 'hex')),
            new AddressValue(minter),
            new StringValue(destinationChain),
        ];
        const transaction = new Interaction(contract, new ContractFunction('deployRemoteInterchainToken'), args)
            .withSender(this.client.owner)
            .withChainID('localnet')
            .withGasLimit(300_000_000)
            .withValue(fee)
            .buildTransaction();

        const accountOnNetwork = await this.client.getAccount(this.client.owner);
        this.client.ownerAccount.update(accountOnNetwork);

        transaction.setNonce(this.client.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.client.signAndSendTransaction(transaction);

        return !returnCode.isSuccess();
    }

    async interchainTransfer(
        tokenId: string,
        destinationChain: string,
        destinationAddress: string,
        tokenIdentifier: string,
        amount: string,
        gasValue: string,
    ) {
        // Remove 0x added by Ethereum for hex strings
        tokenId = tokenId.startsWith('0x') ? tokenId.substring(2) : tokenId;

        const contract = new SmartContract({ address: Address.fromBech32(this.itsContract) });
        const args = [
            new H256Value(Buffer.from(tokenId, 'hex')),
            new StringValue(destinationChain),
            new StringValue(destinationAddress),
            new BytesValue(Buffer.from('')),
            new BigUIntValue(gasValue),
        ];
        const transaction = new Interaction(contract, new ContractFunction('interchainTransfer'), args)
            .withSingleESDTTransfer(TokenTransfer.fungibleFromBigInteger(tokenIdentifier, amount))
            .withSender(this.client.owner)
            .withChainID('localnet')
            .withGasLimit(100_000_000)
            .buildTransaction();

        const accountOnNetwork = await this.client.getAccount(this.client.owner);
        this.client.ownerAccount.update(accountOnNetwork);

        transaction.setNonce(this.client.ownerAccount.getNonceThenIncrement());

        const returnCode = await this.client.signAndSendTransaction(transaction);

        return returnCode.isSuccess();
    }
}

export async function registerMultiversXRemoteITS(multiversxNetwork: MultiversXNetwork, networks: Network[]) {
    logger.log(`Registerring ITS for ${networks.length} other chain for MultiversX...`);

    const accountOnNetwork = await multiversxNetwork.getAccount(multiversxNetwork.owner);
    multiversxNetwork.ownerAccount.update(accountOnNetwork);

    for (const network of networks) {
        const data = [] as string[];
        data.push(
            (
                await network.interchainTokenService.populateTransaction.setTrustedAddress(
                    'multiversx',
                    (multiversxNetwork.interchainTokenServiceAddress as Address).bech32(),
                )
            ).data as string,
        );

        await (await network.interchainTokenService.multicall(data)).wait();

        await multiversxNetwork.setInterchainTokenServiceTrustedAddress(network.name, network.interchainTokenService.address);
    }
    logger.log(`Done`);
}
