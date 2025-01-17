#!/bin/sh

CHAIN_ID=axelar
HOME=/root/private/.axelar
DEFAULT_KEYS_FLAGS="--keyring-backend test --home ${HOME}"
CHAIN=$1
# DENOM=${2:-uwasm}
DENOM=${2:-ibc/295548A78785A1007F232DE286149A6FF512F180AF5657780FC89C009E2C348F}
DIR="$(dirname "$0")"

if [ -z "$CHAIN" ]
then
  echo "Chain name is required"
  exit 1
fi

echo "Registering asset ${CHAIN} ${DENOM}"
docker exec axelar /bin/sh -c "axelard tx axelarnet register-asset ${CHAIN} ${DENOM} --is-native-asset --generate-only \
--chain-id ${CHAIN_ID} --from \$(axelard keys show governance -a ${DEFAULT_KEYS_FLAGS}) ${DEFAULT_KEYS_FLAGS} \
--output json --gas 500000 > ${HOME}/unsigned_msg.json"
docker exec axelar /bin/sh -c "cat ${HOME}/unsigned_msg.json"
echo "Registered asset ${CHAIN} ${DENOM}"

sh "$DIR/../libs/broadcast-unsigned-multi-tx.sh"
