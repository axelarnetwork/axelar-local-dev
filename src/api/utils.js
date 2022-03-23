'use strict';


const {
  utils: {
    defaultAbiCoder,
    id,
    arrayify,
    keccak256,
  },
  ContractFactory
} = require('ethers');
const http = require('http');
const { outputJsonSync } = require('fs-extra');

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
  /**
  * @returns {Contract}
  */
  deployContract: async (wallet, contractJson, args = [], options = {}) => {
    const factory = new ContractFactory(
        contractJson.abi,
        contractJson.bytecode,
        wallet
    );

    const contract =  await factory.deploy(...args, {...options});
    await contract.deployed();
    return contract;
},
	setJSON: (data, name) => {
		outputJsonSync(
			name,
			data,
			{
				spaces:2,
				EOL: "\n" 
			}
		);
	},
    httpGet: (url) => {
		return new Promise((resolve, reject) => { 
			http.get(url, (res) => {
				const { statusCode } = res;
				const contentType = res.headers['content-type'];
				let error;
				if (statusCode !== 200) {
					error = new Error('Request Failed.\n' +
						`Status Code: ${statusCode}`);
				} else if (!/^application\/json/.test(contentType)) {
					error = new Error('Invalid content-type.\n' +
						`Expected application/json but received ${contentType}`);
				}
				if (error) {
					res.resume();
					reject(error);
					return;
				}
				res.setEncoding('utf8');
				let rawData = '';
				res.on('data', (chunk) => { rawData += chunk; });
				res.on('end', () => {
					try {
						const parsedData = JSON.parse(rawData);
						resolve(parsedData);
					} catch (e) {
						reject(e);
					}
				});
			});
		});
    }


}
