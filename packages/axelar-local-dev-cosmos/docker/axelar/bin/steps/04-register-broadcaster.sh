
#!/bin/sh

CHAIN_ID=axelar
HOME=/root/private/.axelar
DEFAULT_KEYS_FLAGS="--keyring-backend test --home ${HOME}"
DIR="$(dirname "$0")"

docker exec axelar /bin/sh -c "axelard tx snapshot register-proxy \$(axelard keys show gov1 -a ${DEFAULT_KEYS_FLAGS}) \
--chain-id ${CHAIN_ID} --from owner ${DEFAULT_KEYS_FLAGS} \
--output json --gas 1000000"

# Read the content of the local file and append it to the file inside the Docker container
docker exec axelar /bin/sh -c "cat /root/private/bin/libs/evm-rpc.toml >> "$HOME"/config/config.toml"

# 2. Register broadcaster as a maintainerf
docker exec axelar /bin/sh -c "axelard tx nexus register-chain-maintainer avalanche ethereum fantom moonbeam polygon \
--chain-id ${CHAIN_ID} --from gov1 ${DEFAULT_KEYS_FLAGS} \
--output json --gas 1000000"


