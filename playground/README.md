# Maco CLI playground

Project game tối thiểu để thử bản `@macobot/maco-cli` đang ở thư mục cha, trước khi publish lên npm.

```bash
pnpm playground:maco:publish
```

Lệnh chạy từ root repository, nạp `.env` ở root (ví dụ `MACOGAME_DOMAIN=http://localhost:3000`), rồi chạy
`maco publish` trong playground. Vì vậy form upload sẽ mở ở đúng môi trường local của bạn. Dependency CLI được liên
kết cục bộ bằng `link:..`; chỉ cần sửa mã CLI ở thư mục cha rồi chạy lại lệnh. Nó sẽ chạy `typecheck`, `test`, `build`, tạo
`playground/maco-upload/maco-cli-playground-0.0.1.zip`, rồi mở `/developer/game-submissions` với game key, version
và nội dung README đã lấy từ project này. Chọn ZIP vừa tạo trước khi gửi form.

Hai lệnh `pnpm playground:maco:validate` và `pnpm playground:maco:zip` cũng dùng cùng `.env`. Biến được export ở shell
vẫn được ưu tiên hơn giá trị trong file `.env`.

Để kiểm tra việc `maco setup` thêm scripts, hãy xóa ba script `maco:*` trong `package.json` rồi chạy:

```bash
pnpm exec maco setup
```
