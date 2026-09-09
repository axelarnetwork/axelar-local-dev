import { SuiTransactionBlockResponse } from '@mysten/sui.js/client';

export interface PublishedPackage {
    packageId: string;
    modules: string[];
}

export interface DeployedPackage extends PublishedPackage {
    deployedAt: number;
}

export interface DeployResult {
    digest: string;
    packages: DeployedPackage[];
    publishTxn: SuiTransactionBlockResponse;
}
