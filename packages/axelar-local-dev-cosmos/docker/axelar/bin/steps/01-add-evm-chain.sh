#!/bin/sh

CHAIN_ID=axelar
HOME=/root/private/.axelar
DEFAULT_KEYS_FLAGS="--keyring-backend test --home ${HOME}"
CHAIN=$1
DIR="$(dirname "$0")"

if [ -z "$CHAIN" ]
then
  echo "Chain name is required"
  exit 1
fi

docker exec axelar /bin/sh -c "axelard tx evm add-chain ${CHAIN} /root/private/bin/libs/params.json --generate-only \
--chain-id ${CHAIN_ID} --from \$(axelard keys show governance -a ${DEFAULT_KEYS_FLAGS}) --home ${HOME} \
--output json --gas 500000 &> ${HOME}/unsigned_msg.json"

docker exec axelar /bin/sh -c "cat ${HOME}/unsigned_msg.json"

sh "$DIR/../libs/broadcast-unsigned-multi-tx.sh"
