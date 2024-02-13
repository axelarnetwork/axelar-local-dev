import { logger, Network } from '@axelar-network/axelar-local-dev';
import { MultiversXNetwork } from './MultiversXNetwork';
import {
    Address, BigUIntValue, BytesValue,
    ContractFunction,
    H256Value, Interaction,
    ResultsParser,
    SmartContract,
    StringValue, TokenTransfer
} from '@multiversx/sdk-core/out';

export class MultiversXITS {
    private readonly client;
    private readonly itsContract;

    constructor(client: MultiversXNetwork, itsContract: string) {
        this.client = client;
        this.itsContract = itsContract;
    }

    async getValidTokenIdentifier(tokenId: string): Promise<string | null> {
        // Remove 0x added by Ethereum for hex strings
        tokenId = tokenId.startsWith('0x') ? tokenId.substring(2) : tokenId;

        try {
            const result = await this.client.callContract(this.itsContract, "validTokenIdentifier", [new H256Value(Buffer.from(tokenId, 'hex'))]);

            const parsedResult = new ResultsParser().parseUntypedQueryResponse(result);

            return parsedResult.values[0].toString();
        } catch (e) {
            return null;
        }
    }

    async interchainTransfer(tokenId: string, destinationChain: string, destinationAddress: string, tokenIdentifier: string, amount: string) {
        // Remove 0x added by Ethereum for hex strings
        tokenId = tokenId.startsWith('0x') ? tokenId.substring(2) : tokenId;

        const contract = new SmartContract({ address: Address.fromBech32(this.itsContract) });
        const args = [
            new H256Value(Buffer.from(tokenId, 'hex')),
            new StringValue(destinationChain),
            new StringValue(destinationAddress),
            new BytesValue(Buffer.from('')),
            new BigUIntValue(0),
        ];
        const transaction = new Interaction(contract, new ContractFunction("interchainTransfer"), args)
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
    for (const network of networks) {
        const data = [] as string[];
        data.push(
            (
                await network.interchainTokenService.populateTransaction.setTrustedAddress(
                    'multiversx',
                    (multiversxNetwork.interchainTokenServiceAddress as Address).bech32(),
                )
            ).data as string
        );

        await (await network.interchainTokenService.multicall(data)).wait();

        await multiversxNetwork.setInterchainTokenServiceTrustedAddress(network.name, network.interchainTokenService.address);
    }
    logger.log(`Done`);
}
