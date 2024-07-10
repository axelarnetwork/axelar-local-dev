import { MultiversXNetwork } from './MultiversXNetwork';
import fs from 'fs';
import path from 'path';

export let multiversXNetwork: MultiversXNetwork;

export interface MultiversXNetworkConfig {
    gatewayUrl: string;
}

export interface MultiversXConfig {
    axelarAuthAddress: string;
    axelarGatewayAddress: string;
    axelarGasReceiverAddress: string;
    interchainTokenServiceAddress: string;
    interchainTokenFactoryAddress: string;
    contractAddress?: string;
}

export function updateMultiversXConfig(contractAddress: string) {
    const currentConfig = getMultiversXConfig() as MultiversXConfig;

    createMultiversXConfig({
        ...currentConfig,
        contractAddress,
    });
}

function createMultiversXConfig(config: MultiversXConfig) {
    console.log('Creating MultiversX config file...');

    const configPath = path.join(__dirname, '..', 'multiversxConfig.json');
    fs.writeFileSync(configPath, JSON.stringify(config));
}

function getMultiversXConfig(): MultiversXConfig | undefined {
    const configPath = path.join(__dirname, '..', 'multiversxConfig.json');

    if (!fs.existsSync(configPath)) {
        console.log('MultiversX config file not found');

        return undefined;
    }

    const contents = fs.readFileSync(configPath);

    return JSON.parse(contents.toString());
}

export async function createMultiversXNetwork(config?: MultiversXNetworkConfig): Promise<MultiversXNetwork> {
    const configFile = getMultiversXConfig();

    const gatewayUrl = config?.gatewayUrl || 'http://127.0.0.1:7950';
    const loadingMultiversXNetwork = new MultiversXNetwork(
        gatewayUrl,
        configFile?.axelarGatewayAddress,
        configFile?.axelarAuthAddress,
        configFile?.axelarGasReceiverAddress,
        configFile?.interchainTokenServiceAddress,
        configFile?.interchainTokenFactoryAddress,
        configFile?.contractAddress,
    );

    // Check if whether the gateway is deployed
    const isGatewayDeployed = await loadingMultiversXNetwork.isGatewayDeployed();

    // Deploy multiversx framework modules, skip if already deployed
    if (!isGatewayDeployed) {
        try {
            const multiversXConfig = await loadingMultiversXNetwork.deployAxelarFrameworkModules();

            createMultiversXConfig(multiversXConfig);

            console.log('Deployed Axelar Framework modules for MultiversX');
        } catch (e) {
            console.error(e);
        }
    } else {
        console.log(`MultiversX Axelar Gateway contract is already deployed at ${loadingMultiversXNetwork.gatewayAddress}`);
    }

    multiversXNetwork = loadingMultiversXNetwork;

    return multiversXNetwork;
}

export async function loadMultiversXNetwork(
    gatewayUrl = 'http://127.0.0.1:7950',
) {
    const configFile = getMultiversXConfig();

    multiversXNetwork = new MultiversXNetwork(
        gatewayUrl,
        configFile?.axelarGatewayAddress,
        configFile?.axelarAuthAddress,
        configFile?.axelarGasReceiverAddress,
        configFile?.interchainTokenServiceAddress,
        configFile?.interchainTokenFactoryAddress,
        configFile?.contractAddress,
    );

    const isGatewayDeployed = await multiversXNetwork.isGatewayDeployed();

    if (!isGatewayDeployed) {
        throw new Error('Axelar Gateway contract is not deployed on MultiversX!');
    }

    return multiversXNetwork;
}
