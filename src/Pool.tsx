import { useState, useCallback } from "react";
import { Contract, parseEther, formatEther, JsonRpcProvider } from "ethers";
import { CHAIN_CONFIG } from "./config";
import { ERC20_ABI, SWAP_ROUTER_ABI, PAIR_ABI } from "./abi";
import { useWalletContext } from "./WalletContext";

function safeError(e: unknown): string {
  if (e instanceof Error) {
    if (e.message.includes("user rejected")) return "トランザクションがキャンセルされました";
    if (e.message.includes("insufficient funds")) return "残高不足です";
    return "プール操作エラーが発生しました";
  }
  return "不明なエラーが発生しました";
}

function isValidAmount(amount: string): boolean {
  if (!amount || amount === ".") return false;
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0;
}

export function Pool() {
  const wallet = useWalletContext();
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [liquidity, setLiquidity] = useState("0");
  const [reserveA, setReserveA] = useState("0");
  const [reserveB, setReserveB] = useState("0");
  const [removeAmount, setRemoveAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const tokenA = CHAIN_CONFIG.l2.wDysAddress;
  const tokenB = CHAIN_CONFIG.l2.wethAddress;

  const fetchPoolInfo = useCallback(async (addr: string) => {
    try {
      const l2Provider = new JsonRpcProvider(CHAIN_CONFIG.l2.rpcUrl);
      const router = new Contract(CHAIN_CONFIG.l2.swapRouterAddress, SWAP_ROUTER_ABI, l2Provider);
      const pairAddress = await router.getPair(tokenA, tokenB);
      if (pairAddress === "0x0000000000000000000000000000000000000000") {
        setReserveA("0");
        setReserveB("0");
        setLiquidity("0");
        return;
      }
      const pair = new Contract(pairAddress, PAIR_ABI, l2Provider);
      const [reserves, _totalSupply, userLiq] = await Promise.all([
        pair.getReserves(),
        pair.totalSupply(),
        pair.balanceOf(addr),
      ]);
      setReserveA(formatEther(reserves[0]));
      setReserveB(formatEther(reserves[1]));
      setLiquidity(formatEther(userLiq));
    } catch {
      setReserveA("0");
      setReserveB("0");
      setLiquidity("0");
    }
  }, [tokenA, tokenB]);

  const handleAddLiquidity = useCallback(async () => {
    if (!wallet.account || !isValidAmount(amountA) || !isValidAmount(amountB)) return;
    setLoading(true);
    setStatus("");
    try {
      if (wallet.chainId !== CHAIN_CONFIG.l2.chainId) {
        await wallet.switchToL2();
      }
      const signer = await wallet.getSigner();

      const tokenAContract = new Contract(tokenA, ERC20_ABI, signer);
      const tokenBContract = new Contract(tokenB, ERC20_ABI, signer);

      const approveA = await tokenAContract.approve(CHAIN_CONFIG.l2.swapRouterAddress, parseEther(amountA));
      await approveA.wait();
      const approveB = await tokenBContract.approve(CHAIN_CONFIG.l2.swapRouterAddress, parseEther(amountB));
      await approveB.wait();

      const router = new Contract(CHAIN_CONFIG.l2.swapRouterAddress, SWAP_ROUTER_ABI, signer);
      const deadline = Math.floor(Date.now() / 1000) + 1200;
      const slippageNum = parseFloat(slippage) || 0.5;
      const slippageBps = BigInt(Math.floor((100 - slippageNum) * 100));
      const amountAMin = (parseEther(amountA) * slippageBps) / BigInt(10000);
      const amountBMin = (parseEther(amountB) * slippageBps) / BigInt(10000);

      const tx = await router.addLiquidity(
        tokenA,
        tokenB,
        parseEther(amountA),
        parseEther(amountB),
        amountAMin,
        amountBMin,
        wallet.account,
        deadline
      );
      wallet.addTxLog({
        timestamp: Date.now(),
        type: "Add Liquidity",
        hash: tx.hash,
        status: "pending",
        details: `${amountA} 1DYS + ${amountB} WETH`,
      });
      await tx.wait();
      wallet.addTxLog({
        timestamp: Date.now(),
        type: "Add Liquidity",
        hash: tx.hash,
        status: "success",
        details: `${amountA} 1DYS + ${amountB} WETH`,
      });
      setStatus("流動性追加完了");
      await fetchPoolInfo(wallet.account);
    } catch (e) {
      const msg = safeError(e);
      setStatus(msg);
      wallet.addTxLog({
        timestamp: Date.now(),
        type: "Add Liquidity",
        hash: "",
        status: "failed",
        details: msg,
      });
    } finally {
      setLoading(false);
    }
  }, [wallet, amountA, amountB, slippage, tokenA, tokenB, fetchPoolInfo]);

  const handleRemoveLiquidity = useCallback(async () => {
    if (!wallet.account || !isValidAmount(removeAmount)) return;
    setLoading(true);
    setStatus("");
    try {
      if (wallet.chainId !== CHAIN_CONFIG.l2.chainId) {
        await wallet.switchToL2();
      }
      const signer = await wallet.getSigner();
      const l2Provider = new JsonRpcProvider(CHAIN_CONFIG.l2.rpcUrl);
      const router = new Contract(CHAIN_CONFIG.l2.swapRouterAddress, SWAP_ROUTER_ABI, l2Provider);
      const pairAddress = await router.getPair(tokenA, tokenB);

      const pair = new Contract(pairAddress, PAIR_ABI, signer);
      const approveTx = await pair.approve(CHAIN_CONFIG.l2.swapRouterAddress, parseEther(removeAmount));
      await approveTx.wait();

      const routerWithSigner = new Contract(CHAIN_CONFIG.l2.swapRouterAddress, SWAP_ROUTER_ABI, signer);
      const deadline = Math.floor(Date.now() / 1000) + 1200;
      const slippageNum = parseFloat(slippage) || 0.5;
      const slippageBps = BigInt(Math.floor((100 - slippageNum) * 100));
      const amountAMin = (parseEther(reserveA) * slippageBps) / BigInt(10000);
      const amountBMin = (parseEther(reserveB) * slippageBps) / BigInt(10000);

      const tx = await routerWithSigner.removeLiquidity(
        tokenA,
        tokenB,
        parseEther(removeAmount),
        amountAMin,
        amountBMin,
        wallet.account,
        deadline
      );
      wallet.addTxLog({
        timestamp: Date.now(),
        type: "Remove Liquidity",
        hash: tx.hash,
        status: "pending",
        details: `${removeAmount} LP`,
      });
      await tx.wait();
      wallet.addTxLog({
        timestamp: Date.now(),
        type: "Remove Liquidity",
        hash: tx.hash,
        status: "success",
        details: `${removeAmount} LP`,
      });
      setStatus("流動性除去完了");
      await fetchPoolInfo(wallet.account);
    } catch (e) {
      const msg = safeError(e);
      setStatus(msg);
      wallet.addTxLog({
        timestamp: Date.now(),
        type: "Remove Liquidity",
        hash: "",
        status: "failed",
        details: msg,
      });
    } finally {
      setLoading(false);
    }
  }, [wallet, removeAmount, slippage, tokenA, tokenB, reserveA, reserveB, fetchPoolInfo]);

  const handleConnectAndFetch = useCallback(async () => {
    const addr = await wallet.connectWallet();
    if (addr) {
      await fetchPoolInfo(addr);
    }
  }, [wallet, fetchPoolInfo]);

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-6 border border-gray-200">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Liquidity Pool</h2>

      {!wallet.account ? (
        <button
          onClick={handleConnectAndFetch}
          className="w-full py-3 bg-nlt-600 text-white rounded-xl font-semibold hover:bg-nlt-700 transition"
        >
          ウォレット接続
        </button>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500">Reserve 1DYS</div>
              <div className="font-mono font-semibold text-xs">{parseFloat(reserveA).toFixed(2)}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500">Reserve WETH</div>
              <div className="font-mono font-semibold text-xs">{parseFloat(reserveB).toFixed(4)}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500">Your LP</div>
              <div className="font-mono font-semibold text-xs">{parseFloat(liquidity).toFixed(4)}</div>
            </div>
          </div>

          <div className="mb-4 border-t pt-4">
            <h3 className="font-semibold text-gray-800 mb-2">流動性追加</h3>
            <div className="space-y-2">
              <input
                type="number"
                min="0"
                step="any"
                value={amountA}
                onChange={(e) => setAmountA(e.target.value)}
                placeholder="1DYS amount"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nlt-500"
              />
              <input
                type="number"
                min="0"
                step="any"
                value={amountB}
                onChange={(e) => setAmountB(e.target.value)}
                placeholder="WETH amount"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nlt-500"
              />
              <button
                onClick={handleAddLiquidity}
                disabled={loading || !isValidAmount(amountA) || !isValidAmount(amountB)}
                className="w-full py-3 bg-nlt-600 text-white rounded-xl font-semibold hover:bg-nlt-700 transition disabled:opacity-50"
              >
                {loading ? "処理中..." : "流動性追加"}
              </button>
            </div>
          </div>

          <div className="mb-4 border-t pt-4">
            <h3 className="font-semibold text-gray-800 mb-2">流動性除去</h3>
            <div className="space-y-2">
              <input
                type="number"
                min="0"
                step="any"
                value={removeAmount}
                onChange={(e) => setRemoveAmount(e.target.value)}
                placeholder="LP token amount"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-nlt-500"
              />
              <button
                onClick={handleRemoveLiquidity}
                disabled={loading || !isValidAmount(removeAmount)}
                className="w-full py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition disabled:opacity-50"
              >
                {loading ? "処理中..." : "流動性除去"}
              </button>
            </div>
          </div>

          <div className="mb-2">
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
