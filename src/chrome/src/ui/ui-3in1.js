// ui-3in1.js - WebBrain Ultimate UI Controller (Tab Switcher, MCP, and Crawler)

document.addEventListener('DOMContentLoaded', () => {
  // ======================== 1. TAB CONTROL ========================
  const tabs = document.querySelectorAll('.sidebar-tab');
  const chatContent = document.getElementById('chat-tab-content');
  const mcpContent = document.getElementById('mcp-tab-content');
  const crawlerContent = document.getElementById('crawler-tab-content');

  // Đưa input area gốc vào trong chat-tab-content để ẩn hiện đồng bộ
  const inputArea = document.getElementById('input-area');
  if (inputArea && chatContent) {
    chatContent.appendChild(inputArea);
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const target = tab.dataset.tab;
      // Lưu trạng thái tab đang chọn
      chrome.storage.local.set({ sidebar_active_tab: target });

      if (target === 'chat') {
        chatContent.classList.remove('hidden');
        mcpContent.classList.add('hidden');
        crawlerContent.classList.add('hidden');
      } else if (target === 'mcp') {
        chatContent.classList.add('hidden');
        mcpContent.classList.remove('hidden');
        crawlerContent.classList.add('hidden');
        updateMcpStatus();
      } else if (target === 'crawler') {
        chatContent.classList.add('hidden');
        mcpContent.classList.add('hidden');
        crawlerContent.classList.remove('hidden');
      }
    });
  });

  // Khôi phục trạng thái tab đã chọn trước đó
  chrome.storage.local.get(['sidebar_active_tab'], (res) => {
    if (chrome.runtime.lastError) return;
    const activeTab = res.sidebar_active_tab || 'chat';
    const targetTabBtn = document.querySelector(`.sidebar-tab[data-tab="${activeTab}"]`);
    if (targetTabBtn && !targetTabBtn.classList.contains('active')) {
      targetTabBtn.click();
    }
  });

  // ======================== 2. MCP SERVER CONTROLS ========================
  const mcpStatusBadge = document.getElementById('mcpStatusBadge');
  const mcpStatusText = document.getElementById('mcpStatusText');
  const mcpReconnectBtn = document.getElementById('mcpReconnectBtn');
  const mcpLogList = document.getElementById('mcpLogList');
  const mcpToolList = document.getElementById('mcpToolList');

  const mcpToolExplanations = {
    'get_accessibility_tree': 'Đọc cấu trúc Accessibility Tree của trang để AI hiểu sơ đồ các phần tử và các thẻ hỗ trợ khả năng đọc/điều khiển.',
    'click_ax': 'Click chuột vào một phần tử dựa trên thuộc tính Accessibility của nó (độ chính xác cao hơn so với CSS Selector thông thường).',
    'type_ax': 'Nhập văn bản vào một ô nhập liệu dựa trên thuộc tính Accessibility của ô đó.',
    'set_field': 'Điền nhanh giá trị cho một ô nhập liệu xác định bằng CSS Selector.',
    'hover': 'Di chuyển con trỏ chuột ảo đến phần tử chỉ định để kích hoạt hiệu ứng hover (rê chuột).',
    'scroll': 'Cuộn trang lên, xuống, sang trái hoặc sang phải theo khoảng cách hoặc đến phần tử chỉ định.',
    'press_keys': 'Gửi chuỗi phím bấm từ bàn phím đến trang web (ví dụ: Enter, Tab, ArrowDown...).',
    'click': 'Click chuột trái vào phần tử dựa trên CSS Selector.',
    'type_text': 'Gõ văn bản trực tiếp vào phần tử dựa trên CSS Selector.',
    'get_selection': 'Đọc đoạn văn bản hiện đang được bôi đen (lựa chọn) trên trang.',
    'read_page': 'Đọc toàn bộ nội dung văn bản thuần (innerText) của trang web hiện tại.',
    'read_page_source': 'Đọc mã nguồn HTML gốc của trang web hiện tại.',
    'extract_data': 'Trích xuất dữ liệu có cấu trúc từ trang web bằng AI dựa trên prompt chỉ thị của bạn.',
    'get_interactive_elements': 'Quét và lấy danh sách tất cả các phần tử có khả năng tương tác (nút bấm, liên kết, ô nhập liệu) trên trang.',
    'navigate': 'Điều giúp tab hiện tại chuyển hướng đến một địa chỉ URL mới.',
    'new_tab': 'Mở một tab trình duyệt mới với địa chỉ URL chỉ định.',
    'go_back': 'Quay lại trang trước đó trong lịch sử duyệt web của tab.',
    'go_forward': 'Đi tới trang tiếp theo trong lịch sử duyệt web của tab.',
    'screenshot': 'Chụp ảnh màn hình trực quan của trang web hiện tại dưới dạng ảnh PNG.',
    'get_window_info': 'Đọc thông tin kích thước và trạng thái của cửa sổ trình duyệt hiện tại.',
    'resize_window': 'Thay đổi kích thước chiều rộng, chiều cao của cửa sổ trình duyệt.',
    'wait_for_element': 'Tạm dừng và chờ cho đến khi phần tử khớp với CSS Selector xuất hiện trên trang.',
    'wait_for_stable': 'Chờ cho trang web ổn định (không còn các yêu cầu mạng hoặc chuyển động DOM đang chạy).',
    'execute_js': 'Thực thi trực tiếp một đoạn mã JavaScript tuỳ chỉnh trên trang web và trả về kết quả.',
    'list_downloads': 'Liệt kê danh sách các tệp tin đã tải xuống từ trình duyệt.',
    'download_files': 'Tải tệp tin từ một đường dẫn URL chỉ định về máy local của bạn.',
    'upload_file': 'Tải tệp tin local lên trang web thông qua API debugger (CDP setFileInputFiles) giúp vượt rào bảo mật sandbox.'
  };

  function updateMcpStatus() {
    chrome.runtime.sendMessage({ target: 'mcp', action: 'GET_STATUS' }, (res) => {
      if (chrome.runtime.lastError || !res) return;
      
      // Update status UI
      mcpStatusBadge.className = `mcp-status-badge ${res.status}`;
      mcpStatusText.textContent = res.status.toUpperCase();
      
      const dot = mcpStatusBadge.querySelector('.mcp-dot');
      if (res.status === 'connected') {
        dot.className = 'mcp-dot';
      } else if (res.status === 'connecting') {
        dot.className = 'mcp-dot pulse';
      } else {
        dot.className = 'mcp-dot';
      }

      // Render tools list
      if (res.tools && res.tools.length) {
        mcpToolList.innerHTML = res.tools
          .map(t => `<div class="mcp-tool-item" style="cursor: pointer;" data-tool="${t}" title="Click để xem ý nghĩa">${t}</div>`)
          .join('');

        // Lắng nghe click giải nghĩa
        mcpToolList.querySelectorAll('.mcp-tool-item').forEach(item => {
          item.addEventListener('click', () => {
            const toolName = item.dataset.tool;
            const explanation = mcpToolExplanations[toolName] || 'Không có mô tả chi tiết cho công cụ này.';
            document.getElementById('mcp-detail-title').textContent = `🛠️ ${toolName}`;
            document.getElementById('mcp-detail-desc').textContent = explanation;

            // Highlight tool đang xem
            mcpToolList.querySelectorAll('.mcp-tool-item').forEach(t => t.style.borderColor = '');
            item.style.borderColor = 'var(--accent-color, #6c63ff)';
          });
        });
      } else {
        mcpToolList.innerHTML = `<div style="grid-column: span 2; font-size:11px; color:#7e7e8a;">Không có tool nào.</div>`;
      }

      // Render logs
      renderMcpLogs(res.logs || []);
    });
  }

  function renderMcpLogs(logs) {
    if (!logs.length) {
      mcpLogList.innerHTML = `<div style="color:#7e7e8a;">Chưa có hoạt động nào...</div>`;
      return;
    }
    mcpLogList.innerHTML = logs
      .map(log => {
        let typeClass = "system";
        if (log.action === "Tool Call") typeClass = "system";
        else if (log.action === "Tool Return") typeClass = log.success ? "success" : "fail";
        else if (log.action === "Error") typeClass = "fail";
        
        return `<div class="mcp-log-item">
          <span class="mcp-log-time">[${log.timestamp}]</span>
          <span class="mcp-log-action ${typeClass}">${log.action}</span>: ${log.details}
        </div>`;
      })
      .join('');
  }

  mcpReconnectBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ target: 'mcp', action: 'RECONNECT' }, () => {
      updateMcpStatus();
    });
  });

  // Lắng nghe cập nhật realtime từ background gửi sang
  chrome.runtime.onMessage.addListener((req) => {
    if (req.target === 'sidepanel-mcp') {
      if (req.action === 'mcp_log_update') {
        mcpStatusBadge.className = `mcp-status-badge ${req.status}`;
        mcpStatusText.textContent = req.status.toUpperCase();
        renderMcpLogs(req.logs || []);
      }
    }
  });

  // Chạy cập nhật tự động MCP mỗi 3 giây
  setInterval(updateMcpStatus, 3000);

  // ======================== 3. SHOPEE CRAWLER CONTROLS ====================
  const crawlerProviderSelect = document.getElementById('crawlerProviderSelect');
  const crawlerApiKeyInput = document.getElementById('crawlerApiKeyInput');
  const crawlerToggleApiKeyBtn = document.getElementById('crawlerToggleApiKeyBtn');
  const crawlerDelayMinInput = document.getElementById('crawlerDelayMinInput');
  const crawlerDelayMaxInput = document.getElementById('crawlerDelayMaxInput');
  const crawlerLinksTextarea = document.getElementById('crawlerLinksTextarea');
  const crawlerLinkCounter = document.getElementById('crawlerLinkCounter');
  const crawlerFormatLinksBtn = document.getElementById('crawlerFormatLinksBtn');
  
  const crawlerProgressSection = document.getElementById('crawlerProgressSection');
  const crawlerStatusMessage = document.getElementById('crawlerStatusMessage');
  const crawlerErrorBadge = document.getElementById('crawlerErrorBadge');
  const crawlerProgressBarFill = document.getElementById('crawlerProgressBarFill');
  const crawlerProgressRatio = document.getElementById('crawlerProgressRatio');
  const crawlerProgressPercentage = document.getElementById('crawlerProgressPercentage');
  
  const crawlerResultsCounter = document.getElementById('crawlerResultsCounter');
  const crawlerEmptyState = document.getElementById('crawlerEmptyState');
  const crawlerResultsList = document.getElementById('crawlerResultsList');
  
  const crawlerStartBtn = document.getElementById('crawlerStartBtn');
  const crawlerPauseBtn = document.getElementById('crawlerPauseBtn');
  const crawlerStopBtn = document.getElementById('crawlerStopBtn');
  const crawlerResumeBtn = document.getElementById('crawlerResumeBtn');
  const crawlerStopPausedBtn = document.getElementById('crawlerStopPausedBtn');
  const crawlerExportJsonBtn = document.getElementById('crawlerExportJsonBtn');
  const crawlerClearDataBtn = document.getElementById('crawlerClearDataBtn');
  
  const crawlerIdleControls = document.getElementById('crawlerIdleControls');
  const crawlerRunningControls = document.getElementById('crawlerRunningControls');
  const crawlerPausedControls = document.getElementById('crawlerPausedControls');

  const crawlerOpenaiFields = document.getElementById('crawlerOpenaiFields');
  const crawlerApiEndpointInput = document.getElementById('crawlerApiEndpointInput');
  const crawlerModelNameInput = document.getElementById('crawlerModelNameInput');
  const crawlerUseVisionCheckbox = document.getElementById('crawlerUseVisionCheckbox');
  const crawlerApiKeyLabel = document.getElementById('crawlerApiKeyLabel');
  const crawlerApiKeyHint = document.getElementById('crawlerApiKeyHint');

  function toggleCrawlerFields(provider) {
    if (provider === 'openai') {
      crawlerOpenaiFields.style.display = 'flex';
      crawlerApiKeyLabel.textContent = 'API Key (9router / OpenAI)';
      crawlerApiKeyHint.textContent = 'Nhập API Key nếu 9router/OpenAI yêu cầu.';
    } else {
      crawlerOpenaiFields.style.display = 'none';
      crawlerApiKeyLabel.textContent = 'Gemini API Key';
      crawlerApiKeyHint.textContent = 'Mặc định sử dụng API Key có sẵn nếu để trống.';
    }
  }

  crawlerProviderSelect.addEventListener('change', (e) => {
    toggleCrawlerFields(e.target.value);
  });

  // Load saved config & data
  chrome.storage.local.get([
    'crawler_apiKey', 'crawler_delayMin', 'crawler_delayMax', 'crawler_scrapedData', 
    'crawler_progress', 'crawler_queue', 'crawler_savedLinksText', 'crawler_apiProvider', 
    'crawler_apiEndpoint', 'crawler_modelName', 'crawler_useVision'
  ], (res) => {
    if (chrome.runtime.lastError) return;
    if (res.crawler_apiKey) crawlerApiKeyInput.value = res.crawler_apiKey;
    if (res.crawler_delayMin) crawlerDelayMinInput.value = res.crawler_delayMin / 1000;
    if (res.crawler_delayMax) crawlerDelayMaxInput.value = res.crawler_delayMax / 1000;
    if (res.crawler_scrapedData) renderCrawlerResults(res.crawler_scrapedData);
    if (res.crawler_progress) updateCrawlerProgressUI(res.crawler_progress);
    if (res.crawler_queue && res.crawler_queue.status) {
      updateCrawlerUIState(res.crawler_queue.status);
    }
    if (res.crawler_savedLinksText) {
      crawlerLinksTextarea.value = res.crawler_savedLinksText;
      updateCrawlerLinkCount();
    }
    if (res.crawler_apiProvider) {
      crawlerProviderSelect.value = res.crawler_apiProvider;
      toggleCrawlerFields(res.crawler_apiProvider);
    }
    if (res.crawler_apiEndpoint) crawlerApiEndpointInput.value = res.crawler_apiEndpoint;
    if (res.crawler_modelName) crawlerModelNameInput.value = res.crawler_modelName;
    if (res.crawler_useVision !== undefined) {
      crawlerUseVisionCheckbox.checked = res.crawler_useVision;
    }
  });

  crawlerToggleApiKeyBtn.addEventListener('click', () => {
    const isPassword = crawlerApiKeyInput.type === 'password';
    crawlerApiKeyInput.type = isPassword ? 'text' : 'password';
    crawlerToggleApiKeyBtn.textContent = isPassword ? '🙈' : '👁️';
  });

  function getCleanedLinks() {
    return crawlerLinksTextarea.value
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('http') && line.includes('shopee.vn'));
  }

  function updateCrawlerLinkCount() {
    const links = getCleanedLinks();
    crawlerLinkCounter.textContent = `${links.length} link`;
    crawlerStartBtn.disabled = links.length === 0;
    chrome.storage.local.set({ crawler_savedLinksText: crawlerLinksTextarea.value });
  }

  crawlerLinksTextarea.addEventListener('input', updateCrawlerLinkCount);

  // Format links (clean trackers & duplicate links)
  crawlerFormatLinksBtn.addEventListener('click', () => {
    const rawText = crawlerLinksTextarea.value;
    const urlRegex = /https?:\/\/[^\s"'<>\n]+/g;
    const foundUrls = rawText.match(urlRegex) || [];
    
    const cleaned = foundUrls
      .filter(url => url.includes('shopee.vn'))
      .map(url => {
        try {
          const u = new URL(url);
          // Giữ lại đường dẫn sạch, xóa mọi tracking query parameters
          return u.origin + u.pathname;
        } catch {
          return url;
        }
      });
      
    const unique = [...new Set(cleaned)];
    crawlerLinksTextarea.value = unique.join('\n');
    updateCrawlerLinkCount();
  });

  // Action Buttons
  crawlerStartBtn.addEventListener('click', () => {
    const links = getCleanedLinks();
    if (!links.length) return;

    const payload = {
      links,
      geminiApiKey: crawlerApiKeyInput.value.trim(),
      delayMin: Number(crawlerDelayMinInput.value) || 3,
      delayMax: Number(crawlerDelayMaxInput.value) || 7,
      apiProvider: crawlerProviderSelect.value,
      apiEndpoint: crawlerApiEndpointInput.value.trim(),
      modelName: crawlerModelNameInput.value.trim(),
      useVision: crawlerUseVisionCheckbox.checked
    };

    // Save configurations
    chrome.storage.local.set({
      crawler_apiKey: payload.geminiApiKey,
      crawler_delayMin: payload.delayMin * 1000,
      crawler_delayMax: payload.delayMax * 1000,
      crawler_apiProvider: payload.apiProvider,
      crawler_apiEndpoint: payload.apiEndpoint,
      crawler_modelName: payload.modelName,
      crawler_useVision: payload.useVision
    });

    chrome.runtime.sendMessage({ target: 'crawler', action: 'START_BATCH', payload }, (res) => {
      if (res && res.ok) {
        updateCrawlerUIState('running');
      }
    });
  });

  crawlerPauseBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ target: 'crawler', action: 'PAUSE_BATCH' }, () => {
      updateCrawlerUIState('paused');
    });
  });

  crawlerResumeBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ target: 'crawler', action: 'RESUME_BATCH' }, () => {
      updateCrawlerUIState('running');
    });
  });

  const stopAction = () => {
    chrome.runtime.sendMessage({ target: 'crawler', action: 'STOP_BATCH' }, () => {
      updateCrawlerUIState('stopped');
    });
  };
  crawlerStopBtn.addEventListener('click', stopAction);
  crawlerStopPausedBtn.addEventListener('click', stopAction);

  crawlerClearDataBtn.addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ kết quả cào cũ?')) {
      chrome.storage.local.remove(['crawler_scrapedData', 'crawler_progress', 'crawler_queue'], () => {
        renderCrawlerResults([]);
        crawlerProgressSection.style.display = 'none';
        updateCrawlerUIState('idle');
      });
    }
  });

  crawlerExportJsonBtn.addEventListener('click', () => {
    chrome.storage.local.get('crawler_scrapedData', (res) => {
      const data = res.crawler_scrapedData || [];
      if (!data.length) return;
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `shopee_scraped_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });

  // UI Updates based on status & storage
  function updateCrawlerUIState(status) {
    if (status === 'running') {
      crawlerIdleControls.style.display = 'none';
      crawlerRunningControls.style.display = 'flex';
      crawlerPausedControls.style.display = 'none';
      crawlerProgressSection.style.display = 'block';
    } else if (status === 'paused') {
      crawlerIdleControls.style.display = 'none';
      crawlerRunningControls.style.display = 'none';
      crawlerPausedControls.style.display = 'flex';
      crawlerProgressSection.style.display = 'block';
    } else { // idle, done, stopped
      crawlerIdleControls.style.display = 'flex';
      crawlerRunningControls.style.display = 'none';
      crawlerPausedControls.style.display = 'none';
    }
  }

  function updateCrawlerProgressUI(prog) {
    if (!prog) return;
    crawlerStatusMessage.textContent = prog.status || 'Đang chạy...';
    
    if (prog.errorCount > 0) {
      crawlerErrorBadge.style.display = 'inline-block';
      crawlerErrorBadge.textContent = `${prog.errorCount} lỗi`;
    } else {
      crawlerErrorBadge.style.display = 'none';
    }

    const total = prog.total || 0;
    const current = prog.index || 0;
    const ratio = total > 0 ? (current / total) : 0;
    const percentage = Math.round(ratio * 100);

    crawlerProgressBarFill.style.width = `${percentage}%`;
    crawlerProgressRatio.textContent = `${current} / ${total}`;
    crawlerProgressPercentage.textContent = `${percentage}%`;
  }

  function renderCrawlerResults(results) {
    const data = results || [];
    crawlerResultsCounter.textContent = `${data.length} sản phẩm`;
    crawlerExportJsonBtn.disabled = data.length === 0;

    if (!data.length) {
      crawlerEmptyState.style.display = 'flex';
      crawlerResultsList.style.display = 'none';
      return;
    }

    crawlerEmptyState.style.display = 'none';
    crawlerResultsList.style.display = 'flex';

    crawlerResultsList.innerHTML = data
      .map((item, idx) => {
        const rating = item.Rating || 'Chưa có';
        const brand = item.Brand || 'Không có';
        const sold = item.Sold || '0';
        const price = item.Price || '0';
        
        return `<div class="crawler-result-item">
          <div class="crawler-result-name">${idx + 1}. ${item.Name || 'Sản phẩm lỗi'}</div>
          <div class="crawler-result-meta">
            <span>💵 ${price} đ</span>
            <span>📦 Bán: ${sold}</span>
            <span>⭐ ${rating}</span>
            <span>🏷️ ${brand}</span>
          </div>
          ${item.failed ? `<div style="color:#ef4444; margin-top:4px;">❌ Lỗi: ${item.errorType || 'Unknown'}</div>` : ''}
          <div style="margin-top:6px; display:flex; gap:6px;">
            <button class="crawler-btn secondary" style="padding:4px 8px; font-size:10px; width:auto;" onclick="window.downloadImagesDirectly('${item.Name}', '${idx}', '${item.url}')">Tải ảnh</button>
            <a href="${item.url}" target="_blank" class="crawler-btn secondary" style="padding:4px 8px; font-size:10px; width:auto; text-decoration:none; text-align:center;">Mở link</a>
          </div>
        </div>`;
      })
      .join('');
  }

  // Khai báo global function để phục vụ nút tải ảnh trong danh sách kết quả HTML
  window.downloadImagesDirectly = (name, index, url) => {
    // Inject button click to download
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab) return;
      
      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: (targetUrl) => {
          // Bắn event click lên nút download được inject trên page shopee
          const btn = document.getElementById('shopee-stealth-download-btn');
          if (btn) {
            btn.click();
          } else {
            alert('Vui lòng mở đúng tab sản phẩm đó và đợi extension inject nút Tải Ảnh ở góc dưới bên phải!');
          }
        },
        args: [url]
      });
    });
  };

  // Lắng nghe thay đổi storage để tự động đồng bộ UI
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.crawler_scrapedData) {
      renderCrawlerResults(changes.crawler_scrapedData.newValue);
    }
    if (changes.crawler_progress) {
      updateCrawlerProgressUI(changes.crawler_progress.newValue);
    }
    if (changes.crawler_queue) {
      const q = changes.crawler_queue.newValue;
      if (q && q.status) {
        updateCrawlerUIState(q.status);
      }
    }
  });
});
