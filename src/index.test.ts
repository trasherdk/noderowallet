import { describe, it, expect } from 'vitest';
import dotenv from 'dotenv'
import { NoderoWallet } from './index'

dotenv.config()
const host = process.env.wallet_host || '127.0.0.1'
const port = Number(process.env.wallet_port) || 38090

describe('Testing NoderoWallet', () => {
  const Wallet = new NoderoWallet({ host, port })

  it('should be an instance of NoderoWallet', () => {
    expect(Wallet).toBeInstanceOf(NoderoWallet)
  })

  it('should connect to a secified daemon (set_daemon)', async () => {
    const address = `http://${process.env.daemon_host}:${process.env.daemon_port}`
    const response = await Wallet.setDaemon(address, true, 'disabled')

    //console.log('set_daemon', response)
    expect(response).toBeTypeOf('object')
  })

  it('should return the balance of the main account', async () => {
    const response = await Wallet.getBalance()

    //console.log('get_balance', response)
    expect(response.balance).toBeTypeOf('bigint')
    expect(response.multisig_import_needed).toBeTypeOf('boolean')
  })
})
