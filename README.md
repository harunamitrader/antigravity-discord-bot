<div align="center">

![Header Image](header.jpg)

# Antigravity Discord Bot


<img src="https://img.shields.io/badge/Node.js-18.x+-43853D?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
<img src="https://img.shields.io/badge/Discord.js-14.x-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord.js" />
<img src="https://img.shields.io/badge/WebSocket-WS-000000?style=for-the-badge" alt="WebSocket" />
<img src="https://img.shields.io/badge/Chokidar-5.x-blue?style=for-the-badge" alt="Chokidar" />

</div>

このツールはAntigravity (VS Code Fork) を Discord から操作するためのボットです。
Chrome DevTools Protocol (CDP) を使用して Antigravity の内部状態にアクセスし、メッセージの送信や操作の自動化を行います。
> ※ 本ツールは公式のAntigravityとは無関係の非公式ツールです。

> [!CAUTION]
> **【重要】セキュリティに関する警告 / Security Warning**
> 
> このソフトウェアは開発者向けの実験的ツール (PoC) です。仕組み上、**あなたのPCを外部（Discord）から遠隔操作するバックドア**として機能します。Botの操作権限を奪われることは **PCの乗っ取りと同義** です。
> 
> **自動承認モード (Auto-approval)** を有効にした場合、Antigravityが求めるすべての操作許可を**無条件・無検閲で自動承認**します。AIが破壊的な操作（ファイル全削除、APIキーの外部送信、悪意あるコマンド実行など）を提案しても、確認なしに即座に実行されます。v1.3のSmart Safetyは一部の危険なコマンドをブロックしますが、**すべてを検出できるわけではありません。**
>
> **安全に使うための絶対ルール:**
> 1. **`.env`（Botトークン）を絶対に公開しない** — パスワードと同じです
> 2. **`DISCORD_ALLOWED_USER_ID` を自分だけに厳格に制限する** — 設定ミス＝第三者にPCを操作される危険
> 3. **個人情報のない独立した環境（仮想環境等）で使用する** — メインPCでの利用は非推奨
> 4. **自動承認モードを使用する場合は、事前にバックアップを取ること**
> 5. **本番環境・顧客データがある環境では絶対に使用しない**
> 6. **セキュリティの知識がない一般ユーザーへの配布は非推奨**
>
> **本ツールの使用によって生じたいかなる損害（データ喪失、システム破壊、情報の流出等）についても、開発者は一切の責任を負いません。すべて自己責任で使用してください。** 詳細は [DISCLAIMER.md](DISCLAIMER.md) を参照。

> [!TIP]
> **許可ボタンの自動クリック機能について**
> v1.2より、AIエージェントが実行する「Run」や「Allow Once」といった承認ボタンを自動でクリックする **「自動承認モード (Auto-approval mode)」** が搭載されました。以下のDiscordコマンドで制御可能です。
>
> v1.3では、Discord上のボタンがAntigravity側のボタン名（Run, Allow Onceなど）をそのまま反映するようになりました。また、`rm -rf /` 等の危険なコマンドは自動承認モードでもブロックされ、手動承認が求められます。

## おすすめの導入方法

antigravityのAIチャットに以下のプロンプトを入力してください。
「https://github.com/harunamitrader/antigravity-discord-bot を導入して。可能な範囲でAI側で作業を行い、必要な情報があれば質問して。手動で行う必要があるものは丁寧にやり方を教えて。」

導入が完了したら、
「デバッグモード用ショートカットとantigravity-discord-botの起動用ショートカットをデスクトップに作成して」
も必要に応じてプロンプトを送信しても良いかもしれません。

## 🚀 主な機能

1.  **テキスト生成**: DiscordメッセージをそのままAntigravityに転送し、生成を開始します。
2.  **ファイル添付**: 画像やテキストファイルを添付してAntigravityに送信できます。
3.  **モデル切替**: `/model` コマンドでAIモデルを切り替えられます。
4.  **モード切替**: `/conversation` コマンドでPlanning/Fastモードを切り替えられます。
5.  **自動承認**: `/auto` コマンドで承認ボタンの自動クリックをON/OFFできます。
6.  **動的ボタンラベル**: Discord上の承認ボタンがAntigravity側のラベル（Run, Allow Once等）を反映します。
7.  **Smart Safety**: 自動承認モードでも破壊的コマンド（`rm -rf /` 等）を検出し、手動承認を要求します。
8.  **スクリーンショット**: `/screenshot` コマンドで現在の画面を取得できます。
9.  **生成停止**: `/stop` コマンドで生成を中断できます。
10. **新規チャット**: `/newchat` コマンドで新しい会話を開始できます。
11. **最終レスポンス取得**: `/last_response` コマンドで直前のAI回答を再取得できます。
12. **ファイル監視**: プロジェクトディレクトリ内のファイル変更を検知し、Discordに通知します。
13. **ウィンドウ管理**: `/window` コマンドで現在の接続先ウィンドウの確認や切り替えができます。
14. **Bot再起動**: `/restart` コマンドでBotプロセスを再起動できます（`start_bot.bat` 経由で起動している場合）。
15. **起動完了通知**: Bot起動完了時にDiscordへ通知メッセージを送信します。
16. **チャンネル指定**: チャット通知とファイルログ通知の送信先チャンネルを `.env` で個別に指定できます（オプション）。

## 🛠️ 事前準備 (Discord Botの作成)

