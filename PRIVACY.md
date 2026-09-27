# プライバシーポリシー / Privacy Policy

最終更新日 / Last updated: 2026-09-27

[日本語](#日本語) ・ [English](#english)

---

## 日本語

Lyric Motion Studio（以下「本ツール」）は、ブラウザーの中だけで動く歌詞動画制作ツールです。作者 ΛNTRΞC は、本ツールを通じて利用者の個人情報を収集しません。

### 1. 収集しない情報
- アカウント登録・ログインはありません。
- 利用状況の解析（アクセス解析、広告、トラッキング）、Cookie は使用していません。
- 読み込んだ音源・歌詞・画像・動画・フォント・プロジェクトは、**どこにも送信されません**。解析（ビート検出、歌声からのタイミング推定など）と動画の書き出しは、すべてお使いの端末のブラウザー内で処理されます。

### 2. 端末内に保存される情報
作業を続けられるよう、次のデータを**お使いのブラウザーの中だけ**に保存します（作者を含め、第三者は参照できません）。

| 保存先 | 内容 |
|---|---|
| localStorage | 自動保存のプロジェクト（歌詞・タイミング・演出設定）、保存したルック、表示言語などの設定、スタイルのコピー |
| IndexedDB | 読み込んだ音源、背景画像・動画、スナップショット |

削除方法：メニュー「ファイル」→「このブラウザーの保存データを削除…」、またはブラウザーのサイトデータ削除。

### 3. 外部への通信
本ツールが行う外部通信は、**書体の読み込み（Google Fonts）のみ**です。
- 書体を表示するため、ブラウザーが `fonts.googleapis.com` / `fonts.gstatic.com`（Google LLC）に接続します。このとき、IPアドレス、ブラウザーの種類、要求した書体名が Google に送られます。日本語・韓国語の書体は文字の範囲ごとに分割して読み込まれるため、表示した文字の大まかな範囲が推測され得ます。
- Google の取り扱いについては [Google プライバシーポリシー](https://policies.google.com/privacy) と [Google Fonts のプライバシーに関する FAQ](https://developers.google.com/fonts/faq/privacy) をご覧ください。
- 本ツールは Content-Security-Policy により、Google Fonts 以外への通信をブラウザーの仕組みで禁止しています。

### 4. ホスティング
公開版は GitHub Pages（GitHub, Inc.）で配信しています。ページの配信にあたり、GitHub がアクセスログ（IPアドレス等）を記録する場合があります。詳しくは [GitHub のプライバシーに関する声明](https://docs.github.com/ja/site-policy/privacy-policies/github-general-privacy-statement) をご覧ください。`index.html` をダウンロードして端末で開けば、GitHub への接続も不要です。

### 5. 変更
本ポリシーを変更する場合は、このファイルを更新し、変更履歴はリポジトリで公開します。

### 6. お問い合わせ
GitHub リポジトリの Issues からご連絡ください。セキュリティ上の問題は [SECURITY.md](SECURITY.md) の方法でご報告ください。

---

## English

Lyric Motion Studio ("the Tool") is a lyric-video editor that runs entirely in your web browser. The author, ΛNTRΞC, does not collect personal data through the Tool.

### 1. What we do not collect
- No accounts or sign-in.
- No analytics, advertising, tracking or cookies.
- Audio, lyrics, images, videos, fonts and projects you load are **never uploaded**. Analysis (beat detection, vocal-based timing) and video export happen on your device, inside your browser.

### 2. Data stored on your device
So that you can continue your work, the Tool stores the following **only in your browser** (neither the author nor anyone else can access it):

| Storage | Contents |
|---|---|
| localStorage | Autosaved project (lyrics, timing, styling), saved looks, settings such as UI language, copied style |
| IndexedDB | Loaded audio, background images and videos, snapshots |

To delete it: menu "File" → "Delete data stored in this browser…", or clear the site data in your browser settings.

### 3. Network connections
The only external connection is **loading typefaces from Google Fonts**.
- To display fonts, your browser connects to `fonts.googleapis.com` / `fonts.gstatic.com` (Google LLC). Google receives your IP address, browser type and the requested font families. Japanese and Korean fonts are split into character-range slices, so the rough range of characters displayed may be inferable.
- See the [Google Privacy Policy](https://policies.google.com/privacy) and the [Google Fonts privacy FAQ](https://developers.google.com/fonts/faq/privacy).
- A Content-Security-Policy makes the browser block every other destination.

### 4. Hosting
The public version is served by GitHub Pages (GitHub, Inc.), which may log requests (e.g. IP addresses); see the [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). If you download `index.html` and open it locally, no connection to GitHub is needed.

### 5. Changes
Changes to this policy are made by updating this file; the history is public in the repository.

### 6. Contact
Please use the repository's Issues. Report security problems as described in [SECURITY.md](SECURITY.md).
