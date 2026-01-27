# 仿真规划服务系统 (Simulation Planning Service)

这是一个包含 C++ 后端和 HTML/JS 前端的仿真规划服务系统。

## 项目结构

- `backend/`: C++ 后端服务器源码 (基于 Winsock)
- `frontend/`: 前端网页源码 (HTML, JS)

## 部署说明

### 1. 前端部署 (Vercel)

前端是一个纯静态网页，可以部署在 Vercel, Netlify 或 GitHub Pages 上。

**推荐步骤 (Vercel):**
1. 将本项目上传到 GitHub。
2. 登录 [Vercel](https://vercel.com)。
3. 点击 "Add New Project" -> "Import" 你的 GitHub 仓库。
4. **重要配置**: 在 "Root Directory" (根目录) 设置中，点击 "Edit" 并选择 `frontend` 文件夹。
5. 点击 "Deploy"。

### 2. 后端部署 (本地或云端)

由于后端是 C++ 长连接服务，无法部署在 Vercel 等 Serverless 平台。你可以选择 **本地运行** 或 **云端容器部署**。

#### 方案 A: 云端容器部署 (推荐 Zeabur)
Zeabur 对新手非常友好，通常不需要复杂的认证，直接用 GitHub 登录即可。

1. 确保项目已同步到 GitHub。
2. 注册并登录 [Zeabur](https://zeabur.com) (直接使用 GitHub 登录)。
3. 点击 **Create Project** (创建项目)。
4. 点击 **Deploy New Service** (部署新服务) -> **Git** -> 选择你的 GitHub 仓库。
5. **关键配置**:
   - Zeabur 通常会自动检测到 Dockerfile。
   - 如果需要手动设置，请确保 **Root Directory (根目录)** 设置为 `backend`。
6. 部署完成后，在 **Networking** (网络) 选项卡中点击 **Generate Domain** (生成域名) 获取公网地址 (例如 `https://xxx.zeabur.app`)。
7. 在前端页面设置中填入该 URL。

*备选方案: Render / Railway / Koyeb 也是不错的选择，但可能需要信用卡验证。*

#### 方案 B: 本地运行 + 内网穿透
适合开发调试。

1. 在本地电脑上运行编译好的 `server.exe` (默认监听 8080 端口)。
2. 使用 cpolar 或其他内网穿透工具将本地 8080 端口暴露到公网。
   ```bash
   cpolar http 8080
   ```
3. 获取公网地址 (例如 `https://xyz.cpolar.cn`)。

### 3. 连接前后端

1. 打开 Vercel 部署好的前端网页。
2. 网页会自动检查后端连接。如果连接失败（因为默认是 localhost），会弹出提示框。
3. 点击 "配置后端地址" 按钮，输入你的 cpolar 公网地址 (例如 `https://xyz.cpolar.cn/api`)。
4. 系统会自动保存该地址，下次访问无需再次配置。

### 4. 订阅与支付（Creem）备注

- 概述
  - 后端已对接 Creem 的 REST API，无需安装 TypeScript 包
  - 前端保持原有“订阅”入口与按钮，不需要额外改动
- 环境变量（后端）
  - `CREEM_API_KEY`：你的 Creem API Key
  - `CREEM_PRODUCT_ID`：Creem 后台创建的产品 ID（如 `prod_abc123`）
  - `CREEM_SUCCESS_URL`：支付成功后的跳转地址（如 `https://yourapp.com/success`）
- 使用步骤
  - 设置上述环境变量并重启后端（默认端口 8080）
  - 在前端“订阅”页点击“立即开通”，会生成并展示 Creem 的 `checkout_url`
  - 完成支付后点击“我已完成订阅”，后端确认成功会为登录用户自动延长 30 天有效期
- 接口行为（简要）
  - `POST /api/pay/create`：调用 Creem `POST /v1/checkouts`，返回 `checkout_url` 与 `id`（作为 `order_id`）
  - `POST /api/pay/status`：优先通过 `GET /v1/checkouts?id=order_id` 读取 `status`，无返回时回退本地状态
  - `POST /api/pay/confirm`：查询会话状态为 `completed`/`paid` 时判定成功并延长订阅
- 前端地址配置
  - 首页“配置后端地址”按钮需填写为 `http(s)://你的域名:8080/api`
  - 前端已对 `API_URL` 做结尾规范化，避免出现路径双斜杠导致 404
- 界面与地图
  - “订阅”与“智能询问”模块激活时，电子海图会自动隐藏（CSS 与脚本双重控制）
- 安全建议
  - API Key 不应出现在前端代码或仓库中，请使用环境变量
  - 后端已启用 TLS 1.2 并使用自定义请求头满足 Creem 的 `x-api-key` 认证
- 备注
  - 如需自动确认订阅，后续可启用 Creem 的 Webhook（`creem_io` 提供签名校验与事件处理）；当前流程为“手动确认”

## 开发环境

- **后端**: Visual Studio 2022 (C++17)
- **前端**: 任意现代浏览器
