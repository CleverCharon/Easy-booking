/**
 * 应用程序入口文件
 * 
 * 本文件负责初始化 Express 服务器、配置中间件、建立数据库连接以及定义 API 接口路由。
 */

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = 3000;

// ==========================================
// 中间件配置
// ==========================================

// 启用 CORS 跨域支持和 JSON 请求体解析
app.use(cors());
app.use(express.json());

// ==========================================
// 数据库配置
// ==========================================

/**
 * 创建 MySQL 连接池
 * 使用连接池可有效管理并发请求，提高数据库操作性能。
 */
const db = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: 'root',
  database: 'easy_travel_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ==========================================
// 阿里云短信服务配置
// ==========================================

const Dypnsapi20170525 = require('@alicloud/dypnsapi20170525');
const OpenApi = require('@alicloud/openapi-client');
const Util = require('@alicloud/tea-util');

/**
 * 初始化阿里云 SDK 客户端
 * 使用环境变量中的 AccessKey ID 和 Secret 进行身份验证。
 * 
 * @returns {Dypnsapi20170525.default} 初始化后的客户端实例
 */
const createClient = () => {
  const config = new OpenApi.Config({
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
    endpoint: 'dypnsapi.aliyuncs.com'
  });
  return new Dypnsapi20170525.default(config);
}

/**
 * 短信验证码内存存储
 * 数据结构: { phone: { code, expireTime, lastSentTime } }
 * 注意：在生产环境中，建议使用 Redis 进行分布式存储以确保持久化和共享。
 */
const smsStore = new Map();

// ==========================================
// API 接口定义
// ==========================================

/**
 * 发送短信验证码接口
 * 
 * @route POST /api/sms/send
 * @param {string} req.body.phone - 目标手机号码
 * @returns {object} 200 - 发送成功消息
 * @returns {object} 400 - 发送失败消息（如手机号无效、请求过于频繁等）
 */
app.post('/api/sms/send', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).send({ message: '手机号不能为空' });

  // 频率限制检查（60秒冷却期）
  const record = smsStore.get(phone);
  if (record) {
    const now = Date.now();
    if (now - record.lastSentTime < 60 * 1000) {
      return res.status(400).send({ message: '请勿频繁发送' });
    }
  }

  // 生成 6 位随机数字验证码
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // 初始化阿里云客户端
  const client = createClient();
  
  // 使用 Dypnsapi 的 SendSmsVerifyCodeRequest 接口发送短信
  // 该接口在某些场景下允许免除严格的签名校验，或用于特定的验证流程
  const sendSmsVerifyCodeRequest = new Dypnsapi20170525.SendSmsVerifyCodeRequest({
    phoneNumber: phone,
    signName: '速通互联验证码',
    templateCode: '100001',
    templateParam: JSON.stringify({ code: code, min: "1" }),
  });
  
  const runtime = new Util.RuntimeOptions({});

  try {
    const resp = await client.sendSmsVerifyCodeWithOptions(sendSmsVerifyCodeRequest, runtime);
    
    if (resp.body.code === 'OK') {
      // 将验证码存入内存，有效期设置为 1 分钟
      smsStore.set(phone, {
        code: code,
        expireTime: Date.now() + 60 * 1000,
        lastSentTime: Date.now()
      });
      res.send({ success: true, message: '验证码发送成功' });
    } else {
      console.error('Aliyun SMS Error:', resp.body);
      res.status(400).send({ message: '短信发送失败: ' + resp.body.message });
    }
  } catch (error) {
    console.error('Aliyun SMS Exception:', error);
    res.status(400).send({ message: '短信发送异常: ' + (error.data?.Recommend || error.message) });
  }
});

/**
 * 获取城市列表接口
 * 
 * @route GET /api/cities
 * @returns {Array} 推荐城市列表数据
 */
app.get('/api/cities', (req, res) => {
  // 返回硬编码的热门城市数据用于演示
  const hotCities = [
    { id: 1, name: '上海', lat: 31.230416, lng: 121.473701 },
    { id: 2, name: '北京', lat: 39.9042, lng: 116.4074 },
    { id: 3, name: '广州', lat: 23.1291, lng: 113.2644 },
    { id: 4, name: '成都', lat: 30.5723, lng: 104.0665 }
  ];
  res.send(hotCities);
});

/**
 * 获取酒店列表接口
 * 
 * @route GET /api/hotels
 * @param {string} [req.query.city_name] - 按城市名称筛选
 * @returns {Array} 包含计算评分和格式化标签的酒店列表
 */
