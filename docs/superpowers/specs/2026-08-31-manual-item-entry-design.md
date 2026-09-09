# 设计规格:手动录入衣物(Spec v1)

日期:2026-08-31
状态:待用户审阅
范围:衣柜管理应用现有 Capture 页扩展,不涉及今日推荐、衣橱浏览、历史、设置

## 1. 目标与背景

当前版本仅支持「拍照→AI 识别→确认入库」一条路径。在云端沙箱、无摄像头设备、只想快速批量添加等场景下无法使用。本次新增**手动录入衣物**的路径,要求:

* 不在底部导航加第 6 项、不新增路由页面

* 与拍照流程共用字段表单、保存逻辑、校验规则

* **录入门槛极低**:最少 3 次点击即可加入衣橱(必填 3 项,其余默认)

* 无图片时自动生成**可识别的颜色+emoji 占位图**,确保衣橱网格视觉可用

## 2. 方案总结(决策记录)

| 决策项    | 选择                                         | 理由                     |
| ------ | ------------------------------------------ | ---------------------- |
| 入口位置   | 方案 A:Capture 页顶部双 Tab(📷 拍照 / ✏️ 手动)       | 改动最小、导航栏不变、代码复用最高、发现性高 |
| 子分类控件  | Category → subCategory 联动下拉(4 大类×各自 6-7 项) | 保证数据一致、避免自由输入的错字/别名    |
| 占位图生成  | 方案 A:色值填画布 + 中心大号子品类 emoji                 | 不依赖外部、一眼就能辨识颜色与品类      |
| 必填字段策略 | 方案 A:仅 Category + color + colorHex 必填      | 快速录入优先,之后在衣橱编辑页修改细节    |

## 3. 入口与状态机设计(Capture.tsx 改造)

### 3.1 新增 state

```ts
mode: 'photo' | 'manual'   // 拍照 Tab  vs  手动 Tab
```

默认 `'photo'`,保持现有用户习惯不变。

### 3.2 Tab 切换

* 标题「拍照入库」下方放一个 Segmented Control(2 段),选中态品牌色填充。

* 切换 `mode` 时**重置所有草稿状态**:`step = 'idle'`(photo) 或 `step = 'confirm'`(manual);清空 `imageBlob`、`previewUrl`、`tagged`、`form`、`error`。

* 切换不触发导航(同一路由 `/capture`)。

### 3.3 状态机分支

```
mode='photo'  →  idle → preview → tagging → confirm
mode='manual' →  直接 confirm(单页表单)
```

两个分支在 `confirm` 步渲染**同一张** **`<ItemForm>`** **组件**,仅头部(图片区域)和保存时 `imageBlob` 来源不同。

### 3.4 共用提取:`<ItemForm>` 新组件

* 位置:`src/components/ItemForm.tsx`

* Props:

  * `form: Partial<ItemTagResult>` — 受控 form 值

  * `setForm: (patch: Partial<ItemTagResult>) => void` — 受控更新

  * `mode: 'photo' | 'manual'` — 仅用于提示文案差异

  * `subCategoryOptions: Array<{ key: string; label: string; emoji: string }>` — 手动模式下拉选项;拍照模式下仍显示(方便校正 AI 结果)

* 内容(与现 Capture.tsx confirm 区域一致,只是从内联搬到组件):

  * Category 4 按钮组(必填·高亮)

  * subCategory `<select>` 下拉(联动 Category,见 §4)

  * 颜色 text + colorHex `<input type=color>` 并排

  * 厚度 range 滑块 1-5,附刻度文案

  * 季节 4 选多(chips,当前月份默认预勾 2 个,见 §6)

  * 风格 7 选多(chips,默认勾 casual)

  * 图案 pattern 下拉:solid / stripe / plaid / print(之前没加,补上)

## 4. 子分类联动常量

新文件 `src/constants/category.ts`:

