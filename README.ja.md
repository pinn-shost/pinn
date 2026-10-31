<p align="center">
  <img src=".github/assets/banner.png" alt="pinn. – あなた自身のNASで動く家族のオーガナイザー" width="880">
</p>

<p align="center">
  <a href="https://github.com/pinn-shost/pinn/releases/latest"><img src="https://img.shields.io/github/v/release/pinn-shost/pinn?style=flat-square&color=2F4B41&label=release" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/pinn-shost/pinn?style=flat-square&color=2F4B41" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/runs%20on-Docker-2F4B41?style=flat-square&logo=docker&logoColor=white" alt="Runs on Docker">
  <img src="https://img.shields.io/badge/backend-PocketBase-2F4B41?style=flat-square" alt="PocketBase">
  <img src="https://img.shields.io/badge/iPhone%20%7C%20iPad%20%7C%20Android-installable%20web%20app-2F4B41?style=flat-square" alt="iPhone, iPad and Android">
  <a href="https://ko-fi.com/pinnapp"><img src="https://img.shields.io/badge/Ko--fi-support-C28A33?style=flat-square&logo=kofi&logoColor=white" alt="Support on Ko-fi"></a>
</p>

<p align="center">
  <a href="README.md">🇬🇧 English</a> ·
  <a href="README.de.md">🇩🇪 Deutsch</a> ·
  <a href="README.es.md">🇪🇸 Español</a> ·
  <a href="README.fr.md">🇫🇷 Français</a> ·
  <a href="README.it.md">🇮🇹 Italiano</a> ·
  <a href="README.pt.md">🇧🇷 Português</a> ·
  <a href="README.zh.md">🇨🇳 中文</a> ·
  <b>🇯🇵 日本語</b> ·
  <a href="README.ko.md">🇰🇷 한국어</a>
</p>

<p align="center">
  <a href="#screenshots">スクリーンショット</a> ·
  <a href="#what-pinn-does">機能</a> ·
  <a href="#installation">インストール</a> ·
  <a href="#privacy">プライバシー</a> ·
  <a href="#faq">FAQ</a>
</p>

---

pinn.は、家庭を回すためのすべてをまとめたアプリです。共有カレンダー、今週の献立、買い物リスト、ごみ出しの担当、お小遣い、3月に解約しなければならない保険など。**あなた自身のNAS**でDockerを使って動き、家族のすべてのiPhone、iPad、Androidスマートフォンにネイティブアプリのようにインストールできます。

クラウドアカウントは不要。定期購読もありません。広告も追跡もありません。家族のデータは家の外に出ません。

<a id="screenshots"></a>

## スクリーンショット

### iPadで

壁に掛けても、キッチンのテーブルに置いても。共有のiPadが家族全員の様子をいっぺんに映し出します。

<table>
  <tr>
    <td align="center" width="50%">
      <img src=".github/assets/screenshots/dashboard.png" alt="pinn.のダッシュボード：選べる家族のプロフィール" width="400"><br>
      <sub><b>ダッシュボード</b>：それぞれが自分の写真をタップ、PINは任意</sub>
    </td>
    <td align="center" width="50%">
      <img src=".github/assets/screenshots/ipad-overview.png" alt="天気、カレンダー、タスク、家族のタイルを表示したiPadのpinn.概要" width="400"><br>
      <sub><b>概要</b>：天気、予定、タスク、食事、家族がひと目でわかる</sub>
    </td>
  </tr>
</table>

### スマートフォンで

いつでも一緒：pinn.は、すべてのiPhoneとAndroidスマートフォンにネイティブアプリのようにインストールできます。

