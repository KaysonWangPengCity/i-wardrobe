# 版本管理流程设计

> 日期: 2026-09-09
> 状态: 设计稿

## 目标

建立"测试版本"与"正式版本"双轨开发流程。日常需求在测试版本调整,本地预览验证通过后,合并到正式版本并推送到 GitHub,触发 Cloudflare Pages 自动部署。

## 架构

### 仓库与分支

- **单仓库** `i-wardrobe`(已存在)
- **双分支模型**:
  - `main`:稳定分支。Cloudflare Pages 仅监听 `main` 的 push 事件触发生产部署。
  - `dev`:开发分支。日常需求在此进行,可包含半成品 commit。同时 push 到 GitHub 做云端备份。
- **Cloudflare Pages** 配置不变,继续以 `main` 为部署源。

### 测试内容隔离(.env.local + .gitignore)

- **`.env.local`**:本地存放测试 API Key 等,已被现有 `.gitignore` 中 `.env.*` 规则覆盖,永不进任何分支。
- **`.env.example`**:提交到仓库作为模板,记录变量名不含值,方便新环境快速复制。
- **代码读取**:通过 `import.meta.env.VITE_TEST_*` 读取。
- **生产隔离**:"载入开发配置"按钮用 `import.meta.env.DEV === true` 判断显示。Vite 生产构建自动剔除该代码块,生产环境无此按钮。

### GitHub main 分支保护

在 GitHub 仓库 Settings → Branches → Add rule:
- Branch name pattern: `main`
- 勾选 `Require a pull request before merging`

效果:本地直接 `git push origin main` 会被 GitHub 拒绝,强制走 PR 流程,防误操作。

## 工作流

### 首次初始化

```bash
# 创建 dev 分支
git checkout -b dev
git push -u origin dev   # 备份到 GitHub
```

### GitHub 仓库设置

在 https://github.com/KaysonWangPengCity/i-wardrobe/settings/branches 添加 main 分支保护规则:
- Branch name pattern: `main`
- 勾选 "Require a pull request before merging"
- 可选:勾选 "Require approvals"(单人项目可省)

### 日常开发循环

```bash
git checkout dev
# ... 修改代码 ...
npm run dev              # 本地预览 localhost:5173
# 确认 OK 后
git add <files> && git commit -m "feat: ..."

# 发布到正式版本
git checkout main
git merge dev            # 本地合并
git push origin main     # 推送,触发 Cloudflare 部署
                         # 注意:受分支保护规则限制,此处需要走 PR 流程
git checkout dev         # 切回 dev 继续开发
```

### 受分支保护后的发布流程

启用分支保护后,本地直接 `git push origin main` 会被拒绝。需改走 PR:

```bash
git checkout dev
git push origin dev      # 推送 dev
# 在 GitHub 网页上创建 dev → main 的 Pull Request
# 审核通过后点击 Merge,触发 main 部署
git checkout main && git pull   # 本地同步最新 main
git checkout dev && git merge main  # dev 同步 main 状态
```

## .env.example 模板

仓库根目录新建 `.env.example`:

```bash
# 复制为 .env.local 并填入实际值
# 这些值仅在本地开发时使用,通过 Settings 页面"载入开发配置"按钮注入
# 生产环境用户通过应用内 Settings 页面自行配置 API Key

# 测试用 AI 服务配置
VITE_TEST_API_KEY=
VITE_TEST_API_BASE_URL=
VITE_TEST_API_PROVIDER=
VITE_TEST_VISION_MODEL=
VITE_TEST_TEXT_MODEL=
VITE_TEST_LOCATION=
```

## Settings 页面"载入开发配置"按钮

### 位置

Settings 页面 API 配置区域顶部,在现有表单上方。

### 显示条件

```tsx
{import.meta.env.DEV && (
  <button onClick={loadDevConfig}>载入开发配置</button>
)}
```

Vite 生产构建时此代码块被自动剔除,生产环境用户看不到此按钮。

### 行为

1. 点击后从 `import.meta.env.VITE_TEST_*` 读取配置
2. 填入 API Key / Base URL / Provider / 视觉模型 / 文本模型 / 地点等字段
3. 保存到 IndexedDB(复用现有 settings 保存逻辑)
4. 显示 toast 提示"开发配置已载入"

### 优点

- 开发时一键载入测试配置,无需每次手动输入
- 生产环境代码被剔除,无安全隐患
- 测试 Key 永不进入 Git 历史

## 实施清单

1. 创建 `dev` 分支并推送到 GitHub
2. GitHub 仓库设置 main 分支保护规则
3. 新建 `.env.example` 文件(根目录)
4. 本地新建 `.env.local` 并填入测试配置(不提交)
5. Settings 页面新增"载入开发配置"按钮(仅 DEV 环境显示)
6. 文档化工作流(本设计文档)

## 不做的事(YAGNI)

- 不引入 preview 部署 URL:用户已选 A 方案,仅本地预览
- 不引入多 feature 分支:单人项目,dev/main 双分支足够
- 不引入 CI 自动化测试:当前构建本地验证即可,后续按需引入
- 不创建第二个仓库:单仓库双分支满足需求
