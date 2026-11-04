# @macobot/maco-cli

CLI cho Maco iframe upload kit. Nó xác minh và đóng gói ZIP; không tự upload game hay publish npm package game.

## Cài đặt

Trong thư mục gốc của project game (nơi có `package.json`), cài CLI dưới dạng dependency phát triển.

### pnpm

```bash
pnpm add -D @macobot/maco-cli
pnpm exec maco setup
```

### npm

```bash
npm install --save-dev @macobot/maco-cli
npx maco setup
```

## `maco setup` dùng để làm gì?

Lệnh này thêm các script tắt vào `package.json` của project hiện tại:

```json
{
  "scripts": {
    "maco:validate": "maco validate",
    "maco:zip": "maco zip",
    "maco:publish": "maco publish"
  }
}
```

Sau đó có thể dùng cùng một workflow với pnpm hoặc npm:

```bash
# pnpm
pnpm maco:validate
pnpm maco:zip
pnpm maco:publish

# npm
npm run maco:validate
npm run maco:zip
npm run maco:publish
```

`maco setup` không ghi đè một script `maco:*` đã có giá trị khác; khi đó hãy tự xem lại `package.json` và chọn workflow phù hợp.

## Yêu cầu và hành vi các lệnh

Project cần có `scripts/zip-maco.mjs` từ Maco upload template.

- `maco validate`: kiểm tra manifest, asset và cấu hình upload.
- `maco zip`: kiểm tra rồi tạo file ZIP trong `maco-upload/`.
- `maco publish`: chạy `typecheck`, `test`, `build`, rồi tạo ZIP.

`maco publish` không tự upload game và cũng không publish package npm; ZIP tạo ra là artifact để upload lên Maco.
