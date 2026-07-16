// ==============================================================================
// WEBBRAIN MCP SERVER - LOCAL NODE.JS CONNECTOR (FULL CAPABILITIES)
// ==============================================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer } from "ws";

// 1. KHỞI TẠO WEBSOCKET SERVER CHO CHROMIUM EXTENSION KẾT NỐI
const WS_PORT = 8545;
const wss = new WebSocketServer({ port: WS_PORT });

let activeExtensionSocket = null;
const pendingRequests = new Map();

console.error(`📡 WebSocket Server đang chạy tại ws://localhost:${WS_PORT}`);

wss.on("connection", (ws) => {
  console.error("🔌 Extension WebBrain-MCP đã kết nối thành công!");
  activeExtensionSocket = ws;

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      
      // Xử lý phản hồi kết quả từ Extension
      if (msg.id && pendingRequests.has(msg.id)) {
        const { resolve, reject } = pendingRequests.get(msg.id);
        pendingRequests.delete(msg.id);
        
        if (msg.error) {
          reject(new Error(msg.error));
        } else {
          resolve(msg.result);
        }
      } else if (msg.type === "status" && msg.status === "ready") {
        console.error("🟢 Trạng thái Extension: SẴN SÀNG THỰC THI.");
      }
    } catch (err) {
      console.error("❌ Lỗi phân tích cú pháp dữ liệu WebSocket nhận được:", err);
    }
  });

  ws.on("close", () => {
    console.error("❌ Extension WebBrain-MCP đã mất kết nối.");
    activeExtensionSocket = null;
  });
});

// 2. KHỞI TẠO MODEL CONTEXT PROTOCOL (MCP) SERVER
const mcpServer = new Server(
  {
    name: "webbrain-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Khai báo danh sách đầy đủ các công cụ vận động tương thích WebBrain gốc
const BROWSER_TOOLS = [
  {
    name: "get_accessibility_tree",
    description: "Đọc cấu trúc Accessibility Tree của tab Chrome hiện tại. Trả về cây phẳng các phần tử tương tác kèm ref_id (dùng ref_id để click/nhập văn bản).",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", enum: ["all", "visible", "interactive"], description: "Visible: Chỉ phần tử trong khung nhìn. Interactive: Chỉ phần tử click được." },
        maxDepth: { type: "number", description: "Độ sâu tối đa của cây (mặc định 15)." },
        ref_id: { type: "string", description: "Tập trung đọc một nhánh cụ thể theo ref_id." }
      }
    }
  },
  {
    name: "click_ax",
    description: "Click vào một phần tử trên DOM bằng ref_id từ get_accessibility_tree. Chính xác tuyệt đối, không lệch tọa độ.",
    inputSchema: {
      type: "object",
      properties: {
        ref_id: { type: "string", description: "Mã định danh ref_id của nút cần click." }
      },
      required: ["ref_id"]
    }
  },
  {
    name: "type_ax",
    description: "Nhập văn bản vào trường nhập liệu bằng ref_id.",
    inputSchema: {
      type: "object",
      properties: {
        ref_id: { type: "string", description: "Mã định danh ref_id của ô nhập liệu." },
        text: { type: "string", description: "Văn bản cần nhập." },
        clear: { type: "boolean", description: "Có xóa chữ cũ trước khi nhập không (mặc định false)." }
      },
      required: ["ref_id", "text"]
    }
  },
  {
    name: "set_field",
    description: "Nhập văn bản nhanh bằng ref_id (tương đương kết hợp click_ax + type_ax). Tự động xóa chữ cũ. Đặt submit=true để bấm Enter.",
    inputSchema: {
      type: "object",
      properties: {
        ref_id: { type: "string", description: "Mã ref_id của ô nhập liệu." },
        text: { type: "string", description: "Văn bản cần điền." },
        submit: { type: "boolean", description: "Bấm Enter sau khi điền không (mặc định false)." }
      },
      required: ["ref_id", "text"]
    }
  },
  {
    name: "hover",
    description: "Di chuột (hover) lên một phần tử bằng ref_id.",
    inputSchema: {
      type: "object",
      properties: {
        ref_id: { type: "string", description: "Mã ref_id cần hover." }
      },
      required: ["ref_id"]
    }
  },
  {
    name: "scroll",
    description: "Cuộn trang lên hoặc xuống.",
    inputSchema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["up", "down", "top", "bottom"], description: "Hướng cuộn trang." }
      },
      required: ["direction"]
    }
  },
  {
    name: "navigate",
    description: "Điều hướng tab trình duyệt đến một URL được cung cấp.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL đích cần mở." }
      },
      required: ["url"]
    }
  },
  {
    name: "new_tab",
    description: "Mở một tab mới trên trình duyệt.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL tùy chọn mở ở tab mới." }
      }
    }
  },
  {
    name: "go_back",
    description: "Quay lại trang trước đó trong lịch sử duyệt web.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "go_forward",
    description: "Tiến tới trang tiếp theo trong lịch sử duyệt web.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "screenshot",
    description: "Chụp ảnh màn hình khu vực khung nhìn (visible tab) hiện tại.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "read_page",
    description: "Trích xuất toàn bộ nội dung văn bản (prose) hiển thị trên trang.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "wait_for_element",
    description: "Chờ cho đến khi một CSS selector xuất hiện trên DOM.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS Selector cần chờ." },
        timeout: { type: "number", description: "Thời gian chờ tối đa bằng mili-giây (mặc định 10000)." }
      },
      required: ["selector"]
    }
  },
  {
    name: "get_selection",
    description: "Lấy phần văn bản đang được bôi đen (highlighted text) trên trang.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "read_page_source",
    description: "Lấy toàn bộ mã nguồn HTML thô (outerHTML) của trang web hiện tại.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "get_window_info",
    description: "Lấy thông tin kích thước cửa sổ trình duyệt và số lượng tab đang mở.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "resize_window",
    description: "Thay đổi kích thước cửa sổ trình duyệt.",
    inputSchema: {
      type: "object",
      properties: {
        width: { type: "number", description: "Chiều rộng mới (pixel)." },
        height: { type: "number", description: "Chiều cao mới (pixel)." }
      },
      required: ["width", "height"]
    }
  },
  {
    name: "execute_js",
    description: "Thực thi một đoạn mã Javascript động bất đồng bộ trong trang hiện tại. Code được thực thi dưới dạng hàm nhận tham số 'resolve'.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Đoạn mã JavaScript cần chạy. Ví dụ: 'resolve(document.title);' hoặc 'setTimeout(() => resolve(42), 1000);'" }
      },
      required: ["code"]
    }
  },
  {
    name: "list_downloads",
    description: "Liệt kê danh sách các file đã được tải xuống bằng trình duyệt.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Số lượng file tối đa trả về." }
      }
    }
  },
  {
    name: "download_files",
    description: "Tải một file từ URL được cung cấp về máy cục bộ thông qua trình quản lý tải xuống của Chrome.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL của file cần tải." },
        filename: { type: "string", description: "Tên file tùy chọn để lưu." }
      },
      required: ["url"]
    }
  },
  {
    name: "press_keys",
    description: "Bấm phím ảo trên bàn phím ảo gửi tới phần tử đang focus (ví dụ: Enter, Backspace, các phím mũi tên).",
    inputSchema: {
      type: "object",
      properties: {
        keys: { type: "array", items: { type: "string" }, description: "Mảng các phím cần bấm, ví dụ ['Enter'] hoặc ['ArrowDown', 'Enter']." }
      },
      required: ["keys"]
    }
  },
  {
    name: "click",
    description: "Click phần tử theo CSS selector, text, hoặc index (sử dụng như phương án dự phòng khi click_ax không tìm thấy ref_id).",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS Selector của phần tử." },
        text: { type: "string", description: "Nội dung chữ của phần tử cần click." },
        index: { type: "number", description: "Index phần tử từ get_interactive_elements." }
      }
    }
  },
  {
    name: "type_text",
    description: "Nhập chữ vào phần tử bằng CSS selector (dự phòng cho type_ax).",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS Selector của trường nhập liệu." },
        text: { type: "string", description: "Chữ cần nhập." }
      },
      required: ["text"]
    }
  },
  {
    name: "extract_data",
    description: "Trích xuất nhanh dữ liệu có cấu trúc từ trang web (bảng biểu, liên kết, danh sách ảnh).",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "wait_for_stable",
    description: "Chờ cho đến khi trang web tải xong hoàn toàn và ổn định mạng lưới.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "get_interactive_elements",
    description: "Liệt kê nhanh các phần tử tương tác thô kèm chỉ mục index trên DOM.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "upload_file",
    description: "Tải một file cục bộ từ đường dẫn local lên một phần tử input file trên trang web thông qua CDP debugger.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS Selector của thẻ input file trên trang." },
        files: { 
          type: "array", 
          items: { type: "string" }, 
          description: "Mảng các đường dẫn tuyệt đối của các file local cần tải lên. Ví dụ: ['C:/images/pic.png']" 
        }
      },
      required: ["selector", "files"]
    }
  }
];