<table>
  <tr>
    <td align="center" width="33%"><img src=".github/assets/screenshots/home.png" alt="今日の天気、タスク、予定を表示したホーム画面" width="240"><br><sub><b>概要</b>：あなたの一日がひと目でわかる</sub></td>
    <td align="center" width="33%"><img src=".github/assets/screenshots/calendar.png" alt="週表示の家族カレンダー" width="240"><br><sub><b>カレンダー</b>：iCloudとGoogleをひとつの画面で</sub></td>
    <td align="center" width="33%"><img src=".github/assets/screenshots/meals.png" alt="レシピ付きの週間献立" width="240"><br><sub><b>食事</b>：一週間を計画して、ワンタップで買い物</sub></td>
  </tr>
  <tr>
    <td align="center" width="33%"><img src=".github/assets/screenshots/lists.png" alt="お店ごとに並べた買い物リスト" width="240"><br><sub><b>リスト</b>：買い物、ストック、荷造り</sub></td>
    <td align="center" width="33%"><img src=".github/assets/screenshots/finance.png" alt="カテゴリ別の支出を示す予算の概要" width="240"><br><sub><b>家計</b>：予算、貯蓄、お小遣い</sub></td>
    <td align="center" width="33%"><img src=".github/assets/screenshots/kids.png" alt="毎日の流れを表示した子どものページ" width="240"><br><sub><b>子ども</b>：楽しい毎日の流れ</sub></td>
  </tr>
</table>

<a id="what-pinn-does"></a>

## pinn.でできること

| | |
|---|---|
| 📅 **カレンダー** | 人ごとのiCloudとGoogleカレンダーを、非公開にも家族との共有にもできます。祝日、学校の休み、ごみ回収日、連絡先の誕生日が自動で表示されます。 |
| 🍝 **食事とレシピ** | 一週間を計画し、材料をそのまま買い物リストへ。テキスト、PDF、写真、リンクからレシピを取り込めます（AIの利用は任意）。お気に入りのレシピを同じサーバー上のほかの家族と共有できます。 |
| 🛒 **リスト** | お店ごとの買い物リスト、在庫が減るとリストを補充するストック、テンプレートからの持ち物リスト（旅行、入院バッグ、パーティー）、ギフトリストとほしいものリスト。 |
| ✅ **タスクと家事** | プッシュのリマインダー付きタスク、掃除計画、ごみ箱。さらに、時間帯に合うことだけを表示するアニメーション付きの日課を備えた子どものページ。 |
| 💶 **家計** | 共有または個人の財布、家計の予算、ETFや株式を扱う貯蓄と証券口座、お小遣い、定期的な支払い、解約リマインダー付きの契約。ルームシェアでは費用を分け合い、だれがだれにいくら支払うかを確認できます。 |
| 📄 **書類と乗り物** | レシートと保証、期限リマインダー付きの身分証。車と自転車の車検日、タイヤ交換、燃費、総費用。 |
| 🏡 **住まい** | 借主、所有者、貸主向け：賃貸借または売買契約書、ローン、写真付きの不具合、請求書、リフォーム計画、予測つきの検針、鍵、貸している部屋・家・ガレージの家賃収入。雨が降った日を把握している水やり計画つきの庭と植物。 |
| 📍 **家族と位置情報** | pinn.から直接、一度だけ、または選んだ時間だけ位置情報を共有できます。無料アプリのTraccar Clientを使えばバックグラウンドでも共有できます（pinn.に直接送信、追加サーバー不要）。さらに「帰宅中」モード、位置と緊急番号つきのSOSアラート、緊急カード、場所への到着通知。 |
| 🎒 **学校と保育園** | 子どもごとに：時間割（入力するか、写真を撮るとAIが入力）、送り迎え、子どものページの宿題、期限がリマインダーになる保護者向けのお便り、カレンダーに直接表示される休園・休校日。 |
| 🐾 **ペット** | 犬、猫、うさぎなどのプロフィール。チェックできる食事の時間、散歩、「だれの番？」の当番表、プッシュのリマインダー付きの予防接種と駆虫、体重グラフ、獣医と救急動物病院、共有できるペットシッター用シート、印刷できる「迷子」ポスター、自動給餌器の補充リマインダー。 |
| 🌦️ **天気と休暇** | 天気をタップすると（スマートフォンではタイル、iPadとパソコンでは日付と時刻の横の上部）、14日分と各日の詳細を確認できます。目的地と日程を入れた持ち物リストには休暇中の天気（予報または平年値）が表示され、持っていくものを提案します。 |
| 🏠 **スマートホーム** | タスクからAppleショートカットやHome Assistantのアクションを開始：家事の期日にロボット掃除機がキッチンを掃除し、ロボット芝刈り機と水やりは庭の計画に従い、自動給餌器は空になりそうなときに知らせます。 |
| 🎙️ **音声操作** | 「Hey Siri、pinn」：買い物リストに追加、読み上げ、タスクの作成、今日の予定の確認。Androidでも使えます。 |
| 🔔 **通知** | iPhone、iPad、Androidに届く個人向けのプッシュメッセージと、家族内のあらゆる変更を集めるベル。 |
| 🧩 **そのほか** | 動かせるメモ付きの家族の掲示板、全体検索、自動同期付きのオフラインモード、ダークモード、プロフィールPIN付きのiPadダッシュボード、ゲストアカウント、チャイルドロック。 |

