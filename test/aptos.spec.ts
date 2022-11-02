import { AptosNetwork } from '../src/aptos';

describe('aptos', () => {
    it('should be able to deploy axelar framework modules', async () => {
        const client = new AptosNetwork('http://localhost:8080');
        console.log("Owner's balance before deployment: ", await client.getOwnerBalance());
        const tx = await client.deployAxelarFrameworkModules();
        expect(tx.vm_status).toBe('Executed successfully');
    });
});
