import { useState, useCallback } from "react";
import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";
import { CHAIN_CONFIG } from "./config";
import { ERC20_ABI, SWAP_ROUTER_ABI } from "./abi";

export function Swap() {
  const [tokenIn, setTokenIn] = useState("1DYS");
  const [tokenOut, setTokenOut] = useState("WETH");
  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState("");
  const [balance, setBalance] = useState("");

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setStatus("MetaMaskが見つかりません");
      return;
    }
    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      const bal = await provider.getBalance(accounts[0]);
      setBalance(formatEther(bal));
    } catch (e) {
      setStatus(`ウォレット接続エラー: ${e}`);
    }
  }, []);

  const handleSwap = useCallback(async () => {
    if (!account || !amountIn) return;
    setLoading(true);
    setStatus("");
    try {
      const provider = new BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();

      const path =
        tokenIn === "1DYS"
          ? [CHAIN_CONFIG.l2.wDysAddress, CHAIN_CONFIG.l2.swapRouterAddress]
          : [CHAIN_CONFIG.l2.swapRouterAddress, CHAIN_CONFIG.l2.wDysAddress];

      const router = new Contract(
        CHAIN_CONFIG.l2.swapRouterAddress,
        SWAP_ROUTER_ABI,
        signer
      );

      if (tokenIn !== "1DYS") {
        const token = new Contract(
          CHAIN_CONFIG.l2.swapRouterAddress,
          ERC20_ABI,
          signer
        );
        const approveTx = await token.approve(
          CHAIN_CONFIG.l2.swapRouterAddress,
          parseEther(amountIn)
        );
        await approveTx.wait();
      }

      const deadline = Math.floor(Date.now() / 1000) + 600;
      const swapTx = await router.swapExactTokensForTokens(
        parseEther(amountIn),
        0,
        path,
        account,
        deadline
      );
      await swapTx.wait();
      setStatus(`スワップ完了: ${amountIn} ${tokenIn} → ${tokenOut}`);
    } catch (e) {
      setStatus(`エラー: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [account, amountIn, tokenIn, tokenOut]);

  const flipTokens = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn(amountOut);
    setAmountOut(amountIn);
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
      <h2 className="text-xl font-bold text-gray-900 mb-4">1DYS Swap</h2>

      {!account ? (
        <button
          onClick={connectWallet}
          className="w-full py-3 bg-nlt-600 text-white rounded-xl font-semibold hover:bg-nlt-700 transition"
        >
          ウォレット接続
        </button>
      ) : (
        <>
          <div className="mb-2 text-sm text-gray-500">
            残高: {balance} 1DYS
          </div>

          <div className="mb-3">
            <label className="block text-sm text-gray-600 mb-1">From</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                placeholder="0.0"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nlt-500 focus:border-transparent"
              />
              <select
                value={tokenIn}
                onChange={(e) => setTokenIn(e.target.value)}
                className="px-4 py-3 border border-gray-300 rounded-lg bg-white font-medium"
              >
                <option value="1DYS">1DYS</option>
                <option value="WETH">WETH</option>
              </select>
            </div>
          </div>

          <div className="flex justify-center mb-3">
            <button
              onClick={flipTokens}
              className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition"
              title="トークンを入れ替え"
            >
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                />
              </svg>
            </button>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">To</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={amountOut}
                onChange={(e) => setAmountOut(e.target.value)}
                placeholder="0.0"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nlt-500 focus:border-transparent"
              />
              <select
                value={tokenOut}
                onChange={(e) => setTokenOut(e.target.value)}
                className="px-4 py-3 border border-gray-300 rounded-lg bg-white font-medium"
              >
                <option value="1DYS">1DYS</option>
                <option value="WETH">WETH</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleSwap}
            disabled={loading || !amountIn}
            className="w-full py-3 bg-nlt-600 text-white rounded-xl font-semibold hover:bg-nlt-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "処理中..." : "スワップ"}
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