pinn.は **🇬🇧 English、🇩🇪 Deutsch、🇪🇸 Español、🇫🇷 Français、🇮🇹 Italiano、🇧🇷 Português、🇨🇳 中文、🇯🇵 日本語、🇰🇷 한국어** に対応し、通貨と緊急番号をお住まいの地域に合わせ、**家族**と**ルームシェア**の表現を切り替えます。1台のサーバーで複数の家族を運用でき、それぞれに管理者を置けます。

## 1.120.3の新機能

**ロシア語 – 第4段階**

- ロシア語に翻訳：リスト（持ち物、プレゼント、ほしい物、チェックリスト、アイデア――すべてのテンプレートを含む）、買い物、スキャナーと「何が作れる？」付きのストック、インポート・公開レシピ・ゴミ箱付きのレシピ――これで6714件中2656件のテキストが完了。
- すべて翻訳されるまで、ロシア語は**非表示**のままです（1.120.0の説明どおり1台の端末で有効にできます）。
- 次回：ロシア語の次の段階（家計、財布、証券口座、契約 …）。
- 変更：`index.html`, `js/sprachen.js`, `js/versionslog.js`, `i18n/ru.i18n.js`, `i18n/versionslog.en.js` ――サーバー側の変更はありません。いつもどおりインストールしてください（`sudo sh pinn-*/pinn-setup.sh` またはアップデートボタン）。

## 1.120.2の新機能

**ロシア語 – 第3段階**

- ロシア語に翻訳：カレンダー（予定、カレンダーの追加、iCloud/Google）、タスク、家事と当番の持ち回り、食事プラン、タイル付きの概要、天気と休暇先の天気、祝日と学校休暇、検索、プロフィール画像――これで6714件中1545件のテキストが完了。
- すべて翻訳されるまで、ロシア語は**非表示**のままです（1.120.0の説明どおり1台の端末で有効にできます）。
- 次回：ロシア語の次の段階（リスト、ストック、レシピ …）。
- 変更：`index.html`, `js/sprachen.js`, `js/versionslog.js`, `i18n/ru.i18n.js`, `i18n/versionslog.en.js` ――サーバー側の変更はありません。いつもどおりインストールしてください（`sudo sh pinn-*/pinn-setup.sh` またはアップデートボタン）。

## 1.120.1の新機能

**ロシア語 – 第2段階**

- ロシア語に翻訳：アカウント（パスワード、PIN、プロフィール、ゲスト、通知、ファミリーダッシュボード）、デバイスとサインイン、エラーログ、バックアップとアップデート――これで6714件中874件のテキストが完了。今回も3つの複数形とシェアハウス用の言葉に対応しています。
- すべて翻訳されるまで、ロシア語は**非表示**のままです（1.120.0の説明どおり1台の端末で有効にできます）。
- 次回：ロシア語の次の段階（カレンダー、タスク、家事 …）。
- 変更：`index.html`, `js/sprachen.js`, `js/versionslog.js`, `i18n/ru.i18n.js`, `i18n/versionslog.en.js` ――サーバー側の変更はありません。いつもどおりインストールしてください（`sudo sh pinn-*/pinn-setup.sh` またはアップデートボタン）。

