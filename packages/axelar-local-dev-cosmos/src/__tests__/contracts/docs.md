## Deploying Factory of Factory:

```
> yarn deploy -- eth-sepolia

yarn run v1.22.22
warning package.json: No license field
warning From Yarn 1.0 onwards, scripts don't require "--" for options to be forwarded. In a future version, any explicit "--" will be forwarded as-is to the scripts.
$ cd packages/axelar-local-dev-cosmos && ./scripts/deploy.sh eth-sepolia
No existing deployment folder to delete: ignition/deployments
✔ Confirm deploy to network eth-sepolia (11155111)? … yes
Deploying FactoryFactory with Gateway: 0xe432150cce91c13a887f7D836923d5597adD8E31
Deploying FactoryFactory with Gas Service: 0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6
Hardhat Ignition 🚀

Deploying [ FactoryFactoryModule ]

Batch #1
  Executed FactoryFactoryModule#FactoryFactory

[ FactoryFactoryModule ] successfully deployed 🚀

Deployed Addresses

FactoryFactoryModule#FactoryFactory - 0xbd358a4951c18c53293D655E4032945A1697040e

Verifying deployed contracts

Verifying contract "src/__tests__/contracts/FactoryFactory.sol:FactoryFactory" for network sepolia...
Successfully verified contract "src/__tests__/contracts/FactoryFactory.sol:FactoryFactory" for network sepolia:
  - https://sepolia.etherscan.io/address/0xbd358a4951c18c53293D655E4032945A1697040e#code

Done in 75.29s.
```

Contract Address: `0xbd358a4951c18c53293D655E4032945A1697040e`

## Creating Factory of Factory

- Transaction to create a Factory of Factory:
  https://testnet.axelarscan.io/gmp/0x16264bcecec64a632445c125b8700f3feeadfd1344258e67157e8dee9a8ac91e-333940086

https://sepolia.etherscan.io/tx/0x1651978f6a098cac862867ce6e524e4e71313fa220b642a2efa0111f6c4db1fa#eventlog

Factory Owner: `agoric1rwwley550k9mmk6uq6mm6z4udrg8kyuyvfszjk`

Factory Address: https://sepolia.etherscan.io/address/0xf44cEC9a4C9a4c3a95Da59c7F3C5B50F298675B4

## Creating a Remote Wallet using Owned Factory

- Transaction to create a wallet:
  https://testnet.axelarscan.io/gmp/0x84759bd05f972f910b9cbc05682843b1da4a2dc1388236d58ac17f8e4061881b-333940154

- Smart Wallet created successfully:
  https://sepolia.etherscan.io/address/0xf75C0Ea7df284D20330E5d526F67cCB56aD5E55B

## Trying to call Owned Factory with some other agoric wallet

Calling Owned Factory with `agoric1ee9hr0jyrxhy999y755mp862ljgycmwyp4pl7q` with instead of owner `agoric1rwwley550k9mmk6uq6mm6z4udrg8kyuyvfszjk`. Tx failed:
https://testnet.axelarscan.io/gmp/0xee67a074cca2b407be0dcb1485a48803364de4d97c50dfd48b5d13f961d80cb0-333940157
