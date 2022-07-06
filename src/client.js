const { Avalanche, Buffer, BN: { BN }, UnsignedTx, SECP256k1KeyChain, PlatformVMAPI, EVMAPI, AVMAPI, AvalancheCore } = require('avalanche');
const { Defaults, Serialization} = require('avalanche/dist/utils');
const {InfoAPI} = require("avalanche/dist/apis/info");
const {SECP256k1KeyPair} = require("avalanche/dist/common");
const Web3 = require("web3");

class InvalidChainError extends Error {}
class InvalidArgumentError extends Error {}


class AvalancheClient {
    /**
     * @typedef ChainIdentifier = "X" | "C" | "P"
     */

    static C_CHAIN_IDENTIFIER = "C";
    static P_CHAIN_IDENTIFIER = "P";
    static X_CHAIN_IDENTIFIER = "X";
    /**
     * @param {{
     *     url: string;
     * }} options Client options. only port, protocol and host part of URL will be used all else will be discarded.
     */
    constructor(options) {

        console.log(`Starting Avalanche client for URL(${options.url})`)
        this.options = options;
        const cChainRpcBaseUrl = '/ext/bc/C/rpc';
        this.web3 = new Web3(`${this.options.url}${cChainRpcBaseUrl}`);
        const { url } = this.options;
        const { host, port, protocol } = AvalancheClient.urlDecoder(url);
        const avalancheCore = new AvalancheCore(host, Number(port), protocol);
        this.infoAPI = new InfoAPI(avalancheCore);

        /** function binding */
        this.createAtomicExportTxCToP = this.createAtomicExportTxCToP.bind(this);
        this.init = this.init.bind(this);
        this.terminate = this.terminate.bind(this);
        this.getClientForChain = this.getClientForChain.bind(this);
        this.getAddressStringsForPublicKey = this.getAddressStringsForPublicKey.bind(this);
    }

    async init() {
        try {
            const { host, port, protocol } = AvalancheClient.urlDecoder(this.options.url);
            this.networkId = await this.infoAPI.getNetworkID();
            this.avaxClient = new Avalanche(host, Number(port), protocol, Number(this.networkId));
            this.hrp = Defaults.network[this.networkId].hrp;
        } catch (e){
            console.log(`could not initialize ${this.constructor.name}`, e)
        }
    }

    async terminate(){}

    /**
     * split up a given URL into protocol, port and host
     * @param url
     * @returns {{protocol: string, port: string, host: string}}
     */
    static urlDecoder = (url) => {
        const protocol = url.split('://')[0];
        const portPart = url.split('://')[1]?.split(':')[1] || "80";
        const port = portPart.split(/[\/?]/)[0];
        const host = url.split('://')[1]?.split(':')[0];
        if(!(protocol && port && host)){
            throw new InvalidArgumentError(`Invalid URL ${url} provided to decode`);
        }
        return {
            protocol, port, host
        }
    }

    /**
     * create an unsigned transaction for an atomic export of funds from the C chain to the P chain
     * @param {string} amount
     * @param {string} cChainAddress
     * @param {string} cAddressString
     * @param {string} pAddressString
     * @param {number} [nonce] optional argument where you can overrride the nonce
     * @param {BN} [fee] optional argument where you can overrride the fee
     * @returns {Promise<UnsignedTx>}
     */
    async createAtomicExportTxCToP(amount, cChainAddress, cAddressString, pAddressString, nonce, fee) {
        const pChainBlockchainIdStr = Defaults.network[this.networkId].P.blockchainID;
        const avaxAssetID = Defaults.network[this.networkId].X.avaxAssetID;
        /** @type EVMAPI */
        const cChainClient = this.getClientForChain(AvalancheClient.C_CHAIN_IDENTIFIER);
        const baseFeeResponse = await cChainClient.getBaseFee();
        const baseFee = new BN(parseInt(baseFeeResponse, 16));
        const lockTime = new BN(0);
        const threshold = 1;

        // Fees
        let feeToApply = fee;
        if(!fee){
            feeToApply = baseFee.div(new BN(1e9));
            feeToApply = feeToApply.add(new BN(1e6));
        }

        // Nonce
        let nonceToApply = nonce;
        if(!nonce){
            nonceToApply = await this.web3.eth.getTransactionCount(cChainAddress);
        }

        return await cChainClient.buildExportTx(
            new BN(amount),
            avaxAssetID,
            pChainBlockchainIdStr,
            cChainAddress,
            cAddressString,
            [pAddressString],
            nonceToApply,
            lockTime,
            threshold,
            feeToApply
        );
    }

    /**
     * get address strings for a given private key
     * @param {Buffer} publicKeyBuffer
     * @returns {{cAddressString: string, xAddressString: string, pAddressString: string}}
     */
    getAddressStringsForPublicKey(publicKeyBuffer){
        const address = SECP256k1KeyPair.addressFromPublicKey(publicKeyBuffer);
        const pAddressString = Serialization.getInstance().bufferToType(address, "bech32", this.hrp, AvalancheClient.P_CHAIN_IDENTIFIER)
        const cAddressString = Serialization.getInstance().bufferToType(address, "bech32", this.hrp, AvalancheClient.C_CHAIN_IDENTIFIER)
        const xAddressString = Serialization.getInstance().bufferToType(address, "bech32", this.hrp, AvalancheClient.X_CHAIN_IDENTIFIER)

        return {
            pAddressString,
            cAddressString,
            xAddressString
        }
    }

    /**
     * return client specific for a given Chain
     * @param {ChainIdentifier} chain
     * @returns {PlatformVMAPI | AVMAPI | EVMAPI}
     */
    getClientForChain(chain) {
        switch (chain){
            case AvalancheClient.X_CHAIN_IDENTIFIER:
                return this.avaxClient.XChain();
            case AvalancheClient.C_CHAIN_IDENTIFIER:
                return this.avaxClient.CChain();
            case AvalancheClient.P_CHAIN_IDENTIFIER:
                return this.avaxClient.PChain();
            default: {
                throw new InvalidChainError("Chain must be either 'X', 'C' or 'P'")
            }
        }
    }

}

module.exports = AvalancheClient;
