# rendrilo 実装プラン

## 1. 方針

MVPは、画像を外部へ送信しないクライアントサイドWebアプリケーションとして実装する。まず主要3形式で変換パイプラインを成立させ、その後に一括処理、AVIF、性能改善を段階的に加える。

本計画は [要件一覧](requirements.md) を実装可能な単位へ分解したものである。未決事項の確定や技術検証の結果により、各フェーズの開始前に更新する。

## 2. 技術構成

| 領域               | 選択                                                 | 理由                                                                           |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| UI                 | React + TypeScript                                   | コンポーネント分割、型安全性、テスト容易性                                     |
| 統合ツールチェーン | Vite+                                                | 開発、ビルド、整形、静的解析、型検査、テストを一貫したコマンドと設定に集約する |
| パッケージ管理     | Bun（Vite+経由）                                     | プロジェクトメタデータでバージョンを固定し、Vite+から一貫して操作する          |
| 変換               | Browser Canvas / Image APIs + 必要最小限のWASM codec | ネイティブ機能を優先し、未対応形式だけ補完する                                 |
| 並列処理           | Web Worker                                           | 変換中もUIの応答性を保つ                                                       |
| 状態管理           | Reactの標準機能を基本とする                          | MVPで依存関係と複雑性を増やさない                                              |
| 単体・結合テスト   | Vite+ Test + Testing Library                         | Viteと共通の解決・変換設定でロジックとUI状態を検証する                         |
| E2E                | Playwright                                           | 実ブラウザで主要フローとダウンロードを検証する                                 |
| CI                 | GitHub Actions + setup-vp                            | Pull RequestごとにVite+と同じ品質検査を再現する                                |
| 配信               | 静的ホスティング                                     | サーバー処理を持たず、運用と攻撃面を小さくする                                 |

Vite+の採用判断は [ADR-0001](adr/0001-use-vite-plus.md) に記録する。Vite+とBunはプロジェクト内でバージョンを固定し、日常の操作は `vp` コマンドへ統一する。画像変換ライブラリは技術検証後に確定し、ブラウザ標準APIで満たせる範囲には追加しない。

### 2.1 標準コマンド

| 目的                   | コマンド     |
| ---------------------- | ------------ |
| 依存関係のインストール | `vp install` |
| 開発サーバー           | `vp dev`     |
| 整形・静的解析・型検査 | `vp check`   |
| 単体・結合テスト       | `vp test`    |
| 本番ビルド             | `vp build`   |

PlaywrightなどVite+の組み込みコマンド外の処理は、`vp run <task>` を入口とする。

## 3. アーキテクチャ

```text
UI
├── File drop / picker
├── Conversion settings
├── Queue and progress
└── Preview / download
          │ commands and events
          ▼
Application layer
├── File validation
├── Conversion queue
├── Capability detection
├── Naming / ZIP export
└── Resource lifecycle
          │ serializable jobs
          ▼
Web Worker conversion core
├── Decode adapter
├── Orientation / resize / composite
├── Encode adapter
└── Structured result / error
          │
          ├── Browser-native codecs
          └── Optional WASM codecs
```

### 3.1 設計原則

- UI、キュー制御、画像変換コアを分離する
- 形式固有処理はdecoder/encoder adapterに閉じ込める
- 変換ジョブと結果は判別可能な型で表現し、不正な状態を作りにくくする
- Blob URL、ImageBitmap、Workerなど、明示的な解放が必要な資源の所有者を決める
- 対応形式を固定値で推測せず、起動時に機能検出する
- メモリ使用量を抑えるため、全画像を同時にデコードしない

### 3.2 想定ディレクトリ

```text
src/
├── app/                 # 画面構成、アプリ全体の状態
├── components/          # 再利用可能なUI
├── features/conversion/ # 入力、設定、キュー、結果
├── core/image/          # 検証、変換、形式adapter
├── workers/             # Web Worker entry point
├── lib/                 # ファイル名、ZIP、容量表示など
├── styles/              # デザイントークン、共通スタイル
└── test/                # テスト共通設定・fixtures
e2e/                     # ブラウザ統合テスト
public/                  # 静的アセット
docs/                    # 要件・設計・運用資料
```

## 4. 実装フェーズ

### Phase 0: 技術検証と基盤

