import { useState, useCallback, useEffect } from "react";
import { Contract, parseEther, formatEther, JsonRpcProvider } from "ethers";
import { CHAIN_CONFIG } from "./config";
import { ERC20_ABI, SWAP_ROUTER_ABI } from "./abi";
import { useWalletContext } from "./WalletContext";

function safeError(e: unknown): string {
  if (e instanceof Error) {
    if (e.message.includes("user rejected")) return "トランザクションがキャンセルされました";
    if (e.message.includes("insufficient funds")) return "残高不足です";
    return "スワップエラーが発生しました";
  }
  return "不明なエラーが発生しました";
}

function isValidAmount(amount: string): boolean {
  if (!amount || amount === ".") return false;
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0;
}

type TokenSymbol = "1DYS" | "WETH";

export function Swap() {
  const wallet = useWalletContext();
  const [tokenIn, setTokenIn] = useState<TokenSymbol>("1DYS");
  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("0");
  const [slippage, setSlippage] = useState("0.5");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [wDysBalance, setWDysBalance] = useState("0.0");
  const [wethBalance, setWethBalance] = useState("0.0");

  const fetchTokenBalances = useCallback(async (addr: string) => {
    try {
      const l2Provider = new JsonRpcProvider(CHAIN_CONFIG.l2.rpcUrl);
      const wDys = new Contract(CHAIN_CONFIG.l2.wDysAddress, ERC20_ABI, l2Provider);
      const weth = new Contract(CHAIN_CONFIG.l2.wethAddress, ERC20_ABI, l2Provider);
      const [wDysBal, wethBal] = await Promise.all([
        wDys.balanceOf(addr),
        weth.balanceOf(addr),
      ]);
      setWDysBalance(formatEther(wDysBal));
      setWethBalance(formatEther(wethBal));
    } catch {
      setWDysBalance("0.0");
      setWethBalance("0.0");
    }
  }, []);

  const getAmountOut = useCallback(async () => {
    if (!isValidAmount(amountIn)) {
      setAmountOut("0");
      return;
    }
    try {
      const l2Provider = new JsonRpcProvider(CHAIN_CONFIG.l2.rpcUrl);
      const router = new Contract(CHAIN_CONFIG.l2.swapRouterAddress, SWAP_ROUTER_ABI, l2Provider);
      const path =
        tokenIn === "1DYS"
          ? [CHAIN_CONFIG.l2.wDysAddress, CHAIN_CONFIG.l2.wethAddress]
          : [CHAIN_CONFIG.l2.wethAddress, CHAIN_CONFIG.l2.wDysAddress];
      const amounts = await router.getAmountsOut(parseEther(amountIn), path);
      setAmountOut(formatEther(amounts[1]));
    } catch {
      setAmountOut("0");
    }
  }, [amountIn, tokenIn]);

  // トークン方向を切り替えたら stale な見積りを捨てて再取得する
  useEffect(() => {
    getAmountOut();
  }, [tokenIn]);

  const handleSwap = useCallback(async () => {
    if (!wallet.account || !isValidAmount(amountIn)) return;
    setLoading(true);
    setStatus("");
    try {
      if (!(await wallet.ensureChain(CHAIN_CONFIG.l2.chainId))) {
        setStatus("Deyansu L2チェーンに切り替えられませんでした。スワップを中止しました。");
        setLoading(false);
        return;
      }

      const balance = tokenIn === "1DYS" ? wDysBalance : wethBalance;
      if (!wallet.checkBalance(amountIn, balance)) {
        setStatus(`${tokenIn}残高不足です`);
        setLoading(false);
        return;
      }

      const signer = await wallet.getSigner();
      const tokenInAddress = tokenIn === "1DYS" ? CHAIN_CONFIG.l2.wDysAddress : CHAIN_CONFIG.l2.wethAddress;
      const tokenOutAddress = tokenIn === "1DYS" ? CHAIN_CONFIG.l2.wethAddress : CHAIN_CONFIG.l2.wDysAddress;

      const token = new Contract(tokenInAddress, ERC20_ABI, signer);
      const approveTx = await token.approve(
        CHAIN_CONFIG.l2.swapRouterAddress,
        parseEther(amountIn)
      );
      wallet.addTxLog({
        timestamp: Date.now(),
        type: "Swap Approve",
        hash: approveTx.hash,
        status: "pending",
        details: `${amountIn} ${tokenIn}`,
      });
      await approveTx.wait();
      wallet.addTxLog({
        timestamp: Date.now(),
        type: "Swap Approve",
        hash: approveTx.hash,
        status: "success",
        details: `${amountIn} ${tokenIn}`,
      });

      const router = new Contract(CHAIN_CONFIG.l2.swapRouterAddress, SWAP_ROUTER_ABI, signer);
      const path = [tokenInAddress, tokenOutAddress];
      const deadline = Math.floor(Date.now() / 1000) + 1200;
      const slippageNum = parseFloat(slippage) || 0.5;

      // 署名直前に見積りを再取得する。stale/未取得の amountOut に依存すると
      // amountOutMin=0 となりスリッページ保護が消失するため、0 なら中止する。
      const quoteProvider = new JsonRpcProvider(CHAIN_CONFIG.l2.rpcUrl);
      const quoteRouter = new Contract(CHAIN_CONFIG.l2.swapRouterAddress, SWAP_ROUTER_ABI, quoteProvider);
      let expectedOut: bigint;
      try {
        const amounts = await quoteRouter.getAmountsOut(parseEther(amountIn), path);
        expectedOut = amounts[amounts.length - 1] as bigint;
      } catch {
        expectedOut = BigInt(0);
      }
      if (expectedOut === BigInt(0)) {
        setStatus("見積りを取得できませんでした。スワップを中止しました。");
        setLoading(false);
        return;
      }
      const amountOutMin = (expectedOut * BigInt(Math.floor((100 - slippageNum) * 100))) / BigInt(10000);

      const swapTx = await router.swapExactTokensForTokens(
        parseEther(amountIn),
        amountOutMin,
        path,
        wallet.account,
        deadline
      );
      wallet.addTxLog({
        timestamp: Date.now(),
        type: "Swap",
        hash: swapTx.hash,
        status: "pending",
        details: `${amountIn} ${tokenIn} → ${amountOut} ${tokenIn === "1DYS" ? "WETH" : "1DYS"}`,
      });
      await swapTx.wait();
      wallet.addTxLog({
        timestamp: Date.now(),
        type: "Swap",
        hash: swapTx.hash,
        status: "success",
        details: `${amountIn} ${tokenIn} → ${amountOut} ${tokenIn === "1DYS" ? "WETH" : "1DYS"}`,
      });
      setStatus(`スワップ完了: ${amountIn} ${tokenIn} → ${amountOut} ${tokenIn === "1DYS" ? "WETH" : "1DYS"}`);
      await fetchTokenBalances(wallet.account);
    } catch (e) {
      const msg = safeError(e);
      setStatus(msg);
      wallet.addTxLog({
        timestamp: Date.now(),
        type: "Swap",
        hash: "",
        status: "failed",
        details: msg,
      });
    } finally {
      setLoading(false);
    }
  }, [wallet, amountIn, amountOut, tokenIn, slippage, wDysBalance, wethBalance, fetchTokenBalances]);

  const handleConnectAndFetch = useCallback(async () => {
    const addr = await wallet.connectWallet();
    if (addr) {
      await fetchTokenBalances(addr);
    }
  }, [wallet, fetchTokenBalances]);

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Swap</h2>

      {!wallet.account ? (
        <button
          onClick={handleConnectAndFetch}
          className="w-full py-3 bg-nlt-600 text-white rounded-xl font-semibold hover:bg-nlt-700 transition"
        >
          ウォレット接続
        </button>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500">1DYS (Wrapped)</div>
              <div className="font-mono font-semibold">{wDysBalance}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500">WETH</div>
              <div className="font-mono font-semibold">{wethBalance}</div>
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-sm text-gray-600 mb-1">From</label>
            <div className="flex gap-2">
              <select
                value={tokenIn}
                onChange={(e) => setTokenIn(e.target.value as TokenSymbol)}
                className="px-3 py-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="1DYS">1DYS</option>
                <option value="WETH">WETH</option>
              </select>
              <input
                type="number"
                min="0"
                step="any"
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                onBlur={getAmountOut}
                placeholder="0.0"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nlt-500"
              />
            </div>
          </div>

          <div className="text-center text-gray-400 mb-3">↓</div>

          <div className="mb-3">
            <label className="block text-sm text-gray-600 mb-1">To ({tokenIn === "1DYS" ? "WETH" : "1DYS"})</label>
            <input
              type="text"
              value={amountOut}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">スリッページ許容 (%)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nlt-500"
            />
          </div>

          <button
            onClick={handleSwap}
            disabled={loading || !isValidAmount(amountIn)}
            className="w-full py-3 bg-nlt-600 text-white rounded-xl font-semibold hover:bg-nlt-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "処理中..." : "スワップ実行"}
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
