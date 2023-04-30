import { ok } from 'assert'
import http from 'http'

const stringifyInts = (json: string) => {
	return json.replaceAll(/(?<=".+?": )(\d+)(?=,?[^0-9]?$)/gm, '"$1n"')
}

export interface MoneroSubaddressIndex {
	major: bigint
	minor: bigint
}

export interface MoneroTransfer {
	address: string
	amount: bigint
	amounts: bigint[]
	confirmations: bigint
	double_spend_seen: boolean
	fee: bigint
	height: bigint
	locked: boolean
	note: string
	payment_id: string
	subaddr_index: MoneroSubaddressIndex
	subaddr_indices?: MoneroSubaddressIndex[]
	suggested_confirmations_threshold: bigint
	timestamp: bigint
	txid: string
	type: string
	unlock_time: bigint
}

export class MoneroRpcError extends Error {
	code?: number
	errorMessage?: string

	constructor(response: unknown) {
		let calledSuper = false
		if (typeof response === 'string') {
			super(response)
			calledSuper = true
		}
		if (typeof response === 'object' && response != null) {
			if ('message' in response && typeof response.message === 'string') {
				super(response.message)
				calledSuper = true
				this.errorMessage = response.message
			}
			if ('code' in response && typeof response.code === 'number') {
				if (!calledSuper) {
					super('Code ' + response.code.toString())
					calledSuper = true
				}
				// @ts-ignore
				this.code = response.code
			}
		}
		if (!calledSuper) super('Unknown error')
	}
}

export class NoderoWallet {
	private host: string
	private port: number

	constructor({ host, port }: { host: string; port: number }) {
		this.host = host
		this.port = port
	}

	private request<ResultType>(method: string, params?: any) {
		const { host, port } = this

		const payload = JSON.stringify({
			jsonrpc: '2.0',
			id: '0',
			method,
			params
		})

		return new Promise<ResultType>((resolve, reject) => {
			const req = http.request(
				{
					host,
					port,
					method: 'POST',
					path: '/json_rpc',
					headers: {
						'Content-Type': 'text/json',
						'Content-Length': Buffer.byteLength(payload)
					}
				},
				(res) => {
					let rawData = ''

					res.on('data', (chunk) => (rawData += chunk))
					res.on('error', (e) => reject(e))
					res.on('end', () => {
						const { statusCode } = res
						if (
							statusCode == null ||
							statusCode < 200 ||
							statusCode > 299
						)
							return reject(
								new MoneroRpcError(
									`RPC call failed with status code ${statusCode}`
								)
							)

						const data = JSON.parse(
							stringifyInts(rawData),
							(k, v) => {
								if (typeof v === 'string') {
									const m = v.match(/(\d+)n/)
									if (m?.[1] != null) return BigInt(m[1])
								}
								return v
							}
						) as {
							id: '0'
							jsonrpc: '2.0'
							result?: ResultType
							error?: { code: number; message: string }
						}

						if (data.error != null)
							return reject(new MoneroRpcError(data.error))
						ok(data.result)
						resolve(data.result)
					})
				}
			)

			req.on('error', (e) => reject(e))
			req.write(payload, 'binary')
			req.end()
		})
	}
	/**
	 * Connect the RPC server to a Monero daemon.
	 * @arg address - (Default: "") The URL of the daemon to connect to.
	 * @arg trusted - (Default: false) If false, some RPC wallet methods will be disabled.
	 * @arg ssl_support - (Default: autodetect; Accepts: disabled, enabled, autodetect) Specifies whether the Daemon uses SSL encryption.
	 * @arg ssl_private_key_path - The file path location of the SSL key.
	 * @arg ssl_certificate_path - The file path location of the SSL certificate.
	 * @arg ssl_ca_file - The file path location of the certificate authority file.
	 * @arg ssl_allowed_fingerprints - The SHA1 fingerprints accepted by the SSL certificate.
	 * @arg ssl_allow_any_cert - (Default: false) If false, the certificate must be signed by a trusted certificate authority.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#set_daemon}
	 */
	async setDaemon(
		address?: string,
		trusted?: boolean,
		ssl_support?: string,
		ssl_private_key_path?: string,
		ssl_certificate_path?: string,
		ssl_ca_file?: string,
		ssl_allowed_fingerprints?: string[],
		ssl_allow_any_cert?: boolean,
		username?: string,
		password?: string
	) {
		return await this.request<{}>('set_daemon', {
			address,
			trusted,
			ssl_support,
			ssl_private_key_path,
			ssl_certificate_path,
			ssl_ca_file,
			ssl_allowed_fingerprints,
			ssl_allow_any_cert,
			username,
			password
		})
	}

	/**
	 * Return the wallet's balance.
	 * @arg account_index - Return balance for this account.
	 * @arg address_indices - Return balance detail for those subaddresses.
	 * @arg all_accounts - (Defaults to false)
	 * @arg strict - (Defaults to false) all changes go to 0-th subaddress (in the current subaddress account)
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_balance}
	 */
	async getBalance(
		account_index?: bigint | number,
		address_indices?: (bigint | number)[],
		all_accounts?: boolean,
		strict?: boolean
	) {
		return await this.request<{
			balance: bigint
			unlocked_balance: bigint
			multisig_import_needed: boolean
			time_to_unlock: bigint
			blocks_to_unlock: bigint
			per_subaddress: {
				account_index: bigint
				address: string
				address_index: bigint
				balance: bigint
				blocks_to_unlock: bigint
				label: string
				num_unspent_outputs: bigint
				time_to_unlock: bigint
				unlocked_balance: bigint
			}[]
			address_index: bigint
			address: string
			label: string
			num_unspent_outputs: bigint
		}>('get_balance', {
			account_index,
			address_indices,
			all_accounts,
			strict
		})
	}

	/**
	 * Return the wallet's addresses for an account. Optionally filter for specific set of subaddresses.
	 * @arg account_index - Return subaddresses for this account.
	 * @arg address_index - List of subaddresses to return from an account.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_address}
	 */
	async getAddress(
		account_index?: bigint | number,
		address_index?: (bigint | number)[]
	) {
		return await this.request<{
			address: string
		}>('get_address', { account_index, address_index })
	}

