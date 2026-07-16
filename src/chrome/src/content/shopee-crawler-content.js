// content.js - Shopee Stealth Extension Content Script

(() => {
  let lastInjectedUrl = '';

  function isProductPage(url) {
    return /\-i\.\d+\.\d+/.test(url) || url.includes('/product/');
  }

  function injectDownloadButton() {
    const currentUrl = location.href;
    
    // Skip if not a Shopee product page
    if (!isProductPage(currentUrl)) {
      const existingBtn = document.getElementById('shopee-stealth-download-btn');
      if (existingBtn) existingBtn.remove();
      lastInjectedUrl = '';
      return;
    }

    // Skip if button is already injected for this URL
    if (currentUrl === lastInjectedUrl && document.getElementById('shopee-stealth-download-btn')) {
      return;
    }
    lastInjectedUrl = currentUrl;

    // Remove old button if exists
    const oldBtn = document.getElementById('shopee-stealth-download-btn');
    if (oldBtn) oldBtn.remove();

    const btn = document.createElement('button');
    btn.id = 'shopee-stealth-download-btn';
    btn.className = 'shopee-stealth-download-btn';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="margin-right: 6px;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
      Tải Ảnh Sản Phẩm
    `;

    // Inject styles directly for independence
    const style = document.createElement('style');
    style.id = 'shopee-stealth-btn-style';
    style.textContent = `
      .shopee-stealth-download-btn {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        background: linear-gradient(135deg, #f43f5e, #e11d48);
        color: white;
        border: none;
        border-radius: 50px;
        padding: 10px 20px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        box-shadow: 0 4px 15px rgba(225, 29, 72, 0.4);
        transition: all 0.2s ease-in-out;
      }
      .shopee-stealth-download-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(225, 29, 72, 0.6);
      }
      .shopee-stealth-download-btn.downloading {
        background: #9ca3af;
        box-shadow: none;
        cursor: not-allowed;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(btn);

    btn.addEventListener('click', async () => {
      try {
        if (btn.classList.contains('downloading')) return;
        btn.classList.add('downloading');
        btn.innerHTML = `Đang quét ảnh...`;

        // 1. Extract Product Info
        const title = document.querySelector('meta[property="og:title"]')?.content
          || document.querySelector('h1[class*="title"]')?.textContent
          || document.querySelector('[data-sqe="name"]')?.textContent
          || document.title.split('-')[0]
          || 'shopee_product';

        const urlMatch = location.pathname.match(/i\.(\d+)\.(\d+)/);
        const productId = urlMatch ? urlMatch[2] : Date.now().toString();

        // 2. Extract Images
        const imgSet = new Set();
        const urls = [];
        const pushUrl = (u) => {
          if (!u) return;
          const clean = u.split('?')[0].split('@')[0];
          if (!imgSet.has(clean)) {
            imgSet.add(clean);
            urls.push(clean);
          }
        };

        // Review images exclusion
        const isInReview = (el) => {
          return !!(el && el.closest('#shopee-product-rating, [data-sqe="rating"], [data-sqe="review"], .product-ratings, .product-rating, .product-review'));
        };

        // Collect from main gallery wrapper
        const heroImg = document.querySelector('img[elementtiming="shopee:heroComponentPaint"]');
        let container = heroImg ? heroImg.closest('.flex, .flex-column') : null;
        if (!container) container = document.querySelector('.TMw1ot, .xxW0BG, .UdI7e2');

        const scanRoots = [];
        if (container) scanRoots.push(container);
        const thumbnailBox = document.querySelector('.airUhU') || document.querySelector('[data-sqe="image"]');
        if (thumbnailBox && !scanRoots.includes(thumbnailBox)) scanRoots.push(thumbnailBox);
        if (!scanRoots.length) scanRoots.push(document);

        scanRoots.forEach(root => {
          root.querySelectorAll('img').forEach(img => {
            if (isInReview(img)) return;
            const src = img.currentSrc || img.src || img.getAttribute('data-src');
            pushUrl(src);
            
            const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
            if (srcset) {
              const items = srcset.split(',').map(x => x.trim()).filter(Boolean);
              if (items.length) {
                const highestRes = items[items.length - 1].split(' ')[0];
                pushUrl(highestRes);
              }
            }
          });
        });

        // Add og:image as fallback
        const ogImage = document.querySelector('meta[property="og:image"]')?.content;
        if (ogImage) pushUrl(ogImage);

        // Filter URLs to target actual product image assets
        const finalUrls = urls.filter(u => /img\.susercontent\.com\/file\//.test(u));
        const resultUrls = finalUrls.length ? finalUrls : urls;

        if (!resultUrls.length) {
          alert('Không tìm thấy ảnh sản phẩm nào!');
          resetBtn();
          return;
        }

        btn.innerHTML = `Đang tải ${resultUrls.length} ảnh...`;

        // 3. Send message to background to trigger downloads API
        chrome.runtime.sendMessage({
          action: 'DOWNLOAD_IMAGES',
          payload: {
            title: title.trim().substring(0, 30),
            productId,
            urls: resultUrls
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Image download error:', chrome.runtime.lastError.message);
            alert('Lỗi: Extension chưa sẵn sàng hoặc bị vô hiệu hóa.');
            resetBtn();
            return;
          }

          if (response && response.success) {
            btn.innerHTML = `✓ Đã tải xong!`;
            btn.style.background = '#10b981'; // Green
            setTimeout(() => {
              resetBtn();
              btn.style.background = '';
            }, 3000);
          } else {
            alert('Có lỗi xảy ra khi tải ảnh.');
            resetBtn();
          }
        });

      } catch (err) {
        console.error('Stealth extraction error:', err);
        resetBtn();
      }
    });

    function resetBtn() {
      btn.classList.remove('downloading');
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="margin-right: 6px;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        Tải Ảnh Sản Phẩm
      `;
    }
  }

  // Initial load
  injectDownloadButton();

  // Handle SPA url change
  let currentUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      setTimeout(injectDownloadButton, 800);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('popstate', () => {
    setTimeout(injectDownloadButton, 500);
  });
})();
