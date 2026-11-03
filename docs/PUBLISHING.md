# Phát hành game package

## Trước lần publish đầu

1. Để repository ở chế độ **public**. Source TypeScript trong package cũng public, nên không được chứa token, private key, API key đặc quyền hoặc logic server.
2. Trong `package.json`, thay các placeholder:
   - `name` phải dùng GitHub scope của repository owner, ví dụ `@lukhaiminh/space-runner`.
   - `description`, `repository.url` và `version`.
3. Chạy kiểm tra cục bộ:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

## Release một game

```bash
pnpm maco:publish
```

Lệnh duy nhất này yêu cầu working tree sạch, chạy dependency check, typecheck và build; sau đó tăng patch version, tạo release commit, tạo tag `vX.Y.Z` và push lên GitHub. Tag kích hoạt GitHub Actions; workflow dùng `GITHUB_TOKEN` của repository để tự tạo/cập nhật package public trên GitHub Packages.

Nếu metadata package chưa khớp với remote `origin`, chạy `pnpm maco:init`, kiểm tra và commit thay đổi rồi publish lại.

## Release trong monorepo

Đặt từng game ở `games/<slug>` và khai báo workspace `games/*` trong `pnpm-workspace.yaml`. Khởi tạo metadata của game bằng:

```bash
pnpm maco:init --wallhammer
```

Sau khi commit, chỉ publish game đó bằng:

```bash
pnpm maco:publish --wallhammer
```

Lệnh tạo tag `wallhammer/vX.Y.Z`; workflow chỉ build và publish `games/wallhammer`.

## Gửi cho Maco administrator

Sau khi workflow thành công, gửi package name, version và package URL. Package public không cần mời bot hay mở Package settings, nhưng npm registry của GitHub vẫn yêu cầu host xác thực bằng token có `read:packages` khi cài package.

Không gửi token GitHub/Vercel và không thêm token vào source code hoặc `.npmrc`. `maco:publish` chỉ stage `package.json` và `pnpm-lock.yaml`, không stage toàn bộ working tree; vẫn phải giữ secret trong local environment/secrets manager.

Trên GitHub, bảo vệ default branch và các release tag để chỉ maintainer được tạo tag publish. Workflow đã pin SHA của GitHub Actions và chỉ cấp `contents: read`, `packages: write`.