	/**
	 * Get account and address indexes from a specific (sub)address
	 * @arg address - (sub)address to look for.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_address_index}
	 */
	async getAddressIndex(address?: string) {
		return await this.request<{
			index: MoneroSubaddressIndex
		}>('get_address_index', { address })
	}

	/**
	 * Create a new address for an account. Optionally, label the new address.
	 * @arg account_index - Create a new address for this account.
	 * @arg label - Label for the new address.
	 * @arg count - Number of addresses to create (Defaults to 1).
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#create_address}
	 */
	async createAddress(
		account_index?: bigint | number,
		label?: string,
		count?: bigint
	) {
		return await this.request<{
			address: string
			address_index: bigint
			address_indices: bigint[]
			addresses: string[]
		}>('create_address', { account_index, label, count })
	}

	/**
	 * Label an address.
	 * @arg index - JSON Object containing the major &amp; minor address index: major - unsigned int; Account index for the subaddress.
	 * @arg minor - Index of the subaddress in the account.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#label_address}
	 */
	async labelAddress(index?: MoneroSubaddressIndex, label?: string) {
		return await this.request<{}>('label_address', { index, label })
	}

	/**
	 * Analyzes a string to determine whether it is a valid monero wallet address and returns the result and the address specifications.
	 * @arg address - The address to validate.
	 * @arg any_net_type - If true, consider addresses belonging to any of the three Monero networks (mainnet, stagenet, and testnet) valid. Otherwise, only consider an address valid if it belongs to the network on which the rpc-wallet's current daemon is running (Defaults to false).
	 * @arg allow_openalias - If true, consider OpenAlias-formatted addresses valid (Defaults to false).
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#validate_address}
	 */
	async validateAddress(
		address?: string,
		any_net_type?: boolean,
		allow_openalias?: boolean
	) {
		return await this.request<{
			valid: boolean
			integrated: boolean
			subaddress: boolean
			nettype: string
			openalias_address: string
		}>('validate_address', { address, any_net_type, allow_openalias })
	}

	/**
	 * Get all accounts for a wallet. Optionally filter accounts by tag.
	 * @arg subaddress_accounts - Index of the account.
	 * @arg balance - Balance of the account (locked or unlocked).
	 * @arg base_address - Base64 representation of the first subaddress in the account.
	 * @arg unlocked_balance - Unlocked balance for the account.
	 * @arg tag - Tag for filtering accounts.
	 * @arg regex - allow regular expression filters if set to true (Defaults to false).
	 * @arg strict_balances - when true, balance only considers the blockchain, when false it considers both the blockchain and some recent actions, such as a recently created transaction which spent some outputs, which isn't yet mined. Outputs:
	 * @arg label - Label of the account.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_accounts}
	 */
	async getAccounts(
		subaddress_accounts?: {
			account_index: bigint
			balance: bigint
			base_address: string
			label: string
			tag: string
			unlocked_balance: bigint
		},
		balance?: bigint | number,
		base_address?: string,
		unlocked_balance?: bigint | number,
		tag?: string,
		regex?: boolean,
		strict_balances?: boolean,
		label?: string
	) {
		return await this.request<{}>('get_accounts', {
			subaddress_accounts,
			balance,
			base_address,
			unlocked_balance,
			tag,
			regex,
			strict_balances,
			label
		})
	}

	/**
	 * Create a new account with an optional label.
	 * @arg label - Label for the account.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#create_account}
	 */
	async createAccount(label?: string) {
		return await this.request<{
			account_index: bigint
			address: string
		}>('create_account', { label })
	}

	/**
	 * Label an account.
	 * @arg account_index - Apply label to account at this index.
	 * @arg label - Label for the account.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#label_account}
	 */
	async labelAccount(account_index?: bigint | number, label?: string) {
		return await this.request<{}>('label_account', { account_index, label })
	}

	/**
	 * Get a list of user-defined account tags.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_account_tags}
	 */
	async getAccountTags() {
		return await this.request<{
			account_tags: {
				accounts: bigint[]
				label: string
				tag: string
			}[]
			label: string
			accounts: bigint[]
		}>('get_account_tags', {})
	}

	/**
	 * Apply a filtering tag to a list of accounts.
	 * @arg tag - Tag for the accounts.
	 * @arg accounts - Tag this list of accounts.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#tag_accounts}
	 */
	async tagAccounts(tag?: string, accounts?: (bigint | number)[]) {
		return await this.request<{}>('tag_accounts', { tag, accounts })
	}

	/**
	 * Remove filtering tag from a list of accounts.
	 * @arg accounts - Remove tag from this list of accounts.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#untag_accounts}
	 */
	async untagAccounts(accounts?: (bigint | number)[]) {
		return await this.request<{}>('untag_accounts', { accounts })
	}

	/**
	 * Set description for an account tag.
	 * @arg tag - Set a description for this tag.
	 * @arg description - Description for the tag.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#set_account_tag_description}
	 */
	async setAccountTagDescription(tag?: string, description?: string) {
		return await this.request<{}>('set_account_tag_description', {
			tag,
			description
		})
	}

	/**
	 * Returns the wallet's current block height.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_height}
	 */
	async getHeight() {
		return await this.request<{
			height: bigint
		}>('get_height', {})
	}

