# cpolar 内网穿透配置指南

本指南将帮助您使用 **cpolar** 将您的服务暴露到公网，并支持国外访问。

## 1. 准备工作

确保您的本地服务已经运行：
1.  **启动后端**：运行 `backend/server` 下的 `server.exe`（默认端口 8080）。
2.  **启动前端**：运行 `frontend` 下的 `run_frontend.bat`（默认端口 5500）。

## 2. 安装与启动 cpolar

1.  访问 [cpolar 官网](https://www.cpolar.com/) 注册账号并下载 Windows 版本。
2.  解压下载的文件，打开命令行（CMD 或 PowerShell），进入解压目录。
3.  **认证**：运行官网提供的 token 认证命令（登录后台可查看），例如：
    ```powershell
    .\cpolar.exe authtoken <您的Token>
    ```

## 3. 配置穿透隧道

我们需要同时穿透前端和后端。

### 方案 A：快速启动（临时域名）

打开两个命令行窗口，分别运行：

**窗口 1（前端）：**
```powershell
.\cpolar.exe http 5500
```
> 记下生成的公网地址，例如：`http://frontend-xyz.cpolar.cn`

**窗口 2（后端）：**
```powershell
.\cpolar.exe http 8080
```
> 记下生成的公网地址，例如：`http://backend-abc.cpolar.cn`

### 方案 B：使用配置文件（推荐，更稳定）

1.  找到 cpolar 配置文件（通常在 `C:\Users\您的用户名\.cpolar\cpolar.yml`）。
2.  编辑文件，添加如下内容：

```yaml
tunnels:
  frontend:
    proto: http
    addr: 5500
    region: cn_vip  # 可选：cn, us, hk 等，根据套餐选择
  backend:
    proto: http
    addr: 8080
    region: cn_vip
```
3.  启动所有隧道：
    ```powershell
    .\cpolar.exe start-all
    ```

## 4. 关键步骤：关联前端与后端

由于前端和后端现在拥有不同的公网地址，您需要告诉前端去哪里找后端。

1.  **访问前端**：在浏览器打开 cpolar 生成的前端地址（如 `http://frontend-xyz.cpolar.cn`）。
2.  **配置后端**：
    -   页面加载后，如果连接不上默认的本地后端，顶部会出现**红色警告**。
    -   点击警告中的 **[配置后端地址]** 按钮。
    -   输入 cpolar 生成的后端地址，并加上 `/api` 后缀。
        -   例如：`http://backend-abc.cpolar.cn/api`
    -   点击确认，页面刷新后即可正常使用。

## 5. 关于国外访问

-   cpolar 默认生成的域名（如 `*.cpolar.cn` 或 `*.cpolar.io`）通常全球可达。
-   **提示**：免费版使用共享节点，海外访问速度可能受限。
-   如果需要更好的海外访问体验：
    1.  登录 cpolar 官网后台。
    2.  在“预留”中选择“保留二级子域名”，地区选择 **Global** 或 **Hong Kong**（如果可用）。
    3.  在配置文件中指定 `region` 和 `subdomain`。

## 常见问题

-   **Q: 为什么聊天没反应？**
    -   A: 检查后端地址是否配置正确。按 F12 打开开发者工具，查看 Console 是否有报错。
-   **Q: 每次重启 cpolar 都要重新配置吗？**
    -   A: 如果使用免费版随机域名，是的。建议保留固定二级子域名（可能需要付费套餐）。
