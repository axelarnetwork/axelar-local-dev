import { chains, getEVMChains, wallet, calculateBridgeFee, getDepositAddress } from './utils';
const { Contract, getDefaultProvider } = require('ethers');

const AxelarGatewayContract = require(
    '../packages/axelar-local-dev/src/artifacts/@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGateway.sol/IAxelarGateway.json',
);
const AxelarGasServiceContract = require(
    '../packages/axelar-local-dev/src/artifacts/@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol/IAxelarGasService.json',
);
const IERC20 = require('../packages/axelar-local-dev/src/artifacts/@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IERC20.sol/IERC20.json');

executeMultiversXExample(getEVMChains(chains), [], wallet, require('./call-contract'))

async function executeMultiversXExample(chains, args, wallet, example) {
    for (const chain of chains) {
        chain.provider = getDefaultProvider(chain.rpc);
        const connectedWallet = wallet.connect(chain.provider);

        // Initialize contracts to chain object.
        deserializeContract(chain, connectedWallet);

        // Recover axelar contracts to chain object.
        chain.gateway = new Contract(chain.gateway, AxelarGatewayContract.abi, connectedWallet);
        chain.gasService = new Contract(chain.gasService, AxelarGasServiceContract.abi, connectedWallet);
        const tokenAddress = await chain.gateway.tokenAddresses('aUSDC');
        chain.usdc = new Contract(tokenAddress, IERC20.abi, connectedWallet);
    }

    // Get destination chains.
    // TODO: Change these
    const destination = chains.find((chain) => chain.name === 'Ethereum');

    // Execute the example script.
    await example.execute(chains, wallet, {
        destination,
    });

    if (!process.env.TEST) {
        process.exit(0);
    }
}

function deserializeContract(chain, wallet) {
    // Loop through every keys in the chain object.
    for (const key of Object.keys(chain)) {
        // If the object has an abi, it is a contract.

        if (chain[key].abi) {
            // Get the contract object.
            const contract = chain[key];

            // Deserialize the contract. Assign the contract to the chain object.
            chain[key] = new Contract(contract.address, contract.abi, wallet);
        }
    }

    return chain;
}