	/**
	 * Send monero to a number of recipients.
	 * @arg destinations - Array of destinations to receive XMR
	 * @arg account_index - Transfer from this account index. (Defaults to 0)
	 * @arg subaddr_indices - Transfer from this set of subaddresses. (Defaults to empty - all indices)
	 * @arg priority - Set a priority for the transaction. Accepted Values are: 0-3 for: default, unimportant, normal, elevated, priority.
	 * @arg mixin - Number of outputs from the blockchain to mix with (0 means no mixing).
	 * @arg ring_size - Number of outputs to mix in the transaction (this output + N decoys from the blockchain). (Unless dealing with pre rct outputs, this field is ignored on mainnet).
	 * @arg unlock_time - Number of blocks before the monero can be spent (0 to not add a lock).
	 * @arg get_tx_key - Return the transaction key after sending.
	 * @arg do_not_relay - If true, the newly created transaction will not be relayed to the monero network. (Defaults to false)
	 * @arg get_tx_hex - Return the transaction as hex string after sending (Defaults to false)
	 * @arg get_tx_metadata - Return the metadata needed to relay the transaction. (Defaults to false)
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#transfer}
	 */
	async transfer(
		destinations?: {
			amount: bigint | number
			address: string
		}[],
		account_index?: bigint | number,
		subaddr_indices?: (bigint | number)[],
		priority?: 0 | 1 | 2 | 3,
		mixin?: bigint | number,
		ring_size?: bigint | number,
		unlock_time?: bigint | number,
		get_tx_key?: boolean,
		do_not_relay?: boolean,
		get_tx_hex?: boolean,
		get_tx_metadata?: boolean
	) {
		return await this.request<{
			amount: bigint
			fee: bigint
			multisig_txset: string
			tx_blob?: string
			tx_hash: string
			tx_key: string
			tx_metadata?: string
			unsigned_txset: string
		}>('transfer', {
			destinations,
			account_index,
			subaddr_indices,
			priority,
			mixin,
			ring_size,
			unlock_time,
			get_tx_key,
			do_not_relay,
			get_tx_hex,
			get_tx_metadata
		})
	}

	/**
	 * Same as transfer, but can split into more than one tx if necessary.
	 * @arg destinations - Array of destinations to receive XMR
	 * @arg account_index - Transfer from this account index. (Defaults to 0)
	 * @arg subaddr_indices - Transfer from this set of subaddresses. (Defaults to empty - all indices)
	 * @arg ring_size - Number of outputs to mix in the transaction (this output + N decoys from the blockchain). (Unless dealing with pre rct outputs, this field is ignored on mainnet).
	 * @arg unlock_time - Number of blocks before the monero can be spent (0 to not add a lock).
	 * @arg payment_id - Payment ID for this transfer.
	 * @arg get_tx_keys - Return the transaction keys after sending.
	 * @arg priority - Set a priority for the transaction. Accepted Values are: 0-3 for: default, unimportant, normal, elevated, priority.
	 * @arg do_not_relay - If true, the newly created transaction will not be relayed to the monero network. (Defaults to false)
	 * @arg get_tx_hex - Return the transaction as hex string after sending (Defaults to false)
	 * @arg get_tx_metadata - Return the metadata needed to relay the transaction. (Defaults to false)
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#transfer}
	 */
	async transferSplit(
		destinations?: {
			amount: bigint | number
			address: string
		}[],
		account_index?: bigint | number,
		subaddr_indices?: (bigint | number)[],
		ring_size?: bigint | number,
		unlock_time?: bigint | number,
		payment_id?: string,
		get_tx_keys?: boolean,
		priority?: 0 | 1 | 2 | 3,
		do_not_relay?: boolean,
		get_tx_hex?: boolean,
		get_tx_metadata?: boolean
	) {
		return await this.request<{
			tx_hash_list: string[]
			tx_key_list: string[]
			amount_list: bigint[]
			fee_list: bigint[]
			weight_list: bigint[]
			tx_blob_list: string[]
			tx_metadata_list: string[]
			multisig_txset: string
			unsigned_txset: string
			spent_key_images_list: {
				key_images: string[]
			}[]
		}>('transfer_split', {
			destinations,
			account_index,
			subaddr_indices,
			priority,
			payment_id,
			ring_size,
			unlock_time,
			get_tx_keys,
			do_not_relay,
			get_tx_hex,
			get_tx_metadata
		})
	}

	/**
	 * Sign a transaction created on a read-only wallet (in cold-signing process)
	 * @arg unsigned_txset - Set of unsigned tx returned by "transfer" or "transfer_split" methods.
	 * @arg export_raw - If true, return the raw transaction data. (Defaults to false)
	 * @arg get_tx_keys - Return the transaction keys after signing.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#sign_transfer}
	 */
	async signTransfer(
		unsigned_txset?: string,
		export_raw?: boolean,
		get_tx_keys?: boolean
	) {
		return await this.request<{
			signed_txset: string
			tx_hash_list: string[]
			tx_raw_list: string[]
			tx_key_list: string[]
		}>('sign_transfer', { unsigned_txset, export_raw, get_tx_keys })
	}

	/**
	 * Submit a previously signed transaction on a read-only wallet (in cold-signing process).
	 * @arg tx_data_hex - Set of signed tx returned by "sign_transfer"
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#submit_transfer}
	 */
	async submitTransfer(tx_data_hex?: string) {
		return await this.request<{
			tx_hash_list: string[]
		}>('submit_transfer', { tx_data_hex })
	}

	/**
	 * Send all dust outputs back to the wallet's, to make them easier to spend (and mix).
	 * @arg get_tx_keys - Return the transaction keys after sending.
	 * @arg do_not_relay - If true, the newly created transaction will not be relayed to the monero network. (Defaults to false)
	 * @arg get_tx_hex - Return the transactions as hex string after sending. (Defaults to false)
	 * @arg get_tx_metadata - Return list of transaction metadata needed to relay the transfer later. (Defaults to false)
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#sweep_dust}
	 */
	async sweepDust(
		get_tx_keys?: boolean,
		do_not_relay?: boolean,
		get_tx_hex?: boolean,
		get_tx_metadata?: boolean
	) {
		return await this.request<{
			tx_hash_list: string[]
			tx_key_list: bigint[]
			amount_list: bigint[]
			fee_list: bigint[]
			weight_list: bigint[]
			tx_blob_list: string[]
			tx_metadata_list: string[]
			multisig_txset: string
			unsigned_txset: string
			spent_key_images_list: {
				key_images: string[]
			}[]
		}>('sweep_dust', {
			get_tx_keys,
			do_not_relay,
			get_tx_hex,
			get_tx_metadata
		})
	}