app.get('/api/hotels', (req, res) => {
  const { city_name } = req.query;
  let sql = 'SELECT h.*, h.price as min_price, h.image_url as main_image FROM hotels h';
  let values = [];
  let whereClauses = ['h.status = 1'];

  if (city_name) {
    whereClauses.push('h.city LIKE ?');
    values.push(`%${city_name}%`);
  }

  if (whereClauses.length > 0) {
    sql += ' WHERE ' + whereClauses.join(' AND ');
  }
  
  db.query(sql, values, (err, results) => {
    if (err) return res.status(500).send({ message: '查询酒店失败', error: err });
    
    // 增强返回数据，计算评分并格式化标签以供前端展示
    const enhancedResults = results.map(h => ({
      ...h,
      score: (h.star_level * 0.1 + 4.3).toFixed(1), 
      review_count: Math.floor(Math.random() * 1000) + 50,
      brand: h.tags ? h.tags.split(',')[0] : '精选',
      tags: h.tags ? h.tags.split(',') : []
    }));

    res.send(enhancedResults);
  });
});

/**
 * 添加酒店收藏接口
 * 
 * @route POST /api/favorites/add
 * @param {number} req.body.user_id - 用户 ID
 * @param {number} req.body.hotel_id - 酒店 ID
 */
app.post('/api/favorites/add', (req, res) => {
  const { user_id, hotel_id } = req.body;
  if (!user_id || !hotel_id) return res.status(400).send({ message: '参数缺失' });
  
  // 更新 sys_users 表中的 JSON 数组字段
  // 使用 JSON_CONTAINS 防止重复添加
  const sql = `
    UPDATE sys_users 
    SET favorites = IF(
      favorites IS NULL, 
      JSON_ARRAY(?), 
      IF(JSON_CONTAINS(favorites, ?, '$'), favorites, JSON_ARRAY_APPEND(favorites, '$', ?))
    )
    WHERE id = ?
  `;
  
  const hId = Number(hotel_id);
  
  db.query(sql, [hId, hId, hId, user_id], (err) => {
    if (err) return res.status(500).send(err);
    res.send({ success: true });
  });
});

/**
 * 取消酒店收藏接口
 * 
 * @route POST /api/favorites/remove
 * @param {number} req.body.user_id - 用户 ID
 * @param {number} req.body.hotel_id - 酒店 ID
 */
app.post('/api/favorites/remove', (req, res) => {
  const { user_id, hotel_id } = req.body;
  const hId = Number(hotel_id);
  
  // 读取当前收藏列表，过滤并更新
  db.query('SELECT favorites FROM sys_users WHERE id = ?', [user_id], (err, results) => {
    if (err || !results[0]) return res.status(500).send(err);
    
    let favs = results[0].favorites || [];
    if (typeof favs === 'string') favs = JSON.parse(favs);
    
    const newFavs = favs.filter(id => Number(id) !== hId);
    
    db.query('UPDATE sys_users SET favorites = ? WHERE id = ?', [JSON.stringify(newFavs), user_id], (e) => {
      if (e) return res.status(500).send(e);
      res.send({ success: true });
    });
  });
});

/**
 * 获取收藏酒店列表接口
 * 
 * @route GET /api/favorites/list
 * @param {number} req.query.user_id - 用户 ID
 */
app.get('/api/favorites/list', (req, res) => {
  const { user_id } = req.query;
  
  db.query('SELECT favorites FROM sys_users WHERE id = ?', [user_id], (err, results) => {
    if (err || !results[0]) return res.status(500).send(err);
    
    let favIds = results[0].favorites || [];
    if (typeof favIds === 'string') favIds = JSON.parse(favIds);
    
    if (favIds.length === 0) return res.send([]);
    
    // 查询所有已收藏酒店的详细信息
    const sql = `SELECT * FROM hotels WHERE id IN (?)`;
    db.query(sql, [favIds], (e, hotels) => {
      if (e) return res.status(500).send(e);
      
      const enhancedResults = hotels.map(h => ({
        ...h,
        score: (h.star_level * 0.1 + 4.3).toFixed(1),
        review_count: 100,
        tags: h.tags ? h.tags.split(',') : []
      }));
      res.send(enhancedResults);
    });
  });
});

/**
 * 添加浏览记录接口
 * 
 * @route POST /api/history/add
 * @param {number} req.body.user_id - 用户 ID
 * @param {number} req.body.hotel_id - 酒店 ID
 */
app.post('/api/history/add', (req, res) => {
  const { user_id, hotel_id } = req.body;
  if (!user_id || !hotel_id) return res.send({ ignored: true });

  const newItem = { id: Number(hotel_id), time: new Date() };
  
  db.query('SELECT history FROM sys_users WHERE id = ?', [user_id], (err, results) => {
    if (err || !results[0]) return res.send({ ignored: true });
    
    let history = results[0].history || [];
    if (typeof history === 'string') history = JSON.parse(history);
    
    // 如果存在重复记录则移除，并将新记录添加到头部
    history = history.filter(item => item.id !== Number(hotel_id));
    history.unshift(newItem);
    
    // 限制历史记录长度为 50 条
    if (history.length > 50) history = history.slice(0, 50);
    
    db.query('UPDATE sys_users SET history = ? WHERE id = ?', [JSON.stringify(history), user_id], () => {
      res.send({ success: true });
    });
  });
});