### 1. Discord Botの作成とトークン取得
1. [Discord Developer Portal](https://discord.com/developers/applications) にアクセスし、ログインします。
2. 右上の **"New Application"** をクリックし、名前（例: `AntigravityBot`）を入力して作成します。
3. 左メニューの **"Bot"** を選択し、**"Reset Token"** をクリックしてトークンを生成・コピーします。
   - ※このトークンが `.env` の `DISCORD_BOT_TOKEN` になります。
4. 同ページ（Botタブ）の下部にある **"Privileged Gateway Intents"** セクションで、以下を **ON** にします。
   - **PRESENCE INTENT**
   - **SERVER MEMBERS INTENT**
   - **MESSAGE CONTENT INTENT** (重要: これがないとメッセージを読み取れません)
5. 設定を変更したら必ず **Warning: Save Changes** ボタンで保存してください。

### 2. Botをサーバーに招待
1. 左メニューの **"OAuth2"** -> **"URL Generator"** を選択します。
2. **SCOPES** で `bot` にチェックを入れます。
3. **BOT PERMISSIONS** で以下にチェックを入れます（最低限必要な権限）。
   - Read Messages/View Channels
   - Send Messages
   - Send Messages in Threads
   - Embed Links
   - Attach Files
   - Read Message History
4. 生成されたURLをコピーし、ブラウザで開いてBotを自分のサーバーに追加します。

### 3. DiscordユーザーIDの取得
1. Discordアプリの **「ユーザー設定」** (歯車アイコン) -> **「詳細設定」** を開きます。
2. **「開発者モード」** をオンにします。
3. 自分のユーザーアイコンまたは名前を右クリックし、**「ユーザーIDをコピー」** を選択します。
   - ※このIDが `.env` の `DISCORD_ALLOWED_USER_ID` になります。

## 📦 導入方法

### 必要要件
- Node.js (v18以上推奨)
- Antigravity (デバッグポート 9222 で起動していること)

### インストール手順

1. リポジトリをクローンします。
   ```bash
   git clone https://github.com/harunamitrader/antigravity-discord-bot.git
   cd antigravity-discord-bot
   ```

2. 依存パッケージをインストールします。
   ```bash
   npm install
   ```

3. 環境変数を設定します。
   リポジトリに含まれる `.env.example` をコピーして `.env` という名前で保存し、中身を書き換えてください。
   
   **Windows (PowerShell):**
   ```powershell
   cp .env.example .env
   ```
   **Mac/Linux:**
   ```bash
   cp .env.example .env
   ```

   その後、`.env` ファイルを開き、トークンなどを入力します。

### 起動方法

1. **Antigravityをデバッグモードで起動**
   - Antigravityのショートカットをコピーして作成します。
   - ショートカットを右クリックし、**「プロパティ」** を開きます。
   - **「リンク先」** の末尾に半角スペースを入れて `--remote-debugging-port=9222` を追加します。
     - 例: `"C:\...\Antigravity.exe" --remote-debugging-port=9222`
   - 「OK」を押して保存し、そのショートカットからアプリを起動します。

2. **ボットを起動**
   ```bash
   node discord_bot.js
   ```
   または `start_bot.bat` をダブルクリックして起動（`/restart` コマンドによる自動再起動に対応）。

### 🔌 高度な設定: 複数ウィンドウでのマルチタスク (Multi-Instance Support)

同じPCで複数のAntigravityウィンドウを立ち上げ、別々のBotアカウントで独立して遠隔操作することができます。

#### 1. 設定の準備
リポジトリにある `.env.bot2.example` をコピーして **`.env.bot2`** を作成し、中身を **2つ目のBotのトークン** に書き換えます。

#### 2. 起動手順
ターミナルを2つ開くか、`start_bot.bat` を2回起動します。
- **1つ目のプロセス** は自動的に `.env` を読み込んで起動します。
- **2つ目のプロセス** は、すでに1つ目が動いていることを検知し、自動的に `.env.bot2` にフォールバックして2番目のBotとして起動します。

#### 3. ウィンドウの割り当て
Discord上で、それぞれのBotが存在するチャンネルで以下のコマンドを入力します。
```text
/window
```
表示される接続先候補のリストから、Bot 1にはウィンドウAの番号を、Bot 2にはウィンドウBの番号を指定して割り当てます。
これで、1台のPCで2つの画面を2つのBotに個別にマルチタスクさせることができます。

## 📖 コマンド一覧

| コマンド | 説明 |
|---|---|
| `/help` | コマンド一覧と使い方の表示 |
| `/status` | ウィンドウ、モデル、モード、自動承認の状態を表示 |
| `/auto on` / `/auto off` | 自動承認をON/OFFに切り替え |
| `/model` | 利用可能なモデル一覧を表示 |
| `/model number:<番号>` | 指定したモデルに切り替える |
| `/conversation planning` / `/conversation fast` | モードを切り替える |
| `/newchat` | 新しいチャットを開始 |
| `/stop` | 生成を停止 |
| `/screenshot` | スクリーンショットを取得 |
| `/last_response` | 直前のAI回答を再取得 |
| `/window` | 出力可能なウィンドウの一覧を表示 |
| `/window number:<番号>` | 指定したウィンドウに切り替える |
| `/restart` | Botプロセスを再起動（`start_bot.bat` 経由起動時のみ自動再起動） |

## 🛠️ 技術仕様

詳細な仕様については [SPECIFICATION.md](SPECIFICATION.md) を参照してください。

## 📝 変更履歴

詳細な変更履歴については [CHANGELOG.md](CHANGELOG.md) を参照してください。

## ⚖️ 免責事項

本ソフトウェアの使用に関する免責事項・セキュリティ警告の詳細は [DISCLAIMER.md](DISCLAIMER.md) を参照してください。

## 📜 ライセンス

MIT License — 詳細は [LICENSE](LICENSE) を参照してください。
