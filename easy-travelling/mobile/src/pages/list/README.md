# 列表页 (List Page) 技术归纳文档

## 1. 概述
列表页是用户浏览和筛选酒店的核心承载页面。它接收来自首页的搜索条件，展示符合要求的酒店列表，并提供进一步的筛选、排序及收藏功能。

## 2. 功能模块与实现

### 2.1 核心功能
- **搜索状态同步**:
  - 页面加载时自动从全局 Store (`useSearchStore`) 读取 `city`, `startDate`, `endDate`, `keyword` 等条件。
  - 顶部展示搜索摘要（城市、日期范围、关键字），支持直接修改关键字触发重新搜索。
- **酒店列表展示**:
  - **卡片式布局**: 展示酒店封面、名称、评分、标签、距离及价格。
  - **库存提示**: 左上角 Badge 显示剩余库存数（如“剩余2间”）或“可预订”。
  - **收藏功能**: 卡片右上角提供爱心按钮，支持一键收藏/取消收藏（需登录）。
  - **骨架屏**: 数据加载时展示 Skeleton 占位图，提升体验。
- **多维筛选**:
  - **顶部筛选栏**: 提供“位置”、“价格/星级”、“人数/房间”、“筛选”四个快捷入口。
  - **横向滚动 Chips**: 快速筛选特定标签（如“免费停车”、“含早餐”）。
  - **底部弹窗筛选**: 
    - 价格区间选择（支持自定义范围预设）。
    - 星级多选（经济/舒适/高档/豪华）。
    - 底部展示“查看X家”按钮，实时反馈筛选结果数量。
- **下拉刷新**:
  - 触发 `usePullDownRefresh`，重新并发加载酒店列表和用户收藏状态。

### 2.2 交互逻辑
- **前端过滤**:
  - 列表数据加载后，部分筛选逻辑（如标签筛选、价格区间二次过滤）在前端通过 `useMemo` 实现，减少后端请求压力。
  - `keyword` 支持同时匹配酒店名、地址或标签。
- **收藏同步**:
  - 页面加载时并行请求 `/favorites/list`，将当前用户的收藏状态同步到本地 Store。
  - 点击收藏时，先乐观更新 UI（即时变色），再发送网络请求；若请求失败则回滚状态。
- **预订跳转**:
  - 点击“预订”按钮或卡片本身，跳转至详情页，并自动携带当前选中的入住/离店日期。

## 3. 接口调用

| 接口路径 | 方法 | 描述 | 参数示例 |
| :--- | :--- | :--- | :--- |
| `/hotels` | GET | 搜索酒店列表 | `city_name=...&keyword=...&check_in_date=...` |
| `/favorites/list` | GET | 获取用户收藏列表（用于回显爱心状态） | `user_id=...` |
| `/favorites/add` | POST | 添加收藏 | `{ user_id, hotel_id }` |
| `/favorites/remove` | POST | 取消收藏 | `{ user_id, hotel_id }` |

## 4. 样式亮点与处理

### 4.1 视觉设计 (SCSS)
- **头部吸顶**:
  - `.list-header` 固定在顶部，包含搜索摘要和地图入口。
  - 下方连接 `.filter-bar` 和 `.chips-scroll`，形成完整的筛选控制区。
- **卡片交互**:
  - 酒店卡片添加了点击反馈效果 (`transform: translateY(-2px)`)，增强操作感。
  - 价格区域采用主色调渐变按钮 (`linear-gradient`)，引导点击。
- **标签排版**:
  - 酒店标签 (`.tag`) 采用单行滚动或换行布局，字体颜色淡雅，避免视觉杂乱。

### 4.2 特殊处理
- **数据标准化**:
  - 类似于收藏页，列表页也实现了 `normalizeTags` 和数据映射逻辑，将后端返回的 `min_price`/`price`、`main_image`/`image_url` 等字段统一为前端模型。
- **日期计算**:
  - 使用 `dayjs` 计算入住晚数 (`nights`)，并在顶部摘要中清晰展示。

## 5. 核心逻辑代码片段

### 5.1 复合筛选逻辑 (`useMemo`)
```typescript
const filteredList = useMemo(() => {
  let result = [...list]
  // 1. 关键字匹配（名称/地址/标签）
  if (keyword.trim()) {
    const key = keyword.trim()
    result = result.filter((h) => h.name.includes(key) || h.location?.includes(key) || h.tags.some((t) => t.includes(key)))
  }
  // 2. 价格区间过滤
  if (minPrice > 0 || maxPrice < 10000) {
    result = result.filter((h) => h.price >= minPrice && h.price <= maxPrice)
  }
  // 3. 标签交集过滤
  if (selectedFilters.length > 0) {
    result = result.filter((h) => selectedFilters.every((tag) => h.tags.includes(tag)))
  }
  return result
}, [keyword, list, maxPrice, minPrice, selectedFilters, starLevels])
```

## 6. 文件结构
- `index.tsx`: 页面主逻辑，包含列表渲染、筛选逻辑、收藏交互。
- `index.scss`: 样式定义，包含骨架屏样式、卡片样式、弹窗样式。
- `index.config.ts`: 开启下拉刷新 (`enablePullDownRefresh: true`)。