## 1.120.0の新機能

**ロシア語――第1段階**

- pinn. を段階的に**ロシア語**へ翻訳しています。第1段階は、ログイン、ダッシュボード、メニュー、メイン管理者ページ、すべての設定、さらに初期設定ウィザード全体とデータのエクスポートです（約500件のテキスト、ロシア語の3つの複数形とルームシェアの表現を含む）。
- すべての翻訳が終わるまで、ロシア語は**非表示**のままです。1台の端末で試すには、ブラウザのコンソールで `localStorage.setItem('pinn.sprachen.alle', '1')` を入力し、Русский を選んでください。まだ翻訳されていないテキストは英語で表示されます。
- サーバー：初期設定でロシア語も言語として受け付けるようになりました（`pb_hooks/pinn-einrichtung.js`）。
- 次回：ロシア語の次の段階（カレンダー、タスク、家事 …）。
- 変更：`index.html`, `js/sprachen.js`, `js/einrichten.js`, `js/exportieren.js`, `js/versionslog.js`, `einrichtung.js`, `datenexport.js`, `i18n/ru.i18n.js`（新規）、`i18n/versionslog.en.js`、`pb_hooks/pinn-einrichtung.js`、`.github/`。いつも通りインストール（`sudo sh pinn-*/pinn-setup.sh` または更新ボタン）。

## 1.119.3の新機能

**整理：古い翻訳機能を削除**

- pinn. のすべてのテキストは、`i18n/` の言語ファイルから直接読み込まれるようになりました。古い辞書（`pb_public/lang/` フォルダ、約 4 MB）と、使用中に画面を書き換えていた翻訳機能は削除されました。pinn. の起動が速くなり、メモリ使用量も減ります（特に古いスマートフォンやタブレットで）。
- アップデート時に古いファイルは NAS の `_alt/<日付>/` に移動され（何も削除されません）、空になった `lang/` フォルダは削除されます。
- 細かな改善：ホーム画面、ダッシュボード、週表示、家計、「住まい」の日付と時刻が最初から言語に合った形式で表示されます。見通し設定の「保存しました」が翻訳されました。ルームシェアでは、メニュー・概要タイル・設定に 🧑‍🤝‍🧑 アイコンが表示されます。自分で書いたテキスト（例：掲示板のメモ「Hallo Familie」）はルームシェアでも書き換えられなくなりました。
- 次回：ロシア語を段階的に追加します（完成までは非表示）。
- 変更：`index.html`, `js/sprachen.js`, `js/zustand.js`, `js/uebersicht.js`, `js/familie.js`, `js/listen.js`, `js/sterne.js`, `js/ausblick.js`, `js/grundlagen.js`, `js/profilauswahl.js`, `js/wohnort.js`, `js/finanzen.js`, `js/einstellungen.js`, `js/smarthome.js`, `js/versionslog.js`, `i18n/versionslog.en.js`, `pinn-setup.sh`、`.github/` – 削除：`pb_public/lang/` – サーバー側の変更はありません。いつも通りインストール（`sudo sh pinn-*/pinn-setup.sh` または更新ボタン）。

## しくみ

```mermaid
flowchart LR
  subgraph Home["自宅のネットワーク"]
    direction LR
    P["📱 Phones & tablets<br/>pinn. on the home screen"] -->|HTTPS| C["Caddy<br/>certificate via DuckDNS"]
    C --> PB["PocketBase<br/>pinn. app + database"]
    PB --- T["Traccar<br/>optional, GPS trackers"]
    PB --- HA["Home Assistant<br/>optional"]
    PB --- B["Nightly backup"]
  end
  R["📱 On the go"] -.->|"WireGuard or Tailscale VPN"| C
```

