# 管理员酒店管理页 (Admin Manage Hotels Page) 技术归纳文档

## 1. 概述
该页面是系统管理员的核心工作台，集成了酒店审核、已发布酒店管理以及管理员个人资料管理三大功能模块。采用了左右分栏布局，左侧为管理员个人中心，右侧为酒店数据管理表格。

## 2. 功能模块与实现

### 2.1 个人资料管理 (左侧栏)
- **信息展示**:
  - 展示管理员头像、名称、ID、注册时间、联系电话及邀请码。
  - 支持一键复制邀请码 (`navigator.clipboard`)。
- **资料编辑**:
  - 支持修改管理员名称和头像。
  - 头像上传支持本地预览 (`URL.createObjectURL`)，提交时先上传至 OSS 获取 URL。
- **密码修改**:
  - 提供独立的密码修改界面，包含新密码与确认密码的双重校验。
- **交互细节**:
  - 编辑模式下提供“提交修改”与“返回”按钮。
  - 使用背景图 (`sidebarBg`) 与渐变叠加层，营造高端视觉效果。

### 2.2 酒店管理 (右侧栏)
- **双 Tab 视图**:
  - **已发布 (`published`)**: 展示所有状态为“已发布”或“已下线”的酒店。
  - **待审核 (`pending`)**: 展示所有新提交需审核的酒店。
- **数据表格 (Ant Design Table)**:
  - **列配置**: 包含酒店图片、商户ID、商户名称、酒店名称、城市、起步价、星级、状态、更新时间及操作栏。
  - **高级筛选**:
    - 支持按商户名、酒店名、城市进行前端筛选 (`filters` + `onFilter`)。
    - 支持按价格、更新时间排序 (`sorter`)。
    - 星级列使用自定义渲染 (`render`)，将数字转换为星星图标 (`★`)。
  - **操作功能**:
    - **查看信息**: 跳转至酒店详情页 (`/hotels/publish?view=1`)。
    - **下线**: 针对已发布酒店，弹出模态框填写原因后下线。
    - **删除**: 针对已下线酒店，弹出二次确认框后物理删除。
    - **通过/拒绝**: 针对待审核酒店，支持一键通过或填写理由拒绝。

### 2.3 弹窗交互
- **下线/拒绝弹窗**:
  - 复用 `Modal` 组件，内嵌 `Input.TextArea` 用于输入操作原因。
  - 提交时显示 Loading 状态，成功后自动刷新列表。

## 3. 接口调用

| 接口路径 | 方法 | 描述 | 参数示例 |
| :--- | :--- | :--- | :--- |
| `/auth/me` | GET | 获取管理员个人信息 | 无 |
| `/auth/update` | PUT | 更新个人资料/密码 | `{ username, avatar, password }` |
| `/admin/hotels/published` | GET | 获取已发布酒店列表 | 无 |
| `/admin/hotels/pending` | GET | 获取待审核酒店列表 | 无 |
| `/admin/hotels/:id/approve` | POST | 审核通过 | 无 |
| `/admin/hotels/:id/reject` | POST | 审核拒绝 | `{ reason }` |
| `/admin/hotels/:id/offline` | POST | 强制下线 | `{ reason }` |
| `/admin/hotels/:id` | DELETE | 删除酒店 | 无 |
| `/upload` | POST | 上传头像文件 | `FormData` |

## 4. 样式亮点与处理

### 4.1 视觉设计 (Tailwind CSS)
- **全屏背景**:
  - 使用 `fixed inset-0 -z-10` 定位背景图，配合 `bg-cover` 和 `background-attachment: fixed` 实现视差滚动效果。
- **毛玻璃效果**:
  - 表格容器和个人信息卡片大量使用 `backdrop-blur-sm` 和半透明背景 (`bg-white/90`)，增强层次感。
- **响应式布局**:
  - 使用 `flex-col lg:flex-row` 实现移动端上下布局、桌面端左右布局的自适应切换。
- **状态样式**:
  - 按钮采用圆角 (`rounded-full`) 和 阴影 (`shadow-sm`)，Hover 时加深阴影。
  - 星级展示使用自定义 JSX 渲染，而非简单的数字。

### 4.2 数据处理细节
- **日期格式化**:
  - 实现了增强版 `formatDate` 函数，兼容 MySQL datetime 字符串、时间戳及 `null` 值，统一输出为 `YYYY年M月D日`。
- **空值防御**:
  - 表格渲染时对 `null`/`undefined` 字段（如图片、价格）均有兜底显示（默认图、`-`）。
- **前端筛选**:
  - 利用 `Set` 对列表数据去重生成筛选菜单，实现全自动的列筛选功能。

## 5. 核心逻辑代码片段

### 5.1 动态生成筛选菜单
```typescript
filters: Array.from(new Set(publishedList.map(item => item.city).filter((city): city is string => city != null))).map(city => ({
  text: city,
  value: city,
})),
onFilter: (value, record) => record.city ? record.city.indexOf(value as string) === 0 : false,
```

### 5.2 头像预览与上传
```typescript
const setAvatarPreview = (file: File | null) => {
  if (!file) return
  const url = URL.createObjectURL(file) // 生成本地预览 URL
  avatarPreviewRef.current = url
  setAvatarPreviewUrl(url)
}

// 提交时
if (pendingAvatarFile) {
  const uploaded = await uploadFile(pendingAvatarFile) // 上传 OSS
  avatar = uploaded.url
}
```

## 6. 文件结构
- `ManageHotels.tsx`: 包含所有 UI 渲染、状态管理及业务逻辑（代码量较大，约 1200 行）。
- 依赖组件: `antd` (Table, Modal, Tabs, Input), `PageLayout`.
- 依赖 API: `api/admin.ts`, `api/auth.ts`, `api/request.ts`.
