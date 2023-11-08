
#!/bin/sh

CHAIN_ID=axelar
HOME=/root/private/.axelar
DEFAULT_KEYS_FLAGS="--keyring-backend test --home ${HOME}"
DIR="$(dirname "$0")"

docker exec axelar /bin/sh -c "axelard tx snapshot register-proxy \$(axelard keys show gov1 -a ${DEFAULT_KEYS_FLAGS}) \
--chain-id ${CHAIN_ID} --from owner ${DEFAULT_KEYS_FLAGS} \
--output json --gas 1000000"

docker exec axelar /bin/sh -c "axelard tx nexus register-chain-maintainer avalanche ethereum fantom moonbeam polygon \
--chain-id ${CHAIN_ID} --from gov1 ${DEFAULT_KEYS_FLAGS} \
--output json --gas 1000000"


