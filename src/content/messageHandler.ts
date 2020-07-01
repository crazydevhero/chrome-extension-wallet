import { HARMONY_REQUEST_TYPE, HARMONY_RESPONSE_TYPE } from "../services/types";
import { TRANSACTIONTYPE, STAKINGTYPE } from "../services/types";
import { StakingTransaction } from "@harmony-js/staking";
import { HarmonyAddress } from "@harmony-js/crypto";
import { Unit } from "@harmony-js/utils";
import { Transaction } from "@harmony-js/transaction";

const unWrapMessageFromContentScript = (data: any) => data.message;
const filterExtensionMessage = (callback: any) => (message: any) => {
  if (message === undefined) return;
  const { detail } = message;
  if (!detail) return;
  if (detail.type && detail.type === HARMONY_RESPONSE_TYPE) {
    callback(detail);
  }
};

const waitForResponse = (type: any) => {
  return new Promise((resolve) => {
    const handler = filterExtensionMessage((data: any) => {
      const message = unWrapMessageFromContentScript(data);
      if (message.type === type) {
        resolve(message.payload);
      }

      // cleanup
      window.removeEventListener("ONEWALLET_SERVICE_EVENT_RESPONSE", handler);
    });
    window.addEventListener("ONEWALLET_SERVICE_EVENT_RESPONSE", handler);
  });
};

const sendMessageToContentScript = (payload: any) => {
  window.dispatchEvent(
    new CustomEvent("ONEWALLET_SERVICE_EVENT_REQUEST", {
      detail: {
        type: HARMONY_REQUEST_TYPE,
        payload,
      },
    })
  );
};

export const sendAsyncMessageToContentScript = async (payload: any) => {
  sendMessageToContentScript(payload);
  const response: any = await waitForResponse(`${payload.type}_RESPONSE`);
  return response;
};

export const getTxnInfo = (transaction: Transaction | StakingTransaction) =>
  new Promise((resolve, reject) => {
    let response: any;
    try {
      if (transaction.constructor.name === Transaction.name) {
        const txnParams = (transaction as Transaction).txParams;
        response = {
          type: TRANSACTIONTYPE.SEND,
          txnInfo: {
            from: new HarmonyAddress(txnParams.from).bech32,
            to: new HarmonyAddress(txnParams.to).bech32,
            amount: Unit.Wei(txnParams.value).toEther(),
            gasLimit: Unit.Wei(txnParams.gasLimit).toWeiString(),
            gasPrice: Unit.Wei(txnParams.gasPrice).toGwei(),
            fromShard: txnParams.shardID,
            toShard: txnParams.toShardID,
          },
        };
      } else if (transaction.constructor.name === StakingTransaction.name) {
        const stakeTransaction: any = JSON.parse(JSON.stringify(transaction));
        const stakeMsg: any = stakeTransaction.stakeMsg;
        const delegatorAddress = new HarmonyAddress(stakeMsg.delegatorAddress)
          .bech32;
        const gasLimit = Unit.Wei(stakeTransaction.gasLimit).toWeiString();
        const gasPrice = Unit.Wei(stakeTransaction.gasPrice).toGwei();
        if (
          stakeTransaction.directive === STAKINGTYPE.DELEGATE ||
          stakeTransaction.directive === STAKINGTYPE.UNDELEGATE
        ) {
          response = {
            type:
              stakeTransaction.directive === STAKINGTYPE.DELEGATE
                ? TRANSACTIONTYPE.DELEGATE
                : TRANSACTIONTYPE.UNDELEGATE,
            txnInfo: {
              from: delegatorAddress,
              to: new HarmonyAddress(stakeMsg.validatorAddress).bech32,
              amount: Unit.Wei(stakeMsg.amount).toEther(),
              gasLimit,
              gasPrice,
            },
          };
        } else if (stakeTransaction.directive === STAKINGTYPE.WITHDRAWREWARD) {
          response = {
            type: TRANSACTIONTYPE.WITHDRAWREWARD,
            txnInfo: {
              from: delegatorAddress,
              gasLimit,
              gasPrice,
            },
          };
        }
      }
      resolve(response);
    } catch (err) {
      reject(err);
    }
  });
