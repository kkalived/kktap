// 生成基础图标文件（淡黄色方形 PNG）
// 运行方式: node scripts/generate-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(width, height, r, g, b) {
  // PNG 签名
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk: raw pixel data with filter byte per row
  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 3)] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const offset = y * (1 + width * 3) + 1 + x * 3;
      rawData[offset] = r;
      rawData[offset + 1] = g;
      rawData[offset + 2] = b;
    }
  }
  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);

  const crc = crc32(typeAndData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([len, typeAndData, crcBuf]);
}

// CRC32 查表实现
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ===== 生成图标 =====
const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// 托盘图标 16x16
fs.writeFileSync(path.join(assetsDir, 'icon-tray.png'), createPNG(16, 16, 0xFF, 0xF9, 0xC4));

// 应用图标 256x256（大号浅黄方块，带圆角效果靠颜色区分边缘）
fs.writeFileSync(path.join(assetsDir, 'icon.png'), createPNG(256, 256, 0xFF, 0xF9, 0xC4));

// Windows .ico 格式比较特殊，最简单的方式是直接把 PNG 存为 ICO
// ICO 格式：ICONDIR + ICONDIRENTRY + PNG data
function createICO(pngBuffer, size) {
  // ICONDIR
  const icondir = Buffer.alloc(6);
  icondir.writeUInt16LE(0, 0);    // reserved
  icondir.writeUInt16LE(1, 2);    // type: 1 = ICO
  icondir.writeUInt16LE(1, 4);    // count: 1 image

  // ICONDIRENTRY
  const entry = Buffer.alloc(16);
  entry[0] = Math.min(size, 255); // width
  entry[1] = Math.min(size, 255); // height
  entry[2] = 0;                    // palette
  entry[3] = 0;                    // reserved
  entry.writeUInt16LE(1, 4);       // planes
  entry.writeUInt16LE(32, 6);      // bpp
  entry.writeUInt32LE(pngBuffer.length, 8); // image size
  entry.writeUInt32LE(22, 12);     // offset (6 + 16)

  return Buffer.concat([icondir, entry, pngBuffer]);
}

const png256 = createPNG(256, 256, 0xFF, 0xF9, 0xC4);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), createICO(png256, 256));

console.log('Icons generated: icon.png, icon.ico, icon-tray.png');
