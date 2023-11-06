
#!/bin/sh

CHAIN_ID=axelar
HOME=/root/private/.axelar
DEFAULT_KEYS_FLAGS="--keyring-backend test --home ${HOME}"

echo "Registering broadcaster"
docker exec -it axelar /bin/sh -c "axelard tx snapshot register-proxy \$(axelard keys show owner -a ${DEFAULT_KEYS_FLAGS}) --generate-only \
--chain-id ${CHAIN_ID} --from \$(axelard keys show governance -a ${DEFAULT_KEYS_FLAGS}) ${DEFAULT_KEYS_FLAGS} \
--output json --gas 1000000 &> ${HOME}/unsigned_msg.json"
docker exec -t axelar /bin/sh -c "cat ${HOME}/unsigned_msg.json"
echo "Registered broadcaster"

sh broadcast-unsigned-tx.sh



