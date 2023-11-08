#!/bin/sh

CHAIN=${1:-ethereum}
DIR="$(dirname "$0")"

sh "$DIR/../libs/activate-chain.sh" ${CHAIN}