	/**
	 * Send all unlocked balance to an address.
	 * @arg address - Destination public address.
	 * @arg account_index - Sweep transactions from this account.
	 * @arg outputs - specify the number of separate outputs of smaller denomination that will be created by sweep operation.
	 * @arg ring_size - Sets ringsize to n (mixin + 1). (Unless dealing with pre rct outputs, this field is ignored on mainnet).
	 * @arg unlock_time - Number of blocks before the monero can be spent (0 to not add a lock).
	 * @arg subaddr_indices - Sweep from this set of subaddresses in the account.
	 * @arg subaddr_indices_all - use outputs in all subaddresses within an account (Defaults to false).
	 * @arg priority - Priority for sending the sweep transfer, partially determines fee.
	 * @arg payment_id - (defaults to a random ID) 16 characters hex encoded.
	 * @arg get_tx_keys - Return the transaction keys after sending.
	 * @arg below_amount - Include outputs below this amount.
	 * @arg do_not_relay - If true, do not relay this sweep transfer. (Defaults to false)
	 * @arg get_tx_hex - return the transactions as hex encoded string. (Defaults to false)
	 * @arg get_tx_metadata - return the transaction metadata as a string. (Defaults to false)
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#sweep_all}
	 */
	async sweepAll(
		address?: string,
		account_index?: bigint | number,
		outputs?: bigint | number,
		ring_size?: bigint | number,
		unlock_time?: bigint | number,
		subaddr_indices?: (bigint | number)[],
		subaddr_indices_all?: boolean,
		priority?: bigint | number,
		payment_id?: string,
		get_tx_keys?: boolean,
		below_amount?: bigint | number,
		do_not_relay?: boolean,
		get_tx_hex?: boolean,
		get_tx_metadata?: boolean
	) {
		return await this.request<{
			tx_hash_list: string[]
			tx_key_list: string[]
			amount_list: bigint[]
			fee_list: bigint[]
			weight_list: bigint[]
			tx_blob_list: string[]
			tx_metadata_list: string[]
			multisig_txset: string
			unsigned_txset: string
			spent_key_images_list: string[]
		}>('sweep_all', {
			address,
			account_index,
			outputs,
			ring_size,
			unlock_time,
			subaddr_indices,
			subaddr_indices_all,
			priority,
			payment_id,
			get_tx_keys,
			below_amount,
			do_not_relay,
			get_tx_hex,
			get_tx_metadata
		})
	}

	/**
	 * Send all of a specific unlocked output to an address.
	 * @arg address - Destination public address.
	 * @arg outputs - specify the number of separate outputs of smaller denomination that will be created by sweep operation.
	 * @arg ring_size - Sets ringsize to n (mixin + 1). (Unless dealing with pre rct outputs, this field is ignored on mainnet).
	 * @arg unlock_time - Number of blocks before the monero can be spent (0 to not add a lock).
	 * @arg key_image - Key image of specific output to sweep.
	 * @arg priority - Priority for sending the sweep transfer, partially determines fee.
	 * @arg payment_id - (defaults to a random ID) 16 characters hex encoded.
	 * @arg get_tx_key - Return the transaction keys after sending.
	 * @arg do_not_relay - If true, do not relay this sweep transfer. (Defaults to false)
	 * @arg get_tx_hex - return the transactions as hex encoded string. (Defaults to false)
	 * @arg get_tx_metadata - return the transaction metadata as a string. (Defaults to false)
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#sweep_single}
	 */
	async sweepSingle(
		address?: string,
		outputs?: bigint | number,
		ring_size?: bigint | number,
		unlock_time?: bigint | number,
		key_image?: string,
		priority?: bigint | number,
		payment_id?: string,
		get_tx_key?: boolean,
		do_not_relay?: boolean,
		get_tx_hex?: boolean,
		get_tx_metadata?: boolean
	) {
		return await this.request<{
			tx_hasht: string[]
			tx_key: string[]
			amount: bigint[]
			fee: bigint[]
			weight: bigint
			tx_blob: string[]
			tx_metadata: string
			multisig_txset: string
			unsigned_txset: string
			spent_key_images: string[]
		}>('sweep_single', {
			address,
			outputs,
			ring_size,
			unlock_time,
			key_image,
			priority,
			payment_id,
			get_tx_key,
			do_not_relay,
			get_tx_hex,
			get_tx_metadata
		})
	}

	/**
	 * Relay a transaction previously created with "do_not_relay":true.
	 * @arg hex - transaction metadata returned from a transfer method with get_tx_metadata set to true.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#relay_tx}
	 */
	async relayTx(hex?: string) {
		return await this.request<{
			tx_hash: string
		}>('relay_tx', { hex })
	}

	/**
	 * Save the wallet file.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#store}
	 */
	async store() {
		return await this.request<{}>('store', {})
	}

	/**
	 * Get a list of incoming payments using a given payment id.
	 * @arg payment_id - Payment ID used to find the payments (16 characters hex).
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_payments}
	 */
	async getPayments(payment_id?: string) {
		return await this.request<{
			payments: {
				address: string
				amount: bigint
				block_height: bigint
				payment_id: string
				subaddr_index: MoneroSubaddressIndex
				tx_hash: string
				unlock_time: bigint
				locked: boolean
			}[]
		}>('get_payments', { payment_id })
	}

	/**
	 * Get a list of incoming payments using a given payment id, or a list of payments ids, from a given height. This method is the preferred method over get_payments because it has the same functionality but is more extendable. Either is fine for looking up transactions by a single payment ID.
	 * @arg payment_ids - Payment IDs used to find the payments (16 characters hex).
	 * @arg min_block_height - The block height at which to start looking for payments.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_bulk_payments}
	 */
	async getBulkPayments(
		payment_ids?: string[],
		min_block_height?: bigint | number
	) {
		return await this.request<{
			payments: string[]
			tx_hash: string
			amount: bigint
			block_height: bigint
			unlock_time: bigint
			subaddr_index: bigint
			minor: bigint
		}>('get_bulk_payments', { payment_ids, min_block_height })
	}

	/**
	 * Return a list of incoming transfers to the wallet.
	 * @arg transfer_type - "all": all the transfers, "available": only transfers which are not yet spent, OR "unavailable": only transfers which are already spent.
	 * @arg account_index - Return transfers for this account. (defaults to 0)
	 * @arg subaddr_indices - Return transfers sent to these subaddresses.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#incoming_transfers}
	 */
	async incomingTransfers(
		transfer_type?: string,
		account_index?: bigint | number,
		subaddr_indices?: (bigint | number)[]
	) {
		return await this.request<{
			transfers: {
				amount: bigint
				block_height: bigint
				global_index: bigint
				key_image: string
				spent: boolean
				subaddr_index: MoneroSubaddressIndex
				tx_hash: string
				pubkey: string
				frozen: boolean
				unlocked: boolean
			}[]
		}>('incoming_transfers', {
			transfer_type,
			account_index,
			subaddr_indices
		})
	}