目的: 最大の技術リスクを先に検証し、継続開発できる土台を作る。

- [ ] Vite+、React、TypeScript、Bunでプロジェクトを初期化する
- [ ] Vite+とBunのバージョンをプロジェクト内で固定する
- [ ] Vite+でformatter、linter、型検査、テストを設定する
- [ ] GitHub Actionsへ `setup-vp` を導入し、`vp check`、`vp test`、`vp build` を実行する
- [ ] React plugin、Web Worker、WASM、PlaywrightとVite+の組み合わせを検証する
- [ ] JPEG、PNG、WebP、AVIFのdecode/encode可否を対象ブラウザで検証する
- [ ] EXIF Orientation、透過、カラープロファイルの扱いを検証する
- [ ] Web Workerへ画像データを渡し、変換・キャンセル・資源解放を試作する
- [ ] 20MP画像と上限付近のファイルで処理時間・ピークメモリを計測する
- [ ] 技術判断をADRに記録し、要件の上限値とAVIF対応範囲を更新する

完了条件:

- 主要3形式の変換試作が対象ブラウザで動く
- AVIFの実装方法とフォールバック方針が決まっている
- CIの必須チェックが通る
- 採用構成でMVPを実装できない重大なリスクが残っていない

### Phase 1: 単一画像の変換

目的: 最小のエンドツーエンド変換体験を完成させる。

- [ ] ファイル選択とドラッグ＆ドロップを実装する
- [ ] MIME、magic bytes、サイズ、画素数による入力検証を実装する
- [ ] 画像情報と入力プレビューを表示する
- [ ] 出力形式、品質、幅、高さ、縦横比、背景色の設定を実装する
- [ ] decode → orientation → resize → composite → encodeパイプラインを実装する
- [ ] Workerとのメッセージ契約と構造化エラーを実装する
- [ ] 進捗、キャンセル、失敗、再試行を実装する
- [ ] 結果プレビュー、比較情報、個別ダウンロードを実装する
- [ ] Blob URLなどの資源解放を実装する
- [ ] 変換コア、検証、ファイル名、主要UI状態のテストを追加する

完了条件:

- FR-IN、FR-SET、FR-CNV、FR-OUTの単一画像に関するMust要件を満たす
- 壊れた画像と未対応画像で画面が停止せず、対処可能なエラーを表示する
- キーボードのみで一連の操作を完了できる

### Phase 2: 一括変換

目的: 複数画像を安定して処理し、一括保存できるようにする。

- [ ] 複数ファイルの追加、削除、全件クリアを実装する
- [ ] 共通設定と変換キューを実装する
- [ ] 端末負荷を考慮した同時実行数制御を実装する
- [ ] 画像ごとの状態と全体進捗を表示する
- [ ] 1件の失敗から他ジョブを分離する
- [ ] ファイル名衝突を解決する
- [ ] 成功結果をZIPへまとめ、一括ダウンロードできるようにする
- [ ] 未保存結果がある状態での離脱警告を実装する
- [ ] 100件、合計500MBまでの境界条件を検証する

完了条件:

- 10枚以上を一括変換し、個別・ZIPの両方で保存できる
- 失敗、キャンセル、再試行を含むキュー状態が破綻しない
- 処理完了後とクリア後に、利用済みメモリが継続して増えない

### Phase 3: 対応形式とUXの仕上げ

目的: 実行環境差を吸収し、MVPとして迷いなく使える状態にする。

- [ ] AVIF adapterと実行時機能検出を完成させる
- [ ] 非対応形式の無効表示と説明を実装する
- [ ] 初期画面、空状態、処理中、完了、エラーの表示を整える
- [ ] モバイルレイアウトを仕上げる
- [ ] スクリーンリーダー向け状態通知、フォーカス管理、コントラストを確認する
- [ ] 「画像は端末外へ送信されない」ことをUIとプライバシー文書で説明する
- [ ] 対応形式、上限、既知の制約をヘルプへ記載する

完了条件:

- 対象ブラウザで機能検出とフォールバックが正しく動く
- 幅320px以上で主要操作を完了できる
- 自動アクセシビリティ検査に重大違反がなく、手動キーボード確認を完了している

### Phase 4: リリース品質

目的: 公開後に品質を維持できる状態でv0.1をリリースする。

