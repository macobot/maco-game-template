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
pnpm maco:publish
```

Lệnh duy nhất này chạy dependency check, typecheck và build; sau đó tự gom mọi thay đổi chưa commit, tăng patch version, tạo release commit, tạo tag `vX.Y.Z` và push lên GitHub. Tag kích hoạt GitHub Actions; workflow dùng `GITHUB_TOKEN` của repository để publish package private lên GitHub Packages.

Nếu metadata package chưa khớp với remote `origin`, lệnh sẽ hỏi có chạy `pnpm maco:init` để tự đồng bộ hay không.

## Cấp quyền cho Maco Games

Sau lần publish đầu:

1. Trên GitHub, vào **Profile → Packages** và mở package vừa publish.
2. Chọn **Package settings** → **Manage access** → **Invite teams or people**.
3. Thêm đúng tài khoản bot do Maco administrator cung cấp, rồi chọn role **Read**.

`Read` là quyền tối thiểu để Vercel của Maco Games tải package khi build. Không cấp `Write`/`Admin`, không gửi token, và không cần thêm bot vào source repository.

## Gửi cho Maco administrator

Gửi tên package, version và URL repository. Administrator sẽ cấu hình host Maco Games cài package bằng token của bot.

Không gửi token GitHub/Vercel và không thêm token vào source code hoặc `.npmrc`.
