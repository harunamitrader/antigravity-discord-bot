# 画像添付機能の実装計画

## 現状

Discordから画像を送信すると、以下のフローで処理されている：

1. 画像をDiscord CDNからダウンロード → ローカル保存（`discord_uploads/`）
2. **ファイルパスのテキスト**をAntigravityチャット入力欄に貼り付け
3. Antigravityはテキストとしてパスを受け取るだけ（画像を認識しない）

```
現在: "[attachment: image.jpg] saved at C:\...\image.jpg" → テキスト入力
目標: 画像ファイル自体をAntigravityチャットに添付
```

## 技術的アプローチ

AntigravityのチャットUIにファイルを添付するには、CDP経由で **ドラッグ&ドロップイベント** をシミュレートする方法が最も確実。

### 処理フロー

1. Discordから画像をダウンロード → ローカル保存（既存ロジック維持）
2. CDPの `Input.dispatchDragEvent` でチャット入力欄にファイルをドロップ
3. テキストメッセージがあれば、その後に `injectMessage` で送信
4. テキストがなければ送信ボタンをクリック

> [!IMPORTANT]
> **CDP `Input.dispatchDragEvent` の制約**: CDPのdragイベントではローカルファイルパスを直接指定できない場合があります。その場合は代替手段として `Runtime.evaluate` 内でJavaScriptの `DataTransfer` + `drop` イベントを構築し、ファイルのBase64データから `File` オブジェクトを生成してドロップする方法を使用します。

## 変更対象ファイル

### [MODIFY] [dom_operations.js](file:///c:/Users/harunami/Desktop/antigravity/project/Discord_Bot_Projects/antigravity-discord-bot/src/dom_operations.js)
- `attachFileToChat(cdp, filePath, mimeType)` 関数を新規追加
  - ファイルをBase64で読み込み → CDP `Runtime.evaluate` でJS側にDropイベントをシミュレート

### [MODIFY] [discord_bot.js](file:///c:/Users/harunami/Desktop/antigravity/project/Discord_Bot_Projects/antigravity-discord-bot/discord_bot.js)
- `messageCreate` ハンドラの画像処理部分を変更
  - ダウンロード後にパス文字列をテキストに含めるのではなく、`attachFileToChat` を呼び出してファイルを添付

## 検証計画

1. `node --check` で構文エラーがないことを確認
2. 実際にDiscordから画像を送信し、Antigravityチャット側に画像として添付されることを手動確認
