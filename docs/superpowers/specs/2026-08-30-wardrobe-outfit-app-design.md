# 衣柜管理 + 每日穿搭推荐应用 · 设计文档

**日期**: 2026-08-30
**状态**: 已确认
**方案**: 方案 1 — 规则生成候选 + AI 重排

***

## 1. 产品定位

一个纯前端移动端 PWA,帮助用户管理衣柜(拍照 + AI 自动打标签入库),并每日根据天气、衣柜库存和用户品味推荐一套四件套穿搭(上装 + 下装 + 外套 + 鞋,外套按天气条件触发)。所有数据本地存储,无账号。

### 1.1 已确认的产品决策

| 决策    | 选择                                |
| ----- | --------------------------------- |
| 平台    | 移动端 PWA(React + Vite + vite-pwa)  |
| 衣物入库  | 拍照 + 视觉 AI 自动打标签 + 人工确认           |
| 推荐逻辑  | 规则过滤 + 候选生成 + AI 重排(方案 1)         |
| 穿搭构成  | 四件套:上装 / 下装 / 外套(按天气) / 鞋子        |
| 数据存储  | 纯本地 IndexedDB(Dexie),无账号无云同步      |
| AI 模型 | 用户自带 API Key,浏览器直调视觉 + 文本接口       |
| 天气    | Open-Meteo 免费 API(无需 Key) + 浏览器定位 |

### 1.2 非目标(明确排除)

* 原生 App(iOS / Android)

* 后端服务 / 用户账号 / 云同步

* 购物记录导入 / 条码扫描

* 配饰推荐(包 / 腰带 / 帽子等)

* 社交分享 / 穿搭社区

* 多端同步

***

## 2. 整体架构

四层架构,自上而下:

```
┌─────────────────────────────────────────────────────────┐
│ UI 层 · React + Vite + vite-pwa                       │
│  今日推荐 · 衣橱浏览 · 拍照入库 · 穿搭历史 · 设置       │
├─────────────────────────────────────────────────────────┤
│ Domain 引擎层(纯 TS,可单测,零 IO)                     │
│  Tagger · RecommendationEngine · AffinityStore         │
├─────────────────────────────────────────────────────────┤
│ Service 适配层(隔离外部依赖,便于 mock)                 │
│  StorageService · AIService · WeatherService            │
├─────────────────────────────────────────────────────────┤
│ 持久化 + 外部                                          │
│ IndexedDB(Dexie) · AI API(用户 Key) · Open-Meteo       │
└─────────────────────────────────────────────────────────┘
```

### 2.1 关键设计原则

1. **引擎层纯函数** — 天气过滤 / 候选生成 / 亲和分计算不碰 IO,输入天气 + 衣橱 + 历史,输出候选,易测试易调试。
2. **Service 层隔离外部** — AI / 天气 / 存储都是 TypeScript 接口,测试时换 mock,真实环境换实现。
3. **本地优先** — 所有数据在 IndexedDB,离线可用;API Key 存本地 settings 表,不出浏览器。

***

## 3. 技术栈

| 层     | 选型                                       | 理由                                         |
| ----- | ---------------------------------------- | ------------------------------------------ |
| 构建    | Vite + React + TypeScript                | PWA 社区标准,TS 为纯函数引擎提供类型安全                   |
| PWA   | vite-plugin-pwa + Workbox                | Service Worker 离线缓存资源                      |
| 路由    | React Router                             | 页面切换 + 深链                                  |
| 状态    | Zustand                                  | 轻量,够用                                      |
| 本地存储  | Dexie(IndexedDB 封装)                      | IndexedDB 能力强,Dexie 提供类 SQL API            |
| 样式    | Tailwind CSS + shadcn/ui                 | 移动端友好,组件可复用                                |
| 天气    | Open-Meteo                               | 免费、无需 Key、覆盖全球                             |
| AI 视觉 | 用户自选(OpenAI GPT-4o / 通义万相 / 智谱 GLM-4V 等) | 浏览器直调 Chat Completions 接口,user API key 存本地 |
| AI 文本 | 同上提供商的文本模型                               | 浏览器直调,重排候选                                 |
| 测试    | Vitest + React Testing Library           | 引擎层 vitest 单测,UI 组件 RTL                    |
| 部署    | 静态文件托管(Vercel / Netlify / GitHub Pages)  | 纯前端,随便放                                    |

