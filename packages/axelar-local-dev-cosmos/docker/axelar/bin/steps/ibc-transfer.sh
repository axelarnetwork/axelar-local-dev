#!/bin/sh

CHAIN_ID=axelar
HOME=/root/private/.axelar
DEFAULT_KEYS_FLAGS="--keyring-backend test --home ${HOME}"
DENOM=uausdc
DIR="$(dirname "$0")"

IBC_COMMAND="axelard tx ibc-transfer transfer transfer channel-0 agoric1estsewt6jqsx77pwcxkn5ah0jqgu8rhgflwfdl 10000000000uausdc"

echo "Transferring asset ${DENOM}"
docker exec axelar /bin/sh -c "$IBC_COMMAND  --generate-only --from \$(axelard keys show governance -a ${DEFAULT_KEYS_FLAGS}) ${DEFAULT_KEYS_FLAGS} \
--output json --gas 500000 > ${HOME}/unsigned_msg.json"
docker exec axelar /bin/sh -c "cat ${HOME}/unsigned_msg.json"
echo "Transferred asset ${DENOM}"

sh "$DIR/../libs/broadcast-unsigned-multi-tx.sh"
