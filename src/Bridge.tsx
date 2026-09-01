import { useState, useCallback } from "react";
import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";
import { CHAIN_CONFIG } from "./config";
import { ERC20_ABI, L1_STANDARD_BRIDGE_ABI, L2_STANDARD_BRIDGE_ABI } from "./abi";

type Direction = "deposit" | "withdraw";

export function Bridge() {
  const [direction, setDirection] = useState<Direction>("deposit");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [l1Balance, setL1Balance] = useState("");
  const [l2Balance, setL2Balance] = useState("");
  const [account, setAccount] = useState("");

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setStatus("MetaMaskが見つかりません");
      return;
    }
    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      await fetchBalances(accounts[0]);
    } catch (e) {
      setStatus(`ウォレット接続エラー: ${e}`);
    }
  }, []);

  const fetchBalances = useCallback(async (addr: string) => {
    try {
      const l1Provider = new BrowserProvider(window.ethereum!);
      const l1Bal = await l1Provider.getBalance(addr);
      setL1Balance(formatEther(l1Bal));

      const { JsonRpcProvider } = await import("ethers");
      const l2Provider = new JsonRpcProvider(CHAIN_CONFIG.l2.rpcUrl);
      const l2Bal = await l2Provider.getBalance(addr);
      setL2Balance(formatEther(l2Bal));
    } catch {
      setL1Balance("0.0");
      setL2Balance("0.0");
    }
  }, []);

  const handleBridge = useCallback(async () => {
    if (!account || !amount) return;
    setLoading(true);
    setStatus("");
    try {
      const provider = new BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();

      if (direction === "deposit") {
        const token = new Contract(
          CHAIN_CONFIG.l1.dysTokenAddress,
          ERC20_ABI,
          signer
        );
        const bridge = new Contract(
          CHAIN_CONFIG.l1.l1StandardBridgeAddress,
          L1_STANDARD_BRIDGE_ABI,
          signer
        );

        const approveTx = await token.approve(
          CHAIN_CONFIG.l1.l1StandardBridgeAddress,
          parseEther(amount)
        );
        await approveTx.wait();
        setStatus("承認完了。デポジット中...");

        const depositTx = await bridge.depositERC20(
          CHAIN_CONFIG.l1.dysTokenAddress,
          CHAIN_CONFIG.l2.l2StandardBridgeAddress,
          account,
          parseEther(amount),
          200000,
          "0x"
        );
        await depositTx.wait();
        setStatus(`デポジット完了: ${amount} 1DYS`);
      } else {
        const l2Signer = await new BrowserProvider(
          window.ethereum!
        ).getSigner();

        const bridge = new Contract(
          CHAIN_CONFIG.l2.l2StandardBridgeAddress,
          L2_STANDARD_BRIDGE_ABI,
          l2Signer
        );

        const withdrawTx = await bridge.withdrawTo(
          CHAIN_CONFIG.l2.l2StandardBridgeAddress,
          account,
          parseEther(amount),
          200000,
          "0x"
        );
        await withdrawTx.wait();
        setStatus(`引き出し完了: ${amount} 1DYS`);
      }
      await fetchBalances(account);
    } catch (e) {
      setStatus(`エラー: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [account, amount, direction, fetchBalances]);

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

      {!account ? (
        <button
          onClick={connectWallet}
          className="w-full py-3 bg-nlt-600 text-white rounded-xl font-semibold hover:bg-nlt-700 transition"
        >
          ウォレット接続
        </button>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500">L1残高</div>
              <div className="font-mono font-semibold">{l1Balance} 1DYS</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500">L2残高</div>
              <div className="font-mono font-semibold">{l2Balance} 1DYS</div>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">金額</label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nlt-500 focus:border-transparent"
            />
          </div>

          <button
            onClick={handleBridge}
            disabled={loading || !amount}
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
    </div>
  );
}
