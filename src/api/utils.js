'use strict';


const {
  utils: {
    defaultAbiCoder,
    id,
    arrayify,
    keccak256,
  },
} = require('ethers');

const { sortBy } = require('lodash');

const getRandomInt = (max) => {
  return Math.floor(Math.random() * max);
};

module.exports = {
  bigNumberToNumber: (bigNumber) => bigNumber.toNumber(),

  getSignedExecuteInput: (data, wallet) =>
    wallet
      .signMessage(arrayify(keccak256(data)))
      .then((signature) =>
        defaultAbiCoder.encode(['bytes', 'bytes'], [data, signature]),
      ),

  getSignedMultisigExecuteInput: (data, wallets) =>
    Promise.all(
      sortBy(wallets, (wallet) => wallet.address.toLowerCase()).map((wallet) =>
        wallet.signMessage(arrayify(keccak256(data))),
      ),
    ).then((signatures) =>
      defaultAbiCoder.encode(['bytes', 'bytes[]'], [data, signatures]),
    ),

  getRandomInt,

  getRandomID: () => id(getRandomInt(1e10).toString()),
  getLogID: (log) => id(log.blockNumber+':'+log.transactionIndex+':'+log.logIndex),
  defaultAccounts: (n, seed='') => {
    const balance = 10000000000000000000000000000000000;
    const privateKeys = [];
    let key = keccak256(defaultAbiCoder.encode(['string'], [seed]));
    for(let i=0;i<n;i++) {
        privateKeys.push(key);
        key = keccak256(key);
    }
    return privateKeys.map(secretKey => ({ balance, secretKey }));
  },
}
