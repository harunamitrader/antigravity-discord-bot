# Changelog

## v1.5.0 (2026-03-07)

### 新機能
- **`/restart` コマンド**: DiscordからBotプロセスを再起動できるようになりました。`start_bot.bat` 経由で起動している場合、exit code `42` を検知し3秒後に自動再起動します
- **起動完了通知**: Bot起動完了時にDiscordへ「✅ Bot 起動完了」メッセージを送信するようになりました
- **通知チャンネル個別指定** (オプション):
  - `DISCORD_CHAT_CHANNEL_ID`: チャット通知・起動完了メッセージの送信先チャンネル
  - `DISCORD_FILE_LOG_CHANNEL_ID`: ファイル変更通知の送信先チャンネル
  - いずれも未設定時は従来通り `lastActiveChannel` に送信

### 改善
- **コード分割**: `discord_bot.js`（3466行）を9つのサブモジュール（`src/`）に分割し、約450行に縮小
- **`/model` コマンドの改善**: ドロップダウン検出を `aria-haspopup="dialog"` ベースに変更。ドロップダウンが開きっぱなしになる問題を、同一ボタン再クリック + Escキーの二重安全策で修正
- **`/conversation` コマンドの改善**: `/model` と同じパターンに統一し、ドロップダウン閉じ忘れを防止
- **`start_bot.bat` のループ化**: `/restart` コマンド対応。exit code `42` で再起動、それ以外で完全停止

### 整理
- デバッグ用スクリプト12ファイルを `debug/` フォルダに移動（`.gitignore` で除外済み）
- デバッグ出力ファイル14ファイルをリポジトリルートから除去

### 変更されたファイル
| ファイル | 主な変更 |
|---|---|
| `discord_bot.js` | モジュール化によるimport構成へ書き換え、`/restart`コマンド追加、起動完了通知追加 |
| `src/*.js` (9ファイル) | 新規作成: config, state, text_processing, logging, cdp_manager, discord_helpers, dom_operations, file_watcher, monitor |
| `start_bot.bat` | ループ化（exit code 42 で再起動対応） |
| `.env.example` | `DISCORD_CHAT_CHANNEL_ID`, `DISCORD_FILE_LOG_CHANNEL_ID` 追加 |

---

## v1.4.0 (2026-03-03)

### 新機能・改善
- **承認ボタン検出の強化**: `checkApprovalRequired` と `clickApproval` を Shadow DOM 対応および全ターゲット横断スキャンに強化し、様々なコンテキストで承認ボタンを確実に検出・クリックできるよう改善しました。
- **ターゲット連携**: `monitorAIResponse` の承認フローに `targetUrl` 連携を統合し、正しいターゲット（ページやワーカーなど）に対して自動接続・承認処理を行うようにしました。
- **マッチングの柔軟化**: `isApproveButton` / `isRejectButton` のキーワードマッチングを部分一致対応とし、`selectors.js` に `allow access` キーワードを追加して検出精度を向上させました。

---

## v1.3.0 (2026-03-02)

### 新機能
- **承認ボタンの動的ラベル**: Discord上のボタンがAntigravity側のボタン名（Run, Allow Once等）をそのまま反映するようになりました
- **破壊的コマンドのブロック（Smart Safety）**: 自動承認モードでも `rm -rf /` 等の危険なコマンドはDiscordに通知して手動承認を要求します
- **セキュリティガード**: `DISCORD_ALLOWED_USER_ID` が未設定の場合、ボットが起動を拒否するようになりました

### 改善
- **iframe走査の廃止**: チャットパネルがメインdocument上にあることが判明したため、不要なiframe走査を全廃。3関数（`getTargetDocs`, `findAgentFrame`, 旧`fillEditor`等のdocパラメータ）を削除
- **レスポンス抽出の簡素化**: 264行のスクロール＋ブロック解析ロジックを約120行に削減。5段テキスト処理パイプラインを廃止し、DOM直接参照方式に変更
- **承認処理の簡素化**: outerHTML解析→span.truncateの直接参照に変更。Safe Click（兄弟ボタン検証）を採用
- **品質判定の廃止**: `isLowConfidenceResponse` による判定を削除し、シンプルなテキスト返却に一本化

### 変更されたファイル
| ファイル | 主な変更 |
|---|---|
| `discord_bot.js` | セキュリティガード、iframe走査廃止、承認処理簡素化、動的ラベル、Smart Safety、レスポンス抽出再設計 |
| `selectors.js` | 承認キーワード10種に整理、`DANGEROUS_COMMANDS` パターン追加 |
| `.gitignore` | 診断用一時ファイルを除外対象に追加 |

---

## v1.2.0

### 新機能
- 自動承認モード (`/auto on/off`)
- 各種スラッシュコマンド (`/model`, `/mode`, `/title`, `/newchat`, `/stop`, `/screenshot`)
- ファイル監視機能

---

## v1.1.0

### 新機能
- `DISCORD_ALLOWED_USER_ID` によるアクセス制限
- 基本的なCDP接続とメッセージ送受信

---

## v1.0.0

### 初期リリース
- Discord ↔ Antigravity間の基本的なメッセージ中継
- CDP経由でのテキスト注入・生成監視