***

## 4. 数据模型

6 张表,全部存 IndexedDB,通过 Dexie 管理。

### 4.1 items — 衣物单品

| 字段            | 类型        | 说明                                                   |
| ------------- | --------- | ---------------------------------------------------- |
| id            | string    | UUID                                                 |
| imageBlob     | Blob      | 原图像二进制                                               |
| thumbnailBlob | Blob      | 压缩缩略图(200×200),列表用                                   |
| category      | enum      | Top / Bottom / Outerwear / Shoes                     |
| subCategory   | string    | T恤 / 衬衫 / 牛仔裤 / 西装 / 运动鞋 …                           |
| color         | string    | 主色,标准化为英文色名(navy-blue / khaki …)                     |
| colorHex      | string    | 主色十六进制,用于色彩兼容计算                                      |
| season        | string\[] | spring / summer / autumn / winter(可多选)               |
| thickness     | 1-5       | 1=薄 / 5=厚,对应温度区间                                     |
| pattern       | enum      | solid / stripe / plaid / print                       |
| style         | string\[] | casual / formal / street / business / vintage …(可多选) |
| brand         | string?   | 可选                                                   |
| material      | string?   | 可选                                                   |
| createdAt     | number    | 时间戳                                                  |
| lastWornAt    | number?   | 上次穿着时间戳                                              |
| wearCount     | number    | 累计穿着次数                                               |
| affinityScore | number    | 用户对这件的偏好分(-10 \~ +10),初始 0                           |
| discarded     | boolean   | 是否标记丢弃,默认 false                                      |

**索引**: `category`, `color`, `season`(multi-entry)

### 4.2 outfits — 穿搭快照

每次推荐产出一条,含用户反馈。

| 字段        | 类型                  | 说明                                                    |
| --------- | ------------------- | ----------------------------------------------------- |
| id        | string              | UUID                                                  |
| date      | string              | YYYY-MM-DD,唯一                                         |
| itemIds   | (string \| null)\[] | 按\[top, bottom, outerwear, shoes]顺序,无外套槽为 null,长度恒为 4 |
| reason    | string              | AI 生成的推荐理由                                            |
| aiRanking | number              | AI 重排后的名次(1 = 最优)                                     |
| weather   | object              | `{ tempHi, tempLo, condition, icon }` 快照              |
| feedback  | enum                | liked / disliked / neutral,默认 neutral                 |
| worn      | boolean             | 用户标记"实际穿了",默认 false                                   |
| createdAt | number              | 时间戳                                                   |

### 4.3 wearLog — 实际穿着记录

用于轮换逻辑(避免近期重复穿同一件)。

| 字段        | 类型        | 说明                            |
| --------- | --------- | ----------------------------- |
| id        | string    | UUID                          |
| date      | string    | YYYY-MM-DD                    |
| itemIds   | string\[] | 当天实际穿的 item ids               |
| eventType | enum      | worn / dryCleaned / discarded |
| createdAt | number    | 时间戳                           |

### 4.4 styleProfile — 风格画像

单条记录(id 固定为 "default")。

| 字段              | 类型        | 说明                   |
| --------------- | --------- | -------------------- |
| id              | string    | "default"            |
| preferredStyles | string\[] | 偏好的风格标签              |
| colorPalette    | string\[] | 偏好色列表                |
| avoidedColors   | string\[] | 避免色列表                |
| warmthBias      | 0-1       | 0=偏怕冷 / 1=偏怕热,默认 0.5 |
| notes           | string    | 用户自由描述的风格备注,如"不要太紧身" |

### 4.5 settings — 用户配置

单条记录(id 固定为 "default")。

