# Maco Game Package Template

Template để tạo một web game có thể:

- chạy standalone sau `pnpm build` (`dist/index.html` là một file HTML);
- được mount vào Maco Games/Nuxt qua `mountGame(container)`;
- publish thành private package trên GitHub Packages.

## Bắt đầu

1. Tạo repository **private** từ template này trong GitHub account của bạn.
2. Cập nhật `package.json`:
   - `name`: dùng scope GitHub của bạn, ví dụ `@lukhaiminh/space-runner`.
   - `description`, `repository.url` và `version`.
3. Thay màn hình mẫu tại `src/main.ts`; giữ API `mountGame(container)` và `destroy()`.
4. Workflow dùng `GITHUB_TOKEN` tạm thời để publish private GitHub Package.

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

Lệnh này kiểm tra dependencies/typecheck/build, gom mọi thay đổi chưa commit của game, tăng patch version, tạo release commit và tag `vX.Y.Z`, rồi push cả hai lên GitHub. Tag sẽ publish package private qua GitHub Actions.

Nếu metadata package chưa khớp với `origin`, lệnh sẽ hỏi có chạy `pnpm maco:init` để tự đồng bộ hay không.

Sau lần publish đầu, mở package trên GitHub → **Package settings** → **Manage access** → **Invite teams or people**, rồi thêm tài khoản bot do Maco administrator cung cấp với role **Read**. Sau đó gửi package name và version cho Maco administrator để host cài package.

Xem [hướng dẫn publish](docs/PUBLISHING.md) nếu cần thêm chi tiết.

## Quy tắc bảo mật

Không commit token, `.env`, `.npmrc` có token hoặc private key. Không thêm token GitHub/Vercel của bạn vào repository hay gửi chúng cho Maco administrator.
