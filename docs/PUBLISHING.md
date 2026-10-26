# Phát hành game package

## Trước lần publish đầu

1. Để repository ở chế độ **private**.
2. Trong `package.json`, thay các placeholder:
   - `name` phải dùng GitHub scope của repository owner, ví dụ `@lukhaiminh/space-runner`.
   - `description`, `repository.url` và `version`.
3. Chạy kiểm tra cục bộ:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

## Release

```bash
pnpm version patch
git push origin HEAD --follow-tags
```

Tag `vX.Y.Z` kích hoạt GitHub Actions. Workflow dùng `GITHUB_TOKEN` của repository để publish package private lên GitHub Packages.

## Cấp quyền cho Maco Games

Sau lần publish đầu:

1. Trên GitHub, vào **Profile → Packages** và mở package vừa publish.
2. Chọn **Package settings** → **Manage access** → **Invite teams or people**.
3. Thêm đúng tài khoản bot do Maco administrator cung cấp, rồi chọn role **Read**.

`Read` là quyền tối thiểu để Vercel của Maco Games tải package khi build. Không cấp `Write`/`Admin`, không gửi token, và không cần thêm bot vào source repository.

## Gửi cho Maco administrator

Gửi tên package, version và URL repository. Administrator sẽ cấu hình host Maco Games cài package bằng token của bot.

Không gửi token GitHub/Vercel và không thêm token vào source code hoặc `.npmrc`.
