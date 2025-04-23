import path from 'path';
import { CosmosClient } from '..';

describe('CosmosClient', () => {
  let wasmClient: CosmosClient;
  let axelarClient: CosmosClient;

  beforeAll(async () => {
    wasmClient = await CosmosClient.create('wasm');
    axelarClient = await CosmosClient.create('axelar');
  });

  it('should be able to upload wasm contract', async () => {
    const _path = path.resolve(__dirname, '../..', 'wasm/multi_send.wasm');
    const response = await wasmClient.uploadWasm(_path);
    expect(response).toBeDefined();
  });

  it('should be able to send tokens to given address on wasm', async () => {
    const recipient = 'wasm1puut77ku823785u3c7aalwqdrawe3lnjgwt89v';
    const amount = '1000000';
    const initialBalance = await wasmClient.getBalance(recipient);
    await wasmClient.fundWallet(recipient, amount);
    const balance = await wasmClient.getBalance(recipient);
    expect(parseInt(balance)).toBe(parseInt(initialBalance) + parseInt(amount));
  });

  it('should be able to send tokens to given address on axelar', async () => {
    const recipient = 'axelar1puut77ku823785u3c7aalwqdrawe3lnjxuv68x';
    const amount = '1000000';
    const initialBalance = await axelarClient.getBalance(recipient);
    await axelarClient.fundWallet(recipient, amount);
    const balance = await axelarClient.getBalance(recipient);
    expect(parseInt(balance)).toBe(parseInt(initialBalance) + parseInt(amount));
  });
});
