## CGT非対称性によるState Divergence（コンセンサス分裂）

### 根本原因

`OptimismPortal2.depositERC20Transaction()` が発行する `TransactionDeposited` イベントの `opaqueData` に含まれる `mint` フィールドの型解釈が、Go実装（`op-node`）とRust実装（`Kona`）で異なります。

### 具体的な非対称性

```
L1: OptimismPortal2.depositERC20Transaction()
  → イベント: TransactionDeposited(from, to, version, opaqueData, data)
  → opaqueData 内の mint フィールド: uint256 (32 bytes) でエンコード
```

| ノード実装 | 言語 | mint の読み取り | 結果 |
|---|---|---|---|
| **op-node** | Go | `uint256` (32 bytes全体を読取) | ✅ 正しい残高 (`big.Int`) |
| **Kona** | Rust | `uint128` (下位 16 bytes に切り捨て) | ❌ 切り捨てられた不一致残高 (`u128`) |

### 分裂の発生プロセス

```
1. 攻撃者が L1 で (2^128 + 10) 相当の値をデポジット
   → opaqueData の mint = 2^128 + 10 (uint256)

2. Go (op-node) が L1 ログを読取
   → mint = 2^128 + 10 = 340,282,366,920,938,463,463,374,607,431,768,211,466 (正確に評価)
   → L2 の eth_balance に 3402京×10^18 相当を mint
   → State Root A を生成

3. Rust (Kona) が同じ L1 ログを読取
   → mint = 2^128 + 10 を u128 に切り捨て (Truncation)
   → 下位 16 bytes のみ残るため mint = 10 と判定
   → L2 の eth_balance に 10 のみを mint
   → State Root B を生成 (State Root A ≠ State Root B)

4. ネットワークが真っ二つに分裂 (State Divergence)
   → Go ノード群と Rust ノード群で合意不能になりチェーンが分断
   → Fault Proof (Dispute Game) の検証が破綻
```

### トリガー条件

- デポジット時の `mint` 値（Wei単位）が $2^{128}$（$\approx 3.4028 \times 10^{38}$ Wei）以上の場合に発現。
- 18 decimals のトークンの場合、$3.4028 \times 10^{20}$（3402京）トークン以上のデポジット値を指定することで意図的にトリガー可能。
- 例: $2^{128} + 10$ を指定した場合、Goノードでは天文学的残高が Mint されるのに対し、Kona（Rust）ではわずか `10`（Wei）しか Mint されず、明確な状態分裂が確定する。

### 影響

| 影響項目 | 説明 |
|---|---|
| **コンセンサス分裂** | Go/Rust ノード間で State Root が不一致になりチェーンが分断 |
| **残高の完全不一致** | 同じアドレスの残高が Go側（3402京×10^18）と Rust側（10）で壊滅的に乖離 |
| **DEX流動性強奪** | Goノード側で過剰 Mint された巨大残高を使い、DEX (Uniswap) 内の全流動性 (USDC/ETH) を100%強奪可能 |
| **Fault Proofの崩壊** | Konaを検証エンジンとして使用する Fault Dispute Game で誤判定が発生し、L1 Bridge の資金が永久凍結 |