| 字段               | 类型         | 说明                                        |
| ---------------- | ---------- | ----------------------------------------- |
| id               | string     | "default"                                 |
| apiKey           | string     | 用户 AI API Key,localStorage 级保护            |
| apiProvider      | string     | 提供商标识(openai / qwen / zhipu / custom)     |
| apiBaseUrl       | string     | 可选,自定义 endpoint                           |
| visionModel      | string     | 视觉模型名                                     |
| textModel        | string     | 文本模型名                                     |
| location         | string?    | 用户输入的城市,优先于自动定位                           |
| units            | enum       | metric / imperial,默认 metric               |
| notificationTime | string     | HH:mm,默认 "07:30"                          |
| outfitComponents | boolean\[] | \[top, bottom, outerwear, shoes],默认全 true |

### 4.6 weatherCache — 天气缓存

| 字段        | 类型     | 说明                 |
| --------- | ------ | ------------------ |
| date      | string | YYYY-MM-DD,主键      |
| location  | string | 城市名                |
| tempHi    | number | 当日最高温(°C)          |
| tempLo    | number | 当日最低温(°C)          |
| condition | string | 晴 / 多云 / 雨 / 雪 …   |
| icon      | string | Open-Meteo WMO 图标码 |
| fetchedAt | number | 时间戳,超过 12h 过期      |

***

## 5. 每日推荐流水线(方案 1 详述)

从"早晨打开应用"到"看到今日穿搭"共 5 步。引擎层全部纯函数,输入 → 输出,可独立单测。

### Step 1 · 获取天气(Service 层)

```
WeatherService.fetchToday(location) → Weather { tempHi, tempLo, condition }
```

* 调 Open-Meteo `/v1/forecast` + `/geocoding` 两个端点

* 结果写 weatherCache,12h 内读缓存

* 失败时回退:用本地上次天气 + 标记 stale

### Step 2 · 规则过滤(引擎层,纯函数)

```
filterByWeather(items, weather, season) → FilteredItems
```

过滤规则(硬约束,不可绕过):

* `discarded === false`

* `season` 包含当前季节或相邻季节(如 8 月允许 summer + autumn)

* `thickness` 与温度区间匹配:温度越高,允许的 thickness 上限越低

* 按 category 分桶:topItems / bottomItems / outerwearItems / shoesItems

### Step 3 · 候选组合生成(引擎层,纯函数)

```
generateCandidates(filtered, wearLog, styleProfile, count=20) → OutfitCandidate[]
```

**枚举**:对四个桶做笛卡尔积,但外套桶**允许为空**(外层枚举时对空外套桶传 null 槽位,不是跳过整个组合):

* top / bottom / shoes 任一桶为空 → 整个组合跳过(无外套可选但其他三件不可缺)

* outerwear 桶为空 / 天气不需外套 → 该槽位传 null,组合照常参与打分

* 近期穿过:单品 `lastWornAt` 在近 N 天内(N 可配置,默认 3)时,该组合扣分

**打分公式**:

```
score = colorHarmony × 0.35
      + categoryFit × 0.25
      + rotationScore × 0.2
      + affinityScore × 0.1
      + styleMatch × 0.1
```

* **colorHarmony**:基于色彩兼容表(互补色 / 邻近色 / 黑白灰百搭),输出 0-1

* **categoryFit**:上-下 / 上-外套 / 下-鞋 品类配对规则(如 西装+皮鞋 得分 > 西装+运动鞋)

* **rotationScore**:`max(0, lastWornDays - 3) / 7`,越久没穿分越高;新物品分 0.5

* **affinityScore**:四件单品的 affinityScore 之和归一化

* **styleMatch**:与 styleProfile.preferredStyles / colorPalette 的匹配度

取 Top 20 候选,进入 AI 重排。

### Step 4 · AI 重排(Service + 引擎)

```
AIService.rankOutfits(candidates, weather, styleProfile, wearLogRecent7d) → RankedOutfit[]
```

Prompt 构造:

