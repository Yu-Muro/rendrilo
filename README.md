# rendrilo

Universal Image Converter — ブラウザ内で画像を安全かつ手軽に変換するWebアプリケーションです。

## Status

現在はMVPの基盤実装段階です。

- [要件一覧](docs/requirements.md)
- [実装プラン](docs/implementation-plan.md)

## Development

### Prerequisites

- [Vite+](https://viteplus.dev/guide/)

Vite+がNode.jsと、内部で使用するパッケージマネージャーをプロジェクト指定のバージョンで管理します。開発者は直接 `bun`、`npm`、`pnpm`、`yarn` を呼ばず、依存関係を含む日常の操作を `vp` に統一します。

### Commands

```sh
vp install
vp dev
```

依存関係の追加・削除・更新・調査もVite+から実行します。

```sh
vp add <package>
vp add -D <package>
vp remove <package>
vp update
vp outdated
vp why <package>
```

品質チェック、テスト、ビルドは次のコマンドで実行します。

```sh
vp check
vp test --run
vp build
```

`vp dev`、`vp check`、`vp test`、`vp build`、`vp preview` はVite+の組み込みコマンドです。同名の `package.json` scriptsは定義しません。組み込み外のタスクを追加する場合は、`vite.config.ts` に定義して `vp run <task>` から実行します。

## Product principles

- **Private by default**: 画像をサーバーへ送信せず、端末内で処理する
- **Simple**: 形式を選び、必要な設定を行い、すぐに変換できる
- **Reliable**: 対応可否や失敗理由を明確に伝え、元画像を変更しない
- **Accessible**: キーボードや支援技術を含む多様な利用環境に対応する

## License

[MIT License](LICENSE)
