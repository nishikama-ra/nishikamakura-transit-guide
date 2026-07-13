# 西鎌倉周辺くらしの交通案内（静的HTML版）

編集しやすい静的サイトです。Next.js、TSX、ビルド処理は使っていません。

## 主な編集場所

- トップの文章・カード: `content/site.json`
- 乗りもの・サービス・地図の地点: `content/services.json`
- 地域の取り組み: `content/initiatives.json`
- Instagram投稿: `content/instagram.json`
- 最終便: `content/timetables.json`
- 見た目: `styles.css`
- ページ構成: 各 `.html`

## ローカル確認

ファイルを直接ダブルクリックするとブラウザーの制限でJSONを読み込めません。フォルダー内で簡易Webサーバーを起動して確認します。

```powershell
python -m http.server 3002
```

ブラウザーで `http://localhost:3002/` を開きます。

## 公開前の確認事項

- 乗車・貸出場所の名称と緯度経度を公式情報と照合する
- 最終便はダイヤ改定後の公式時刻表から再収集する
- 外部サービスの掲載可否、サービス終了、URL変更を確認する
- 地域公共交通計画のリンクを該当ページへ差し替える