/**
 * 获取浏览记录接口
 * 
 * @route GET /api/history/list
 * @param {number} req.query.user_id - 用户 ID
 */
app.get('/api/history/list', (req, res) => {
  const { user_id } = req.query;
  
  db.query('SELECT history FROM sys_users WHERE id = ?', [user_id], (err, results) => {
    if (err || !results[0]) return res.status(500).send(err);
    
    let history = results[0].history || [];
    if (typeof history === 'string') history = JSON.parse(history);
    
    if (history.length === 0) return res.send([]);
    
    const ids = history.map(h => h.id);
    if (ids.length === 0) return res.send([]);

    const sql = `SELECT * FROM hotels WHERE id IN (?)`;
    db.query(sql, [ids], (e, hotels) => {
      if (e) return res.status(500).send(e);
      
      // 按浏览历史顺序排序结果
      const hotelMap = new Map(hotels.map(h => [h.id, h]));
      const sortedHotels = history
        .map(item => hotelMap.get(item.id))
        .filter(h => h);

      const enhancedResults = sortedHotels.map(h => ({
        ...h,
        score: (h.star_level * 0.1 + 4.3).toFixed(1),
        review_count: 100,
        tags: h.tags ? h.tags.split(',') : []
      }));
      res.send(enhancedResults);
    });
  });
});

/**
 * 获取酒店详情接口
 * 
 * @route GET /api/hotels/:id
 * @param {string} req.params.id - 酒店 ID
 */
app.get('/api/hotels/:id', (req, res) => {
  const hotelId = req.params.id;
  
  const hotelSql = 'SELECT *, price as min_price, image_url as main_image FROM hotels WHERE id = ?';
  const roomsSql = 'SELECT * FROM room_types WHERE hotel_id = ?';

  db.query(hotelSql, [hotelId], (err, hotels) => {
    if (err) return res.status(500).send(err);
    if (hotels.length === 0) return res.status(404).send({ message: '酒店不存在' });

    const hotel = hotels[0];
    
    // 格式化酒店详情数据
    hotel.score = (hotel.star_level * 0.1 + 4.3).toFixed(1);
    hotel.review_count = Math.floor(Math.random() * 1000) + 50;
    hotel.brand = hotel.tags ? hotel.tags.split(',')[0] : '精选';
    hotel.tags = hotel.tags ? hotel.tags.split(',') : [];

    // 查询关联房型
    db.query(roomsSql, [hotelId], (err, rooms) => {
      if (err) return res.status(500).send(err);
      
      hotel.images = [hotel.main_image]; 
      
      const formattedRooms = rooms.map(r => ({
        id: r.id,
        name: r.name,
        area: '30㎡', 
        max_guests: 2,
        plans: [{
          id: r.id, 
          name: '标准价',
          breakfast: 1, 
          cancel_policy: 1, 
          price: r.price
        }]
      }));
      
      hotel.rooms = formattedRooms;
      res.send(hotel);
    });
  });
});

/**
 * 获取 App Banner 接口
 * 
 * @route GET /api/banners
 */
