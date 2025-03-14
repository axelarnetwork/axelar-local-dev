#!/bin/sh

DENOM=uaxl
CHAIN_ID=axelar
MONIKER=axelar
HOME=/root/private/.axelar

# Removing the existing directory to start with a clean slate
rm -rf ${HOME}/*

DEFAULT_KEYS_FLAGS="--keyring-backend test --home ${HOME}"
ASSETS="100000000000000000000${DENOM},10000000000000000uausdc"

# Initializing a new blockchain with identifier ${CHAIN_ID} in the specified home directory
axelard init "$MONIKER" --chain-id ${CHAIN_ID} --home ${HOME} > /dev/null 2>&1 && echo "Initialized new blockchain with chain ID ${CHAIN_ID}"

# edit the app.toml file to enable the API and swagger
sed -i '/\[api\]/,/\[/ s/enable = false/enable = true/' "$HOME"/config/app.toml
sed -i '/\[api\]/,/\[/ s/swagger = false/swagger = true/' "$HOME"/config/app.toml

# staking/governance token is hardcoded in config, change this
sed -i "s/\"stake\"/\"$DENOM\"/" "$HOME"/config/genesis.json && echo "Updated staking token to $DENOM"

# Counter for poll number, which is reset when chain is restarted
echo '0' > $HOME/poll-counter.txt
chmod 666 $HOME/poll-counter.txt

mnemonic="sunset proud calm real denial process fish coconut sad glass toward duty argue aisle rack arrive bleak suffer invest general animal lift swarm front"
gov1_mnemonic="smile unveil sketch gaze length bulb goddess street case exact table fetch robust chronic power choice endorse toward pledge dish access sad illegal dance"

final_output=$(
    jq  '.app_state.nexus.chain_states += 
    [{
      "chain": {
        "name": "agoric",
        "supports_foreign_assets": true,
        "key_type": "KEY_TYPE_NONE",
        "module": "axelarnet"
      },
      "activated": false,
      "assets": [
        {
          "denom": "ubld",
          "is_native_asset": true
        },
        {
          "denom": "uausdc",
          "is_native_asset": false
        }
      ],
      "maintainer_states": []
    },
    {
      "chain": {
        "name": "Ethereum",
        "supports_foreign_assets": true,
        "key_type": "KEY_TYPE_MULTISIG",
        "module": "evm"
      },
      "activated": false,
      "assets": [
        {
          "denom": "ubld",
          "is_native_asset": false
        },
        {
          "denom": "uausdc",
          "is_native_asset": false
        }
      ],
      "maintainer_states": []
    }]
    ' "$HOME"/config/genesis.json | jq '.app_state.nexus.chain_states[0].assets += 
    [{
      "denom": "uausdc",
      "is_native_asset": false
    },
    {
      "denom": "ubld",
      "is_native_asset": false
    }]' | jq '.app_state.evm.chains[0].gateway.address = 
    [
      65,  97, 201,  20, 243, 101,
      90,  90, 204, 118, 189, 175,
      227, 219, 229, 192, 249,  71,
      75, 200
    ]
  ' | jq '.app_state.snapshot.proxied_validators += 
    [{
      "validator": "axelarvaloper1sufx2ryp5ndxdhl3zftdnsjwrgqqgd3q63svql",
      "proxy": "axelar1kcreerqvlvtful5r6hp8nt7mj4fd0z0rq9mxk5",
      "active": true
    }]
  '  | jq '.app_state.feegrant.allowances += 
    [{
      "granter": "axelar1sufx2ryp5ndxdhl3zftdnsjwrgqqgd3q6sxfjs",
      "grantee": "axelar1kcreerqvlvtful5r6hp8nt7mj4fd0z0rq9mxk5",
      "allowance": {
        "@type": "/cosmos.feegrant.v1beta1.BasicAllowance",
        "expiration": null,
        "spend_limit": [{
          "denom": "uaxl",
          "amount": "10000000000000000000000000000000000000000000000000"
        }]
      }
    }]
  ')
  
echo $final_output | jq . > "$HOME"/config/genesis.json

cat "$HOME"/config/genesis.json


# Adding a new key named 'owner' with a test keyring-backend in the specified home directory
# and storing the mnemonic in the mnemonic.txt file
echo ${mnemonic} | axelard keys add owner --recover ${DEFAULT_KEYS_FLAGS} 2>&1 | tail -n 1
echo ${mnemonic} | tr -d "\n" > ${HOME}/mnemonic.txt
echo "Added new key 'owner'"

echo ${gov1_mnemonic} | axelard keys add gov1 --recover ${DEFAULT_KEYS_FLAGS} 2>&1 | tail -n 1
echo ${gov1_mnemonic} | tr -d "\n" > ${HOME}/mnemonic-gov1.txt
echo "Added new key 'gov1'"

gov2_mnemonic=$(axelard keys add gov2 ${DEFAULT_KEYS_FLAGS} 2>&1 | tail -n 1)
echo ${gov2_mnemonic} | tr -d "\n" > ${HOME}/mnemonic-gov2.txt
echo "Added new key 'gov2'"

$(axelard keys add governance --multisig "gov1,gov2" --multisig-threshold 1 --nosort ${DEFAULT_KEYS_FLAGS} 2>&1 | tail -n 1)
echo "Added new key 'governance'"

# Adding a new genesis account named 'owner' with an initial balance of 100000000000000000000 in the blockchain
axelard add-genesis-account owner ${ASSETS} \
--home ${HOME} \
--keyring-backend test > /dev/null 2>&1 && echo "Added 'owner' to genesis account"

axelard add-genesis-account gov1 ${ASSETS} \
--home ${HOME} \
--keyring-backend test > /dev/null 2>&1 && echo "Added 'gov1' to genesis account"

axelard add-genesis-account gov2 ${ASSETS} \
--home ${HOME} \
--keyring-backend test > /dev/null 2>&1 && echo "Added 'gov2' to genesis account"

axelard add-genesis-account governance ${ASSETS} \
--home ${HOME} \
--keyring-backend test > /dev/null 2>&1 && echo "Added 'governance' to genesis account"

axelard set-genesis-mint --inflation-min 0 --inflation-max 0 --inflation-max-rate-change 0 --home ${HOME}
axelard set-genesis-gov --minimum-deposit "100000000${DENOM}" --max-deposit-period 90s --voting-period 90s --home ${HOME}
axelard set-genesis-reward --external-chain-voting-inflation-rate 0 --home ${HOME}
axelard set-genesis-slashing --signed-blocks-window 35000 --min-signed-per-window 0.50 --home ${HOME} \
--downtime-jail-duration 600s --slash-fraction-double-sign 0.02 --slash-fraction-downtime 0.0001 --home ${HOME}
axelard set-genesis-snapshot --min-proxy-balance 5000000 --home ${HOME}
axelard set-genesis-staking  --unbonding-period 168h --max-validators 50 --bond-denom "$DENOM" --home ${HOME}
axelard set-genesis-chain-params evm Ethereum --evm-network-name ethereum --evm-chain-id 5 --network ethereum --confirmation-height 1 --revote-locking-period 5 --home ${HOME}

GOV_1_KEY="$(axelard keys show gov1 ${DEFAULT_KEYS_FLAGS} -p)"
GOV_2_KEY="$(axelard keys show gov2 ${DEFAULT_KEYS_FLAGS} -p)"
axelard set-governance-key 1 "$GOV_1_KEY" "$GOV_2_KEY" --home ${HOME}
axelard validate-genesis --home ${HOME}

# Generating a new genesis transaction for 'owner' delegating 70000000${DENOM} in the blockchain with the specified chain-id
axelard gentx owner 70000000${DENOM} \
--home ${HOME} \
--keyring-backend test \
--moniker ${MONIKER} \
--chain-id ${CHAIN_ID} > /dev/null 2>&1 && echo "Generated genesis transaction for 'owner'"

# Collecting all genesis transactions to form the genesis block
axelard collect-gentxs \
--home ${HOME} > /dev/null 2>&1 && echo "Collected genesis transactions"

# Read the content of the local file and append it to the file inside the Docker container
cat /root/private/bin/libs/evm-rpc.toml >> "$HOME"/config/config.toml

# Starting the blockchain node with the specified home directory
axelard start --home ${HOME} \
--minimum-gas-prices 0${DENOM} \
--moniker ${MONIKER} \
--rpc.laddr "tcp://0.0.0.0:26657" \
--log_level debug

