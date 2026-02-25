# Easy Travelling 业务全流程说明（商户发布 -> 管理员审核 -> 用户预订）

本文档仅做文字说明，描述当前项目已实现的真实业务链路，以及每一步对数据库与 OSS 的影响。

## 1. 角色与核心数据

### 1.1 角色
- 商户：发布/编辑/下线酒店与房型。
- 管理员：审核商户发布内容（通过/拒绝/下线/删除）。
- 用户：浏览酒店、收藏、下单、支付、取消、查看订单。

### 1.2 核心表
- `sys_users`：账号信息（商户/管理员/用户），并存储收藏 `favorites`、浏览历史 `history`、头像 `avatar` 等。
- `hotels`：酒店主信息（门面信息），`status` 控制审核与上下线状态。
- `room_types`：酒店下的房型信息（名称、价格、房型图等）。
- `room_stock`：按“酒店 + 房型 + 日期”存储库存，`total_count` 与 `booked_count` 共同决定可售库存。
- `bookings`：订单主表（入住人信息、酒店、房型、日期、价格、状态等）。

### 1.3 状态定义
- `hotels.status`
- `0`：待审核（商户新发/修改后）
- `1`：已上架（管理员审核通过）
- `2`：已拒绝（管理员拒绝或商户主动下线）
- `3`：已下线（管理员下线）

- `bookings.status`
- `0`：待支付
- `1`：已支付
- `2`：已取消
- `3`：已完成（离店日期早于当前日期后自动流转）

## 2. 商户发布酒店流程

### 2.1 图片上传（可选多次）
- 接口：`POST /api/upload`（需登录）
- 行为：
- 服务端将图片流上传到阿里云 OSS：`uploads/{timestamp}-{random}.{ext}`
- 返回可访问 URL：`https://{bucket}.{region}.aliyuncs.com/{objectName}`
- 数据影响：
- OSS：新增对象文件。
- MySQL：本步骤不写业务表。

### 2.2 提交酒店发布
- 接口：`POST /api/hotels`（商户权限）
- 入参核心：
- 酒店信息：`name/city/address/phone/price/star_level/tags/image_url/description`
- 房型数组：`roomTypes[]`（每项含 `name/price/description/image_url`）
- 数据库事务内操作：
1. 向 `hotels` 新增一条酒店记录，`status=0`（待审核）。
2. 向 `room_types` 批量插入该酒店的房型记录。
3. 查询新房型 ID 列表，调用库存补齐逻辑 `ensureRoomStockRows`。
4. 为每个房型按日期补齐 `room_stock`：
- `total_count = 1`（当前项目已改为每种房型默认仅 1 间）
- `booked_count = 0`
5. 事务提交。
- 数据影响：
- `hotels`：新增。
- `room_types`：新增多条。
- `room_stock`：新增多条（未来日期库存初始化）。
- OSS：不新增（除非前一步调用了 `/api/upload`）。

## 3. 管理员审核流程

### 3.1 查看待审核列表
- 接口：`GET /api/admin/hotels/pending`
- 仅查询 `hotels.status=0`，不改数据。

### 3.2 查看待审核详情
- 接口：`GET /api/admin/hotels/:id`
- 查询 `hotels + room_types`，不改数据。

### 3.3 审核通过
- 接口：`POST /api/admin/hotels/:id/approve`
- 数据库事务内操作：
1. `hotels.status` 更新为 `1`（上架）。
2. 重新对该酒店所有房型执行 `ensureRoomStockRows`，补齐缺失库存行。
3. 事务提交。
- 数据影响：
- `hotels`：状态更新。
- `room_stock`：可能新增缺失日期库存。

### 3.4 审核拒绝
- 接口：`POST /api/admin/hotels/:id/reject`
- 数据影响：
- `hotels.status=2`，并写入 `cancellation` 拒绝原因。

### 3.5 管理员下线
- 接口：`POST /api/admin/hotels/:id/offline`
- 数据影响：
- `hotels.status=3`，并写入 `cancellation` 下线原因。

### 3.6 管理员删除酒店
- 接口：`DELETE /api/admin/hotels/:id`
- 数据库事务内操作：
1. 删除 `room_stock`（该酒店全部库存行）。
2. 删除 `room_types`。
3. 删除 `hotels`。
4. 事务提交。
- 注意：
- 当前实现未联动删除 `bookings` 历史数据，也未自动删除 OSS 对象文件。

## 4. 用户浏览与选择流程

### 4.1 列表检索
- 接口：`GET /api/hotels`
- 只返回 `status=1`（已上架）酒店。
- 若携带入住离店日期：
- 服务端会按 `room_stock` 判断每家酒店是否仍有可售房型。
- 需要时会先补齐缺失库存行，再计算可售量。
- 数据影响：
- 可能新增 `room_stock` 缺失行（补齐动作）。

