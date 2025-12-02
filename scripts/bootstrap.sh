#!/bin/bash

if [ "$CI" = "true" ]; then
    echo "Running Lerna bootstrap in CI (skipping optional deps)..."
    lerna bootstrap --hoist -- --no-optional
else
    echo "Running normal Lerna bootstrap..."
    lerna bootstrap
fi
