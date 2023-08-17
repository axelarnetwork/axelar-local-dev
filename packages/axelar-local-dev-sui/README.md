# Axelar Local Dev Sui

## Running Local Sui Network

1. Clone the repository

```bash
git clone https://github.com/MystenLabs/sui.git
```

2. cd into sui directory and run the following commmand

```bash
RUST_LOG="consensus=off" cargo run --bin sui-test-validator
```

> Important: Each time you start the sui-test-validator, the network starts as a new network with no previous data. The local network is not persistent.

```
OPTIONS:
  --epoch-duration-ms <EPOCH_DURATION_MS>
      The duration for epochs (defaults to one minute) [default: 60000]

  --faucet-port <FAUCET_PORT>
      Port to start the Sui faucet on [default: 9123]

  --fullnode-rpc-port <FULLNODE_RPC_PORT>
      Port to start the Fullnode RPC server on [default: 9000]
```

See more: https://docs.sui.io/build/install#start-the-local-network

##