- [ ] 主要ユースケースのE2Eテストを追加する
- [ ] 各形式、透過、Orientation、極端な縦横比のfixtureを整備する
- [ ] 対象ブラウザでクロスブラウザテストを実施する
- [ ] 性能・メモリ計測を行い、同時実行数と利用上限を確定する
- [ ] Content Security Policyなど配信時のセキュリティヘッダーを設定する
- [ ] 依存関係とライセンスを確認する
- [ ] READMEへ開発、テスト、ビルド、デプロイ手順を追記する
- [ ] プライバシー、対応形式、制約、変更履歴を公開する
- [ ] v0.1.0をデプロイし、リリースタグを作成する

完了条件:

- 要件一覧のMVP受け入れ条件をすべて確認できる
- CIとE2Eテストが成功する
- 本番相当環境のスモークテストが成功する
- 既知の制約とロールバック手順が文書化されている

## 5. テスト戦略

### 5.1 単体テスト

- 形式判定、入力上限、寸法計算、品質値の正規化
- ファイル名と重複時の連番生成
- キュー状態遷移とキャンセル
- 形式adapterの成功・失敗・未対応
- 構造化エラーから利用者向けメッセージへの変換

### 5.2 結合テスト

- 入力から設定、変換、結果表示までのコンポーネント連携
- Workerメッセージの送受信と異常終了
- 一部失敗を含む一括変換とZIP生成
- 資源解放と再実行

### 5.3 E2Eテスト

- 主要3形式の相互変換とダウンロード
- 複数画像の一括変換とZIPダウンロード
- リサイズ、品質、透過背景、Orientation
- 未対応・破損・上限超過・キャンセル
- キーボード操作と主要なアクセシビリティ検査

画像の見た目だけに依存せず、出力のMIME、寸法、透過、ファイルサイズ、主要ピクセル値などを組み合わせて検証する。

## 6. リスクと対策

| リスク                                  | 影響                     | 対策                                                           |
| --------------------------------------- | ------------------------ | -------------------------------------------------------------- |
| Vite+が0.x系で仕様変更の可能性がある    | 設定変更、CI停止         | バージョン固定、更新用PRでの検証、通常のViteへ戻せる構成の維持 |
| ブラウザごとにdecode/encode対応が異なる | 同じ形式でも利用できない | 起動時の機能検出、adapter分離、必要箇所のみWASMで補完          |
| 大画像・大量画像でメモリが枯渇する      | タブ停止、結果消失       | 事前検証、同時実行制御、逐次decode、明示的な資源解放           |
| Canvas経由でメタデータや色が変わる      | 見た目の差、情報消失     | 仕様を明示し、Orientation・ICCをfixtureで検証                  |
| WASM codecが初期表示を重くする          | 離脱増加                 | 遅延読み込み、形式別chunk、ブラウザ標準API優先                 |
| ZIP生成で結果を二重保持する             | ピークメモリ増加         | ストリーム生成の可否を検証し、上限と警告を設ける               |
| 悪意ある、または破損した画像            | 過負荷、例外、脆弱性     | magic bytes・寸法・上限の検証、Worker隔離、依存監査            |

## 7. 運用ルール

- `main` は常にビルド・テスト可能な状態を保つ
- ローカルとCIの標準入口を `vp` コマンドへ統一する
- Vite+とBunの更新は機能変更から分離し、`vp check`、`vp test`、`vp build`、E2Eを確認する
- 変更は小さなPull Request単位とし、要件IDを説明へ記載する
- 新しい形式はadapter、fixture、対応表、エラー処理をセットで追加する
- 要件変更は `docs/requirements.md`、技術判断は `docs/adr/` へ記録する
- リリース前に対応ブラウザ・形式・上限を実測値で更新する

## 8. 最初の実装Pull Request候補

1. `chore: initialize Vite+ React TypeScript application`
2. `ci: add Vite+ quality checks`
3. `spike: validate browser image codec capabilities`
4. `feat: add image input and validation`
5. `feat: implement single image conversion worker`
6. `feat: add conversion settings and result download`
7. `feat: add batch conversion queue`
8. `feat: add ZIP download and collision-safe naming`
9. `feat: improve accessibility and responsive layout`
10. `test: add cross-browser conversion coverage`
