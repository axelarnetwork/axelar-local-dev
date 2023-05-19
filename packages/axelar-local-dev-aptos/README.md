## Aptos

We also support a local develompent environment for aptos cross chain communication. This only supports general message passing. `AptosNetwork` is a generalization of `AptosClient` (avaliable in the `aptos` package) that includes (among others that are mainly used for intrnal purposes):

- `getResourceAccountAddress(MaybeHexString sourceAddress, MaybeHexString seed)`: Predicts the aptos resource address for an account with a certain seed.
- `deploy(string modulePath , string[] compiledModules, MaybeHexString seed)`: Deploy `compiledModules` found in `modulePath`. Seed is optional, if it is included then the modules are deployed as a resource.
- `submitTransactionAndWait(MaybeHexString from, EntryFunctionPayload txData)`: A wrapper for aptos' submit transaction workflow, for ease of use.

Additionaly we export two utility functions

- `createAptosNetwork(config?: {nodeUrl: string, faucetUrl: string})`: This funds the `owner` account and uses it to deploy the gateway module. `nodeUrl` defaults to `http://localhost:8080` and `faucetUrl` defaults to `http://localhost:8081`
- `loadAptosNetwork(string nodeUrl)`: This loads the an preconfigured `AptosNetwork`. It is useful so that relaying works properly to said aptos network works properly.

`createAndExport` (see above) will try to also call `createAptosNetwork` so that realying works to aptos as well.
