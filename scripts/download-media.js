// download-media.js - Download scraped Shopee Images and Videos to Workspace
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { finished } = require('stream/promises');

// Cấu hình mặc định tìm file json trong workspace
const DEFAULT_JSON_PATH = path.join(__dirname, '..', '..', '..', 'shopee_scraped.json');

async function downloadFile(url, destPath) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const fileStream = fs.createWriteStream(destPath);
    await finished(Readable.fromWeb(res.body).pipe(fileStream));
    return true;
  } catch (err) {
    console.error(`\n   ❌ Lỗi tải file từ ${url}: ${err.message}`);
    return false;
  }
}

function sanitizeDirName(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '') // Xóa ký tự cấm đặt tên folder trên Windows
    .replace(/\s+/g, '_')         // Thay khoảng trắng bằng gạch dưới
    .substring(0, 50)             // Cắt ngắn tránh vượt độ dài path
    .trim();
}

async function start() {
  // Lấy đường dẫn từ đối số dòng lệnh hoặc mặc định
  const jsonPath = process.argv[2] || DEFAULT_JSON_PATH;
  
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ Không tìm thấy file JSON kết quả cào tại: ${jsonPath}`);
    console.log(`💡 Hướng dẫn chạy:`);
    console.log(`   node download-media.js "C:/đường_dẫn/đến/file_kết_quả.json"`);
    process.exit(1);
  }

  console.log(`📖 Đang đọc dữ liệu từ: ${jsonPath}...`);
  const dataRaw = fs.readFileSync(jsonPath, 'utf8');
  let products = [];
  try {
    products = JSON.parse(dataRaw);
  } catch (e) {
    console.error(`❌ Lỗi cấu trúc file JSON: ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(products) || !products.length) {
    console.log('⚠️ Danh sách sản phẩm trống hoặc không hợp lệ.');
    process.exit(0);
  }

  // Thư mục downloads gốc nằm trong thư mục lab của workspace
  const baseDownloadDir = path.join(__dirname, '..', '..', '..', 'downloads');
  if (!fs.existsSync(baseDownloadDir)) {
    fs.mkdirSync(baseDownloadDir, { recursive: true });
  }

  console.log(`📂 Các tài nguyên sẽ được tải về thư mục: ${baseDownloadDir}`);
  console.log(`🚀 Bắt đầu tải tài nguyên cho ${products.length} sản phẩm...\n`);

  for (let idx = 0; idx < products.length; idx++) {
    const p = products[idx];
    if (p.failed) {
      console.log(`[Sản phẩm ${idx + 1}] Bỏ qua vì cào lỗi.`);
      continue;
    }

    const pName = p.Name || 'San_pham_khong_ten';
    // Lấy Product ID từ URL
    const urlMatch = (p.url || '').match(/i\.(\d+)\.(\d+)/);
    const productId = urlMatch ? urlMatch[2] : `sp_${idx + 1}`;
    
    const folderName = `${sanitizeDirName(pName)}_${productId}`;
    const productDir = path.join(baseDownloadDir, folderName);

    if (!fs.existsSync(productDir)) {
      fs.mkdirSync(productDir, { recursive: true });
    }

    console.log(`--------------------------------------------------`);
    console.log(`📦 [${idx + 1}/${products.length}] ${pName}`);
    console.log(`📂 Thư mục: ${folderName}`);

    // 1. Tải mảng hình ảnh
    const images = p.Images || [];
    if (images.length) {
      console.log(`🖼️  Đang tải ${images.length} hình ảnh...`);
      for (let i = 0; i < images.length; i++) {
        const imgUrl = images[i];
        const lastPart = (imgUrl.split('/').pop() || '').split('?')[0];
        const ext = lastPart.includes('.') ? '' : '.jpg';
        const imgName = lastPart ? `${lastPart}${ext}` : `image_${i + 1}.jpg`;
        const dest = path.join(productDir, imgName);
        
        process.stdout.write(`   ↳ Tải ảnh ${i + 1}/${images.length}... `);
        const success = await downloadFile(imgUrl, dest);
        if (success) {
          process.stdout.write(`✅ Xong\n`);
        }
      }
    } else {
      console.log(`🖼️  Không tìm thấy danh sách ảnh.`);
    }

    // 2. Tải video
    const videoUrl = p.Video;
    if (videoUrl) {
      console.log(`📹 Đang tải video sản phẩm...`);
      const dest = path.join(productDir, 'video.mp4');
      const success = await downloadFile(videoUrl, dest);
      if (success) {
        console.log(`   ↳ ✅ Đã tải video thành công!`);
      }
    }
  }

  console.log(`\n🎉 Hoàn thành tải toàn bộ tài nguyên về local!`);
}

start();
