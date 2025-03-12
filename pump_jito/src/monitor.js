require('dotenv').config();
const { Connection, Keypair } = require('@solana/web3.js');
const { AnchorProvider } = require('@coral-xyz/anchor');
const { PumpFunSDK } = require('pumpdotfun-sdk');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function watchNewToken() {
    try {
        const connection = new Connection(process.env.HELIUS_RPC_URL, {
            commitment: 'confirmed'
        });
        
        const wallet = {
            publicKey: Keypair.generate().publicKey,
            signTransaction: () => Promise.reject(),
            signAllTransactions: () => Promise.reject(),
        };

        const provider = new AnchorProvider(connection, wallet, {
            commitment: 'confirmed',
            preflightCommitment: 'confirmed',
        });

        const sdk = new PumpFunSDK(provider);
        
        return new Promise((resolve) => {
            sdk.addEventListener("createEvent", async (event) => {
                try {
                    const response = await fetch(event.uri);
                    const metadata = await response.json();
                    resolve(metadata);
                } catch (error) {
                    resolve(null);
                }
            });
        });
    } catch (error) {
        console.error("Watch token error:", error);
        return null;
    }
}

module.exports = {
    watchNewToken
};
 