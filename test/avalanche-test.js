const expect = require('chai').expect;
const sinon = require('sinon')
const {UnsignedTx } = require("avalanche/dist/apis/evm");
const { Buffer } = require("avalanche");
const Client = require('../src/client');

describe('Avalanche client Tests', async function () {
    const client = new Client({
        url: "http://localhost:9650",
    });

    before(async () => {
        sinon.stub(client.infoAPI, "getNetworkID").resolves("5");
        await client.init();
    })

    after(async () => {
        await client.terminate();
    })

    it("be eqal objects when converting from and to hex ", async () => {
        //create an unsigned Tx in wallet
        const exportTx = await client.createAtomicExportTxCToP(
            "1000000000",
            "0x5a6a57fafc7c52f39086a963da9a4d55e958c966",
            "C-fuji1vrgpamm48mu5jc5gzg33tv7je8x48887nv0qq6",
            'P-fuji1vrgpamm48mu5jc5gzg33tv7je8x48887nv0qq6'
        );

        // convert to String
        const buffer = exportTx.toBuffer();
        const bufferAsString = buffer.toString("hex");

        // Store in DB
        const recreatedBuffer = Buffer.from(bufferAsString, "hex");

        //recreate UnsignedTx for signing
        const newExportTx = new UnsignedTx();
        newExportTx.fromBuffer(recreatedBuffer);
        expect(newExportTx).to.eql(exportTx)
    });
})
