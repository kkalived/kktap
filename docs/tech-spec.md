# 技术规格

## 技术栈

| 层级 | 技术 | 说明 |
|---|---|---|
| 框架 | Electron 42 | 桌面应用框架 |
| 主进程 | Node.js | 窗口管理、文件系统、全局快捷键 |
| 渲染进程 | 原生 HTML/CSS/JS | 无需 React/Vue，减少构建复杂度 |
| 打包 | electron-builder | 生成 NSIS Windows 安装包 |

## 进程架构

```
┌─────────────────────────────────────────┐
│ 主进程 (Main Process)                    │
│                                          │
│  noteStore.js     数据持久化             │
│  windowManager.js  窗口创建/销毁/合并     │
│  screenshotService.js  截图捕获/裁剪     │
│  hotkeyManager.js  全局快捷键            │
│  trayManager.js   系统托盘               │
│  preload.js       contextBridge API     │
└──────────┬──────────────────────────────┘
           │ IPC (contextBridge)
           ▼
┌─────────────────────────────────────────┐
│ 渲染进程 (Renderer Process)              │
│                                          │
│  note-stack/    便利贴窗口               │
│  screenshot-overlay/  截图选区覆盖层     │
│  history/       历史记录窗口             │
│  settings/      设置窗口                 │
└─────────────────────────────────────────┘
```

## IPC 消息表

所有通信通过 `window.api.*` 调用，底层走 `ipcRenderer.invoke` / `ipcMain.handle`。

| 频道 | 方向 | 载荷 | 用途 |
|---|---|---|---|
| `notes:get-all` | Renderer → Main | — | 加载所有堆数据 |
| `notes:create` | Renderer → Main | `{ type, position, size }` | 创建新便利贴 |
| `notes:update-content` | Renderer → Main | `{ stackId, noteId, content, images }` | 保存文字/图片变更 |
| `notes:update-geometry` | Renderer → Main | `{ stackId, position, size }` | 保存位置/大小变更 |
| `notes:update-order` | Renderer → Main | `{ stackId, order[] }` | 翻页后更新堆内顺序 |
| `notes:delete` | Renderer → Main | `{ stackId, noteId }` | 删除便利贴 |
| `notes:get-history` | Renderer → Main | — | 获取已删除便利贴列表 |
| `notes:restore` | Renderer → Main | `{ noteData }` | 恢复已删除便利贴 |
| `notes:permanent-delete` | Renderer → Main | `{ noteId }` | 永久删除 |
| `stacks:merge-check` | Renderer → Main | `{ stackId, position }` | 拖拽后请求检查合并 |
| `stacks:split` | Renderer → Main | `{ stackId, noteId, position }` | 拆分堆中便利贴 |
| `screenshot:capture` | Renderer → Main | — | 触发截图 |
| `screenshot:region-selected` | Renderer → Main | `{ x, y, width, height }` | 选区确认 |
| `screenshot:cancel` | Renderer → Main | — | 取消截图 |
| `files:open-image` | Renderer → Main | — | 打开文件选择器 |
| `settings:get` | Renderer → Main | — | 获取设置 |
| `settings:set` | Renderer → Main | `{ key, value }` | 更新设置 |
| `app:get-path` | Renderer → Main | — | 获取 userData 路径 |

## 窗口类型

| 窗口 | 类型 | 特性 |
|---|---|---|
| 便利贴窗口 | BrowserWindow | frameless, transparent, alwaysOnTop, resizable |
| 截图覆盖层 | BrowserWindow | frameless, transparent, fullscreen, alwaysOnTop |
| 历史窗口 | BrowserWindow | 普通模态窗口 |
| 设置窗口 | BrowserWindow | 普通模态窗口 |

## 安全约束

- `contextIsolation: true` — 渲染进程隔离
- `nodeIntegration: false` — 渲染进程无 Node 权限
- `sandbox: false` — 需要 preload 支持（preload 中用 ipcRenderer）
- 所有 IPC 通过 `contextBridge.exposeInMainWorld` 暴露
