# Changelog

## v1.7.0 (2026-03-26)

### 新機能
- **定期実行ジョブ（Scheduled Jobs）**: `data/jobs/*.json` に1ジョブ1ファイルでスケジュールを管理する機能を追加
  - cron式（JST）によるスケジューリング（[node-cron](https://github.com/node-cron/node-cron) 使用）
  - Chokidar によるファイル監視 — ジョブファイルの追加・変更・削除を即座に反映（Bot再起動不要）
  - `active: false` でジョブの一時停止が可能
  - Bot起動時に保存済みジョブを自動復元
  - 実行時にDiscordチャンネルへ通知を送信し、AIレスポンスをリレー
- **Antigravity用グローバルスキル同梱**: `.agent/skills/schedule-manager/SKILL.md` を同梱。Antigravityのグローバルスキル（`~/.gemini/antigravity/skills/`）にインストールすることで、AIチャットから自然言語でジョブ管理が可能

### 改善
- **ファイル監視のクラッシュ耐性**: Chokidar のエラー（Googleドライブ等のネットワークドライブでの障害）でBotプロセスが落ちないよう改善。監視機能だけ停止し、他の機能は正常に動作を継続
- **WATCH_DIR 無効パスの処理改善**: 存在しないパスが設定されていた場合、`process.exit(1)` せず警告を出して監視機能のみ無効化

### 依存パッケージ追加
- `node-cron` ^3.0.3 — cron式ベースのタスクスケジューリング

### 変更されたファイル
| ファイル | 主な変更 |
|---|---|
| `src/scheduler.js` | 新規作成: node-cron + Chokidar によるジョブ管理モジュール |
| `discord_bot.js` | スケジューラ初期化・コールバック登録・シャットダウン処理を追加 |
| `.agent/skills/schedule-manager/SKILL.md` | 新規作成: Antigravity用ジョブ管理スキル |
| `package.json` | `node-cron` 依存追加、バージョンを 1.7.0 に更新 |
| `src/file_watcher.js` | Chokidar エラー耐性追加、WATCH_DIR 無効パスの処理改善 |
| `README.md` | 定期実行ジョブのセットアップ手順・仕様・cron式ガイドを追加 |

---

## v1.5.1 (2026-03-11)

### ドキュメント更新
- **Browser CDPポート競合の注意事項を追記**: Antigravityをデバッグモード（ポート9222）で使用しながらブラウザツール機能を使うと、ブラウザツールがAntigravityのメインウィンドウに誤接続し乗っ取られるバグが発生する問題を文書化
- **対処法を「起動方法」セクションに追加**: AntigravityのSettings → Browser → Browser CDP Portを `9333` 等の別ポートに変更するよう手順と設定値比較表を記載
- **設定画面のスクリーンショット追加**: `docs/images/browser_cdp_port_settings.png` を追加し、README内に画像を挿入

---

## v1.6.0 (2026-03-09)

### 新機能
- **マルチインスタンス対応（Multi-Instance Support）**: 同一PCで複数のAntigravityウィンドウを立ち上げ、独立したBotアカウントでそれぞれ遠隔操作できるようになりました
  - `src/env_loader.js` を新規追加。起動時に `bot1.lock` でOSレベルのプロセス死活監視（PIDチェック）を実施
  - Primaryインスタンスが稼働中の場合、後発プロセスは自動的にSecondaryスロットへフォールバックし、`.env.bot2` を読み込んで2つ目のBotとして起動
  - `/window` コマンドで各Botに接続先ウィンドウを個別に割り当てることで、1台のPCで複数のAntigravityを独立してマルチタスク操作可能
- **`/window` コマンドの強化**: 接続可能なウィンドウ一覧の表示と切り替えに対応

### 設定ファイル追加
- `.env.bot2.example` — 2つ目のBot用の環境変数テンプレートを追加
- `bot1.lock` / `bot2.lock` — インスタンス管理用のロックファイルを追加

### 変更されたファイル
| ファイル | 主な変更 |
|---|---|
| `src/env_loader.js` | 新規作成: PIDベースのロックファイルによるインスタンス管理・自動フォールバック |
| `discord_bot.js` | `/window` コマンドのマルチウィンドウ対応 |
| `.env.bot2.example` | 新規追加: 2番目のBotアカウント用設定テンプレート |
| `README.md` | マルチウィンドウの導入手順・コマンド説明を追記 |
| `SPECIFICATION.md` | セクション3.6にマルチウィンドウの仕様を追記 |

---

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
