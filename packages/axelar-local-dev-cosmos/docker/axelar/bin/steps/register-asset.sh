#!/bin/sh

CHAIN_ID=axelar
HOME=/root/private/.axelar
DEFAULT_KEYS_FLAGS="--keyring-backend test --home ${HOME}"
CHAIN=$1
DENOM=${2:-uausdc}
DIR="$(dirname "$0")"

if [ -z "$CHAIN" ]
then
  echo "Chain name is required"
  exit 1
fi

REGISTER="axelard tx axelarnet register-asset ${CHAIN} ${DENOM} --chain-id ${CHAIN_ID} "

echo "Registering asset ${CHAIN} ${DENOM}"
docker exec axelar /bin/sh -c "$REGISTER  --generate-only --from \$(axelard keys show governance -a ${DEFAULT_KEYS_FLAGS}) ${DEFAULT_KEYS_FLAGS} \
--output json --gas 500000 > ${HOME}/unsigned_msg.json"
docker exec axelar /bin/sh -c "cat ${HOME}/unsigned_msg.json"
echo "Registered asset ${CHAIN} ${DENOM}"

sh "$DIR/../libs/broadcast-unsigned-multi-tx.sh"
