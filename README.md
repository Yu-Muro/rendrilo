# rendrilo

Universal Image Converter — ブラウザ内で画像を安全かつ手軽に変換するWebアプリケーションです。

## Status

現在はMVPの基盤実装段階です。

- [要件一覧](docs/requirements.md)
- [実装プラン](docs/implementation-plan.md)

## Development

### Prerequisites

- [Vite+](https://viteplus.dev/guide/)

Vite+がプロジェクトで指定されたNode.jsとBunを管理します。

### Commands

```sh
vp install
vp dev
```

品質チェック、テスト、ビルドは次のコマンドで実行します。

```sh
vp check
vp test --run
vp build
```

## Product principles

- **Private by default**: 画像をサーバーへ送信せず、端末内で処理する
- **Simple**: 形式を選び、必要な設定を行い、すぐに変換できる
- **Reliable**: 対応可否や失敗理由を明確に伝え、元画像を変更しない
- **Accessible**: キーボードや支援技術を含む多様な利用環境に対応する

## License

[MIT License](LICENSE)
