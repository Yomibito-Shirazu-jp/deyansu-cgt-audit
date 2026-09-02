import { useCallback, useEffect, useState } from "react";
import { Contract, parseEther, formatEther, JsonRpcProvider } from "ethers";
import { CHAIN_CONFIG } from "./config";
import { ERC20_ABI, OPTIMISM_PORTAL2_ABI } from "./abi";
import { useWalletContext } from "./WalletContext";

function safeError(e: unknown): string {
  if (e instanceof Error) {
    if (e.message.includes("user rejected")) return "トランザクションがキャンセルされました";
    if (e.message.includes("insufficient funds")) return "残高不足です";
    return "デポジットエラーが発生しました";
  }
  return "不明なエラーが発生しました";
}

export function Dashboard() {
  const wallet = useWalletContext();
  const [depositAmount, setDepositAmount] = useState("");
  const [depositStatus, setDepositStatus] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);
  const [tokenInfo, setTokenInfo] = useState({ name: "", symbol: "", totalSupply: "" });

  const fetchTokenInfo = useCallback(async () => {
    try {
      const l1Provider = new JsonRpcProvider(CHAIN_CONFIG.l1.rpcUrl);
      const token = new Contract(CHAIN_CONFIG.l1.dysTokenAddress, ERC20_ABI, l1Provider);
      const [name, symbol, totalSupply] = await Promise.all([
        token.name(),
        token.symbol(),
        token.totalSupply ? token.totalSupply() : Promise.resolve(BigInt(0)),
      ]);
      setTokenInfo({
        name,
        symbol,
        totalSupply: formatEther(totalSupply),
      });
    } catch {
      setTokenInfo({ name: "Deyansu", symbol: "1DYS", totalSupply: "0" });
    }
  }, []);

  useEffect(() => {
    fetchTokenInfo();
  }, [fetchTokenInfo]);

  const handleDeposit = useCallback(async () => {
    if (!wallet.account || !depositAmount) return;
    setDepositLoading(true);
    setDepositStatus("");
    try {
      if (!(await wallet.ensureChain(CHAIN_CONFIG.l1.chainId))) {
        setDepositStatus("Baseチェーンに切り替えられませんでした。処理を中止しました。");
        setDepositLoading(false);
        return;
      }
      if (!wallet.checkBalance(depositAmount, wallet.l1TokenBalance)) {
        setDepositStatus("L1トークン残高不足です");
        setDepositLoading(false);
        return;
      }
      const signer = await wallet.getSigner();

      const token = new Contract(CHAIN_CONFIG.l1.dysTokenAddress, ERC20_ABI, signer);
      const approveTx = await token.approve(
        CHAIN_CONFIG.l1.optimismPortal2Address,
        parseEther(depositAmount)
      );
      wallet.addTxLog({
        timestamp: Date.now(),
        type: "Dashboard Deposit Approve",
        hash: approveTx.hash,
        status: "pending",
        details: `${depositAmount} 1DYS`,
      });
      await approveTx.wait();
      wallet.addTxLog({
        timestamp: Date.now(),
        type: "Dashboard Deposit Approve",
        hash: approveTx.hash,
        status: "success",
        details: `${depositAmount} 1DYS`,
      });

      const portal = new Contract(
        CHAIN_CONFIG.l1.optimismPortal2Address,
        OPTIMISM_PORTAL2_ABI,
        signer
      );
      const depositTx = await portal.depositERC20Transaction(
        wallet.account,
        parseEther(depositAmount),
        0,
        200000,
        false,
        "0x"
      );
      wallet.addTxLog({
        timestamp: Date.now(),
        type: "Dashboard Deposit",
        hash: depositTx.hash,
        status: "pending",
        details: `${depositAmount} 1DYS via OptimismPortal2`,
      });
      await depositTx.wait();
      wallet.addTxLog({
        timestamp: Date.now(),
        type: "Dashboard Deposit",
        hash: depositTx.hash,
        status: "success",
        details: `${depositAmount} 1DYS via OptimismPortal2`,
      });
      setDepositStatus(`デポジット完了: ${depositAmount} 1DYS`);
      await wallet.fetchBalances(wallet.account);
    } catch (e) {
      const msg = safeError(e);
      setDepositStatus(msg);
      wallet.addTxLog({
        timestamp: Date.now(),
        type: "Dashboard Deposit",
        hash: "",
        status: "failed",
        details: msg,
      });
    } finally {
      setDepositLoading(false);
    }
  }, [wallet, depositAmount]);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Dashboard</h2>

        {!wallet.account ? (
          <button
            onClick={wallet.connectWallet}
            className="w-full py-3 bg-nlt-600 text-white rounded-xl font-semibold hover:bg-nlt-700 transition"
          >
            ウォレット接続
          </button>
        ) : (
          <>
            {wallet.balanceError && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                {wallet.balanceError}
              </div>
            )}
            <div className="mb-4 text-sm text-gray-600">
              <div>Account: <span className="font-mono">{wallet.account.slice(0, 10)}...{wallet.account.slice(-6)}</span></div>
              <div>Chain ID: {wallet.chainId}</div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-gradient-to-br from-nlt-50 to-nlt-100 rounded-xl p-4">
                <div className="text-xs text-gray-500">L1 ETH</div>
                <div className="font-mono font-bold text-lg">{parseFloat(wallet.l1Balance).toFixed(4)}</div>
              </div>
              <div className="bg-gradient-to-br from-nlt-50 to-nlt-100 rounded-xl p-4">
                <div className="text-xs text-gray-500">L1 1DYS</div>
                <div className="font-mono font-bold text-lg">{parseFloat(wallet.l1TokenBalance).toFixed(2)}</div>
              </div>
              <div className="bg-gradient-to-br from-nlt-50 to-nlt-100 rounded-xl p-4">
                <div className="text-xs text-gray-500">L2 1DYS</div>
                <div className="font-mono font-bold text-lg">{parseFloat(wallet.l2Balance).toFixed(2)}</div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="text-sm text-gray-600 mb-2">トークン情報</div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><span className="text-gray-400">Name:</span> {tokenInfo.name}</div>
                <div><span className="text-gray-400">Symbol:</span> {tokenInfo.symbol}</div>
                <div><span className="text-gray-400">Supply:</span> {parseFloat(tokenInfo.totalSupply).toLocaleString()}</div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-800 mb-2">3400億デポジット (L1→L2)</h3>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="amount (1DYS)"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nlt-500"
                />
                <button
                  onClick={() => setDepositAmount(CHAIN_CONFIG.token.totalSupply)}
                  className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200"
                >
                  Max
                </button>
                <button
                  onClick={handleDeposit}
                  disabled={depositLoading || !depositAmount}
                  className="px-6 py-2 bg-nlt-600 text-white rounded-lg font-semibold hover:bg-nlt-700 transition disabled:opacity-50"
                >
                  {depositLoading ? "処理中..." : "Deposit"}
                </button>
              </div>
              {depositStatus && (
                <div className="mt-2 text-sm text-gray-700 break-all">{depositStatus}</div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-3">トランザクションログ</h3>
        {wallet.txLogs.length === 0 ? (
          <div className="text-sm text-gray-400 py-8 text-center">トランザクション履歴がありません</div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {wallet.txLogs.map((log, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg text-sm border ${
                  log.status === "success"
                    ? "bg-green-50 border-green-200"
                    : log.status === "failed"
                    ? "bg-red-50 border-red-200"
                    : "bg-yellow-50 border-yellow-200"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-semibold">{log.type}</span>
                    <span className="text-gray-500 ml-2 text-xs">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <span className={`text-xs font-medium ${
                    log.status === "success" ? "text-green-600" :
                    log.status === "failed" ? "text-red-600" : "text-yellow-600"
                  }`}>
                    {log.status}
                  </span>
                </div>
                <div className="text-gray-600 text-xs mt-1">{log.details}</div>
                {log.hash && (
                  <div className="text-gray-400 text-xs mt-1 font-mono">
                    tx: {log.hash.slice(0, 20)}...{log.hash.slice(-8)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
