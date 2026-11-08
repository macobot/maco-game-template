# @macobot/maco-cli

CLI để kiểm tra và đóng gói Maco iframe game upload kit. Nó không tự upload game hay publish game package.

## Cài đặt và dùng trong project game

Trong thư mục gốc project game (nơi có `package.json`), cài CLI rồi đăng ký các scripts một lần:

```bash
pnpm i -D @macobot/maco-cli
pnpm exec maco setup
pnpm maco:publish
```

`maco setup` ghi đè các script Maco trong `package.json` để luôn dùng CLI hiện tại. Nếu project chưa có `maco.key` (hoặc vẫn là `my-game` của template), CLI tạo key từ `name`: bỏ scope `@ten/`, bỏ dấu, chuyển về chữ thường và nối bằng dấu gạch ngang, ví dụ `@ten/Space Runner` thành `space-runner`. Key đã đặt sẵn thì được giữ nguyên, vì key là vĩnh viễn sau lần upload đầu tiên. Nếu `name` không tạo được key hợp lệ, CLI dừng và nhắc bạn tự đặt `maco.key`. Các thiết lập Maco khác, ví dụ `obfuscate`, vẫn được giữ nguyên:

```json
{
  "name": "project-name",
  "maco": {
    "key": "project-name"
  },
  "scripts": {
    "maco:validate": "maco validate",
    "maco:zip": "maco zip",
    "maco:publish": "maco publish"
  }
}
```

Sau đó dùng `pnpm maco:validate`, `pnpm maco:zip` hoặc `pnpm maco:publish`. `maco publish` chạy `typecheck` và `test` nếu project có các script này (bỏ qua nếu không có), rồi `build` (bắt buộc), tạo ZIP, rồi đọc `maco.key`, `version` và `README.md` trong project game để mở form `/developer/game-submissions` với metadata đã điền sẵn. Nội dung README (lưu dạng UTF-8, form nhận tối đa 20.000 ký tự đầu) được truyền qua URL fragment `#readme=…`, để form frontend có thể đọc mà nội dung không đi theo HTTP request; vẫn chỉ ghi thông tin công khai, không chứa token hay thông tin nhạy cảm. Bộ kiểm tra, đóng gói và handoff được cài kèm trong `@macobot/maco-cli`; project game không cần có các script này.

Với npm, dùng `npm i -D @macobot/maco-cli`, `npx maco setup`, và `npm run maco:publish`.

## Maco Game Template

