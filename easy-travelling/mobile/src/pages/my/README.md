# 个人中心页 (My Page) 技术归纳文档

## 1. 概述
个人中心页是用户管理个人信息、订单、收藏及设置的聚合入口。采用了自定义导航栏设计，根据登录状态展示不同的 UI 形态，并提供了便捷的功能入口。

## 2. 功能模块与实现

### 2.1 核心功能
- **自定义导航栏**:
  - 初始背景透明，随着页面滚动（超过 10px）渐变为白色毛玻璃效果 (`backdrop-filter`)。
  - 标题“我的”使用品牌字体 (`"华文新魏"`)，增强视觉识别度。
- **用户信息卡片**:
  - **已登录态**: 展示用户头像（首字母）和用户名。
  - **未登录态**: 展示默认头像和登录引导文案，点击跳转登录页。
- **功能宫格 (Grid)**:
  - 提供“酒店订单”和“我的收藏”两个核心入口。
  - 支持 `Taro.switchTab` (针对 Tab 页) 和 `Taro.navigateTo` (针对普通页) 两种跳转方式。
- **设置菜单**:
  - 仅在登录态下显示。
  - 提供“退出登录”功能，点击后弹出二次确认框。

### 2.2 交互逻辑
- **登录状态管理**:
  - 通过 `useUserStore` 获取全局 `isLogin` 和 `userInfo`。
  - 未登录点击头像区域自动跳转登录页。
- **滚动交互**:
  - 使用 `usePageScroll` 监听页面滚动事件，动态更新 `scrollTop` 状态，控制导航栏样式的切换。
- **退出登录**:
  - 调用 `logout()` 清除全局用户状态。
  - 弹出 `Toast` 提示用户已退出。

## 3. 接口调用
本页面主要依赖全局 Store 数据，不直接调用后端接口。
- **依赖 Store**: `useUserStore` (用户信息、登录/退出方法)。

## 4. 样式亮点与处理

### 4.1 视觉设计 (SCSS)
- **极简风格**:
  - 整体背景色为淡灰 (`#f9f9f9`)，卡片采用纯白背景 + 大圆角 (`16px`) + 极淡阴影，营造悬浮质感。
- **头像设计**:
  - 已登录用户头像采用首字母大写展示，背景色为品牌蓝 (`#33C7F7`)。
  - 头像增加外发光阴影 (`box-shadow`)，突出主体。
- **渐变文字**:
  - 用户名采用了线性渐变色 (`linear-gradient(120deg, #25255F, #2C439B)`) 和文字阴影，提升质感。

### 4.2 布局细节
- **导航栏适配**:
  - 顶部 padding 适配了刘海屏 (`env(safe-area-inset-top)`)。
  - 标题左对齐 (`justify-content: flex-start`) 并留出边距，符合现代 App 设计规范。

## 5. 核心逻辑代码片段

### 5.1 滚动渐变导航栏
```typescript
usePageScroll((res) => {
  setScrollTop(res.scrollTop)
})

// JSX
<View className={`nav-bar ${scrollTop > 10 ? 'scrolled' : ''}`}>
  ...
</View>
```

### 5.2 路由跳转封装
```typescript
const handleMenuClick = (item: any) => {
  if (item.path) {
    if (item.isTab) {
      Taro.switchTab({ url: item.path })
    } else {
      Taro.navigateTo({ url: item.path })
    }
  }
}
```

## 6. 文件结构
- `index.tsx`: 页面主逻辑。
- `index.scss`: 样式定义，包含卡片、宫格、导航栏动效。
- `index.config.ts`: 开启自定义导航栏 (`navigationStyle: 'custom'`)。
