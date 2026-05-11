# KKTap — 电子便利贴

基于 Electron 的 Windows 桌面便利贴软件。淡黄色仿真实便利贴外观，支持文字编辑、图片展示、全局截图、多张便利贴堆叠翻页。

---

## 项目标准文件

所有开发规范文档位于 `docs/` 目录，开发前请先阅读：

| 文件 | 内容 |
|---|---|
| [docs/requirements.md](docs/requirements.md) | 用户需求文档（非技术语言） |
| [docs/tech-spec.md](docs/tech-spec.md) | 技术规格：架构、进程模型、IPC 表 |
| [docs/design-standards.md](docs/design-standards.md) | 设计规范：颜色、字体、阴影、动画 |
| [docs/implementation-steps.md](docs/implementation-steps.md) | 13 步实现清单，每步标注涉及文件 |
| [docs/data-model.md](docs/data-model.md) | JSON 数据结构、字段说明、存储路径 |

---

## 开发日志

每次开发会话在 `dev-logs/` 创建 `YYYY-MM-DD.md`，记录完成事项和待办事项。

---

## 工作约定

### 代码风格
- 使用 2 空格缩进
- 函数名使用 camelCase
- IPC 消息使用 `domain:action` 格式（如 `notes:create`、`screenshot:capture`）
- 文件名：主进程用 PascalCase（`NoteStore.js` 除外，使用 camelCase），渲染进程用 kebab-case

### 架构约束
- 所有主进程与渲染进程通信必须通过 `contextBridge`（preload.js），**禁止**使用 `nodeIntegration: true`
- 渲染进程不直接访问 Node.js API，全部通过 `window.api.*` 调用
- `noteStore.js` 是数据的唯一真相来源（single source of truth）
- 截图时先隐藏所有便利贴窗口，避免便利贴出现在截图中

### 文件组织
- `src/main/` — 主进程代码（Node.js 端）
- `src/renderer/` — 渲染进程代码（浏览器端），按功能窗口分目录

### 开发环境
- 运行开发模式：`npm start`
- 构建安装包：`npm run build`
- 数据存储目录：`%APPDATA%/KKTap/`