	/**
	 * Return the spend or view private key.
	 * @arg key_type - Which key to retrieve: "mnemonic" - the mnemonic seed (older wallets do not have one) OR "view_key" - the view key OR "spend_key".
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#query_key}
	 */
	async queryKey(key_type?: string) {
		return await this.request<{
			key: string
		}>('query_key', { key_type })
	}

	/**
	 * Make an integrated address from the wallet address and a payment id.
	 * @arg standard_address - (defaults to primary address) Destination public address.
	 * @arg payment_id - (defaults to a random ID) 16 characters hex encoded.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#make_integrated_address}
	 */
	async makeIntegratedAddress(
		standard_address?: string,
		payment_id?: string
	) {
		return await this.request<{
			integrated_address: string
			payment_id: string
		}>('make_integrated_address', { standard_address, payment_id })
	}

	/**
	 * Retrieve the standard address and payment id corresponding to an integrated address.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#split_integrated_address}
	 */
	async splitIntegratedAddress(integrated_address?: string) {
		return await this.request<{
			is_subaddress: boolean
			payment: string
			standard_address: string
		}>('split_integrated_address', { integrated_address })
	}

	/**
	 * Store the current state of any open wallet and exit the monero-wallet-rpc process.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#stop_wallet}
	 */
	async stopWallet() {
		return await this.request<{}>('stop_wallet', {})
	}

	/**
	 * Rescan the blockchain from scratch, losing any information which can not be recovered from the blockchain itself. This includes destination addresses, tx secret keys, tx notes, etc.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#rescan_blockchain}
	 */
	async rescanBlockchain() {
		return await this.request<{}>('rescan_blockchain', {})
	}

	/**
	 * Set arbitrary string notes for transactions.
	 * @arg txids - transaction ids
	 * @arg notes - notes for the transactions
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#set_tx_notes}
	 */
	async setTxNotes(txids?: string[], notes?: string[]) {
		return await this.request<{}>('set_tx_notes', { txids, notes })
	}

	/**
	 * Get string notes for transactions.
	 * @arg txids - transaction ids
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_tx_notes}
	 */
	async getTxNotes(txids?: string[]) {
		return await this.request<{
			notes: string[]
		}>('get_tx_notes', { txids })
	}

	/**
	 * Set arbitrary attribute.
	 * @arg key - attribute name
	 * @arg value - attribute value
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#set_attribute}
	 */
	async setAttribute(key?: string, value?: string) {
		return await this.request<{}>('set_attribute', { key, value })
	}

	/**
	 * Get attribute value by name.
	 * @arg key - attribute name
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_attribute}
	 */
	async getAttribute(key?: string) {
		return await this.request<{
			value: string
		}>('get_attribute', { key })
	}

	/**
	 * Get transaction secret key from transaction id.
	 * @arg txid - transaction id.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_tx_key}
	 */
	async getTxKey(txid?: string) {
		return await this.request<{
			tx_key: string
		}>('get_tx_key', { txid })
	}

	/**
	 * Check a transaction in the blockchain with its secret key.
	 * @arg txid - transaction id.
	 * @arg tx_key - transaction secret key.
	 * @arg address - destination public address of the transaction.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#check_tx_key}
	 */
	async checkTxKey(txid?: string, tx_key?: string, address?: string) {
		return await this.request<{
			confirmations: bigint
			in_pool: boolean
			received: bigint
		}>('check_tx_key', { txid, tx_key, address })
	}

	/**
	 * Get transaction signature to prove it.
	 * @arg txid - transaction id.
	 * @arg address - destination public address of the transaction.
	 * @arg message - add a message to the signature to further authenticate the prooving process.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_tx_proof}
	 */
	async getTxProof(txid?: string, address?: string, message?: string) {
		return await this.request<{
			signature: string
		}>('get_tx_proof', { txid, address, message })
	}

	/**
	 * Prove a transaction by checking its signature.
	 * @arg txid - transaction id.
	 * @arg address - destination public address of the transaction.
	 * @arg signature - transaction signature to confirm.
	 * @arg message - Should be the same message used in get_tx_proof.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#check_tx_proof}
	 */
	async checkTxProof(
		txid?: string,
		address?: string,
		signature?: string,
		message?: string
	) {
		return await this.request<{
			confirmations: bigint
			good: boolean
			in_pool: boolean
			received: bigint
		}>('check_tx_proof', { txid, address, signature, message })
	}

	/**
	 * Generate a signature to prove a spend. Unlike proving a transaction, it does not requires the destination public address.
	 * @arg txid - transaction id.
	 * @arg message - add a message to the signature to further authenticate the prooving process.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_spend_proof}
	 */
	async getSpendProof(txid?: string, message?: string) {
		return await this.request<{
			signature: string
		}>('get_spend_proof', { txid, message })
	}

	/**
	 * Prove a spend using a signature. Unlike proving a transaction, it does not requires the destination public address.
	 * @arg txid - transaction id.
	 * @arg signature - spend signature to confirm.
	 * @arg message - Should be the same message used in get_spend_proof.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#check_spend_proof}
	 */
	async checkSpendProof(txid?: string, signature?: string, message?: string) {
		return await this.request<{
			good: boolean
		}>('check_spend_proof', { txid, signature, message })
	}

	/**
	 * Generate a signature to prove of an available amount in a wallet.
	 * @arg all - Proves all wallet balance to be disposable.
	 * @arg account_index - Specify the account from which to prove reserve. (ignored if all is set to true)
	 * @arg amount - Amount (in atomic units) to prove the account has in reserve. (ignored if all is set to true)
	 * @arg message - add a message to the signature to further authenticate the proving process. If a message is added to get_reserve_proof (optional), this message will be required when using check_reserve_proof
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_reserve_proof}
	 */
	async getReserveProof(
		all?: boolean,
		account_index?: bigint | number,
		amount?: bigint | number,
		message?: string
	) {
		return await this.request<{
			signature: string
		}>('get_reserve_proof', { all, account_index, amount, message })
	}

