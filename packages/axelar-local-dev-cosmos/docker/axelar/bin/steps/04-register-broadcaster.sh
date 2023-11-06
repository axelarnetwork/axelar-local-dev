
#!/bin/sh

CHAIN_ID=axelar
HOME=/root/private/.axelar
DEFAULT_KEYS_FLAGS="--keyring-backend test --home ${HOME}"
DIR="$(dirname "$0")"

# 1. Register broadcaster
echo "Registering broadcaster"
docker exec -it axelar /bin/sh -c "axelard tx snapshot register-proxy \$(axelard keys show gov1 -a ${DEFAULT_KEYS_FLAGS}) \
--chain-id ${CHAIN_ID} --from owner ${DEFAULT_KEYS_FLAGS} \
--output json --gas 1000000"
echo "Registered broadcaster"

# Read the content of the local file and append it to the file inside the Docker container
docker exec -t axelar /bin/sh -c "cat /root/private/bin/libs/evm-rpc.toml >> "$HOME"/config/config.toml"
echo "Added evm-rpc.toml to config.toml"

# 2. Register broadcaster as a maintainerf
echo "Registering maintainer"
docker exec -it axelar /bin/sh -c "axelard tx nexus register-chain-maintainer avalanche ethereum fantom moonbeam polygon \
--chain-id ${CHAIN_ID} --from gov1 ${DEFAULT_KEYS_FLAGS} \
--output json --gas 1000000"

echo "Registered maintainer"




