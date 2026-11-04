# Maco Game Package Template

Template để tạo một web game có thể:

- chạy standalone sau `pnpm build` (`dist/index.html` là một file HTML);
- được mount vào Maco Games/Nuxt qua `mountGame(container)`;
- publish thành public package trên npm.

## Bắt đầu

1. Tạo repository **public** từ template này trong GitHub account của bạn.
2. Cập nhật `package.json`:
   - `name`: dùng npm scope mà bạn sở hữu, thường trùng GitHub owner, ví dụ `@lukhaiminh/space-runner`.
   - `description`, `repository.url` và `version`.
3. Thay màn hình mẫu tại `src/main.ts`; giữ API `mountGame(container)` và `destroy()`.
4. Đăng nhập npm (`npm login`) với account có quyền publish npm scope của package trước khi release.

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm build
```

## Dùng như package CLI

Project cài package từ npm chạy setup một lần để thêm alias vào `package.json` (pnpm không tự kế thừa `scripts` từ dependency):

```bash
pnpm add -D @macobot/maco-game-template
pnpm exec maco setup
node bin/maco.mjs publish
```

Setup chỉ thêm `maco:init` → `maco init` và `maco:publish` → `maco publish`; không tự chạy khi cài package, không ghi đè alias đang có. Với monorepo, `pnpm maco:publish --wallhammer` sẽ target `games/wallhammer`.

## Publish

```bash
pnpm maco:publish
```

Lệnh này yêu cầu working tree sạch, kiểm tra dependencies/typecheck/build, tăng patch version, publish public package lên npm, tạo release commit/tag `vX.Y.Z`, rồi push cả hai lên GitHub. Project cài package dùng `pnpm maco:publish` sau khi chạy `pnpm exec maco setup`.

Nếu metadata package chưa khớp với `origin`, chạy `node bin/maco.mjs init`, kiểm tra và commit thay đổi, rồi publish lại. Project consumer dùng `pnpm maco:init`.

Không cần GitHub Package settings hay token `read:packages`. Sau khi release, gửi package name, version và npm URL cho Maco administrator.

Với monorepo nhiều game đặt tại `games/<slug>`, dùng `node bin/maco.mjs publish --wallhammer`; project consumer dùng `pnpm maco:publish --wallhammer`. Lệnh tạo tag `wallhammer/vX.Y.Z` và chỉ publish game đó. Xem [hướng dẫn publish](docs/PUBLISHING.md) nếu cần thêm chi tiết.

## Quy tắc bảo mật

Không commit npm token, `.env`, `.npmrc` có token hoặc private key. Mã trong source repository và package public đều có thể bị đọc; không đặt secret, API key đặc quyền hay logic server trong game client.