```
你是一名穿搭顾问。今天天气:晴,26°/19°,北京。
候选穿搭共 20 套,每套含 4 件:[上装,下装,外套(可能为空),鞋子]。
请选出最优 3 套,按推荐度排序,并给每套一句推荐理由。
输出 JSON: { ranked: [{ index, reason }], bestMatch: number }
候选清单:
1. 藏青T恤(Top, solid, navy-blue, casual) + 卡其短裤(Bottom, khaki, casual) + null + 白鞋(Shoes, white, casual)
2. ...
用户风格偏好:prefer casual, avoid neon colors, warmth bias 0.5
近 7 天已穿:8/29 黑卫衣+灰牛仔,8/28 白T恤+卡其裤
```

解析 LLM JSON 输出,更新 aiRanking 字段。失败时回退到规则打分第一名。

### Step 5 · 展示 + 记录 + 反馈

* 渲染今日推荐卡片

* 用户可点:👍 喜欢 / 🔄 换一套(按顺序展示 AI 返回的 Top 3;用完后重新跑 Step 3-4,取 Top 20) / ✓ 穿了

* 反馈写回 outfit.feedback / outfit.worn,并更新每件单品的 affinityScore

**affinityScore 更新规则**:

* `worn=true`:每单品 +1

* `feedback=liked`:每单品 +2

* `feedback=disliked`:每单品 -2

* 指数衰减:每次更新后,所有 affinityScore 乘 0.98(避免极端值)

***

## 6. 拍照入库流程

```
拍照 → 视觉 AI 识别 → 人工确认修正 → 入 items 表
```

**Step 1 · 拍照/选图** — 原生 `<input type="file" capture="environment">` 调后置摄像头,或从相册选。支持裁剪/旋转。图片压缩到 1280×1280 以内再上传,省 token。

**Step 2 · AI 视觉识别** — 调 Chat Completions,把图片(base64)发给视觉模型。Prompt 约束输出严格 JSON:

```
请识别这件衣物,输出 JSON:
{
  "category": "Top|Bottom|Outerwear|Shoes",
  "subCategory": "具体品类(如 T恤/衬衫/牛仔裤)",
  "color": "主色英文名",
  "colorHex": "#rrggbb",
  "season": ["spring","summer","autumn","winter"],
  "thickness": 1-5,
  "pattern": "solid|stripe|plaid|print",
  "style": ["casual|formal|street|business|vintage"],
  "confidence": 0-1
}
```

* `confidence < 0.6` 的字段标记为"不确定",UI 上高亮提醒用户确认

* 图片 blob 同时存进 thumbnail 字段(200×200 压缩)

**Step 3 · 人工确认** — 表单预填 AI 结果,字段可改。UI 上:

* 左侧显示图片 + 缩略图切换

* 右侧显示可编辑字段:品类(下拉)、颜色(预设色板 + 取色器)、季节(多选)、厚度(滑块)、风格(多选)

* 不确定的字段标黄

* 确认后写入 items 表

***

## 7. 关键页面(移动端,底部 Tab 导航)

### 7.1 今日推荐(首页)

* 顶部:日期 + 城市 + 天气条(温度 / 图标)

* 中部:四件套网格(2×2),无外套槽位显示"(无需)"

* 推荐理由卡片(AI 生成,黄色高亮条)

* 底部操作栏:👍 喜欢 / 🔄 换一套 / ✓ 穿了

* 下拉刷新 = 重新获取天气 + 重跑推荐

### 7.2 衣橱浏览

* 顶部分类 Tab:全部 / 上装 / 下装 / 外套 / 鞋子

* 网格视图(3 列,缩略图)

* 点击单品 → 详情页:大图、AI 识别标签、穿着历史、亲和分、删除/丢弃

* 右上角"+"按钮 → 跳拍照入库

### 7.3 拍照入库

* 全屏相机视图 / 选图按钮

* AI 加载动画 → 显示预填表单

* 保存后跳回衣橱(定位到新物品)

### 7.4 穿搭历史

* 时间线视图,按周分组

* 每条:日期 + 小图 + 单品摘要 + 天气 + 用户反馈图标

* 点击 → 查看当日 outfit 详情 + 每件单品的跳转

### 7.5 设置

