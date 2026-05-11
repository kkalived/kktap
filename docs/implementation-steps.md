# 实现步骤

## Step 0: 项目文档体系搭建 ✅
- [x] 创建 `docs/` 及 5 份规范文档
- [x] 创建 `dev-logs/` 及首日日志
- [x] 创建 `CLAUDE.md` 项目指引

## Step 1: 项目脚手架
**涉及文件**：`package.json`, `src/main/main.js`, `src/main/preload.js`, `src/renderer/note-stack/index.html`, `src/renderer/note-stack/style.css`, `src/renderer/note-stack/app.js`

- `npm init` + 安装 electron
- 创建主进程入口 `main.js`
- 创建 `preload.js`（contextBridge）
- 创建便利贴窗口基础 HTML/CSS/JS
- 验证：窗口显示，可打字

## Step 2: 数据持久化（noteStore.js）
**涉及文件**：`src/main/noteStore.js`, `src/main/main.js`

- JSON 文件读写（`%APPDATA%/tapp/data.json`）
- 增删改查方法
- 所有 IPC handler 注册
- 损坏文件自动恢复

## Step 3: 窗口管理（windowManager.js）
**涉及文件**：`src/main/windowManager.js`, `src/main/main.js`

- 创建/销毁 BrowserWindow
- stackId ↔ BrowserWindow 映射
- 应用退出前保存

## Step 4: 基础交互
**涉及文件**：`src/renderer/note-stack/app.js`, `src/main/trayManager.js`, `src/shared/contextMenu.js`

- 拖拽移动（标题栏区域）
- 边缘拖拽缩放
- 右上角 X 关闭
- 右键菜单
- 系统托盘

## Step 5: 堆叠合并与拆分
**涉及文件**：`src/main/windowManager.js`, `src/main/noteStore.js`, `src/renderer/note-stack/app.js`

- 拖拽结束检测窗口重叠
- 合并逻辑（最多 3 张）
- 拆分逻辑
- 超限拒绝

## Step 6: 边缘露出效果
**涉及文件**：`src/renderer/note-stack/style.css`, `src/renderer/note-stack/app.js`

- 多页时下层露出 30px 边缘
- 边缘显示创建日期
- 点击边缘触发翻页

## Step 7: CSS 3D 翻页动画
**涉及文件**：`src/renderer/note-stack/style.css`, `src/renderer/note-stack/app.js`

- perspective + rotateY 翻书效果
- bringToFront() 逻辑
- 动画完成回调更新 DOM 顺序

## Step 8: 全局截图
**涉及文件**：`src/main/screenshotService.js`, `src/main/hotkeyManager.js`, `src/renderer/screenshot-overlay/*`

- 注册 Ctrl+Alt+Z
- 隐藏便利贴 → 全屏截图 → 选区覆盖层
- 裁剪保存 → 创建新便利贴 → 恢复便利贴
- Esc 取消

## Step 9: 本地图片上传
**涉及文件**：`src/main/main.js`, `src/renderer/note-stack/app.js`

- 右键菜单 "插入图片"
- 系统文件选择器
- 图片复制到数据目录并显示

## Step 10: 历史记录
**涉及文件**：`src/renderer/history/*`, `src/main/noteStore.js`

- 删除的便利贴进入回收站
- 历史浏览窗口
- 恢复 / 永久删除

## Step 11: 设置面板
**涉及文件**：`src/renderer/settings/*`, `src/main/hotkeyManager.js`

- 快捷键修改
- 开机自启开关
- 设置持久化

## Step 12: 视觉打磨 + 打包
**涉及文件**：`src/renderer/note-stack/style.css`, `builder.config.js`

- 淡黄色 + 阴影 + 微倾斜
- electron-builder NSIS 配置
- 生成 .exe 安装包