すべては1台のマシン上でDockerコンテナとして動きます。HTTPSは**ポート開放なし**で動作し、証明書はDNS確認で発行されます。外部からpinn.に接続できるのは、あなた自身のVPN経由のみです。

## 必要なもの

- **Docker**と**Docker Compose 2.17以降**が使えるNASまたはサーバー：UGOSを搭載したUGREEN NASで開発され、Dockerが動くあらゆるLinuxホスト（amd64、arm64、armv7）で動作します
- そのSSHアクセス
- 任意ですが推奨：HTTPS用の無料の[DuckDNS](https://www.duckdns.org)サブドメイン（プッシュ通知とpinn.のアプリとしてのインストールに必要）

<a id="installation"></a>

## インストール

1. [最新リリース](https://github.com/pinn-shost/pinn/releases/latest)のZIPをダウンロードして展開します。
2. NASにフォルダを作成し（例：`/volume1/docker/Pocketbase`）、展開したフォルダ（例：`pinn-1.120.3`または`pinn-main`）をそのまま入れます。
3. SSHでログインして次を実行します：
   ```sh
   cd /volume1/docker/Pocketbase && sudo sh pinn-*/pinn-setup.sh
   ```
   スクリプトがすべてのファイルを所定の場所にコピーし、PDF取り込みと写真の文字認識に必要なライブラリをダウンロードして、pinn.を起動します。
4. `http://<NASのIP>:8090`を開き、**メイン管理者としてログイン** → パスワード`Admin` → 自分のパスワードを設定します。
5. **セットアップアシスタント**が、HTTPS、WireGuardまたはTailscaleでのリモートアクセス、Google、AI、位置情報、Home Assistantといった残りの設定を、9つの言語で順番に案内します。
6. 各スマートフォンでHTTPSアドレスからpinn.を開き、ホーム画面に追加します：
   - **iPhone/iPad（Safari）：** 共有 → *ホーム画面に追加*（通知にはiOS 16.4以降が必要）
   - **Android（Chrome）：** 設定 → 通知 → *pinn.をアプリとしてインストール*、またはChromeのメニュー ⋮ → *アプリをインストール*

   そのあと、各デバイスで**設定 → 通知 → このデバイスで有効にする**から通知をオンにします。

**アップデート：**新しいZIPをダウンロードし、展開したフォルダを同じフォルダに入れて、もう一度`sudo sh pinn-*/pinn-setup.sh`を実行します。置き換えられたファイルは`_alt/`に残り、データには手を付けません。

**バックアップ**は毎晩`./backups`に作成され、14日間保存されます。

<a id="privacy"></a>

## プライバシー

pinn.は、クラウドサービスには決して預けたくないデータのために作られました。銀行の取引明細、健康に関する書類、子どもたちの居場所などです。そのため：

- **すべてのデータはあなたのNASに**、1つのPocketBaseデータベースとして保存されます。pinn.のサーバーはなく、テレメトリもありません。
- **外部サーバーのスクリプトは使いません。**すべてのコードとライブラリはあなたのNASから配信されます。
- **プッシュ通知に内容は含まれません。**Apple、Google、Mozillaは空の起動シグナルを届けるだけで、デバイスがあなたのNASからメッセージを取得します。
- **iCloudとGoogleのパスワード**は、ロックされたコレクションに暗号化して保存されます。
- **インターネットからは接続できません。**リモートアクセスはあなた自身のVPN経由です。

pinn.が外部サービスに接続するのは、それを必要とする機能のときだけです：

| サービス | 用途 | いつ |
|---|---|---|
| [Open-Meteo](https://open-meteo.com) | 天気予報 | 自宅の住所が設定されているとき |
| [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org) | 住所を地図上の位置に変換 | 住所を入力するとき |
| [OpenStreetMapタイル](https://www.openstreetmap.org) | 地図の背景 | 位置情報ページで、あなたのNAS経由で読み込み |
| [Google Fonts](https://fonts.google.com) | 書体 | アプリの読み込み時 |
| [OpenHolidays API](https://www.openholidaysapi.org) | 祝日と学校の休み | 自宅の住所が設定されているとき |
| [DuckDNS](https://www.duckdns.org) | HTTPS証明書とアドレス | 設定した場合 |
| iCloud / Google | カレンダーと連絡先 | 接続したアカウントのみ |
| Google Gemini | レシピと書類の読み取り | APIキーを追加した場合のみ |
| jsDelivr | pdf.jsとTesseractの1回限りのダウンロード | インストール中のみ |

<a id="faq"></a>

## FAQ

<details>
<summary><b>ルーターのポートを開ける必要はありますか？</b></summary>
<br>
いいえ。HTTPS証明書はDNS確認で発行され、リモートアクセスはVPN経由です。FRITZ!BoxではWireGuard、そのほかのルーターではTailscaleを使います。
</details>

<details>
<summary><b>NASがなくても使えますか？</b></summary>
<br>
Dockerが動く常時稼働のマシンなら使えます。ミニPC、Raspberry Pi 4/5、Linuxサーバーなどです。
</details>

<details>
<summary><b>pinn.はApp Storeの「本物」のアプリですか？</b></summary>
<br>
pinn.はホーム画面に追加するWebアプリです。追加するとネイティブアプリのように全画面で開き、オフラインでも動作し、未完了のタスクをバッジで表示し、プッシュ通知も受け取れます。アプリストアは不要です。
</details>

<details>
<summary><b>1つのインストールを複数の家族で使えますか？</b></summary>
<br>
はい。メイン管理者が家族を作成し、各家族に専用の管理者、カレンダー、データが用意されます。レシピは家族間で任意に共有できます。
</details>

<details>
<summary><b>子どもはどうなりますか？</b></summary>
<br>
チャイルドロックのあるプロフィールは自分のタスクだけが見え、何も削除や変更ができません。家計、書類、乗り物は非表示のままです。小さな子どもには、毎日の日課を載せた楽しい専用ページがあります。
</details>

<details>
<summary><b>費用はかかりますか？</b></summary>
<br>
かかりません。pinn.は無料で、MITライセンスのオープンソースです。Gemini AIなどのオプションサービスには無料枠があります。
</details>

## リポジトリの構成

リポジトリは、NAS上のインストールと同じ構成です。すべてのファイルが最終的に置かれる場所にあります：

```
pinn/
├── pb_hooks/            server: *.pb.js hooks and their helper modules (pinn-*.js, calendar-sync.js)
├── pb_public/           web app served by PocketBase
│   ├── index.html       the app page, built from src/ (HTML, start check) – do not edit by hand
│   ├── js/              app code split out of index.html, plain <script> files without a build step
│   │                    (ruhemodus.js, textkern.js, sprachen.js, region.js, grundlagen.js, popups.js, verbindung.js, benutzer.js, mitteilungen.js, serverzugriff.js, tastatur.js, anmeldemaske.js, dashboard.js, dashboardhintergrund.js, profilauswahl.js, pineingabe.js, dashboardsitzung.js, dashboardkonto.js, familienverwalten.js, einrichten.js, exportieren.js, hauptadminseite.js, anmeldung.js, konto.js, profilverwaltung.js, zustand.js, bedienzustand.js, rezeptbilder.js, zusammenfuehren.js, speichern.js, design.js, sprache.js, uebersicht.js, familienkachel.js, wobistdu.js, geburtstagsfeier.js, wetterkachel.js, geburtstage.js, uebersichteinstellungen.js, familiensync.js, bereiche.js, kalenderquellen.js, icsparser.js, zeitleiste.js, termindetails.js, kalenderdatei.js, wetter.js, wohnort.js, feiertage.js, muellkalender.js, mitglieder.js, profilbild.js, mitglied.js, kinderseite.js, kinderroutine.js, sterne.js, kalenderansicht.js, essenplanen.js, rezeptparser.js, rezeptdialog.js, rezeptbild.js, rezeptmengen.js, einkauf.js, einkaufslisten.js, einkaufseingabe.js, rezepte.js, offline.js, aufgabenextras.js, appbadge.js, reisen.js, aufgabendaten.js, haushalt.js, reihum.js, aufgaben.js, smarthome.js, sprachsteuerung.js, termine.js, ansichten.js, versionspruefung.js, sicherungen.js, geraete.js, fehlerprotokoll.js, versionslog.js, einstellungen.js, kalenderkonto.js, finanzen.js, kassen.js, vorrat.js, vorrat2.js, sparen.js, vertraege.js, fahrzeuge.js, zuhause.js, dokumente.js, pdflesen.js, appstart.js, pinnwand.js, listen.js, familie.js, hinweise.js, ausblick.js – ausblick.js always comes last)
│   ├── css/             app styles split out of index.html, plain CSS without a build step (ergaenzung.css, energiesparen.css, basis.css … haustierewetter.css, terminal.css, glocke.css)
│   ├── einrichtung.js   setup assistant · datenexport.js  data export
│   ├── i18n/            texts by key (de, en, fr, es, it, pt, zh, ja, ko) – English is the reference
│   └── vendor/          pinn.css, pocketbase/ (pdf.js and Tesseract are downloaded by the setup)
├── .github/             GitHub Actions (workflows/check.yml), checks (scripts/), CONTRIBUTING.md, SECURITY.md, images – not installed
├── src/                 sources of index.html (build.js, rahmen.html, teile/) – not installed
├── caddy/Caddyfile      HTTPS reverse proxy
├── docker-compose.yaml  all containers
├── env.txt              template for .env
├── pinn-setup.sh        install & update
├── pinn-wartung.sh      backups & updates (container "wartung")
├── pinn-pocketbase-update.sh
├── index.html           placeholder only, never installed (keeps the update button of 1.38 working)
└── README.md            this page · README.<code>.md in de, es, fr, it, pt, zh, ja, ko
```

`pinn-setup.sh`は、`pb_hooks/`、`pb_public/`、`caddy/Caddyfile`をそのままプロジェクトフォルダにコピーします。データフォルダ（`pb_data/`、`konfig/`、`backups/`、`caddy/data/`など）には決して手を付けません。

## 参加する

不具合の報告、アイデア、翻訳を心から歓迎します。[CONTRIBUTING.md](.github/CONTRIBUTING.md)をご覧ください。セキュリティの問題は、[SECURITY.md](.github/SECURITY.md)の説明に従って非公開で報告してください。プルリクエストの前に`node .github/scripts/check-all.js`を実行してください。同じチェックがGitHubでも自動的に実行されます。

## pinn.を応援する

pinn.は無料で、これからもずっと、すべての人に完全に無料です。私の空き時間に作っています。毎日が少し楽になったなら、ささやかな支援をいただけるとうれしいです。ただし完全に任意です：

<p>
  <a href="https://ko-fi.com/pinnapp"><img src="https://img.shields.io/badge/Ko--fi-Buy%20me%20a%20coffee-C28A33?style=for-the-badge&logo=kofi&logoColor=white" alt="Ko-fi"></a>
  <a href="https://buymeacoffee.com/pinn"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-2F4B41?style=for-the-badge&logo=buymeacoffee&logoColor=white" alt="Buy Me a Coffee"></a>
</p>

⭐もうれしいです。ほかの家族がpinn.を見つけやすくなります。

## 使用しているもの

[PocketBase](https://pocketbase.io) (MIT) · [Tailwind CSS](https://tailwindcss.com) (MIT) · [pdf.js](https://mozilla.github.io/pdf.js/) (Apache-2.0) · [Tesseract.js](https://tesseract.projectnaptha.com) (Apache-2.0) · [Traccar](https://www.traccar.org) (Apache-2.0) · [Caddy](https://caddyserver.com) (Apache-2.0)

## ライセンス

[MIT](LICENSE)：自由に使い、変更し、共有してください。
