# Tapp

Tapp 是一款基于 Electron 的 Windows 桌面便利贴软件，强调轻量、常驻、本地优先和低打扰。它保留了真实便利贴的使用直觉，同时加入了截图、图片展示、待办清单、堆叠翻页和 AI 日报等适合现代桌面工作流的能力。

## 功能特性

- 多张便利贴自由摆放、拖拽和缩放
- 多张便利贴可收起为堆叠，并支持翻页切换
- 支持文字编辑、图片插入和截图插入
- 支持待办清单交互：勾选完成、自动变灰、删除线
- 全局截图快捷键，截图后可插入便利贴并复制到剪贴板
- 全局隐藏/显示快捷键，不退出应用即可快速收起所有便利贴
- 历史记录支持分栏查看：
  - 日报
  - 便利贴
- 基于 DeepSeek 的日报生成，支持用“工作内容”做轻量 RAG 过滤
- 本地 JSON 持久化，关闭后可恢复上次状态

## 技术路线

项目当前采用的技术路线是：

`Electron + 主进程集中管理 + 原生 HTML/CSS/JS 渲染层 + 本地 JSON 存储 + DeepSeek API`

架构要点如下：

- `src/main/`
  - 主进程代码
  - 负责窗口管理、截图、托盘、全局快捷键、数据持久化、日报生成
- `src/renderer/`
  - 渲染进程代码
  - 按窗口拆分为便利贴、设置、历史、截图覆盖层等模块
- `src/main/preload.js`
  - 通过 `contextBridge` 暴露安全 API
  - 渲染进程不直接访问 Node.js API
- `src/main/noteStore.js`
  - 数据唯一真相来源
  - 管理便利贴、设置、历史记录、日报历史

## 当前快捷键

- `Ctrl+Alt+Z`：截图
- `Ctrl+Alt+H`：隐藏 / 显示全部便利贴

截图快捷键可以在设置中修改，隐藏快捷键当前为固定全局快捷键。

## 项目结构

```text
tapp/
├─ assets/                  # 图标和静态资源
├─ dev-logs/                # 开发日志
├─ docs/                    # 需求、技术规格、数据模型等文档
├─ src/
│  ├─ main/                 # 主进程
│  └─ renderer/             # 渲染进程
├─ package.json
└─ README.md
```

## 开发环境

要求：

- Windows 11
- Node.js
- npm

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm start
```

构建安装包：

```bash
npm run build
```

## 数据存储

本地数据默认保存在 Electron `userData` 目录下：

- `data.json`：便利贴、设置、历史记录、日报历史
- `images/`：插入图片和截图文件

在 Windows 上，默认路径通常为：

```text
%APPDATA%/tapp/
```

## AI 日报

日报功能基于 DeepSeek API，核心流程如下：

1. 收集当天更新过的便利贴内容
2. 清洗 HTML、待办和图片相关标记
3. 读取用户在设置中填写的“工作内容”
4. 将“工作内容”作为轻量 RAG 上下文
5. 过滤非工作信息并生成日报
6. 生成后的日报：
   - 新建为一张便利贴
   - 同时保存到“日报历史”

设置中需要填写：

- `DeepSeek API Key`
- `日报模型`
- `工作内容`

推荐先使用：

```text
deepseek-v4-flash
```

## 核心文档

- [项目说明](./docs/project-overview.md)
- [需求文档](./docs/requirements.md)
- [技术规格](./docs/tech-spec.md)
- [设计规范](./docs/design-standards.md)
- [数据模型](./docs/data-model.md)
- [实现步骤](./docs/implementation-steps.md)

## License

MIT
