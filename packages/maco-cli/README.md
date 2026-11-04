# @macobot/maco-cli

CLI cho Maco iframe upload kit. Nó xác minh và đóng gói ZIP; không tự upload game hay publish npm package game.

```bash
pnpm add -D @macobot/maco-cli
pnpm exec maco setup
pnpm maco:publish
```

Project cần có `scripts/zip-maco.mjs` từ Maco upload template. Dùng `maco validate`, `maco zip` hoặc `maco publish`.
