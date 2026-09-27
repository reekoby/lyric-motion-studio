# Security Policy / セキュリティポリシー

## Reporting a vulnerability / 脆弱性の報告

Please **do not open a public issue** for security problems. Use GitHub's private reporting instead:
**Security** tab → **Report a vulnerability** (GitHub Private Vulnerability Reporting).

セキュリティ上の問題は、公開の Issue ではなく、リポジトリの **Security** タブ →「Report a vulnerability」から非公開でご報告ください。

Please include: steps to reproduce, the affected file or feature, and a sample project / file if relevant.
We aim to respond within 14 days. / 14日以内の返信を目安にしています。

## Supported versions / 対象バージョン

Only the latest version on the `main` branch (and the GitHub Pages build) is supported.
最新版（`main` ブランチと GitHub Pages 版）のみを対象とします。

## Security model / 安全設計

- Everything runs client-side; there is no server, account or upload. すべてブラウザー内で動作し、サーバー・アカウント・アップロードはありません。
- The published `index.html` ships a strict Content-Security-Policy: only the bundled inline scripts (pinned by SHA-256 hashes) can run, and the only allowed network destinations are Google Fonts. 公開版は厳格な CSP を持ち、同梱スクリプト（SHA-256 で固定）以外は実行されず、通信先は Google Fonts のみです。
- Project files (`.json` / `.lmz`), looks, lyric files and data restored from browser storage are treated as untrusted input: values are validated against known types and IDs, prototype-polluting keys are dropped, `.lmz` entries are bounds-checked and size-capped, and remote URLs are never loaded from a file. 読み込むファイルや保存データは信頼しない前提で検証しています。
- Only open project files from people you trust, as with any document format. 他人から受け取ったプロジェクトファイルは、信頼できる相手のものだけを開いてください。