	/**
	 * Proves a wallet has a disposable reserve using a signature.
	 * @arg address - Public address of the wallet.
	 * @arg signature - reserve signature to confirm.
	 * @arg message - If a message was added to get_reserve_proof , this message will be required when using check_reserve_proof
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#check_reserve_proof}
	 */
	async checkReserveProof(
		address?: string,
		signature?: string,
		message?: string
	) {
		return await this.request<{
			good: boolean
			spent: bigint
			total: bigint
		}>('check_reserve_proof', { address, signature, message })
	}

	/**
	 * Returns a list of transfers.
	 * @arg in - (defaults to false) Include incoming transfers.
	 * @arg out - (defaults to false) Include outgoing transfers.
	 * @arg pending - (defaults to false) Include pending transfers.
	 * @arg failed - (defaults to false) Include failed transfers.
	 * @arg pool - (defaults to false) Include transfers from the daemon's transaction pool.
	 * @arg filter_by_height - Filter transfers by block height.
	 * @arg min_height - Minimum block height to scan for transfers, if filtering by height is enabled.
	 * @arg max_height - Maximum block height to scan for transfers, if filtering by height is enabled (defaults to max block height).
	 * @arg account_index - Index of the account to query for transfers. (defaults to 0)
	 * @arg subaddr_indices - List of subaddress indices to query for transfers. (Defaults to empty - all indices).
	 * @arg all_accounts - (Defaults to false).
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_transfers}
	 */

	async getTransfers(
		inn?: boolean,
		out?: boolean,
		pending?: boolean,
		failed?: boolean,
		pool?: boolean,
		filter_by_height?: boolean,
		min_height?: bigint | number,
		max_height?: bigint | number,
		account_index?: bigint | number,
		subaddr_indices?: (bigint | number)[],
		all_accounts?: boolean
	) {
		return await this.request<{
			[key: string]: MoneroTransfer[]
		}>('get_transfers', {
			in: inn,
			out,
			pending,
			failed,
			pool,
			filter_by_height,
			min_height,
			max_height,
			account_index,
			subaddr_indices,
			all_accounts
		})
	}

	/**
	 * Show information about a transfer to/from this address.
	 * @arg txid - Transaction ID used to find the transfer.
	 * @arg account_index - Index of the account to query for the transfer.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_transfer_by_txid}
	 */
	async getTransferByTxid(txid?: string, account_index?: bigint | number) {
		return await this.request<{
			transfer: MoneroTransfer
			transfers: MoneroTransfer[]
		}>('get_transfer_by_txid', { txid, account_index })
	}

	/**
	 * Returns details for each transaction in an unsigned or multisig transaction set. Transaction sets are obtained as return values from one of the following RPC methods:
	 * @arg unsigned_txset - A hexadecimal string representing a set of unsigned transactions (empty for multisig transactions; non-multisig signed transactions are not supported).
	 * @arg multisig_txset - A hexadecimal string representing the set of signing keys used in a multisig transaction (empty for unsigned transactions; non-multisig signed transactions are not supported).
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#describe_transfer}
	 */
	async describeTransfer(unsigned_txset?: string, multisig_txset?: string) {
		return await this.request<{
			desc: bigint[]
			amount_out: bigint
			recipients: string[]
			amount: bigint
		}>('describe_transfer', { unsigned_txset, multisig_txset })
	}

	/**
	 * Sign a string.
	 * @arg data - Anything you need to sign.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#sign}
	 */
	async sign(data?: string) {
		return await this.request<{
			signature: string
		}>('sign', { data })
	}

	/**
	 * Verify a signature on a string.
	 * @arg data - What should have been signed.
	 * @arg address - Public address of the wallet used to sign the data.
	 * @arg signature - signature generated by sign method.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#verify}
	 */
	async verify(data?: string, address?: string, signature?: string) {
		return await this.request<{
			good: boolean
		}>('verify', { data, address, signature })
	}

	/**
	 * Export outputs in hex format.
	 * @arg all - If true, export all outputs. Otherwise, export outputs since the last export. (default = false)
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#export_outputs}
	 */
	async exportOutputs(all?: boolean) {
		return await this.request<{
			outputs_data_hex: string
		}>('export_outputs', { all })
	}

	/**
	 * Import outputs in hex format.
	 * @arg outputs_data_hex - wallet outputs in hex format.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#import_outputs}
	 */
	async importOutputs(outputs_data_hex?: string) {
		return await this.request<{
			num_imported: bigint
		}>('import_outputs', { outputs_data_hex })
	}

	/**
	 * Export a signed set of key images.
	 * @arg all - If true, export all key images. Otherwise, export key images since the last export. (default = false)
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#export_key_images}
	 */
	async exportKeyImages(all?: boolean) {
		return await this.request<{
			offset: bigint
			signed_key_images: {
				key_image: string
				signature: string
			}[]
		}>('export_key_images', { all })
	}

	/**
	 * Import signed key images list and verify their spent status.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#import_key_images}
	 */
	async importKeyImages(
		signed_key_images?: string[],
		signature?: string,
		offset?: bigint
	) {
		return await this.request<{
			height: bigint
			spent: bigint
			unspent: bigint
		}>('import_key_images', { signed_key_images, signature, offset })
	}

	/**
	 * Create a payment URI using the official URI spec.
	 * @arg address - Wallet address
	 * @arg amount - the integer amount to receive, in atomic units
	 * @arg payment_id - (defaults to a random ID) 16 characters hex encoded.
	 * @arg recipient_name - name of the payment recipient
	 * @arg tx_description - Description of the reason for the tx
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#make_uri}
	 */
	async makeUri(
		address?: string,
		amount?: bigint | number,
		payment_id?: string,
		recipient_name?: string,
		tx_description?: string
	) {
		return await this.request<{
			uri: string
		}>('make_uri', {
			address,
			amount,
			payment_id,
			recipient_name,
			tx_description
		})
	}

	/**
	 * Parse a payment URI to get payment information.
	 * @arg uri - This contains all the payment input information as a properly formatted payment URI
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#parse_uri}
	 */
	async parseUri(uri?: string) {
		return await this.request<{
			uri: {
				address: string
				amount: bigint
				payment_id: string
				recipient_name: string
				tx_description: string
			}
		}>('parse_uri', { uri })
	}