* AI 服务:提供商选择 + API Key(密码类型) + 模型下拉 + 测试连接按钮

* 位置:自动定位(浏览器 geolocation) + 手动输入城市

* 穿搭构成:四件套勾选(外套默认"按天气")

* 通知:时间设置 + PWA 推送权限申请

* 数据:导出备份(JSON 文件下载) + 导入备份(选文件) + 清空数据(二次确认)

### 7.6 底部 Tab 导航

```
🏠 今日  ·  👗 衣橱  ·  📷 拍照  ·  📅 历史  ·  ⚙️ 设置
```

拍照 Tab 居中、加大、高亮色,强调入口。

***

## 8. Service 接口定义

```typescript
// AIService 接口
interface AIService {
  tagImage(imageBlob: Blob): Promise<ItemTagResult>;
  rankOutfits(
    candidates: OutfitCandidate[],
    weather: Weather,
    styleProfile: StyleProfile,
    recentWearLog: WearLogEntry[]
  ): Promise<RankedOutfit[]>;
}

// WeatherService 接口
interface WeatherService {
  fetchToday(location: string): Promise<Weather>;
  geocode(city: string): Promise<{ lat: number; lon: number; city: string }>;
}

// StorageService 接口(薄封装,主要暴露 Dexie collection)
interface StorageService {
  items: Dexie.Table<Item, string>;
  outfits: Dexie.Table<Outfit, string>;
  wearLog: Dexie.Table<WearLogEntry, string>;
  styleProfile: Dexie.Table<StyleProfile, string>;
  settings: Dexie.Table<Settings, string>;
  weatherCache: Dexie.Table<WeatherCache, string>;
  export(): Promise<BackupJSON>;
  import(data: BackupJSON): Promise<void>;
  clear(): Promise<void>;
}
```

***

## 9. 错误处理

| 场景            | 处理                                          |
| ------------- | ------------------------------------------- |
| AI API Key 缺失 | 设置页红色横幅提示 + 今日推荐页"先去设置填写 API Key"按钮         |
| AI API 调用失败   | 视觉识别:重试 1 次,仍失败则给空白表单让用户手动填;重排:回退到规则打分第一名   |
| 天气获取失败        | 读 weatherCache 中最近一次,标记 stale;再失败则让用户手动输入温度 |
| 本地存储满         | IndexedDB 配额超额时 catch,提示用户清理旧照片或导出备份        |
| 图片过大          | 上传前压缩到 1280px,thumbnail 压缩到 200px           |
| 衣橱单品不足        | 分类桶 < 2 件时,推荐页提示"请多录入一些 X 类单品"              |
| 用户未授权定位       | 回退到上次设置的城市或让用户手动输入                          |

***

## 10. 测试策略

* **引擎层(核心)** — Vitest 单元测试,100% 覆盖:

  * `filterByWeather`:各季节 / 厚度边界条件

  * `generateCandidates`:打分公式各权重、轮换逻辑、色彩兼容表案例

  * affinityScore 更新规则

* **Service 层** — Vitest + MSW mock 外部 API 响应

* **UI 组件** — RTL 组件测试,关键交互(点赞/换掉/保存)

* **集成** — 在真机 / Chrome DevTools 模拟 PWA 完整跑一遍:入库 → 推荐 → 反馈 → 历史记录

***

## 11. 安全与隐私

* 所有数据仅存浏览器 IndexedDB,永远不上传服务器

* API Key 存 localStorage,UI 上以密码类型显示,不输出到日志

* 备份文件为纯 JSON,不含敏感信息(API Key 除外,建议导入前脱敏)

* 无第三方追踪 / 分析 SDK

***

## 12. 后续可扩展(不在本次实现)

* 色彩兼容表升级为 embedding 相似度匹配

* "不喜欢"点击后立即更新 styleProfile.avoidedColors

* 手动保存穿搭为"经典搭配集",推荐时优先复用

* 配饰(包/腰带/帽子)作为可选第五件

* 基于地理位置的场所推荐(职场 / 约会 / 运动)

* Service Worker 推送 + 后台定时刷新天气与推荐

