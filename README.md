# Maco Game Package Template

Template để tạo một web game có thể:

- chạy standalone sau `pnpm build` (`dist/index.html` là một file HTML);
- được mount vào Maco Games/Nuxt qua `mountGame(container)`;
- publish thành public package trên GitHub Packages.

## Bắt đầu

1. Tạo repository **public** từ template này trong GitHub account của bạn.
2. Cập nhật `package.json`:
   - `name`: dùng scope GitHub của bạn, ví dụ `@lukhaiminh/space-runner`.
   - `description`, `repository.url` và `version`.
3. Thay màn hình mẫu tại `src/main.ts`; giữ API `mountGame(container)` và `destroy()`.
4. Workflow dùng `GITHUB_TOKEN` tạm thời để publish public GitHub Package; không cần tạo package trước trên GitHub.

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm build
```

## Publish

```bash
pnpm maco:publish
```

Lệnh này yêu cầu working tree sạch, kiểm tra dependencies/typecheck/build, tăng patch version, tạo release commit và tag `vX.Y.Z`, rồi push cả hai lên GitHub. Tag sẽ tự publish package public qua GitHub Actions.

Nếu metadata package chưa khớp với `origin`, chạy `pnpm maco:init`, kiểm tra và commit thay đổi, rồi publish lại.

Không cần mở Package settings, tạo package hay mời bot. Sau khi workflow thành công, gửi package name, version và package URL cho Maco administrator. Lưu ý GitHub Packages vẫn yêu cầu token `read:packages` để cài npm package, kể cả package public.

Với monorepo nhiều game đặt tại `games/<slug>`, dùng `pnpm maco:publish --wallhammer`. Lệnh tạo tag `wallhammer/vX.Y.Z` và chỉ publish game đó. Xem [hướng dẫn publish](docs/PUBLISHING.md) nếu cần thêm chi tiết.

## Quy tắc bảo mật

Không commit token, `.env`, `.npmrc` có token hoặc private key. Mã trong source repository và package public đều có thể bị đọc; không đặt secret, API key đặc quyền hay logic server trong game client.