Template để làm một web game và đưa lên [Maco](https://macogame.com) dưới dạng **bản build chạy trong iframe**:

- `pnpm build` tạo bản build nhiều file trong `dist/`, với đường dẫn asset tương đối;
- `pnpm maco:zip` kiểm tra bản build theo đúng quy tắc của Maco và đóng gói thành `maco-upload/<key>-<version>.zip`;
- bạn upload file zip tại <https://macogame.com/developer/game-submissions>.

Bridge `maco-game/v1` đã có sẵn, nên Maco nhận ra game đã sẵn sàng và truyền ngôn ngữ của người chơi vào game.

Với game có source riêng, bridge tự thêm khi zip là phương án tương thích chung nhất: game vẫn tự khởi động như trước, còn Maco nhận `ready`. Nếu game cần chỉ khởi động sau `init`, nhận `locale`, hoặc muốn khóa bản copy ngay từ source, hãy tích hợp `src/maco-iframe-bridge.ts` và gọi `mountMacoIframeGame(mountGame)` theo template. CLI không tự rewrite `iframe.ts`, vì không thể đoán an toàn entry point, vòng đời và chữ ký hàm mount của từng engine.

> Maco không nhận game qua npm package. `maco:publish` kiểm tra, build, tạo ZIP và mở form upload; bạn vẫn tự chọn file ZIP rồi gửi form.

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

`MACOGAME_DOMAIN=https://macogame.com` trong `.env` là domain của host Maco được bridge tin cậy khi build. Khi
chạy `pnpm dev`, bridge cũng nhận iframe từ `localhost`, `127.0.0.1` (mọi port) để bạn thử bằng link local; ngoại lệ
này không có trong bản build phát hành. Thiết lập này áp dụng bridge Vite trong `src/`; bridge tĩnh
`bridge/maco-bridge.js` cho Unity/Godot vẫn dùng danh sách host Maco mặc định.

## Cách game được mount

`src/entry.ts` giao `mountGame` cho bridge (`src/maco-iframe-bridge.ts`). Khi chạy bằng `pnpm dev`, bridge mount game ngay. Bản build mở riêng ở một tab sẽ hiện "Trò chơi này chỉ chơi được trên Maco Games" thay vì game. Khi chạy trong Maco, bridge mount game khi nhận `init`, và **mount lại** mỗi lần người chơi đổi ngôn ngữ (`locale`): nó gọi `destroy()` của lần trước, rồi `mountGame(document.body, { lang })`.

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

`pnpm maco:publish` chạy trọn luồng kiểm tra → build → zip, sau đó mở `/developer/game-submissions` với **game key**, **version** và nội dung **README.md** của project. Chọn file trong `maco-upload/` vừa được tạo rồi gửi form.

Mỗi version là bất biến, nhưng bạn không cần tự tăng `version` cho mỗi lần upload. Nếu `maco-upload/<key>-<version>.zip` của version hiện tại đã có, `pnpm maco:publish` ghi version kế tiếp vào `package.json` trước khi build (`1.0.0` → `1.0.1`, `1.0.0-beta.1` → `1.0.0-beta.2`), rồi in ra để bạn commit. Muốn lên minor/major, đặt `version` mới bằng tay; version chưa có zip được giữ nguyên. `pnpm maco:zip` không bao giờ đổi version. Quản trị viên Maco xét duyệt từng version trước khi phát hành.

Chi tiết về giới hạn, đuôi file được phép, version và ghi chú cho từng engine: [docs/UPLOADING.md](docs/UPLOADING.md). Hướng dẫn đầy đủ trên Maco: [Cách đưa game lên Maco](https://macogame.com/huong-dan/dua-game-len-maco).

## Phát hành CLI (maintainers)

Package npm được phát hành từ root repository. Mỗi version npm là bất biến. Sau khi đăng nhập npm, chạy một lệnh sau để tăng patch version, kiểm tra, publish và push commit/tag:

```bash
pnpm run publish:cli
```

`pnpm run publish:cli` chạy lần lượt `pnpm version patch`, kiểm tra kiểu/test, `npm publish --access public`, rồi `git push --follow-tags`. Version mới được tạo Git tag (ví dụ `0.2.5` → `0.2.6`); tag chỉ được push sau khi npm publish thành công. Dùng `pnpm version minor` hoặc `pnpm version major` trực tiếp khi thay đổi có phạm vi lớn hơn.

## Engine khác (Unity, Godot, HTML thuần)

Bạn không bắt buộc phải dùng Vite. Với engine xuất ra bản build web tĩnh, chép [`bridge/maco-bridge.js`](bridge/maco-bridge.js) vào gốc thư mục build, cạnh `index.html`, và nạp nó trong `index.html`:

```html
<script src="maco-bridge.js"></script>
```

Script này trả lời bắt tay `host-ready` bằng `ready`, để trình chơi của Maco không báo "failed" khi game đang chạy. Nó không mount hay khởi động engine; engine vẫn tự khởi động như bình thường. Sau đó đóng gói thư mục build thành zip với `index.html` ở gốc và upload như trên.

### Bridge API cho game tĩnh

Ngoài handshake, bản bridge tĩnh đặt `window.MacoBridge`, để game ở R2/engine khác dùng cùng một contract mà không phải import code của Maco:

```js
MacoBridge.on('locale', (locale) => setLanguage(locale))
MacoBridge.on('input', (input) => applyHostInput(input))

const ticket = await MacoBridge.requestRoomTicket(roomCode) // `null` để tạo room
const voiceTicket = await MacoBridge.requestVoiceTicket(roomCode)
```

`requestRoomTicket` và `requestVoiceTicket` chỉ gửi `postMessage` tới parent Maco đã hoàn tất handshake. Bridge không chứa API URL, cookie, token ký hay secret. Parent cần trả lời theo contract sau (cũng kiểm `origin` và đúng `iframe.contentWindow`):

```ts
// iframe -> parent
{ protocol: 'maco-game/v1', type: 'online-ticket-request',
  payload: { id: string, room: string | null, channel: 'game' | 'voice' } }

// parent -> iframe
{ protocol: 'maco-game/v1', type: 'online-ticket',
  payload: { id: string, ticket: GameRoomTicket } }
// Hoặc: payload: { id: string, error: 'invalid' | 'unavailable' | 'denied' }
```

Parent phải lấy game id từ cấu hình artifact đã duyệt, **không** từ message iframe, rồi mới gọi endpoint cấp ticket. Ticket là bearer credential ngắn hạn, nên chỉ gửi về iframe URL/origin của artifact đã duyệt. Nếu host chưa hỗ trợ contract này, promise sẽ từ chối sau 12 giây; game nên hiển thị "online unavailable".

Bridge chuẩn hóa quyền truy cập vào room/RTC và locale/input, chứ không biến tự động một game single-player thành multiplayer. Mỗi game vẫn phải có adapter nhỏ cho input, snapshot/rollback hoặc server-authoritative simulation, lobby và UI kết quả. Đừng đưa simulation/luật của Paint Tanks vào bridge: phần tái sử dụng đúng chỗ là `realtime` room protocol/client ở host và API bridge này.

## Quy tắc bảo mật

Không commit hay đưa vào bản build token, `.env`, khóa API hoặc private key. Mọi file trong zip đều công khai sau khi game được phát hành.

## Chống re-host

Bridge của template (`src/maco-iframe-bridge.ts`) chỉ bắt tay với `MACOGAME_DOMAIN` (mặc định `https://macogame.com`), `https://macomanga.com` (admin xem thử), `http://localhost:7070` và `http://localhost:6868`. Riêng `pnpm dev` nhận thêm `localhost` và `127.0.0.1` ở mọi port để thử local. Khi phát hành, ngoại lệ này không còn. Game chỉ mount khi Maco gửi `init`, nên bản copy bị nhúng vào trang khác hoặc mở riêng ở một tab chỉ hiện thông báo "Trò chơi này chỉ chơi được trên Maco Games". Bridge cổ điển (`bridge/maco-bridge.js`) yếu hơn, vì engine tự khởi động: nó chỉ thay trang bằng thông báo khi trình duyệt báo trang nhúng là trang lạ, hoặc khi trang lạ gửi `host-ready`. Bản copy mở riêng, hoặc nhúng bởi trang không gửi gì, vẫn chạy. Maco bù phần này bằng một đoạn script chèn vào mọi `index.html` đã phát hành; đoạn này dừng bản copy chưa bị sửa ở mọi tên miền khác. Bản build bằng bridge cũ không có khoá này, nên hãy build lại với bridge mới.

Để việc gỡ khoá khỏi bản copy tốn công hơn, đặt `"obfuscate": true` trong `maco` của `package.json`. Code của game bị làm rối khi `pnpm build`, còn `node_modules` giữ nguyên. Bản build lớn hơn một chút, nên hãy chơi thử một lượt để chắc game vẫn mượt. Bản build mở riêng ở một tab chỉ hiện thông báo khoá, nên hãy chơi nó trong khung xem thử của admin sau khi upload. Khoá này chỉ chặn bản copy chưa bị sửa; người đủ kiên nhẫn vẫn gỡ được.
