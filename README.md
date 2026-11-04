# Maco Game Template

Template để làm một web game và đưa lên [Maco](https://macogame.com) dưới dạng **bản build chạy trong iframe**:

- `pnpm build` tạo bản build nhiều file trong `dist/`, với đường dẫn asset tương đối;
- `pnpm maco:zip` kiểm tra bản build theo đúng quy tắc của Maco và đóng gói thành `maco-upload/<key>-<version>.zip`;
- bạn upload file zip tại <https://macogame.com/developer/game-submissions>.

Bridge `maco-game/v1` đã có sẵn, nên Maco nhận ra game đã sẵn sàng và truyền ngôn ngữ của người chơi vào game.

> Luồng cũ (publish npm package lên GitHub Packages, `maco:publish`) đã đóng. Maco không còn nhận package; hãy dùng zip như bên dưới.

## Bắt đầu

1. Nhấn **Use this template** để tạo repository của bạn, rồi clone về máy.
2. Trong `package.json`, đặt `"maco": { "key": "..." }` thành game key của bạn và đặt `version` (ví dụ `1.0.0`). Xem [quy tắc key và version](docs/UPLOADING.md#game-key).
3. Thay màn hình mẫu trong `src/main.ts` bằng game của bạn. Giữ chữ ký `mountGame(container, { lang })` và `destroy()`.

```bash
pnpm install
pnpm dev          # chạy thử độc lập tại http://localhost:5173
pnpm typecheck
pnpm test
```

## Cách game được mount

`src/entry.ts` giao `mountGame` cho bridge (`src/maco-iframe-bridge.ts`). Khi chạy độc lập, bridge mount game ngay. Khi chạy trong Maco, bridge mount game khi nhận `init`, và **mount lại** mỗi lần người chơi đổi ngôn ngữ (`locale`): nó gọi `destroy()` của lần trước, rồi `mountGame(document.body, { lang })`.

Vì vậy `mountGame` phải:

- tạo một phần tử con mới bên trong `container` mỗi lần được gọi (đừng gắn shadow root hay state trực tiếp lên `container`);
- áp dụng `options.lang` (ví dụ `vi`, `en`);
- trong `destroy()`, dừng mọi timer, vòng lặp, âm thanh và listener, rồi xóa phần tử con đó.

`src/main.test.ts` kiểm tra chuỗi `init` → `locale` → `locale`; hãy giữ test này chạy được khi thay game.

## Build và upload

```bash
pnpm build
pnpm maco:zip
```

`pnpm maco:zip` dừng với lỗi nếu bản build vi phạm một quy tắc mà máy chủ Maco cũng kiểm tra: thiếu `index.html` ở gốc, đuôi file không được phép, symlink, quá 1.000 file, quá 150 MB sau giải nén hoặc zip quá 50 MB, game key hay version không hợp lệ. Khi thành công, lệnh in ra game key và version để nhập vào form upload.

Mỗi version là bất biến: muốn sửa, tăng `version` trong `package.json`, build và zip lại. Quản trị viên Maco xét duyệt từng version trước khi phát hành.

Chi tiết về giới hạn, đuôi file được phép, version và ghi chú cho từng engine: [docs/UPLOADING.md](docs/UPLOADING.md). Hướng dẫn đầy đủ trên Maco: [Cách đưa game lên Maco](https://macogame.com/huong-dan/dua-game-len-maco).

## Engine khác (Unity, Godot, HTML thuần)

Bạn không bắt buộc phải dùng Vite. Với engine xuất ra bản build web tĩnh, chép [`bridge/maco-bridge.js`](bridge/maco-bridge.js) vào gốc thư mục build, cạnh `index.html`, và nạp nó trong `index.html`:

```html
<script src="maco-bridge.js"></script>
```

Script này trả lời bắt tay `host-ready` bằng `ready`, để trình chơi của Maco không báo "failed" khi game đang chạy. Nó không mount gì và bỏ qua `init`/`locale`. Sau đó đóng gói thư mục build thành zip với `index.html` ở gốc và upload như trên.

## Quy tắc bảo mật

Không commit hay đưa vào bản build token, `.env`, khóa API hoặc private key. Mọi file trong zip đều công khai sau khi game được phát hành.
