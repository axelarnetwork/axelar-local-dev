#!/bin/sh

DENOM=ubld
CHAIN_ID=agoriclocal
MONIKER=agoric
HOME=/root/private/.agoric

# Removing the existing directory to start with a clean slate
rm -rf ${HOME}/*
mnemonic="soap hub stick bomb dish index wing shield cruel board siren force glory assault rotate busy area topple resource okay clown wedding hint unhappy"
echo ${mnemonic} | tr -d "\n" >${HOME}/mnemonic.txt
echo "Added new key 'owner'"
