# 既存ページへの共通ヘッダー・配色適用

対象は `nishikamakura-transit-guide` の `index.html`、`school-districts.html`、`school-map-mockup.html`。

## 共通作業
1. `<head>` の既存CSSの後に次を追加する。
```html
<link rel="stylesheet" href="machinote-theme.css">
<link rel="stylesheet" href="existing-pages-theme.css">
```
2. 既存の `<header class="site-header">...</header>` または `<header class="school-site-header">...</header>` を次に置換する。
```html
<div data-machinote-header></div>
```
3. `<body>` にページ属性を加える。
- `index.html`: `data-mn-page="home" data-mn-base="."`
- `school-districts.html`: `data-mn-page="school" data-mn-base="."`
- `school-map-mockup.html`: `data-mn-page="maps" data-mn-base="."`
4. `</body>` 直前、既存のページ固有スクリプトより前に追加する。
```html
<script src="scripts/machinote-shell.js"></script>
```
5. `index.html` の「地域の移動情報」カード群または適切な位置から `regional-maps.html` へリンクを追加する。
6. `school-map-mockup.html` の上部ナビゲーションは共通ヘッダーに置き換え、ページ本文中の「公立小中学校の学区」リンクは維持する。

## 注意
- `school-districts.js`、`school-map-mockup.js`、時刻表JSON、Mapbox処理は変更しない。
- ヘッダー置換後に地図の高さやsticky位置が崩れていないか、PC・スマートフォンで確認する。
