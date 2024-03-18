#!/bin/bash

CHAIN=${1:-wasm}
DIR="$(dirname "$0")"

sh "$DIR/../libs/activate-chain.sh" ${CHAIN}
