import { defaultAxelarChainInfo, AxelarRelayerService, startChains } from './index';
import { SigningStargateClient } from '@cosmjs/stargate';
import { encode } from '@metamask/abi-utils';

import {
    evmRelayer,
    createNetwork,
    deployContract,
    relay,
    RelayerType,
} from '@axelar-network/axelar-local-dev';

import { Contract, ethers } from 'ethers';


export const relayDataToEth = async () => {
    // Start both Axelar and Wasm Chains
    // await startChains();

    // Initialize the Axelar Relayer Service with default configuration
    const axelarRelayer = await AxelarRelayerService.create(
        defaultAxelarChainInfo
    );

    const CallContractWithToken = require('../artifacts/src/__tests__/contracts/ContractCallWithToken.sol/CallContractWithToken.json');

    const ethereumNetwork = await createNetwork({ name: 'Ethereum' });
    const ethereumContract = await deployContract(
        ethereumNetwork.userWallets[0],
        CallContractWithToken,
        [
            ethereumNetwork.gateway.address,
            ethereumNetwork.gasService.address,
        ]
    );

    // Deploy tokens
    const tokenContract = await ethereumNetwork.deployToken("USDC", "aUSDC", 6, BigInt(100_000e6));

    const ibcRelayer = axelarRelayer.ibcRelayer;

    console.log('IBC RELAYER', JSON.stringify(ibcRelayer.srcChannelId));

    const IBC_DENOM_AXL_USDC =
        // 'ubld';
        'ibc/5BDD47E9E73BF91C14497E254F0A751F1A7D3A6084343F66EA7CEE834A384651';
    const AMOUNT_IN_ATOMIC_UNITS = '10' + '000' + '000';
    const FEE = '1' + '000' + '000';
    const CHANNEL_ID = ibcRelayer.srcChannelId;
    const DENOM = 'ubld';
    const AXELAR_GMP_ADDRESS =
        'axelar1dv4u5k73pzqrxlzujxg3qp8kvc3pje7jtdvu72npnt5zhq05ejcsn5qme5';

    const signer = ibcRelayer.wasmClient;
    const senderAddress = 'agoric1estsewt6jqsx77pwcxkn5ah0jqgu8rhgflwfdl';

    const DESTINATION_ADDRESS = ethereumContract.address;
    const DESTINATION_CHAIN = 'Ethereum';

    const ADDRESS_TO_DEPOSIT = '0x20E68F6c276AC6E297aC46c84Ab260928276691D'

    const payload = encode(['address[]'], [[ADDRESS_TO_DEPOSIT]]);
    console.log('Balance of account before relaying', (await tokenContract.balanceOf(ADDRESS_TO_DEPOSIT)));

    const memo = {
        destination_chain: DESTINATION_CHAIN,
        destination_address: DESTINATION_ADDRESS,
        payload: Array.from(payload),
        fee: {
            amount: FEE,
            recipient: 'axelar1zl3rxpp70lmte2xr6c4lgske2fyuj3hupcsvcd',
        },
        type: 2,
    };

    const message = [
        {
            typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
            value: {
                sender: senderAddress,
                receiver: AXELAR_GMP_ADDRESS,
                token: {
                    denom: IBC_DENOM_AXL_USDC,
                    amount: AMOUNT_IN_ATOMIC_UNITS,
                },
                timeoutTimestamp: (Math.floor(Date.now() / 1000) + 600) * 1e9,
                sourceChannel: CHANNEL_ID,
                sourcePort: 'transfer',
                memo: JSON.stringify(memo),
            },
        },
    ];


    const fee = {
        gas: '250000',
        amount: [{ denom: DENOM, amount: '30000' }],
    };

    console.log('Preparing to send tokens...');
    const signingClient = await SigningStargateClient.connectWithSigner(
        'http://localhost/agoric-rpc',
        signer.owner
    );
    // Set up the Relayer for Wasm Chain
    evmRelayer.setRelayer(RelayerType.Agoric, axelarRelayer);

    console.log('Sending transaction...', message);
    const response = await signingClient.signAndBroadcast(
        senderAddress,
        message,
        fee
    );
    console.log('transaction response', response);

    // Relay messages between Ethereum and Agoric chains
    await relay({
        agoric: axelarRelayer,
        evm: evmRelayer,
    });


    console.log('Balance of account after relaying', (await tokenContract.balanceOf(ADDRESS_TO_DEPOSIT)));
    const ethereumMessage = await ethereumContract.storedMessage();
    console.log('Message on Ethereum Contract:', ethereumMessage);

};





