	/**
	 * Retrieves entries from the address book.
	 * @arg entries - indices of the requested address book entries
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_address_book}
	 */
	async getAddressBook(entries?: (bigint | number)[]) {
		return await this.request<{
			entries: string[]
			description: string
			index: bigint
			payment_id: string
		}>('get_address_book', { entries })
	}

	/**
	 * Add an entry to the address book.
	 * @arg payment_id - (defaults to a random ID) 16 characters hex encoded.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#add_address_book}
	 */
	async addAddressBook(
		address?: string,
		payment_id?: string,
		description?: string
	) {
		return await this.request<{
			index: bigint
		}>('add_address_book', { address, payment_id, description })
	}

	/**
	 * Edit an existing address book entry.
	 * @arg index - Index of the address book entry to edit.
	 * @arg set_address - If true, set the address for this entry to the value of "address".
	 * @arg set_description - If true, set the description for this entry to the value of "description".
	 * @arg set_payment_id - If true, set the payment ID for this entry to the value of "payment_id".
	 * @arg address - The 95-character public address to set.
	 * @arg description - Human-readable description for this entry.
	 * @arg payment_id - (defaults to a random ID) 16 characters hex encoded.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#edit_address_book}
	 */
	async editAddressBook(
		index?: bigint | number,
		set_address?: boolean,
		set_description?: boolean,
		set_payment_id?: boolean,
		address?: string,
		description?: string,
		payment_id?: string
	) {
		return await this.request<{}>('edit_address_book', {
			index,
			set_address,
			set_description,
			set_payment_id,
			address,
			description,
			payment_id
		})
	}

	/**
	 * Delete an entry from the address book.
	 * @arg index - The index of the address book entry.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#delete_address_book}
	 */
	async deleteAddressBook(index?: bigint | number) {
		return await this.request<{}>('delete_address_book', { index })
	}

	/**
	 * Refresh a wallet after openning.
	 * @arg start_height - The block height from which to start refreshing. Passing no value or a value less than the last block scanned by the wallet refreshes from the last block scanned.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#refresh}
	 */
	async refresh(start_height?: bigint | number) {
		return await this.request<{
			blocks_fetched: bigint
			received_money: boolean
		}>('refresh', { start_height })
	}

	/**
	 * Set whether and how often to automatically refresh the current wallet.
	 * @arg enable - Enable or disable automatic refreshing (default = true).
	 * @arg period - The period of the wallet refresh cycle (i.e. time between refreshes) in seconds.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#auto_refresh}
	 */
	async autoRefresh(enable?: boolean, period?: bigint | number) {
		return await this.request<{}>('auto_refresh', { enable, period })
	}

	/**
	 * Rescan the blockchain for spent outputs.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#rescan_spent}
	 */
	async rescanSpent() {
		return await this.request<{}>('rescan_spent', {})
	}

	/**
	 * Start mining in the Monero daemon.
	 * @arg threads_count - Number of threads created for mining.
	 * @arg do_background_mining - Allow to start the miner in smart mining mode.
	 * @arg ignore_battery - Ignore battery status (for smart mining only)
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#start_mining}
	 */
	async startMining(
		threads_count?: bigint | number,
		do_background_mining?: boolean,
		ignore_battery?: boolean
	) {
		return await this.request<{}>('start_mining', {
			threads_count,
			do_background_mining,
			ignore_battery
		})
	}

	/**
	 * Stop mining in the Monero daemon.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#stop_mining}
	 */
	async stopMining() {
		return await this.request<{}>('stop_mining', {})
	}

	/**
	 * Get a list of available languages for your wallet's seed.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_languages}
	 */
	async getLanguages() {
		return await this.request<{
			languages: string[]
		}>('get_languages', {})
	}

	/**
	 * Create a new wallet. You need to have set the argument "–wallet-dir" when launching monero-wallet-rpc to make this work.
	 * @arg filename - Wallet file name.
	 * @arg language - Language for your wallets' seed.
	 * @arg password - password to protect the wallet.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#create_wallet}
	 */
	async createWallet(
		filename?: string,
		language?: string,
		password?: string
	) {
		return await this.request<{}>('create_wallet', {
			filename,
			language,
			password
		})
	}

	/**
	 * Restores a wallet from a given wallet address, view key, and optional spend key.
	 * @arg filename - The wallet's file name on the RPC server.
	 * @arg address - The wallet's primary address.
	 * @arg viewkey - The wallet's private view key.
	 * @arg password - The wallet's password.
	 * @arg restore_height - (defaults to 0) The block height to restore the wallet from.
	 * @arg spendkey - (omit to create a view-only wallet) The wallet's private spend key.
	 * @arg autosave_current - (Defaults to true) If true, save the current wallet before generating the new wallet.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#generate_from_keys}
	 */
	async generateFromKeys(
		filename?: string,
		address?: string,
		viewkey?: string,
		password?: string,
		restore_height?: bigint | number,
		spendkey?: string,
		autosave_current?: boolean
	) {
		return await this.request<{
			address: string
			info: string
		}>('generate_from_keys', {
			filename,
			address,
			viewkey,
			password,
			restore_height,
			spendkey,
			autosave_current
		})
	}

	/**
	 * Open a wallet. You need to have set the argument "–wallet-dir" when launching monero-wallet-rpc to make this work.
	 * @arg filename - wallet name stored in –wallet-dir.
	 * @arg password - only needed if the wallet has a password defined.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#open_wallet}
	 */
	async openWallet(filename?: string, password?: string) {
		return await this.request<{}>('open_wallet', { filename, password })
	}

	/**
	 * Create and open a wallet on the RPC server from an existing mnemonic phrase and close the currently open wallet.
	 * @arg filename - Name of the wallet.
	 * @arg password - Password of the wallet.
	 * @arg seed - Mnemonic phrase of the wallet to restore.
	 * @arg restore_height - Block height to restore the wallet from (default = 0).
	 * @arg language - Language of the mnemonic phrase in case the old language is invalid.
	 * @arg seed_offset - Offset used to derive a new seed from the given mnemonic to recover a secret wallet from the mnemonic phrase.
	 * @arg autosave_current - Whether to save the currently open RPC wallet before closing it (Defaults to true).
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#restore_deterministic_wallet}
	 */
	async restoreDeterministicWallet(
		filename?: string,
		password?: string,
		seed?: string,
		restore_height?: bigint | number,
		language?: string,
		seed_offset?: string,
		autosave_current?: boolean
	) {
		return await this.request<{
			address: string
			info: string
			seed: string
			was_deprecated: boolean
		}>('restore_deterministic_wallet', {
			filename,
			password,
			seed,
			restore_height,
			language,
			seed_offset,
			autosave_current
		})
	}

