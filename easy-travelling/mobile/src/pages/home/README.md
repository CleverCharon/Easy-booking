# 首页 (Home Page) 技术归纳文档

## 1. 概述
首页是应用的核心入口，集成了品牌展示、轮播推荐、核心搜索、快捷筛选等多项功能。采用了自定义导航栏与沉浸式 Banner 设计，提供了流畅的酒店搜索体验。

## 2. 功能模块与实现

### 2.1 核心功能
- **自定义导航栏**:
  - 隐藏系统原生导航栏 (`navigationStyle: 'custom'`)。
  - 左侧展示品牌 Logo（使用特殊字体 `"华文新魏"`）。
  - 右侧提供个人中心快捷入口。
- **轮播图 (Banner)**:
  - 顶部大图轮播，支持自动播放与循环。
  - 底部叠加渐变遮罩 (`banner-overlay`)，确保上层内容可读性。
- **搜索筛选卡片**:
  - **Tab 切换**: 国内/海外/钟点房/民宿（目前主要实现国内逻辑）。
  - **城市定位**:
    - 支持点击选择城市（级联选择器）。
    - 支持“我的位置”一键定位（调用 `getLocation` 工具函数）。
  - **关键字搜索**: 输入框支持实时更新搜索关键词。
  - **日期选择**:
    - 展示入住/离店日期及共住晚数。
    - 点击弹出日历组件 (`NutUI Calendar`) 进行范围选择。
  - **客流与价格筛选**:
    - **人数选择**: 弹窗选择房间数、成人数、儿童数。
    - **价格星级**: 弹窗选择价格区间与星级要求（支持多选）。
    - UI 上采用胶囊式标签展示当前选中状态。
  - **快捷标签**: 横向滚动的热门标签（如“亲子”、“海景”），支持点击切换选中状态。
- **开始搜索**:
  - 点击按钮跳转至列表页 (`/pages/list/index`)，并将搜索条件同步至全局 Store。

### 2.2 交互逻辑
- **全局状态管理 (Zustand)**:
  - 页面与 `useSearchStore` 深度绑定，所有的搜索条件（城市、日期、人数、价格等）均存储在全局 Store 中。
  - 这样设计确保了从首页跳转到列表页时，筛选条件能自动透传。
- **级联选择器**:
  - 城市选择使用了 `Cascader` 组件，支持从省份到城市的层级选择。
  - 处理逻辑：优先使用最后一级选中的值（城市），若只选了省份则使用省份名。
- **弹窗管理**:
  - 使用多个 `useState` 控制不同弹窗（日历、城市、人数、价格）的显隐，互不冲突。

## 3. 接口调用

| 接口路径 | 方法 | 描述 | 参数示例 |
| :--- | :--- | :--- | :--- |
| `/banners` | GET | 获取首页轮播图数据 | 无 |
| `/cities` | GET | 获取城市列表（用于定位匹配） | 无 |

## 4. 样式亮点与处理

### 4.1 视觉设计 (SCSS)
- **沉浸式布局**:
  - Banner 高度设为 `190px`，搜索卡片通过 `margin-top` 和 `z-index` 叠加在 Banner 之上，形成层次感。
- **阴影与圆角**:
  - 搜索卡片使用了大圆角 (`18px`) 和 柔和阴影 (`box-shadow: 0 4px 20px rgba(0,0,0,0.1)`)，营造悬浮感。
- **胶囊样式**:
  - 筛选标签（人数、价格）统一采用胶囊形状 (`border-radius: 30px`)，选中态高亮显示。
- **字体**:
  - 品牌 Logo 使用了 `"华文新魏", "STXinwei"`，具有中国风特色。

### 4.2 特殊样式覆盖
- **NutUI 组件样式定制**:
  - 强制覆盖了 `nut-calendar` 和 `nut-popup` 的 `z-index` 为 `2000`，确保弹窗层级高于自定义导航栏。
  - 调整了 Swiper 的高度，确保在不同机型上撑满容器。

## 5. 核心逻辑代码片段

### 5.1 城市定位与状态同步
```typescript
const handleLocation = async () => {
  try {
    Taro.showLoading({ title: '定位中...' })
    // 传入完整城市列表用于匹配经纬度对应的城市名
    const cityName = await getLocation(fullCities)
    if (cityName) {
      setCity(cityName) // 更新全局 Store
    }
  } catch (e) {
    // ... Error handling
  }
}
```

### 5.2 级联选择处理
```typescript
const confirmCity = (values: any[], options: any[]) => {
  // 智能获取最后一级非空选项
  const lastSelected = options && options.length > 0 ? options[options.length - 1] : null;
  const newVal = lastSelected?.text || lastSelected?.value;
  if (newVal) setCity(newVal)
}
```

## 6. 文件结构
- `index.tsx`: 页面主逻辑，包含多个 Popup 组件的渲染与状态控制。
- `index.scss`: 复杂的布局样式定义，特别是 Banner 与搜索卡片的叠加关系。
- `index.config.ts`: 开启自定义导航栏 (`navigationStyle: 'custom'`)。
