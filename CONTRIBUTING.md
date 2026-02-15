# Contributing

コントリビューションを歓迎します。

## 開発環境

```bash
npm install
cd webview && npm install
```

## 開発コマンド

```bash
npm run compile          # Extension ビルド
npm run build:webview    # Webview ビルド
npx tsc --noEmit         # 型チェック
npm run package          # VSIX 生成
```

## Pull Request

- 変更理由と内容を簡潔に説明してください
- UI 変更がある場合はスクリーンショットを添付してください
- 以下を満たしていることを確認してください:
  - `npm run compile` が通る
  - `npx tsc --noEmit` が通る
  - トークンや秘密情報がコード・ログ・スクリーンショットに含まれていない

## バグ報告・機能要望

[Issue](https://github.com/cursor-tool/cursor-economizer/issues) で受け付けています。

## ライセンス

本プロジェクトへの貢献は [MIT License](LICENSE) のもとで提供されます。