	/**
	 * Close the currently opened wallet, after trying to save it.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#close_wallet}
	 */
	async closeWallet() {
		return await this.request<{}>('close_wallet', {})
	}

	/**
	 * Change a wallet password.
	 * @arg old_password - Current wallet password, if defined.
	 * @arg new_password - New wallet password, if not blank.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#change_wallet_password}
	 */
	async changeWalletPassword(old_password?: string, new_password?: string) {
		return await this.request<{}>('change_wallet_password', {
			old_password,
			new_password
		})
	}

	/**
	 * Check if a wallet is a multisig one.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#is_multisig}
	 */
	async isMultisig() {
		return await this.request<{
			multisig: boolean
			ready: boolean
			threshold: bigint
			total: bigint
		}>('is_multisig', {})
	}

	/**
	 * Prepare a wallet for multisig by generating a multisig string to share with peers.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#prepare_multisig}
	 */
	async prepareMultisig() {
		return await this.request<{
			multisig_info: string
		}>('prepare_multisig', {})
	}

	/**
	 * Make a wallet multisig by importing peers multisig string.
	 * @arg multisig_info - List of multisig string from peers.
	 * @arg threshold - Amount of signatures needed to sign a transfer. Must be less or equal than the amount of signature in multisig_info.
	 * @arg password - Wallet password
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#make_multisig}
	 */
	async makeMultisig(
		multisig_info?: string[],
		threshold?: bigint | number,
		password?: string
	) {
		return await this.request<{
			address: string
			multisig_info: string
		}>('make_multisig', { multisig_info, threshold, password })
	}

	/**
	 * Export multisig info for other participants.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#export_multisig_info}
	 */
	async exportMultisigInfo() {
		return await this.request<{
			info: string
		}>('export_multisig_info', {})
	}

	/**
	 * Import multisig info from other participants.
	 * @arg info - List of multisig info in hex format from other participants.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#import_multisig_info}
	 */
	async importMultisigInfo(info?: string[]) {
		return await this.request<{
			n_outputs: bigint
		}>('import_multisig_info', { info })
	}

	/**
	 * Turn this wallet into a multisig wallet, extra step for N-1/N wallets.
	 * @arg multisig_info - List of multisig string from peers.
	 * @arg password - Wallet password
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#finalize_multisig}
	 */
	async finalizeMultisig(multisig_info?: string[], password?: string) {
		return await this.request<{
			address: string
		}>('finalize_multisig', { multisig_info, password })
	}

	/**
	 * Sign a transaction in multisig.
	 * @arg tx_data_hex - Multisig transaction in hex format, as returned by transfer under multisig_txset.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#sign_multisig}
	 */
	async signMultisig(tx_data_hex?: string) {
		return await this.request<{
			tx_data_hex: string
			tx_hash_list: string[]
		}>('sign_multisig', { tx_data_hex })
	}

	/**
	 * Submit a signed multisig transaction.
	 * @arg tx_data_hex - Multisig transaction in hex format, as returned by sign_multisig under tx_data_hex.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#submit_multisig}
	 */
	async submitMultisig(tx_data_hex?: string) {
		return await this.request<{
			tx_hash_list: string[]
		}>('submit_multisig', { tx_data_hex })
	}

	/**
	 * Get RPC version Major &amp; Minor integer-format, where Major is the first 16 bits and Minor the last 16 bits.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#get_version}
	 */
	async getVersion() {
		return await this.request<{
			version: bigint
		}>('get_version', {})
	}

	/**
	 * Freeze a single output by key image so it will not be used
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#freeze}
	 */
	async freeze(key_image?: string) {
		return await this.request<{}>('freeze', { key_image })
	}

	/**
	 * Checks whether a given output is currently frozen by key image
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#frozen}
	 */
	async frozen(key_image?: string) {
		return await this.request<{
			frozen: boolean
		}>('frozen', { key_image })
	}

	/**
	 * Thaw a single output by key image so it may be used again
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#thaw}
	 */
	async thaw(key_image?: string) {
		return await this.request<{}>('thaw', { key_image })
	}

	/**
	 * Performs extra multisig keys exchange rounds. Needed for arbitrary M/N multisig wallets
	 * @arg force_update_use_with_caution - (Default false) only require the minimum number of signers to complete this round (including local signer) ( minimum = num_signers - (round num - 1).
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#exchange_multisig_keys}
	 */
	async exchangeMultisigKeys(
		password?: string,
		multisig_info?: string,
		force_update_use_with_caution?: boolean
	) {
		return await this.request<{
			address: string
			multisig_info: string
		}>('exchange_multisig_keys', {
			password,
			multisig_info,
			force_update_use_with_caution
		})
	}

	/**
	 * @arg ring_size - Sets ringsize to n (mixin + 1). (Unless dealing with pre rct outputs, this field is ignored on mainnet).
	 * @arg rct - Is this a Ring Confidential Transaction (post blockheight 1220516)
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#estimate_tx_size_and_weight}
	 */
	async estimateTxSizeAndWeight(
		n_inputs?: bigint | number,
		n_outputs?: bigint | number,
		ring_size?: bigint | number,
		rct?: boolean
	) {
		return await this.request<{
			size: bigint
			weight: bigint
		}>('estimate_tx_size_and_weight', {
			n_inputs,
			n_outputs,
			ring_size,
			rct
		})
	}

	/**
	 * Given list of txids, scan each for outputs belonging to your wallet. Note that the node will see these specific requests and may be a privacy concern.
	 * @see {@link https://www.getmonero.org/resources/developer-guides/wallet-rpc.html#scan_tx}
	 */
	async scanTx(txids?: string[]) {
		return await this.request<{}>('scan_tx', { txids })
	}
}