app.get('/api/banners', (req, res) => {
  // 返回静态 Banner 数据
  const banners = [
    { id: 1, image_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80' },
    { id: 2, image_url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=800&q=80' }
  ];
  res.send(banners);
});

/**
 * 用户登录接口
 * 支持验证码登录和密码登录两种方式。
 * 
 * @route POST /api/user/login
 * @param {string} req.body.phone - 手机号
 * @param {string} [req.body.code] - 验证码（验证码登录模式下必填）
 * @param {string} [req.body.password] - 密码（密码登录模式下必填）
 * @param {string} req.body.method - 登录方式 ('code' 或 'password')
 */
app.post('/api/user/login', async (req, res) => {
  const { phone, code, password, method } = req.body;
  if (!phone) return res.status(400).send({ message: '手机号不能为空' });

  try {
    // 检查用户是否存在
    const [users] = await db.promise().query('SELECT * FROM sys_users WHERE phone = ?', [phone]);
    const user = users[0];

    // 方式：验证码登录
    if (method === 'code') {
      if (!code) return res.status(400).send({ message: '验证码不能为空' });
      
      // 验证本地存储的验证码
      const record = smsStore.get(phone);
      if (!record) {
        return res.status(400).send({ message: '验证码不正确或已过期' });
      }
      if (Date.now() > record.expireTime) {
        return res.status(400).send({ message: '验证码已过期' });
      }
      if (record.code !== code) {
        return res.status(400).send({ message: '验证码不正确' });
      }

      // 验证通过后清除验证码
      smsStore.delete(phone);

      if (user) {
        return res.send(user);
      } else {
        // 用户不存在则自动注册
        const [result] = await db.promise().query(
          'INSERT INTO sys_users (phone, nickname, avatar, role) VALUES (?, ?, ?, ?)',
          [phone, '用户', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80', 'user']
        );
        // 返回 is_new 标志以触发账号设置流程
        const newUser = { id: result.insertId, phone, nickname: '用户', is_new: true };
        return res.send(newUser);
      }
    } 
    // 方式：密码登录
    else if (method === 'password') {
      if (!user) return res.status(400).send({ message: '账号不存在，请先使用验证码登录注册' });
      if (!user.password) return res.status(400).send({ message: '您尚未设置密码，请用验证码登录' });
      if (user.password !== password) return res.status(400).send({ message: '密码错误' });
      
      return res.send(user);
    } 
    else {
      return res.status(400).send({ message: '不支持的登录方式' });
    }

  } catch (err) {
    console.error(err);
    res.status(500).send({ message: '登录异常', error: err.message });
  }
});

/**
 * 账号设置接口
 * 用于新用户设置用户名和密码。
 * 
 * @route POST /api/user/setup-account
 */
app.post('/api/user/setup-account', async (req, res) => {
  const { userId, username, password } = req.body;
  if (!userId || !username || !password) return res.status(400).send({ message: '参数缺失' });

  try {
    // 检查用户名唯一性
    const [existing] = await db.promise().query('SELECT id FROM sys_users WHERE username = ? AND id != ?', [username, userId]);
    if (existing.length > 0) {
      return res.status(400).send({ message: '该账号名已被使用，请换一个' });
    }

    // 更新用户凭证
    await db.promise().query('UPDATE sys_users SET username = ?, password = ? WHERE id = ?', [username, password, userId]);
    
    // 返回更新后的用户信息
    const [users] = await db.promise().query('SELECT * FROM sys_users WHERE id = ?', [userId]);
    res.send({ success: true, user: users[0] });

  } catch (err) {
    console.error(err);
    res.status(500).send({ message: '设置失败' });
  }
});

/**
 * 微信登录接口 (模拟实现)
 * 
 * @route POST /api/user/wx-login
 */
app.post('/api/user/wx-login', (req, res) => {
  const { code } = req.body;
  console.log('收到微信登录 code:', code);

  // 模拟微信 OpenID
  const mockOpenId = `wx_openid_${Date.now()}`;
  
  res.send({
    token: 'mock_wx_token_123456',
    userInfo: {
      id: 'wx_user_001',
      nickname: '微信用户',
      avatar: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?auto=format&fit=crop&w=200&q=80',
      openid: mockOpenId
    }
  });
});

/**
 * 获取用户优惠券接口
 * 
 * @route GET /api/user/:id/coupons
 */
app.get('/api/user/:id/coupons', (req, res) => {
  res.send([]);
});

/**
 * 创建订单接口
 * 
 * @route POST /api/bookings/create
 */
app.post('/api/bookings/create', (req, res) => {
  const { user_name, user_phone, user_id_card, hotel_id, hotel_name, room_type_name, check_in_date, check_out_date, total_price } = req.body;

  const sql = `
    INSERT INTO bookings 
    (user_name, user_phone, user_id_card, hotel_id, hotel_name, room_type_name, check_in_date, check_out_date, total_price, status) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `;

  const values = [user_name, user_phone, user_id_card, hotel_id, hotel_name, room_type_name || '标准房', check_in_date, check_out_date, total_price];
  
  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('Create booking failed:', err);
      return res.status(500).send({ message: '服务器错误，预订失败' });
    }
    res.send({ 
      success: true, 
      message: '预订成功！', 
      orderId: result.insertId
    });
  });
});

/**
 * 获取用户订单列表接口
 * 
 * @route GET /api/bookings/my-list
 * @param {string} req.query.phone - 用户手机号
 */
app.get('/api/bookings/my-list', (req, res) => {
  const { phone } = req.query;
  
  if (!phone) return res.send([]);

  const sql = 'SELECT * FROM bookings WHERE user_phone = ? ORDER BY create_time DESC';

  db.query(sql, [phone], (err, results) => {
    if (err) return res.status(500).send('查询失败');
    res.send(results);
  });
});

// ==========================================
// 服务器启动
// ==========================================

// 启动前验证数据库连接
db.getConnection((err, connection) => {
  if (err) {
    console.error('❌ 数据库连接失败！');
    console.error('错误信息:', err.message);
  } else {
    console.log('✅ 数据库连接成功');
    connection.release();
  }
});

app.listen(port, () => {
  console.log(`🚀 服务端已启动: http://localhost:${port}`);
});
