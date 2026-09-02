import { useState, useCallback } from "react";
import { Contract, parseEther } from "ethers";
import { CHAIN_CONFIG } from "./config";
import { ERC20_ABI, OPTIMISM_PORTAL2_ABI, L2_TO_L1_MESSAGE_PASSER_ABI } from "./abi";
import { useWalletContext } from "./WalletContext";

type Direction = "deposit" | "withdraw";

function safeError(e: unknown): string {
  if (e instanceof Error) {
    if (e.message.includes("user rejected")) return "トランザクションがキャンセルされました";
    if (e.message.includes("insufficient funds")) return "残高不足です";
    return "トランザクションエラーが発生しました";
  }
  return "不明なエラーが発生しました";
}

function isValidAmount(amount: string): boolean {
  if (!amount || amount === ".") return false;
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0;
}

export function Bridge() {
  const wallet = useWalletContext();
  const [direction, setDirection] = useState<Direction>("deposit");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const handleBridge = useCallback(async () => {
    if (!wallet.account || !isValidAmount(amount)) return;
    setLoading(true);
    setStatus("");
    try {
      if (direction === "deposit") {
        if (!(await wallet.ensureChain(CHAIN_CONFIG.l1.chainId))) {
          setStatus("Baseチェーンに切り替えられませんでした。処理を中止しました。");
          setLoading(false);
          return;
        }
        if (!wallet.checkBalance(amount, wallet.l1TokenBalance)) {
          setStatus("L1トークン残高不足です");
          setLoading(false);
          return;
        }
        const signer = await wallet.getSigner();

        const token = new Contract(CHAIN_CONFIG.l1.dysTokenAddress, ERC20_ABI, signer);
        const approveTx = await token.approve(
          CHAIN_CONFIG.l1.optimismPortal2Address,
          parseEther(amount)
        );
        wallet.addTxLog({
          timestamp: Date.now(),
          type: "Bridge Approve (L1→L2)",
          hash: approveTx.hash,
          status: "pending",
          details: `${amount} 1DYS`,
        });
        await approveTx.wait();
        wallet.addTxLog({
          timestamp: Date.now(),
          type: "Bridge Approve (L1→L2)",
          hash: approveTx.hash,
          status: "success",
          details: `${amount} 1DYS`,
        });
        setStatus("承認完了。デポジット中...");

        const portal = new Contract(
          CHAIN_CONFIG.l1.optimismPortal2Address,
          OPTIMISM_PORTAL2_ABI,
          signer
        );
        const depositTx = await portal.depositERC20Transaction(
          wallet.account,
          parseEther(amount),
          0,
          200000,
          false,
          "0x"
        );
        wallet.addTxLog({
          timestamp: Date.now(),
          type: "Bridge Deposit (L1→L2)",
          hash: depositTx.hash,
          status: "pending",
          details: `${amount} 1DYS via OptimismPortal2`,
        });
        await depositTx.wait();
        wallet.addTxLog({
          timestamp: Date.now(),
          type: "Bridge Deposit (L1→L2)",
          hash: depositTx.hash,
          status: "success",
          details: `${amount} 1DYS via OptimismPortal2`,
        });
        setStatus(`デポジット完了: ${amount} 1DYS`);
      } else {
        if (!(await wallet.ensureChain(CHAIN_CONFIG.l2.chainId))) {
          setStatus("Deyansu L2チェーンに切り替えられませんでした。処理を中止しました。");
          setLoading(false);
          return;
        }
        if (!wallet.checkBalance(amount, wallet.l2Balance)) {
          setStatus("L2残高不足です");
          setLoading(false);
          return;
        }
        const signer = await wallet.getSigner();

        const passer = new Contract(
          CHAIN_CONFIG.l2.l2ToL1MessagePasserAddress,
          L2_TO_L1_MESSAGE_PASSER_ABI,
          signer
        );
        const withdrawTx = await passer.initiateWithdrawal(
          wallet.account,
          parseEther(amount),
          200000,
          "0x"
        );
        wallet.addTxLog({
          timestamp: Date.now(),
          type: "Bridge Withdraw (L2→L1)",
          hash: withdrawTx.hash,
          status: "pending",
          details: `${amount} 1DYS via L2ToL1MessagePasser`,
        });
        await withdrawTx.wait();
        wallet.addTxLog({
          timestamp: Date.now(),
          type: "Bridge Withdraw (L2→L1)",
          hash: withdrawTx.hash,
          status: "success",
          details: `${amount} 1DYS via L2ToL1MessagePasser`,
        });
        setStatus(`引き出し完了: ${amount} 1DYS (7日後にL1でClaim可能)`);
      }
      await wallet.fetchBalances(wallet.account);
    } catch (e) {
      const msg = safeError(e);
      setStatus(msg);
      wallet.addTxLog({
        timestamp: Date.now(),
        type: direction === "deposit" ? "Bridge Deposit" : "Bridge Withdraw",
        hash: "",
        status: "failed",
        details: msg,
      });
    } finally {
      setLoading(false);
    }
  }, [wallet, amount, direction]);

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
      <h2 className="text-xl font-bold text-gray-900 mb-4">1DYS Bridge</h2>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setDirection("deposit")}
          className={`flex-1 py-2 rounded-lg font-medium transition ${
            direction === "deposit"
              ? "bg-nlt-500 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          L1 → L2
        </button>
        <button
          onClick={() => setDirection("withdraw")}
          className={`flex-1 py-2 rounded-lg font-medium transition ${
            direction === "withdraw"
              ? "bg-nlt-500 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          L2 → L1
        </button>
      </div>

      {!wallet.account ? (
        <button
          onClick={wallet.connectWallet}
          className="w-full py-3 bg-nlt-600 text-white rounded-xl font-semibold hover:bg-nlt-700 transition"
        >
          ウォレット接続
        </button>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500">L1 1DYS</div>
              <div className="font-mono font-semibold">{wallet.l1TokenBalance}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500">L2 1DYS (Native)</div>
              <div className="font-mono font-semibold">{wallet.l2Balance}</div>
            </div>
          </div>

          <div className="mb-2 text-xs text-gray-500">
            Chain ID: {wallet.chainId} | Account: {wallet.account.slice(0, 8)}...{wallet.account.slice(-4)}
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">金額 (1DYS)</label>
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nlt-500 focus:border-transparent"
            />
            {amount && !isValidAmount(amount) && (
              <div className="text-xs text-red-500 mt-1">有効な金額を入力してください</div>
            )}
          </div>

          <button
            onClick={handleBridge}
            disabled={loading || !isValidAmount(amount)}
            className="w-full py-3 bg-nlt-600 text-white rounded-xl font-semibold hover:bg-nlt-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "処理中..." : direction === "deposit" ? "デポジット" : "引き出し"}
          </button>
        </>
      )}

      {status && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 break-all">
          {status}
        </div>
      )}

      {wallet.error && (
        <div className="mt-2 p-3 bg-red-50 rounded-lg text-sm text-red-700">
          {wallet.error}
        </div>
      )}
    </div>
  );
}
