# 订单管理模块 (Order Module) 技术归纳文档

## 1. 概述
订单管理模块涵盖了从下单、支付到列表查看、取消操作的完整业务闭环。包含三个核心页面：订单创建页 (`order/create`)、订单列表页 (`order/list`) 和支付页 (`order/pay`)。

## 2. 功能模块与实现

### 2.1 订单创建页 (`order/create`)
- **功能**:
  - 展示入住信息（酒店名、房型、日期、晚数）。
  - 填写入住人信息（姓名、手机号）。
  - 显示价格明细与优惠金额。
  - 提交订单并跳转支付。
- **交互**:
  - **表单校验**: 提交前校验姓名和手机号格式。
  - **价格计算**: 根据 `price * nights * roomCount` 动态计算总价。
  - **防重复提交**: 提交过程中禁用按钮并显示 Loading。

### 2.2 订单列表页 (`order/list`)
- **功能**:
  - **状态筛选**: 全部/待支付/已支付/已取消/已完成。
  - **订单卡片**: 展示酒店图、名称、房型、日期、总价及状态标签。
  - **操作按钮**:
    - 待支付 -> 去支付 / 取消订单
    - 已支付 -> 取消订单
    - 已取消/已完成 -> 再次预订
  - **清空订单**: 支持一键清空当前账号所有历史订单（慎用功能）。
- **交互**:
  - **下拉刷新**: 触发 `usePullDownRefresh` 重新加载列表。
  - **状态映射**: 前端维护 `statusMap` 和 `statusClassMap` 实现状态码到文案/样式的映射。
  - **空状态**: 未登录或无订单时展示缺省图及引导按钮。

### 2.3 支付页 (`order/pay`)
- **功能**:
  - 展示订单剩余支付时间（倒计时）。
  - 选择支付方式（微信支付/支付宝/银行卡）。
  - 模拟支付流程（由于无真实支付牌照，仅做模拟）。
- **交互**:
  - **支付成功**: 弹窗提示成功，并在 1.5s 后跳转至订单列表页。
  - **倒计时结束**: 自动将订单状态置为“已取消”（前端展示逻辑，后端有定时任务兜底）。

## 3. 接口调用

| 接口路径 | 方法 | 描述 | 参数示例 |
| :--- | :--- | :--- | :--- |
| `/bookings/create` | POST | 创建订单 | `{ hotel_id, room_type_id, check_in_date, guest_name, ... }` |
| `/bookings/my-list` | GET | 获取我的订单列表 | `phone=...` |
| `/bookings/:id/pay` | POST | 支付订单 | `{ id }` |
| `/bookings/:id/cancel` | POST | 取消订单 | `{ user_phone, user_id }` |
| `/bookings/clear` | POST | 清空所有订单 | `{ user_phone }` |

## 4. 样式亮点与处理

### 4.1 视觉设计 (SCSS)
- **状态标签**:
  - 不同状态采用不同色系区分：
    - 待支付: 黄色背景 (`#fff4d8`) + 棕色文字
    - 已支付: 蓝色背景 (`#e8f0ff`) + 蓝色文字
    - 已取消: 红色背景 (`#ffe9e9`) + 红色文字
    - 已完成: 绿色背景 (`#e8f9ee`) + 绿色文字
- **卡片布局**:
  - 列表页卡片采用上下结构：上部状态栏，中部信息区（左图右文），下部操作栏（右对齐按钮组）。
  - 操作栏按钮根据重要级区分样式：
    - **主按钮**（去支付）: 渐变背景 (`linear-gradient`)。
    - **次按钮**（取消/再订）: 描边样式。

### 4.2 数据处理
- **日期格式化**:
  - 后端返回 ISO 时间字符串，前端截取 `slice(0, 10)` 展示 `YYYY-MM-DD`。
- **Tab 映射**:
  - URL 参数 `tab` (string) 与内部状态 `activeTab` (enum) 之间通过 `normalizeTab` 函数进行安全转换。

## 5. 核心逻辑代码片段

### 5.1 列表筛选逻辑 (`useMemo`)
```typescript
const filteredOrders = useMemo(() => {
  const status = statusMap[activeTab]
  if (status === -1) return orders
  return orders.filter((o) => Number(o.status) === status)
}, [activeTab, orders])
```

### 5.2 清空订单逻辑
```typescript
const handleClearOrders = () => {
  Taro.showModal({
    title: '清空订单',
    content: '将删除该账号所有订单记录，此操作不可恢复，是否继续？',
    success: async (res) => {
      if (res.confirm) {
        await post('/bookings/clear', { ... })
        setOrders([]) // 乐观更新
      }
    }
  })
}
```

## 6. 文件结构
- `create/`: 订单创建页相关文件。
- `list/`: 订单列表页相关文件。
- `pay/`: 支付页相关文件。
