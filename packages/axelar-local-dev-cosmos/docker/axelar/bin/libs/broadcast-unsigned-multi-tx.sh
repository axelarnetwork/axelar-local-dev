#!/bin/sh

CHAIN_ID=axelar
HOME=/root/private/.axelar
DEFAULT_KEYS_FLAGS="--keyring-backend test --home ${HOME}"

## Sign unsigned transaction.
docker exec axelar /bin/sh -c "axelard tx sign ${HOME}/unsigned_msg.json --from gov1 \
--multisig \$(axelard keys show governance -a ${DEFAULT_KEYS_FLAGS}) \
--chain-id $CHAIN_ID ${DEFAULT_KEYS_FLAGS} &> ${HOME}/signed_tx.json"
docker exec axelar /bin/sh -c "cat ${HOME}/signed_tx.json"

## Multisign signed transaction.
docker exec axelar /bin/sh -c "axelard tx multisign ${HOME}/unsigned_msg.json governance ${HOME}/signed_tx.json \
--from owner --chain-id $CHAIN_ID ${DEFAULT_KEYS_FLAGS} &> ${HOME}/tx-ms.json"
docker exec axelar /bin/sh -c "cat ${HOME}/tx-ms.json"

## Broadcast multisigned transaction.
docker exec axelar /bin/sh -c "axelard tx broadcast ${HOME}/tx-ms.json ${DEFAULT_KEYS_FLAGS}"
