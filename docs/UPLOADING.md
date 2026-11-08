# Đưa bản build lên Maco

Maco chạy game của bạn trong một iframe, từ chính các file bạn upload. Tài liệu này mô tả những gì bản upload phải đáp ứng. Hướng dẫn đầy đủ: [Cách đưa game lên Maco](https://macogame.com/huong-dan/dua-game-len-maco) ([English](https://macogame.com/guide/host-a-game-on-maco)).

## Quy trình

```bash
pnpm install
pnpm typecheck && pnpm test
pnpm build      # tạo dist/
pnpm maco:zip   # kiểm tra dist/ và tạo maco-upload/<key>-<version>.zip
```

`pnpm maco:validate` chỉ kiểm tra artifact, còn `pnpm maco:publish` chạy typecheck, test, build, đóng ZIP và mở form upload với game key, version và nội dung `README.md` đã điền sẵn. Nội dung README đi trong URL fragment để form frontend đọc, nên không được chứa token hoặc thông tin nhạy cảm. Lệnh không tự gửi file upload.

Mở <https://macogame.com/developer/game-submissions>, nhập đúng **game key** và **version** mà `pnpm maco:zip` in ra, chọn file zip rồi gửi. Quản trị viên Maco xét duyệt từng version trước khi game được phát hành. Trong giai đoạn thử nghiệm, chỉ những developer được mời mới upload được.

## Cấu trúc zip

- `index.html` nằm ở **gốc** zip, không nằm trong thư mục con.
- Mọi đường dẫn asset là **tương đối** (`./assets/...`). Template đã đặt `base: './'` trong `vite.config.ts`. Game được phục vụ tại `<key>/<version>/index.html`, nên đường dẫn bắt đầu bằng `/` sẽ hỏng.
- Không có symlink, không có file bị mã hóa, không có hai file chỉ khác nhau ở chữ hoa/thường.
- Không đăng ký Service Worker; Maco từ chối nó.

## Giới hạn

| Giới hạn | Giá trị |
|---|---|
| Kích thước zip | 50 MB (52.428.800 byte) |
| Tổng kích thước sau giải nén | 150 MB (157.286.400 byte) |
| Số file | 1.000 |
| Lượt upload | 10 lượt mỗi ngày, tối đa 5 lượt đang mở cùng lúc |

Các giới hạn này cố định. `pnpm maco:zip` kiểm tra chúng trước khi tạo zip.

## Đuôi file được phép

```text
html htm js mjs css json map wasm txt xml csv
png jpg jpeg gif webp avif svg ico bmp ktx2 basis
mp3 ogg oga wav m4a aac opus mp4 webm
ttf otf woff woff2 glb gltf bin data unityweb pck atlas fnt
```

File nén sẵn `.br` và `.gz` **không** được phép, vì máy chủ phục vụ game không gắn được `Content-Encoding`. File không có đuôi (ví dụ `LICENSE`) cũng bị từ chối. Riêng `.DS_Store` và thư mục `__MACOSX/` do macOS tạo ra thì không sao: `pnpm maco:zip` tự bỏ chúng ra, và máy chủ cũng bỏ qua nếu chúng có trong file zip.

## Game key

Game key đặt trong `package.json` tại `"maco": { "key": "..." }`. Key:

- chỉ gồm chữ thường, chữ số và dấu gạch ngang đơn, tối đa 40 ký tự;
- không bắt đầu bằng `r-` và không có dạng UUID;
- không phải `thumbs`, `www`, `review`, `api`, `games`, `assets` hoặc `static`.

Key là **vĩnh viễn** sau lần duyệt đầu tiên.

## Version

`version` trong `package.json` theo semver, ví dụ `1.0.0` hoặc `1.0.0-beta.1`, **không** có phần build metadata `+...`. Mỗi version là bất biến: muốn sửa thì upload một version mới. Một lượt upload bị lỗi, hết hạn hoặc bị hủy sẽ giải phóng version đó để bạn thử lại.

`maco publish` tự chọn version mới. Nếu `maco-upload/<key>-<version>.zip` của version hiện tại đã có, lệnh ghi version kế tiếp chưa có zip vào `package.json` trước khi build, theo cách `npm version patch` (`1.0.0` → `1.0.1`) hoặc `npm version prerelease` (`1.0.0-beta.1` → `1.0.0-beta.2`, `1.0.0-rc` → `1.0.0-rc.0`). Chỉ dòng `version` thay đổi, nên commit `package.json` cùng code. Lệnh không tạo git commit hay tag.

- Version chưa có zip được giữ nguyên, nên lần upload đầu và version minor/major bạn tự đặt dùng đúng số đó.
- `maco zip` và `maco validate` không đổi version. Muốn upload lại cùng version sau khi lượt trước bị lỗi hoặc hủy, chọn lại zip cũ trong `maco-upload/` hoặc chạy `maco zip`.
- `maco-upload/` không nằm trong git, nên ở bản clone mới form có thể báo version đã được gửi. Chạy lại `maco publish`: zip vừa tạo làm lệnh tăng version.

## Bridge

Maco gửi `host-ready` vào iframe, chờ game trả lời `ready`, rồi gửi `init` kèm ngôn ngữ; mỗi lần người chơi đổi ngôn ngữ, Maco gửi `locale`. Giao thức là `maco-game/v1`. Nếu không nhận được `ready` trong 10 giây, Maco hiển thị "failed" dù game vẫn chạy.

**Với template này**, bridge đã có sẵn (`src/maco-iframe-bridge.ts`). `src/entry.ts` giao `mountGame` cho bridge; bridge gọi `destroy()` rồi `mountGame(document.body, { lang })` mỗi lần nhận `init` hoặc `locale`. Vì vậy `mountGame` phải chạy lại được nhiều lần trên cùng `document.body`: luôn tạo phần tử con mới, và `destroy()` phải dọn sạch timer, vòng lặp, âm thanh, listener cùng phần tử con đó. `src/main.test.ts` kiểm tra điều này.

**Với engine khác** (Unity, Godot, HTML thuần), chép [`bridge/maco-bridge.js`](../bridge/maco-bridge.js) vào gốc zip và nạp nó trong `index.html`:

```html
<script src="maco-bridge.js"></script>
```

Script này chỉ trả lời bắt tay để Maco ngừng chờ; nó bỏ qua `init` và `locale`, nên game tự khởi động như bình thường. Nó chỉ trả lời trang của Maco. Khi trình duyệt báo trang nhúng là trang lạ, hoặc trang lạ gửi `host-ready`, nó thay cả trang bằng thông báo "Trò chơi này chỉ chơi được trên Maco Games", nên canvas của engine biến khỏi trang (vòng lặp và âm thanh của engine có thể vẫn chạy ngầm). Nó không chặn được bản copy mở riêng ở một tab, hoặc bị nhúng bởi trang không gửi gì. Hãy nạp nó làm script đầu tiên trong `<head>` để nó chạy trước engine.

## Ghi chú theo engine

- **Unity WebGL:** trong Publishing Settings, chọn Compression Format là **Disabled**, hoặc bật **Decompression Fallback**. Không upload file `.br`/`.gz`. Thêm `maco-bridge.js` vào template WebGL hoặc vào `index.html` sau khi build.
- **Godot 4:** khi export Web, **tắt Thread Support**, vì iframe của Maco không bật cross-origin isolation. Thêm `maco-bridge.js` cạnh `index.html` và nạp nó trong Head Include của export preset.
- Mọi engine: kiểm tra trên điện thoại, máy tính bảng và desktop; thao tác chạm, bàn phím, âm thanh và resize trong khung chơi.

## Bảo mật

Không đưa token, khóa API, `.env` hay mã chỉ dành cho server vào bản build. Mọi file trong zip đều công khai sau khi game được phát hành.

Maco bảo vệ game đã phát hành theo ba lớp:

- Request không đến từ iframe của Maco (ví dụ `curl` không kèm header của trình duyệt) bị từ chối.
- Mỗi `index.html` được chèn một đoạn script tự dừng game khi chạy ở tên miền khác.
- Bridge chỉ bắt tay với trang của Maco. Bridge của template không mount game nếu không có Maco; bridge cổ điển yếu hơn (xem mục Bridge). Bật `"obfuscate": true` để khoá trong bridge của template khó gỡ hơn.

Những lớp này không chặn được người chơi lưu file bằng DevTools, cũng như bản copy đã bị sửa để gỡ khoá. Upload game nghĩa là bạn cho phép Maco phục vụ game đó. Đem game lấy từ Maco đi host ở nơi khác là không được phép.
