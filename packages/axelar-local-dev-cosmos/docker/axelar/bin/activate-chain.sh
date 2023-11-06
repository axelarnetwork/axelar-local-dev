#!/bin/sh

CHAIN_ID=axelar
HOME=/root/private/.axelar
DEFAULT_KEYS_FLAGS="--keyring-backend test --home ${HOME}"
CHAIN=$1

if [ -z "$CHAIN" ]
then
  echo "Chain name is required"
  exit 1
fi

echo "Activating chain ${CHAIN}"
docker exec -it axelar /bin/sh -c "axelard tx nexus activate-chain ${CHAIN} --generate-only \
--chain-id ${CHAIN_ID} --from \$(axelard keys show governance -a ${DEFAULT_KEYS_FLAGS}) --home ${HOME} \
--output json --gas 500000 &> ${HOME}/unsigned_msg.json"
echo "Activated chain ${CHAIN}"
docker exec -t axelar /bin/sh -c "cat ${HOME}/unsigned_msg.json"

sh broadcast-unsigned-tx.sh
