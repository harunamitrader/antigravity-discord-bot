# 免責事項・セキュリティ警告 / Disclaimer & Security Warning

## 非公式ツールについて / Unofficial Tool

本ソフトウェア「Antigravity Discord Bot」は、**個人が開発した非公式のサードパーティーツール**です。
Google LLC、Antigravity の開発元、およびその関連企業・団体とは**一切関係がありません**。

「Antigravity」の名称は、対応するソフトウェアを示すために使用しているものであり、商標権の主張や公式な関係を示唆するものではありません。

This software "Antigravity Discord Bot" is an **unofficial third-party tool** developed by an individual.
It is **not affiliated with, endorsed by, or associated with** Google LLC, the developers of Antigravity, or any of their subsidiaries or affiliates.

The name "Antigravity" is used solely to indicate compatibility and does not imply any trademark claim or official relationship.

---

## 免責事項 / Disclaimer

**本ソフトウェアは「現状有姿 (AS IS)」で提供されます。**

本ソフトウェアの使用に起因または関連して生じた以下を含む（ただしこれに限定されない）いかなる損害についても、著者は**一切の責任を負いません**。

- データの消失、破損、または流出
- PCやシステムへの不正アクセスや乗っ取り
- ハードウェアまたはソフトウェアの故障
- サービスアカウントの停止
- 経済的損失
- その他あらゆる直接的・間接的・偶発的・特別・懲罰的損害

利用者は、上記のリスクを十分に理解し、**完全に自己責任**のもとで本ソフトウェアを使用するものとします。

This software is provided **"AS IS"**, without warranty of any kind. The author shall not be held liable for any damages arising from the use of this software, including but not limited to data loss, unauthorized access, system damage, account suspension, financial loss, or any other direct, indirect, incidental, special, or consequential damages.

---

## セキュリティに関する重大な警告 / Critical Security Warning

> [!CAUTION]
> 本ソフトウェアは、その設計上、**あなたのPCを外部（Discord）から遠隔操作できるバックドア**として機能します。

### 具体的なリスク

1. **遠隔コード実行 (Remote Code Execution)**
   - Discord経由でAIエージェントに任意のコマンドを実行させることが可能です。Botトークンの漏洩やユーザーID制限の設定ミスにより、**悪意ある第三者がPC上で任意のコードを実行できる**危険性があります。

2. **データの流出・消失**
   - AIエージェントはファイルシステムへの読み書き権限を持つため、**機密ファイルの窃取やデータの削除**が行われる可能性があります。

3. **アカウント侵害**
   - PC上に保存されたクッキー、認証トークン、パスワードなどが漏洩し、**各種オンラインサービスのアカウントが乗っ取られる**可能性があります。

### 安全に使うために

- `.env` ファイル（Botトークン）を**絶対に公開しない**。
- `DISCORD_ALLOWED_USER_ID` を**自分のユーザーIDのみに厳格に制限**する。
- **個人情報や重要データが含まれないPC・仮想環境**で使用する。
- **信頼できるネットワーク**でのみ使用する。
- 使用後は速やかにBotを停止する。

---

## 利用規約への影響について / Terms of Service

本ソフトウェアは Google Antigravity の非公式な自動化ツールです。

**規約違反と判断された場合、該当の Google アカウントが予告なく一時停止、または永久的に削除（BAN）されるリスクがあります。**
**万が一アカウントが停止されても支障のない環境での利用を推奨します。**

---

## 問い合わせ / Contact

本ソフトウェアに関する問い合わせは、GitHubのIssueまたは以下のアカウントまでお願いします。

- X (旧Twitter): [https://x.com/harunamix](https://x.com/harunamix)