// import { defaultAxelarChainInfo, AxelarRelayerService, startChains } from './index';
// import { SigningStargateClient } from '@cosmjs/stargate';
// import { encode } from '@metamask/abi-utils';

// import {
//   evmRelayer,
//   createNetwork,
//   deployContract,
//   relay,
//   RelayerType,
//   contracts,
//   setupNetwork,
// } from '@axelar-network/axelar-local-dev';

// import { Wallet, ethers, getDefaultProvider } from 'ethers';

// export const relayDataToEth = async () => {
//   // Start both Axelar and Wasm Chains
//   // await startChains();
//   const chain: any = {
//     "name": "Ethereum",
//     "chainId": 2503,
//     "gateway": "0x013459EC3E8Aeced878C5C4bFfe126A366cd19E9",
//     "gasService": "0x28f8B50E1Be6152da35e923602a2641491E71Ed8",
//     "constAddressDeployer": "0x69aeB7Dc4f2A86873Dae8D753DE89326Cf90a77a",
//     "create3Deployer": "0x783E7717fD4592814614aFC47ee92568a495Ce0B",
//     "interchainTokenService": "0xc66bec212fb265f86703ff82599693Eb020e9f34",
//     "interchainTokenFactory": "0x5548588aCE4A15342856BC36576ceA6C97198086",
//     "tokens": {
//       "aUSDC": "aUSDC"
//     },
//     "rpc": "http://127.0.0.1:8500/3",
//     wallet: undefined,
//     contract: undefined,
//   };
//   // Initialize the Axelar Relayer Service with default configuration
//   const axelarRelayer = await AxelarRelayerService.create(
//     defaultAxelarChainInfo
//   );

//   const SendReceive = require('../artifacts/src/__tests__/contracts/SendReceive.sol/SendReceive.json');
//   const CallContractWithToken = require('../artifacts/src/__tests__/contracts/ContractCallWithToken.sol/CallContractWithToken.json');
//   // const CallContractWithToken = require('../artifacts/src/__tests__/contracts/ContractCallWithToken.sol/ExecutableWithToken.json');

//   // const ethereumNetwork = await createNetwork({ name: 'Ethereum' });
//   // const ethereumContract = await deployContract(
//   // ethereumNetwork.userWallets[0],
//   // CallContractWithToken,
//   // [
//   // ethereumNetwork.gateway.address,
//   // ethereumNetwork.gasService.address,
//   // // 'Ethereum',
//   // ]
//   // );

//   const wallet = new Wallet('0xe2d761246917948fa57c75ebe690bab0d214d6d968397487c3221b9563d946fe')
//   const provider = getDefaultProvider(chain.rpc);
//   chain.wallet = wallet.connect(provider);
//   await setupNetwork(provider, {
//     name: 'Ethereum',
//     // ownerKey: chain.wallet,
//     chainId: 2503,
//   })

//   // chain.contract = await deployContract(chain.wallet, CallContractWithToken, [chain.gateway, chain.gasService]);

//   const ibcRelayer = axelarRelayer.ibcRelayer;

//   console.log('IBC RELAYER', JSON.stringify(ibcRelayer.srcChannelId));

//   const IBC_DENOM_AXL_USDC =
//     'ubld';
//   // 'ibc/5BDD47E9E73BF91C14497E254F0A751F1A7D3A6084343F66EA7CEE834A384651';
//   const AMOUNT_IN_ATOMIC_UNITS = '10000000';
//   const CHANNEL_ID = ibcRelayer.srcChannelId;
//   const DENOM = 'ubld';
//   const AXELAR_GMP_ADDRESS =
//     'axelar1dv4u5k73pzqrxlzujxg3qp8kvc3pje7jtdvu72npnt5zhq05ejcsn5qme5';

//   const signer = ibcRelayer.wasmClient;
//   const senderAddress = 'agoric1estsewt6jqsx77pwcxkn5ah0jqgu8rhgflwfdl';
//   console.log(1);

//   console.log(await provider.getBlockNumber())
//   // TODO
//   // const ethAccount = ethereumNetwork.userWallets[0];
//   // const ethAdd = await ethAccount.getAddress();
//   // if (ethAdd !== ethAccount.address)
//   // throw new Error('wth');
//   // const DESTINATION_ADDRESS = chain.contract.address;
//   const DESTINATION_ADDRESS = '0x1aD9C268e5CDf4018cd1EBC50b1EBBcf967c34f3';
//   const DESTINATION_CHAIN = 'Ethereum';

//   const payload = encode(['address[]'], [['0x5B34876FFB1656710fb963ecD199C6f173c29267']]);

