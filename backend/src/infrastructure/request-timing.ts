import { AsyncLocalStorage } from "node:async_hooks";

export type RequestTiming = {
  authMs: number;
  poolWaitMs: number;
  transactionMs: number;
  transactions: number;
};

export const requestTiming = new AsyncLocalStorage<RequestTiming>();