// 3. ĐĂNG KÝ HÀM GỬI DANH SÁCH TOOL CHO AGENT QUA MCP
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: BROWSER_TOOLS,
  };
});

// 4. ĐĂNG KÝ HÀM THỰC THI TOOL (CALL TOOL)
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!activeExtensionSocket) {
    return {
      content: [
        {
          type: "text",
          text: "❌ Lỗi: Chưa có Extension WebBrain-MCP nào kết nối tới Server. Hãy đảm bảo bạn đã nạp Extension và bật Chrome debug."
        }
      ],
      isError: true
    };
  }

  // Đóng gói và gửi yêu cầu sang WebSocket Client (Extension)
  const requestId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
  
  const responsePromise = new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
    // Timeout dự phòng sau 35 giây
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error(`Timeout: Thao tác tool ${name} phản hồi quá lâu từ trình duyệt.`));
      }
    }, 35000);
  });

  try {
    activeExtensionSocket.send(
      JSON.stringify({
        id: requestId,
        action: "execute_tool",
        toolName: name,
        params: args
      })
    );

    // Chờ phản hồi kết quả
    const result = await responsePromise;
    
    // Đóng gói trả kết quả về chuẩn MCP
    if (result && result.screenshot) {
      // Nếu là ảnh chụp màn hình
      return {
        content: [
          {
            type: "text",
            text: "Đã chụp ảnh màn hình thành công."
          },
          {
            type: "image",
            data: result.screenshot.split(",")[1], // Bỏ tiền tố data:image/png;base64,
            mimeType: "image/png"
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: typeof result === "string" ? result : JSON.stringify(result, null, 2)
        }
      ]
    };

  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Lỗi thực thi tool: ${err.message}`
        }
      ],
      isError: true
    };
  }
});

// Khởi động Stdio Transport để kết nối CLI Agent
async function run() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("🚀 WebBrain MCP Server đã khởi chạy và kết nối qua STDIO!");
}

run().catch((err) => {
  console.error("❌ MCP Server bị dừng đột ngột:", err);
});
