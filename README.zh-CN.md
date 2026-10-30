# Moss

[English](README.md) · **简体中文**

Moss 是一款安静、以本地优先的个人项目管理工作台，提供首页仪表盘、任务、带可编辑排期与里程碑的项目、可配置的工作区标签，以及概览 / 看板 / 列表 / 表格 / 日历 / 时间线 / 文件视图、日程、收藏、归档、全局搜索和设置。首个版本支持英文和简体中文（`zh-CN`），并将任务和事件日期视为本地日历日期，不做时区转换。

项目使用原生 JavaScript ES modules 和 CSS 构建，由 [Vite](https://vite.dev) 打包；不使用 UI 框架，也没有运行时依赖。Web 版本将数据存储在浏览器 `localStorage` 中，可在“设置 -> 数据与备份”中导出和导入 JSON。桌面版本将附件内容存储在应用托管的用户数据目录中，元数据和同步待发送队列（outbox）位于 SQLite；启动时会清理无归属的附件 blob。浏览器版本的附件仍仅保留元数据。基于 SQLite 的本地仓库已为桌面外壳准备好。

![Moss 首页仪表盘](docs/preview.png)

## 快速开始

需要 Node.js 24 或更高版本。桌面主进程使用 Node 内置的 `node:sqlite`；`.nvmrc` 固定为 24。

```bash
npm install
npm run dev          # 启动 http://localhost:5173，支持热更新
npm run build        # 在 dist/ 中生成生产构建
npm run dev:desktop  # 同时启动 Vite 渲染进程和 Electron 桌面外壳
npm run pack         # 在 release/ 中生成未打包的桌面应用
npm run dist         # 在 release/ 中生成各平台安装包
npm run preview      # 在本地预览生产构建
npm run typecheck    # 对共享包执行严格 TypeScript 检查
npm test             # 客户端/应用契约和 SQLite 集成测试
npm run lint         # ESLint
npm run format       # Prettier
```

## 项目结构

```
index.html              HTML 入口，加载 src/main.js
public/favicon.svg      品牌图标
vite.config.js          Vite 配置，包括 Lucide 图标子集插件
eslint.config.js        lint 规则（ESLint flat config）；格式化使用 Prettier（.prettierrc.json）
.github/workflows/      CI：lint、格式检查、构建
docs/preview.png        README 截图
packages/
  contracts/            可序列化实体、命令、查询和结果
  domain/               纯任务与项目规则
  application/          基于仓库接口的命令处理器
  client/               WorkspaceClient 接口，以及内存、浏览器和本地适配器
  local-db/             Node SQLite schema、迁移、仓库、outbox 和同步运行器
  sync-core/            与传输无关的同步协议、校验、重试和拉取合并
  test-fixtures/        共享快照和实体构建器
tests/                   包级单元测试
src/
  main.js               入口：导入样式和模块，然后启动应用
  styles/
    index.css           按层叠顺序导入所有样式表
    tokens.css          颜色、间距、字体、圆角，以及共享的 --gutter
    base.css  components.css  shell.css  panels.css  overlays.css  states.css  motion.css  responsive.css
    views/              列表、看板、表格、日历、时间线、项目与文件视图
    pages/              设置与本地数据工具
  core/                 工具、常量、图标、读取存储、工作区桥接和主题
  data/seed.js          初始的空工作区数据
  i18n/                 语言注册表、查找/插值、复数规则，以及英文和 zh-CN 语言目录
  ui/                   共享渲染辅助函数、toast 和下拉选择框
  shell/                渲染循环与路由、侧边栏/顶栏布局、骨架屏和视图引擎
  components/           任务列表渲染器
  pages/                每个路由一个模块
  views/                项目视图：看板、表格、日历、时间线、文件和概览
  overlays/             任务抽屉、模态框、弹出层、上下文菜单和命令面板
  features/             子任务和归档渲染
  actions/              用户操作、事件绑定、键盘快捷键和拖放
apps/desktop/           Electron 主进程、类型化 preload 桥接和打包配置
```

### 分层架构

依赖关系由外向内收敛：

1. `contracts` 定义可序列化的实体以及命令/查询类型。
2. `domain` 包含不依赖框架的业务规则。
3. `application` 通过仓库接口校验并执行命令。
4. `client` 暴露 `WorkspaceClient`；浏览器和内存适配器负责选择具体实现。
5. UI 操作调用共享的 workspace client，不直接修改项目、任务、文件或已保存视图。

`S.data` 是渲染进程使用的同步读取缓存。每次执行命令后，它都会从 client 刷新。临时 UI 状态和设备偏好不经过工作区命令路径，可以直接保存。

## 开发约定

- **渲染：**每个页面或视图都是一个函数，根据 store（`S`）返回 HTML 字符串。`render()` 会重建外壳，并保留焦点和滚动位置。
- **交互：**元素通过 `data-a="actionName"` 声明操作，`actions/events.js` 会将点击委托给 `A.actionName`。输入框使用 `data-in`，失焦事件使用 `data-blur`。业务写入通过 `runCommand()` 和 `WorkspaceClient` 完成。
- **布局：**每个页面边缘都使用 `var(--gutter)`，确保面包屑、页面标题、工具栏、列表、表格和看板从同一条基线开始。
- **下拉菜单：**编写普通的 `<select class="select">`。`ui/select.js` 会将其渲染为设计系统菜单，并保留原生元素作为真实数据源。
- **图标：**调用 `ic('name')` 使用任意 [Lucide](https://lucide.dev) 图标名。`virtual:icons` 插件只会打包源码中实际用到的图标。
- **本地化：**用户可见文案通过 `t('namespace.key')` 获取。各语言目录的结构应保持一致；日期和数字使用 `Intl`；持久化 ID 与展示文案保持分离。`tests/i18n.test.ts` 会检查语言目录的一致性和静态引用键。

## 持续集成

每次推送和拉取请求都会运行 lint、格式检查和生产构建（`.github/workflows/ci.yml`）。

## 部署

`vercel.json` 使用 Vite 构建，并托管 `dist/` 中的文件。

## 架构说明

本地优先桌面应用及可选云同步的设计记录在 [docs/architecture.md](docs/architecture.md) 中。剩余云同步和加固工作记录在 [docs/remaining-work.md](docs/remaining-work.md) 中。

里程碑 1 建立了命令和 client 的边界。里程碑 2 增加了基于 SQLite 的本地仓库、迁移、旧版数据导入、outbox 和 tombstone。里程碑 4 现在包含离线同步引擎：HTTP 推送/拉取、重试调度、有序的远端变更、持久化拉取游标和同步状态控制。跨设备同步仍需要托管 API 和 PostgreSQL schema。Web 版本仍使用浏览器 `localStorage`；Electron 版本通过类型化 preload 适配器连接 SQLite。桌面工作区数据位于 `app.getPath("userData")/workspace.sqlite3`，浏览器偏好和视图状态仍作为本地 UI 状态保存。
