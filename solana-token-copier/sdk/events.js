const { PublicKey } = require('@solana/web3.js');

class EventProcessor {
  static toCreateEvent(event) {
    try {
      return {
        name: event.name,
        symbol: event.symbol,
        uri: event.uri,
        mint: new PublicKey(event.mint),
        bondingCurve: new PublicKey(event.bondingCurve),
        user: new PublicKey(event.user),
      };
    } catch (error) {
      console.error('Error processing create event:', error);
      return event;
    }
  }

  static toTradeEvent(event) {
    try {
      return {
        mint: new PublicKey(event.mint),
        solAmount: BigInt(event.solAmount),
        tokenAmount: BigInt(event.tokenAmount),
        isBuy: event.isBuy,
        user: new PublicKey(event.user),
        timestamp: Number(event.timestamp),
        virtualSolReserves: BigInt(event.virtualSolReserves),
        virtualTokenReserves: BigInt(event.virtualTokenReserves),
        realSolReserves: BigInt(event.realSolReserves),
        realTokenReserves: BigInt(event.realTokenReserves),
      };
    } catch (error) {
      console.error('Error processing trade event:', error);
      return event;
    }
  }

  static toCompleteEvent(event) {
    try {
      return {
        user: new PublicKey(event.user),
        mint: new PublicKey(event.mint),
        bondingCurve: new PublicKey(event.bondingCurve),
        timestamp: event.timestamp,
      };
    } catch (error) {
      console.error('Error processing complete event:', error);
      return event;
    }
  }

  static toSetParamsEvent(event) {
    try {
      return {
        feeRecipient: new PublicKey(event.feeRecipient),
        initialVirtualTokenReserves: BigInt(event.initialVirtualTokenReserves),
        initialVirtualSolReserves: BigInt(event.initialVirtualSolReserves),
        initialRealTokenReserves: BigInt(event.initialRealTokenReserves),
        tokenTotalSupply: BigInt(event.tokenTotalSupply),
        feeBasisPoints: BigInt(event.feeBasisPoints),
      };
    } catch (error) {
      console.error('Error processing set params event:', error);
      return event;
    }
  }
}

module.exports = { EventProcessor }; 