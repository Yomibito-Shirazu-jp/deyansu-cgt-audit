import { useState, useCallback } from "react";
import { Contract, parseEther, formatEther, JsonRpcProvider } from "ethers";
import { CHAIN_CONFIG } from "./config";
import { ERC20_ABI, RAILGUN_ABI } from "./abi";
import { useWalletContext } from "./WalletContext";

function safeError(e: unknown): string {
  if (e instanceof Error) {
    if (e.message.includes("user rejected")) return "トランザクションがキャンセルされました";
    if (e.message.includes("insufficient funds")) return "残高不足です";
    return "ステルス送金エラーが発生しました";
  }
  return "不明なエラーが発生しました";
}

function isValidAmount(amount: string): boolean {
  if (!amount || amount === ".") return false;
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0;
}

function isValidBytes32(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function Stealth() {
  const wallet = useWalletContext();
  const [mode, setMode] = useState<"shield" | "unshield">("shield");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [shieldedBalance, setShieldedBalance] = useState("0.0");

  const fetchShieldedBalance = useCallback(async (addr: string) => {
    try {
      const l2Provider = new JsonRpcProvider(CHAIN_CONFIG.l2.rpcUrl);
      const railgun = new Contract(CHAIN_CONFIG.railgun.railgunAddress, RAILGUN_ABI, l2Provider);
      const bal = await railgun.balanceOf(addr);
      setShieldedBalance(formatEther(bal));
    } catch {
      setShieldedBalance("0.0");
    }
  }, []);

  const handleStealth = useCallback(async () => {
    if (!wallet.account || !isValidAmount(amount)) return;
    if (mode === "unshield" && !isValidBytes32(recipient)) return;
    setLoading(true);
    setStatus("");
    try {
      if (wallet.chainId !== CHAIN_CONFIG.l2.chainId) {
        await wallet.switchToL2();
      }
      const signer = await wallet.getSigner();

      if (mode === "shield") {
        if (!wallet.checkBalance(amount, wallet.l2Balance)) {
          setStatus("L2残高不足です");
          setLoading(false);
          return;
        }

        const token = new Contract(CHAIN_CONFIG.l2.wDysAddress, ERC20_ABI, signer);
        const approveTx = await token.approve(
          CHAIN_CONFIG.railgun.railgunAddress,
          parseEther(amount)
        );
        wallet.addTxLog({
          timestamp: Date.now(),
          type: "Stealth Shield Approve",
          hash: approveTx.hash,
          status: "pending",
          details: `${amount} 1DYS`,
        });
        await approveTx.wait();
        wallet.addTxLog({
          timestamp: Date.now(),
          type: "Stealth Shield Approve",
          hash: approveTx.hash,
          status: "success",
          details: `${amount} 1DYS`,
        });

        const railgun = new Contract(CHAIN_CONFIG.railgun.railgunAddress, RAILGUN_ABI, signer);
        const shieldTx = await railgun.shield(
          CHAIN_CONFIG.l2.wDysAddress,
          parseEther(amount)
        );
        wallet.addTxLog({
          timestamp: Date.now(),
          type: "Stealth Shield",
          hash: shieldTx.hash,
          status: "pending",
          details: `${amount} 1DYS → Shielded`,
        });
        await shieldTx.wait();
        wallet.addTxLog({
          timestamp: Date.now(),
          type: "Stealth Shield",
          hash: shieldTx.hash,
          status: "success",
          details: `${amount} 1DYS → Shielded`,
        });
        setStatus(`シールド完了: ${amount} 1DYS`);
      } else {
        const railgun = new Contract(CHAIN_CONFIG.railgun.railgunAddress, RAILGUN_ABI, signer);
        const unshieldTx = await railgun.unshield(
          recipient,
          CHAIN_CONFIG.l2.wDysAddress,
          parseEther(amount)
        );
        wallet.addTxLog({
          timestamp: Date.now(),
          type: "Stealth Unshield",
          hash: unshieldTx.hash,
          status: "pending",
          details: `${amount} 1DYS → ${recipient.slice(0, 10)}...`,
        });
        await unshieldTx.wait();
        wallet.addTxLog({
          timestamp: Date.now(),
          type: "Stealth Unshield",
          hash: unshieldTx.hash,
          status: "success",
          details: `${amount} 1DYS → ${recipient.slice(0, 10)}...`,
        });
        setStatus(`アンシールド完了: ${amount} 1DYS`);
      }
      await fetchShieldedBalance(wallet.account);
      await wallet.fetchBalances(wallet.account);
    } catch (e) {
      const msg = safeError(e);
      setStatus(msg);
      wallet.addTxLog({
        timestamp: Date.now(),
        type: "Stealth",
        hash: "",
        status: "failed",
        details: msg,
      });
    } finally {
      setLoading(false);
    }
  }, [wallet, amount, mode, recipient, fetchShieldedBalance]);

  const handleConnectAndFetch = useCallback(async () => {
    const addr = await wallet.connectWallet();
    if (addr) {
      await fetchShieldedBalance(addr);
    }
  }, [wallet, fetchShieldedBalance]);

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Stealth Transfer (Railgun)</h2>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode("shield")}
          className={`flex-1 py-2 rounded-lg font-medium transition ${
            mode === "shield"
              ? "bg-nlt-500 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Shield
        </button>
        <button
          onClick={() => setMode("unshield")}
          className={`flex-1 py-2 rounded-lg font-medium transition ${
            mode === "unshield"
              ? "bg-nlt-500 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Unshield
        </button>
      </div>

      {!wallet.account ? (
        <button
          onClick={handleConnectAndFetch}
          className="w-full py-3 bg-nlt-600 text-white rounded-xl font-semibold hover:bg-nlt-700 transition"
        >
          ウォレット接続
        </button>
      ) : (
        <>
          <div className="mb-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4">
            <div className="text-xs text-gray-500">Shielded Balance</div>
            <div className="font-mono font-bold text-lg">{shieldedBalance} 1DYS</div>
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nlt-500"
            />
          </div>

          {mode === "unshield" && (
            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-1">受信者 (bytes32)</label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x... (64 hex chars)"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nlt-500 font-mono text-sm"
              />
              {recipient && !isValidBytes32(recipient) && (
                <div className="text-xs text-red-500 mt-1">有効なbytes32アドレスを入力してください (0x + 64文字)</div>
              )}
            </div>
          )}

          <button
            onClick={handleStealth}
            disabled={loading || !isValidAmount(amount) || (mode === "unshield" && !isValidBytes32(recipient))}
            className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "処理中..." : mode === "shield" ? "シールド" : "アンシールド"}
          </button>
        </>
      )}

      {status && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 break-all">
          {status}
        </div>
      )}
    </div>
  );
}
