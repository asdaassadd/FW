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

### 2. 后端部署 (本地/服务器)

后端是 C++ 可执行程序 (`server.exe`)，无法直接在 Vercel (Serverless 环境) 上运行。你需要在一个支持长时间运行进程的环境中运行它。

**本地运行 + 内网穿透 (推荐):**
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

## 开发环境

- **后端**: Visual Studio 2022 (C++17)
- **前端**: 任意现代浏览器