```ts
import type { Category } from '@/types'

export interface SubCategoryOpt { key: string; label: string; emoji: string }

export const SUB_CATEGORY_MAP: Record<Category, SubCategoryOpt[]> = {
  Top: [
    { key: 't-shirt',   label: 'T恤',         emoji: '👕' },
    { key: 'shirt',     label: '衬衫',        emoji: '👔' },
    { key: 'hoodie',    label: '卫衣',        emoji: '🧥' },
    { key: 'sweater',   label: '毛衣/针织衫',   emoji: '🧶' },
    { key: 'polo',      label: 'POLO 衫',     emoji: '👕' },
    { key: 'tank',      label: '背心/吊带',    emoji: '🎽' },
    { key: 'blouse',    label: '雪纺/衬衫女',   emoji: '👚' },
  ],
  Bottom: [
    { key: 'jeans',     label: '牛仔裤',       emoji: '👖' },
    { key: 'chino',     label: '休闲裤',       emoji: '👖' },
    { key: 'trousers',  label: '西裤',         emoji: '👖' },
    { key: 'shorts',    label: '短裤',         emoji: '🩳' },
    { key: 'skirt',     label: '半裙',         emoji: '👗' },
    { key: 'dress-pants',label: '连衣裙/连体裤', emoji: '👗' },
  ],
  Outerwear: [
    { key: 'denim-jacket', label: '牛仔外套',  emoji: '🧥' },
    { key: 'windbreaker',  label: '风衣',     emoji: '🧥' },
    { key: 'blazer',       label: '西装',     emoji: '🧥' },
    { key: 'down',         label: '羽绒服',   emoji: '🧥' },
    { key: 'coat',         label: '毛呢大衣',  emoji: '🧥' },
    { key: 'cardigan',     label: '开衫',     emoji: '🧶' },
    { key: 'bomber',       label: '飞行员夹克', emoji: '🧥' },
  ],
  Shoes: [
    { key: 'sneakers',    label: '运动鞋',    emoji: '👟' },
    { key: 'dress-shoes', label: '皮鞋',     emoji: '👞' },
    { key: 'boots',       label: '短靴/长靴', emoji: '👢' },
    { key: 'sandals',     label: '凉鞋',     emoji: '🩴' },
    { key: 'heels',       label: '高跟鞋',    emoji: '👠' },
    { key: 'flats',       label: '平底鞋',    emoji: '👡' },
    { key: 'canvas',      label: '帆布鞋',    emoji: '👟' },
  ],
}

export const CATEGORY_LABEL: Record<Category, string> = {
  Top: '上装', Bottom: '下装', Outerwear: '外套', Shoes: '鞋子',
}
```

### 联动与默认值

* `form.category` 一变 → `SUB_CATEGORY_MAP[category]` 切下拉数组 → `form.subCategory` 默认设为数组第一个 `label`。

* 拍照模式下,AI 返回的 `tagged.subCategory` 做**归一匹配**(忽略大小写/空格/中划线):若命中 `label` 或 `key`,就把下拉选中它;否则保留原值写入下拉旁边的自由输入兜底(§4.1 兜底描述)。

### 4.1 兼容兜底

为防止 AI 返回「羽绒服」与常量「羽绒服」字面值一致但无法匹配的边缘情况,子分类实际用 \*\*`<select>` + 可选「自定义」\*\*实现。下拉最末一项为 `{ key: '__custom', label: '自定义…' }`;选中该项时旁边出现 `<Input placeholder="手动输入子分类">`,其值写入 `form.subCategory`。

## 5. 占位图生成(无图片时的 imageBlob)

新文件 `src/lib/placeholder.ts`:

```ts
/**
 * 根据颜色与 emoji 生成一张 JPEG 占位图。
 * canvas=640x640,背景填 colorHex,中心画大号 emoji(180px),底部画 24px subCategoryLabel。
 * 文字颜色:按 colorHex 亮度自动取黑(#111)或白(#fff)。
 * 对比度不足时可叠加 1px 文字描边保障可读。
 */
export async function makePlaceholderBlob(
  colorHex: string,
  emoji: string,
  subCategoryLabel: string,
  size = 640,
): Promise<Blob>
```

内部工具函数:

