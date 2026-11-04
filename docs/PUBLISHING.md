# Phát hành game package

## Trước lần publish đầu

1. Để repository ở chế độ **public**. Source TypeScript trong package cũng public, nên không được chứa token, private key, API key đặc quyền hoặc logic server.
2. Trong `package.json`, thay các placeholder:
   - `name` phải dùng npm scope mà bạn sở hữu, thường trùng GitHub owner, ví dụ `@lukhaiminh/space-runner`.
   - `description`, `repository.url` và `version`.
3. Chạy kiểm tra cục bộ:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

## Release một game

```bash
node bin/maco.mjs publish
```

Khi dùng release tool từ package đã cài thay vì copy template, chạy setup một lần từ root project:

```bash
pnpm add -D @macobot/maco-game-template
pnpm exec maco setup
```

Setup thêm hai alias `maco:init` và `maco:publish` vào `package.json`. Sau đó project consumer dùng `pnpm maco:publish` bình thường; trong repository template dùng `node bin/maco.mjs publish`.

Lệnh duy nhất này yêu cầu working tree sạch, chạy dependency check, typecheck và build; sau đó tăng patch version, publish package public lên npm, tạo release commit/tag `vX.Y.Z` và push lên GitHub. Chạy `npm login` trước với account có quyền publish npm scope tương ứng.

Nếu metadata package chưa khớp với remote `origin`, chạy `node bin/maco.mjs init`, kiểm tra và commit thay đổi rồi publish lại. Project consumer dùng `pnpm maco:init`.

## Release trong monorepo

Đặt từng game ở `games/<slug>` và khai báo workspace `games/*` trong `pnpm-workspace.yaml`. Khởi tạo metadata của game bằng:

```bash
node bin/maco.mjs init --wallhammer
```

Sau khi commit, chỉ publish game đó bằng:

```bash
node bin/maco.mjs publish --wallhammer
```

Lệnh publish npm package rồi tạo tag `wallhammer/vX.Y.Z`; GitHub Actions chỉ xác minh lại tag và build `games/wallhammer`.

## Gửi cho Maco administrator

Sau khi release thành công, gửi package name, version và npm URL. Package public không cần mời bot, mở Package settings hoặc token GitHub Packages.

Không gửi token GitHub/Vercel và không thêm token vào source code hoặc `.npmrc`. `maco:publish` chỉ stage `package.json` và `pnpm-lock.yaml`, không stage toàn bộ working tree; vẫn phải giữ secret trong local environment/secrets manager.

Trên GitHub, bảo vệ default branch và các release tag để chỉ maintainer được tạo tag publish. Workflow đã pin SHA của GitHub Actions và chỉ cấp `contents: read`.
