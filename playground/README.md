# Maco CLI playground

Project game tối thiểu để thử bản `@macobot/maco-cli` đang ở thư mục cha, trước khi publish lên npm.

```bash
cd playground
pnpm install
pnpm maco:publish
```

Dependency CLI được liên kết cục bộ bằng `link:..`; vì vậy chỉ cần sửa mã CLI ở thư mục cha rồi chạy lại `pnpm maco:publish`. Lệnh sẽ chạy `typecheck`, `test`, `build` và tạo `maco-upload/maco-cli-playground-0.0.1.zip`.

Để kiểm tra việc `maco setup` thêm scripts, hãy xóa ba script `maco:*` trong `package.json` rồi chạy:

```bash
pnpm exec maco setup
```