### 4.2 详情查看
- 接口：`GET /api/hotels/:id`
- 返回：
- 酒店基础信息
- 房型列表（每个房型的 `remain_count/sold_out`）
- 顶部图片集合 `images`（封面图 + 房型图聚合去重）
- 数据影响：
- 可能补齐 `room_stock` 缺失行（用于日期范围库存计算）。

### 4.3 收藏与历史
- 收藏：
- `POST /api/favorites/add`
- `POST /api/favorites/remove`
- `GET /api/favorites/list`
- 浏览历史：
- `POST /api/history/add`
- `GET /api/history/list`
- 数据影响：
- `sys_users.favorites`（JSON 数组）更新。
- `sys_users.history`（JSON 数组）更新。

## 5. 用户下单、支付、取消、完成流程

### 5.1 创建订单（待支付）
- 接口：`POST /api/bookings/create`
- 业务规则：
1. 校验用户信息、日期合法性。
2. 解析/兜底房型（按 `room_type_id` 或 `room_type_name` 匹配）。
3. 补齐该房型在入住区间的 `room_stock` 行。
4. 加锁校验库存是否充足（逐日检查 `total_count - booked_count`）。
5. 仅写入 `bookings`，状态为 `0`（待支付）。
- 重要说明：
- 创建订单阶段不扣减库存。

### 5.2 订单支付（我已支付）
- 接口：`POST /api/bookings/:id/pay`
- 数据库事务内操作：
1. 锁定订单行并校验状态必须是待支付。
2. 再次解析房型并计算房间数。
3. 锁定入住区间库存行并再次校验库存。
4. `room_stock.booked_count += room_count`（逐日生效）。
5. `bookings.status = 1`（已支付）。
6. 事务提交。
- 结果：
- 支付成功后库存才被占用，避免“只下单未支付也占库存”。

### 5.3 取消订单
- 接口：`POST /api/bookings/:id/cancel`
- 分支逻辑：
- 若订单为 `status=0`（待支付）：
- 仅更新 `bookings.status=2`，不操作库存。
- 若订单为 `status=1`（已支付）：
- 先按订单入住区间回滚库存（`booked_count` 递减，最小不低于 0）
- 再更新 `bookings.status=2`。

### 5.4 自动完成
- 触发点：用户请求 `GET /api/bookings/my-list`
- 服务端会先执行：
- `status=1` 且 `check_out_date < CURDATE()` 的订单自动更新为 `status=3`（已完成）。
- 然后再返回订单列表。

## 6. 商户修改/下线/删除酒店时的数据变化

### 6.1 商户编辑酒店
- 接口：`PUT /api/hotels/:id`
- 数据库事务内操作：
1. 更新 `hotels` 基础信息并置 `status=0`（重新审核）。
2. 删除该酒店“今天及未来”的旧房型库存行（`room_stock`）。
3. 删除旧 `room_types` 并重建新房型。
4. 基于新房型重建库存 `room_stock`。

### 6.2 商户主动下线
- 接口：`PATCH /api/hotels/:id/status`（仅支持改为 `2`）
- 数据影响：
- 更新 `hotels.status=2` 和 `cancellation` 说明。
- 不删除库存历史记录。

### 6.3 商户删除酒店
- 接口：`DELETE /api/hotels/:id`
- 数据库事务内操作：
1. 删除 `room_stock`
2. 删除 `room_types`
3. 删除 `hotels`
- 当前实现不自动清理 OSS 文件对象。

## 7. OSS 操作总览（当前实现）

- 会写 OSS 的场景：
- 图片上传接口 `POST /api/upload`
- 文件会落入 `uploads/` 目录，返回 URL 给前端保存。

- 数据库中保存 OSS URL 的典型字段：
- `hotels.image_url`（酒店封面）
- `room_types.image_url`（房型图，可多图逗号分隔）
- `sys_users.avatar`（用户/商户头像）

- 当前未自动删除 OSS 文件的场景：
- 删除酒店、删除房型、替换图片、删除用户等操作不会自动删除旧 OSS 对象。
- 代码中有删除 OSS 的辅助函数，但当前主流程未调用。

## 8. 当前库存与订单一致性策略（关键结论）

- 默认每个房型每天 `total_count=1`（本项目已配置）。
- 待支付订单不占库存，支付成功才占库存。
- 已支付订单取消会回滚库存。
- 列表与详情查询时会补齐缺失库存行，避免查询日期没有库存记录导致异常。
- 订单完成状态由“离店日期 < 当前日期”自动流转。

---

如需，我可以下一步再补一份“接口时序图版 README”（同样只写文字，不加代码），把每一步的前端页面跳转和 API 调用顺序按时间线列出来。
