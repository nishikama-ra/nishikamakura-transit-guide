# Codex担当範囲（最終版）

## 1. nishikamakura-transit-guide
`site/` 直下のファイル・フォルダーを、リポジトリの対応する場所へ配置する。
ただし `site/map-repo/` は別リポジトリ用なので配置しない。

新規ページ:
- regional-maps.html
- public-facilities.html
- medical-welfare.html
- culture-history.html
- safety-map.html
- population-outlook.html
- station-passengers.html

既存ページは `site/docs/EXISTING_PAGE_PATCHES.md` の手順で、ヘッダーと配色のみを適用する。
既存の地図・学区・交通・時刻表ロジックは変更しない。

## 2. nishikama-transit-map
`site/map-repo/` 内のファイルを配置し、`README_APPLY.md` に記載した差分だけを `index.html` に加える。

## 3. データの状態
- 施設の現行確認日: 2026-07-19
- 追加候補の調査は完了
- 未確定の掲載判断: 0件
- 公共施設地図: 52地点 / 64施設
- 医療・福祉地図: 166地点 / 198施設
- 文化・歴史地図: 21地点 / 24項目
- 消防・警察地図: 14地点

## 4. 公開前の確認
1. `python -m http.server 3002` でローカル表示する。
2. PC幅1280px、スマートフォン幅390pxで確認する。
3. 全JSON・GeoJSONの読み込み、分類切替、一覧開閉、範囲切替を確認する。
4. 人口ページの2025～2070年・4指標を確認する。
5. 駅ページの15駅・19系列・2011～2024年を確認する。
6. 学校地図、学区ルート、交通地図の既存機能に影響がないことを確認する。
7. 差分をユーザーに提示し、承認後にcommit / push / Pages公開を行う。
