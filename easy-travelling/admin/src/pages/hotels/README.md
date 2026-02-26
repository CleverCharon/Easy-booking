# 酒店发布与管理模块 (Hotels Module) 技术归纳文档

## 1. 概述
酒店发布与管理模块是商户端的核心功能区，包含酒店列表页 (`list.tsx`) 和发布/编辑页 (`publish.tsx`)。该模块支持商户全流程管理旗下的酒店资产，包括创建、编辑、下架、删除及状态查看。

## 2. 功能模块与实现

### 2.1 酒店列表页 (`list.tsx`)
- **左右分栏布局**:
  - **左侧 (商户个人中心)**: 复用了管理员端的个人中心设计，支持头像上传、资料修改、密码修改及邀请码复制。
  - **右侧 (酒店列表)**: 使用 `Collapse` 折叠面板展示酒店列表，每个面板头部展示酒店摘要（图片、名称、星级、状态、价格），展开后显示详情与操作按钮。
- **状态管理**:
  - 定义了 4 种状态：待审核 (Processing)、已发布 (Success)、已拒绝 (Error)、已下线 (Default)。
  - 根据不同状态展示差异化的操作按钮组合：
    - **待审核**: 退回申请、查看信息。
    - **已发布**: 编辑、下架、查看信息。
    - **已拒绝/已下线/已退回**: 重新发布、删除、查看信息。
- **交互细节**:
  - **动态加载详情**: 点击折叠面板展开时，按需异步加载该酒店的房型数据 (`getHotelDetail`)。
  - **二次确认**: 删除、下架、退回申请等敏感操作均需通过 `Modal.confirm` 确认。

### 2.2 酒店发布/编辑页 (`publish.tsx`)
- **多模式支持**:
  - **发布模式**: 表单为空，提交创建新酒店。
  - **编辑模式**: URL 带 `id`，回显酒店详情，提交更新。
  - **查看模式**: URL 带 `view=1`，表单只读，仅用于查看信息（支持管理员视角 `from=admin`）。
- **复杂表单设计 (Ant Design Form)**:
  - **级联选择**: 城市选择使用 `Cascader`，支持从省份到城市的层级选择。
  - **动态增减**: 房型列表使用 `Form.List`，支持动态添加/删除房型条目。
  - **图片上传**:
    - **封面图**: 单张上传，支持本地预览与删除。
    - **房型图**: 每个房型支持多张上传，独立维护预览状态。
  - **电话输入**: 组合了国家区号选择 (`Select`) 和号码输入 (`Input`)。
- **数据回显与转换**:
  - **城市**: 根据城市名反查级联数组 (`getCascadeValueFromCity`) 以正确回显 Cascader。
  - **电话**: 解析数据库中的 `+86 138xxxx` 格式为区号和号码两部分。
  - **标签**: 将字符串/数组格式的标签统一转换为数组供 `Checkbox.Group` 使用。

## 3. 接口调用

| 接口路径 | 方法 | 描述 | 参数示例 |
| :--- | :--- | :--- | :--- |
| `/hotels/my-hotels` | GET | 获取商户名下酒店列表 | 无 |
| `/hotels/:id` | GET | 获取酒店详情（含房型） | 无 |
| `/hotels` | POST | 创建酒店 | `{ name, city, roomTypes: [...] }` |
| `/hotels/:id` | PUT | 更新酒店 | `{ name, city, roomTypes: [...] }` |
| `/hotels/:id` | DELETE | 删除酒店 | 无 |
| `/hotels/:id/withdraw` | POST | 撤回审核申请 | 无 |
| `/upload` | POST | 上传文件（图片） | `FormData` |

## 4. 样式亮点与处理

### 4.1 视觉设计
- **视差背景**:
  - 列表页使用固定定位的背景图 (`fixed inset-0 -z-10`)，营造沉浸感。
- **卡片式交互**:
  - 列表项采用 `Collapse` 组件，自定义了样式 (`border-0`, `rounded-2xl`)，Hover 时有轻微上浮和阴影加深效果。
- **国旗图标**:
  - 发布页的电话区号选择器集成了各国国旗图标 (`import.meta.glob` 预加载)，提升国际化体验。

### 4.2 数据处理细节
- **图片暂存机制**:
  - 发布页的图片上传采用“暂存 + 统一提交”策略。用户选择图片后仅在本地生成预览 URL (`URL.createObjectURL`)，点击提交按钮时才并发上传至 OSS，避免产生垃圾文件。
- **表单校验**:
  - 必填项（名称、城市、地址、房型价格等）均配置了 `rules`。
  - 提交前额外校验“至少添加一个有效房型”。

## 5. 核心逻辑代码片段

### 5.1 图片暂存与并发上传
```typescript
// 提交时
const roomTypeUrls: string[] = []
for (let i = 0; i < roomTypes.length; i++) {
  const existing = (roomTypes[i].image_url || '').split(',').filter(Boolean)
  const pending = pendingRoomFiles[i] || []
  // 并发上传当前房型的新增图片
  const uploaded = await Promise.all(pending.map((p) => uploadFile(p.file).then((r) => r.url)))
  const all = [...existing, ...uploaded.filter(Boolean)]
  roomTypeUrls.push(all.join(','))
}
```

### 5.2 城市级联回显算法
```typescript
function getCascadeValueFromCity(city: string | undefined): string[] {
  if (!city) return []
  for (const prov of chinaRegions) {
    if (prov.value === city) return [city]
    const child = prov.children?.find((c) => c.value === city)
    if (child) return [prov.value, child.value]
  }
  return []
}
```

## 6. 文件结构
- `list.tsx`: 酒店列表管理页，包含商户个人中心逻辑。
- `publish.tsx`: 酒店发布/编辑/详情页，包含复杂的表单处理逻辑。
- 依赖数据: `data/regions.ts` (省市区数据), `data/countryCodes.ts` (国际区号)。