//   const memo = {
//     destination_chain: DESTINATION_CHAIN,
//     destination_address: DESTINATION_ADDRESS,
//     payload: Array.from(payload),
//     fee: null,
//     type: 2,
//   };

//   const message = [
//     {
//       typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
//       value: {
//         sender: senderAddress,
//         receiver: AXELAR_GMP_ADDRESS,
//         token: {
//           denom: IBC_DENOM_AXL_USDC,
//           amount: AMOUNT_IN_ATOMIC_UNITS,
//         },
//         timeoutTimestamp: (Math.floor(Date.now() / 1000) + 600) * 1e9,
//         sourceChannel: CHANNEL_ID,
//         sourcePort: 'transfer',
//         memo: JSON.stringify(memo),
//       },
//     },
//   ];


//   const fee = {
//     gas: '250000',
//     amount: [{ denom: DENOM, amount: '30000' }],
//   };

//   console.log('Preparing to send tokens...');
//   const signingClient = await SigningStargateClient.connectWithSigner(
//     'http://localhost/agoric-rpc',
//     signer.owner
//   );
//   // Set up the Relayer for Wasm Chain
//   evmRelayer.setRelayer(RelayerType.Agoric, axelarRelayer);

//   console.log('Sending transaction...', message);
//   const response = await signingClient.signAndBroadcast(
//     senderAddress,
//     message,
//     fee
//   );
//   console.log('transaction response', response);

//   console.log(await provider.getBlockNumber())
//   // Relay messages between Ethereum and Agoric chains
//   await relay({
//     agoric: axelarRelayer,
//     evm: evmRelayer,
//   });

//   // Setup for Ethereum Network and Wasm chain relayer
//   //

//   // // Deploy Smart Contract on the EVM (Ethereum Virtual Machine)
//   // // const ethereumContract = await deployContract(
//   // // ethereumNetwork.userWallets[0],
//   // // SendReceive,
//   // // [
//   // // ethereumNetwork.gateway.address,
//   // // ethereumNetwork.gasService.address,
//   // // 'Ethereum',
//   // // ]
//   // // );

//   // // Deploy Contract on the Wasm Chain
//   // const wasmFilePath = path.resolve(__dirname, '../wasm/send_receive.wasm');
//   // const wasmUploadResponse = await wasmClient1.uploadWasm(wasmFilePath);

//   // // Instantiate the Wasm Contract
//   // const { client: wasmClient, address: wasmSenderAddress } =
//   // await wasmClient1.createFundedSigningClient();

//   // const wasmContractInstantiation = await wasmClient.instantiate(
//   // wasmSenderAddress,
//   // wasmUploadResponse.codeId,
//   // {
//   // channel: ibcRelayer.srcChannelId,
//   // },
//   // 'send_receive',
//   // 'auto'
//   // );
//   // // ============ SETUP END ============

//   // const messageToEthereum = 'Hello from Ethereum';
//   // const messageToWasm = 'Hello from Wasm';

//   // // Send a message from Wasm Chain to Ethereum Chain
//   // const wasmTransaction = await wasmClient.execute(
//   // wasmSenderAddress,
//   // wasmContractInstantiation.contractAddress,
//   // {
//   // send_message_evm: {
//   // destination_chain: 'Ethereum',
//   // destination_address: ethereumContract.address,
//   // message: messageToWasm,
//   // },
//   // },
//   // 'auto',
//   // 'test',
//   // [{ amount: '100000', denom: 'uwasm' }]
//   // );
//   // console.log('Wasm Chain Transaction Hash:', wasmTransaction.transactionHash);

//   // // Send a message from Ethereum Chain to Wasm Chain
//   // const ethereumTransaction = await ethereumContract.send(
//   // 'agoric',
//   // wasmContractInstantiation.contractAddress,
//   // messageToEthereum,
//   // {
//   // value: ethers.utils.parseEther('0.001'),
//   // }
//   // );
//   // console.log('Ethereum Chain Transaction Hash:', ethereumTransaction.hash);



//   // // Verify the message on the Ethereum contract
//   // const ethereumMessage = await chain.contract.storedMessage();
//   // console.log('Message on Ethereum Contract:', ethereumMessage);
//   console.log(await provider.getBlockNumber())
//   // console.log(await ethAccount.getBalance())
//   // console.log(await ethereumNetwork.provider.getLogs({fromBlock:0}))

//   // // Verify the message on the Wasm contract
//   // const wasmResponse = await wasmClient1.client.queryContractSmart(
//   // wasmContractInstantiation.contractAddress,
//   // {
//   // get_stored_message: {},
//   // }
//   // );

//   // console.log('Message on Wasm Contract:', wasmResponse);
// };