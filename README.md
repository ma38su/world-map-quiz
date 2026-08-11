# 世界地図クイズ

[![Deploy to GitHub Pages](https://github.com/ma38su/world-map-quiz/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/ma38su/world-map-quiz/actions/workflows/deploy-pages.yml)

**公開サイト:** [https://ma38su.github.io/world-map-quiz/](https://ma38su.github.io/world-map-quiz/)

地図・国旗・国の特徴を組み合わせて、世界の国々を学べるブラウザ向けクイズアプリです。メルカトル図法の世界地図と3D地球儀を切り替えながら、学習レベルに合わせて問題に挑戦できます。

## 主な機能

- 地図、国旗、国の特徴を使った6種類の出題形式
- 複数の出題形式を組み合わせる「おまかせミックス」
- 小学校・中学校・大学入試・その他の4段階の難易度
- メルカトル図法と3D地球儀の切り替え
- 標高表示と北向きへのリセット
- 10問単位のスコア表示
- 間違えた国を復習できる復習モード
- 学習履歴のブラウザ保存
- 国名のふりがな表示

学習履歴はブラウザの `localStorage` に保存されます。外部サーバーへの送信は行いません。

## 技術スタック

- React 19
- TypeScript
- Vite
- Three.js
- React Compiler
- Oxlint
- GitHub Pages / GitHub Actions

## ローカルでの起動

Node.js 22以上を推奨します。

```bash
npm ci
npm run dev
```

起動後、ターミナルに表示されるURLをブラウザで開いてください。

## 利用できるコマンド

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバーを起動します |
| `npm run build` | 型チェック後、本番用ファイルを `dist` に生成します |
| `npm run lint` | Oxlintでコードを検査します |
| `npm run preview` | 本番ビルドをローカルで確認します |

## GitHub Pagesへのデプロイ

`main` ブランチへpushすると、[GitHub Actions](.github/workflows/deploy-pages.yml)がアプリをビルドし、GitHub Pagesへ自動的にデプロイします。

初回のみ、GitHubリポジトリで次の設定を行ってください。

1. **Settings** → **Pages** を開く
2. **Build and deployment** の **Source** を **GitHub Actions** に設定する
3. `main` ブランチへpushする

公開先: [https://ma38su.github.io/world-map-quiz/](https://ma38su.github.io/world-map-quiz/)

リポジトリ名を変更する場合は、[`vite.config.ts`](vite.config.ts) の `base` も新しいリポジトリ名に合わせて変更してください。

## ディレクトリ構成

```text
.
├── .github/workflows/   # GitHub Pagesのデプロイ設定
├── public/              # 静的ファイルと地形テクスチャ
├── src/                 # Reactコンポーネント、問題データ、クイズロジック
├── index.html
├── package.json
└── vite.config.ts
```