* `hexLuminance(hex: string): number` 返回 0-1(<https://www.w3.org/WAI/ER/WD-AERT/#color-contrast> 公式)

* `makeThumbnail` 复用 `src/lib/image.ts` 现有实现

### 手动模式的图片卡片

confirm 表单顶部放「📷 图片(可选)」卡片:

* 左半:实时预览**当前 form 的占位图**(直接渲染 `<canvas>`,不转 Blob)。色值或子分类改变,canvas 立即重绘。

* 右半:两个按钮——

  1. **📁 选择图片**(`<input type=file accept=image/* hidden>`):若选了,就走和拍照模式一样的 `resizeImage`→真实图片预览→缩略图→忽略占位生成器。
  2. **🧹 清除用占位**(选了图片后才出现):恢复占位模式。

## 6. 字段默认值与最少必填策略

| 字段            | 手动初始值                                   | 必填? | 来源/说明                |
| ------------- | --------------------------------------- | --- | -------------------- |
| `category`    | Top(Category 按钮组高亮上装)                   | 是   | 用户切换后即时生效            |
| `subCategory` | `SUB_CATEGORY_MAP[category][0].label`   | 否   | 随 category 联动自动设为第一项 |
| `color`       | navy-blue                               | 是   | <br />               |
| `colorHex`    | `#1e3a8a`(藏蓝)                           | 是   | `<input type=color>` |
| `season[]`    | 按月份:1-2→秋冬 3-4→春秋 5-7→夏 8-9→春秋 10-12→秋冬 | 否   | 预勾 2 季               |
| `thickness`   | 2 / 5                                   | 否   | 滑块                   |
| `pattern`     | solid                                   | 否   | 下拉 4 项               |
| `style[]`     | \['casual']                             | 否   | chips                |

### 保存前补齐(与拍照模式共用的 `finalizeItemForm` 辅助函数)

任一缺失字段按上表默认值补齐。这样:**无论手动模式还是拍照失败回退模式,最终入库都有一份完整 Item**,不会出现 undefined 字段。

保存时只做**三项硬校验**(alert 提示后不跳转):

1. `category` 非空
2. `color` 非空
3. `colorHex` 非空

`imageBlob`:手动模式下**一定非空**——要么用户选了真实图片,要么调用 `makePlaceholderBlob()` 生成。

## 7. 保存流程与共用逻辑

现有 Capture.tsx 中的 `saveItem()` 改造成两种模式通用:

```
saveItem()
  │
  ├─ 跑 finalizeFormDefaults(form) → 缺失项补默认
  │
  ├─ 拿到最终 imageBlob:
  │    if photo mode  →  用已有的 imageBlob(必须已存在,否则 alert)
  │    if manual mode →  if 用户选了真实图 → 用真实图
  │                      else → 用 makePlaceholderBlob(colorHex, emoji, subLabel)
  │
  ├─ thumbnailBlob = makeThumbnail(imageBlob)
  │
  ├─ 拼 Item 对象(与原有一致)
  │
  ├─ db.items.add(item)
  │
  ├─ alert('已加入衣橱!') + navigate('/wardrobe')
```

**ItemForm 组件与保存函数解耦**:ItemForm 只管显示/修改 `form`;保存逻辑仍在 Capture.tsx。这样拍照和手动模式都可以用同一个 ItemForm,保存前后可加各自特有动作(比如手动模式下自动记录"录入方式=manual")。

## 8. 文件改动清单

### 新增

* `src/constants/category.ts` — SUB\_CATEGORY\_MAP 常量 + 接口

* `src/lib/placeholder.ts` — makePlaceholderBlob + hexLuminance

* `src/components/ItemForm.tsx` — 共用字段表单组件(把 Capture.tsx 的 confirm 表单卡片搬到这里)

### 修改

* `src/pages/Capture.tsx`:

  * 顶部加双 Tab Segmented(`mode` 状态)

  * 引入 `SUB_CATEGORY_MAP` 做联动

  * 把原 confirm 内联表单替换为 `<ItemForm>`

  * manual 分支:直接 `step = 'confirm'` + 图片可选卡片 + `finalizeFormDefaults`

  * `saveItem()` 按 §7 改为双分支拿到 imageBlob

  * 新增 `finalizeFormDefaults(form, mode)` 辅助函数

* `src/types/index.ts`(可选):若要区分录入来源,可给 `Item` 加 `source?: 'photo' | 'manual'` 字段。**本次不做**,保持简单,后续需要再加不破坏存量数据。

## 9. 验证方式(自测用例)

1. **手动快速添加**:打开 Capture → 切 ✏️ 手动 → 不改任何字段 → 直接点「保存」 → 跳转到衣橱页,能看到一件藏蓝色 👕 T恤。
2. **改颜色看预览**:切手动后拖动 color picker → 预览区的背景色应该实时变化;切子分类 → 中央 emoji 变化。
3. **选图片覆盖占位**:切手动 → 点「选择图片」选本地图 → 预览变成真实图片 → 保存 → 衣橱里显示真实图,不是占位。
4. **Category 联动**:切 Category → 子分类下拉数组和默认值同步切换,不会残留旧大类的子分类。
5. **拍照流程无回归**:旧的「选图→AI 识别→确认」完整走通一遍,ItemForm 显示 AI 识别结果,可以调整。
6. **最少必填**:删除 color 值 → 点保存 → alert 提示,不入库。
7. **月份预勾季节**:改系统月份,验证 season 预勾符合 §6 表格(或在代码里写个单测 mock new Date)。

## 10. 不在本次范围(后续可加)

* 批量手动导入 CSV/JSON

* 录入来源 `source` 字段 + 衣橱筛选「只看手动录入的」

* 占位图切换为渐变色/纹理(方案 B)

* 手动录入后补图功能按钮(方案 C)

* 子分类下拉搜索框(数据量目前 6-7 项/类,暂不需要)

