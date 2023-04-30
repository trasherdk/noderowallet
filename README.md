# `noderowallet`

A node.js library for interacting with the [Monero Wallet RPC interface](https://www.getmonero.org/resources/developer-guides/wallet-rpc.html), written in [TypeScript](https://www.typescriptlang.org/), documented with [JSDoc](https://jsdoc.app/), with [BigInt](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt) support. Zero (0) dependencies.

Currently, authentication is not supported. You have to start `monero-wallet-rpc` with `--disable-rpc-login`.

**Be careful when using `monero-wallet-rpc` without authenticaton. Block the RPC port with a firewall, or even better, [run the wallet in Docker](https://registry.hub.docker.com/r/sethsimmons/simple-monero-wallet-rpc). If the port is open to the Internet anyone can use your wallet, including stealing all your funds.**

## Usage

```ts
import {NoderoWallet} from 'noderowallet'

const monero = new NoderoWallet({ host: '127.0.0.1', port: 6000 })
monero.getBalance().then((x) => console.log(x))

// Outputs:
{
  balance: 1125125151521,
// atomic units, in this case the balance is 1.125125151521
// from https://www.getmonero.org/resources/moneropedia/atomic-units.html:
// Atomic Units refer to the smallest fraction of 1 XMR. One atomic unit is currently 1e-12 XMR (0.000000000001 XMR, or one piconero). It may be changed in the future.
  blocks_to_unlock: 0,
  multisig_import_needed: false,
  per_subaddress: [
    {
      account_index: 0,
      address: '52R4RNjVjPn6Aj3SVA1yzZQStC8a4StYTUiuAtLjBPk92A76vrCD2pcPmV51Td8X56Gb1smNTaiEadc4gurjQ5nJBUuVCFB',
      address_index: 0,
      balance: 1125125151521,
      blocks_to_unlock: 0,
      label: 'Primary account',
      num_unspent_outputs: 1,
      time_to_unlock: 0,
      unlocked_balance: 1125125151521
    }
  ],
  time_to_unlock: 0,
  unlocked_balance: 1125125151521
}
```

###### `(◣_◢)`
