// 1. 引入必要的工具包（dotenv 需最先加载以便读取 .env）
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { Readable } = require('stream');
const OSS = require('ali-oss');

const app = express();
const port = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'easy-booking-secret-key';

// 2. 开启中间件 (允许跨域 + 允许读取 JSON 数据)
app.use(cors());
app.use(express.json());

// 内存存储，不落盘，直接上传到 OSS（单张图片最大 20MB）
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ==========================================
// 核心步骤：创建数据库连接池
// ==========================================
const db = mysql.createPool({
  host: 'localhost',      // 数据库地址 (本机)
  user: 'root',           // 账号 (phpStudy默认是root)
  password: 'clever',       // 密码 (phpStudy默认是root，如果改过请填你的)
  database: 'easy_travel_db', // 刚才我们建的数据库名字
  waitForConnections: true,
  connectionLimit: 10,    // 最多允许10个人同时连，多了排队
  queueLimit: 0
});

// 测试一下连接是否成功
db.getConnection((err, connection) => {
  if (err) {
    console.error('❌ 数据库连接失败！请检查账号密码或phpStudy是否启动。');
    console.error('错误信息:', err.message);
  } else {
    console.log('✅ 数据库连接成功！服务端已准备就绪。');
    connection.release();
  }
});

// ==========================================
// 注册接口：POST /api/auth/register
// ==========================================
app.post('/api/auth/register', (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ success: false, message: '请填写账号、密码并选择角色' });
  }
  if (!['admin', 'merchant'].includes(role)) {
    return res.status(400).json({ success: false, message: '角色只能是 admin 或 merchant' });
  }
  if (String(username).trim().length < 2) {
    return res.status(400).json({ success: false, message: '账号长度至少 2 个字符' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ success: false, message: '密码长度至少 6 位' });
  }

  const checkSql = 'SELECT id FROM sys_users WHERE username = ?';
  db.query(checkSql, [username.trim()], (err, rows) => {
    if (err) {
      console.error('注册-查询用户失败:', err);
      return res.status(500).json({ success: false, message: '服务器错误' });
    }
    if (rows && rows.length > 0) {
      return res.status(400).json({ success: false, message: '该账号已被注册' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const insertSql = 'INSERT INTO sys_users (username, password, role, created_at) VALUES (?, ?, ?, NOW())';
    db.query(insertSql, [username.trim(), hashedPassword, role], (err, result) => {
      if (err) {
        console.error('注册-插入用户失败:', err);
        return res.status(500).json({ success: false, message: '服务器错误，注册失败' });
      }
      res.json({ success: true, message: '注册成功，请登录', userId: result.insertId });
    });
  });
});

// ==========================================
// 登录接口：POST /api/auth/login
// ==========================================
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: '请输入账号和密码' });
  }

  const sql = 'SELECT id, username, password, role, avatar, created_at FROM sys_users WHERE username = ?';
  db.query(sql, [username.trim()], (err, rows) => {
    if (err) {
      console.error('登录-查询失败:', err);
      return res.status(500).json({ success: false, message: '服务器错误' });
    }
    if (!rows || rows.length === 0) {
      return res.status(401).json({ success: false, message: '账号或密码错误' });
    }

    const user = rows[0];
    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: '账号或密码错误' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      success: true,
      message: '登录成功',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        avatar: user.avatar || null,
      },
    });
  });
});

// ==========================================
// JWT 鉴权中间件（需要登录的接口使用）
// ==========================================
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '请先登录' });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { userId: decoded.userId, username: decoded.username, role: decoded.role };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
  }
}

/** 仅管理员可访问 */
function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '仅管理员可操作' });
  }
  next();
}

function getOSSClient() {
  const region = process.env.OSS_REGION || 'oss-cn-beijing';
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
  const bucket = process.env.OSS_BUCKET || 'easy-travelling';
  if (!accessKeyId || !accessKeySecret) return null;
  return new OSS({ region, accessKeyId, accessKeySecret, bucket, secure: true });
}

// 从 OSS 完整 URL 解析出 objectKey（支持虚拟主机风格与路径风格，仅本 bucket 才解析）
function urlToOSSObjectKey(url) {
  if (!url || typeof url !== 'string') return null;
  let u = url.trim();
  if (!u) return null;
  if (u.startsWith('//')) u = 'https:' + u;
  const bucket = (process.env.OSS_BUCKET || 'easy-travelling').toLowerCase();
  const region = (process.env.OSS_REGION || 'oss-cn-beijing').toLowerCase();
  try {
    const parsed = new URL(u);
    const pathname = parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    const host = (parsed.hostname || '').toLowerCase();
    // 虚拟主机风格: https://bucket.oss-cn-beijing.aliyuncs.com/uploads/xxx
    if (host === `${bucket}.${region}.aliyuncs.com`) {
      return pathname || null;
    }
    // 路径风格: https://oss-cn-beijing.aliyuncs.com/bucket/uploads/xxx
    if (host === `${region}.aliyuncs.com` && pathname.startsWith(bucket + '/')) {
      return pathname.slice(bucket.length + 1) || null;
    }
    // 兼容：只要路径里包含 uploads/ 且域名含 aliyuncs，尝试取最后一截作为 key（兜底）
    if (host.includes('aliyuncs.com') && pathname.includes('uploads/')) {
      const idx = pathname.indexOf('uploads/');
      return pathname.slice(idx) || null;
    }
  } catch (_) {
    // 非合法 URL，尝试简单前缀匹配
    const prefix = `https://${bucket}.${region}.aliyuncs.com/`;
    if (u.startsWith(prefix)) {
      const key = u.slice(prefix.length).replace(/^\/+/, '').split('?')[0];
      return key || null;
    }
  }
  return null;
}

// 批量从 OSS 删除文件（按 URL）；忽略非本 bucket 的 URL 和删除失败
function deleteOSSFiles(client, urls) {
  if (!client) {
    console.warn('[OSS] 未配置 OSS 客户端，跳过删除');
    return Promise.resolve();
  }
  if (!urls || !urls.length) return Promise.resolve();
  const keys = urls.map(urlToOSSObjectKey).filter(Boolean);
  if (keys.length === 0) {
    console.warn('[OSS] 未解析出任何 objectKey，原始 URL 数量:', urls.length, '示例:', urls[0]);
    return Promise.resolve();
  }
  console.log('[OSS] 即将删除', keys.length, '个文件:', keys.slice(0, 3).join(', '), keys.length > 3 ? '...' : '');
  return Promise.allSettled(keys.map((key) => client.delete(key)))
    .then((results) => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') console.error('[OSS] 删除失败:', keys[i], r.reason?.message || r.reason);
      });
    });
}

function _getImageUrl(row) {
  if (!row) return null;
  const v = row.image_url !== undefined ? row.image_url : row.IMAGE_URL;
  return v != null ? String(v).trim() : null;
}

// 从酒店 + 房型行中收集所有图片 URL（封面 + 房型多图逗号分隔）
function collectImageUrls(hotelRow, roomRows) {
  const list = [];
  const cover = _getImageUrl(hotelRow);
  if (cover) list.push(cover);
  if (roomRows && Array.isArray(roomRows)) {
    roomRows.forEach((r) => {
      const s = _getImageUrl(r);
      if (s) s.split(',').forEach((u) => u && list.push(u.trim()));
    });
  }
  return [...new Set(list)];
}

// ==========================================
// 图片上传到 OSS：POST /api/upload（需登录，单文件，返回 url）
// ==========================================
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '请选择要上传的图片' });
  }
  const client = getOSSClient();
  if (!client) {
    return res.status(503).json({ success: false, message: '未配置 OSS，请设置 .env 中的 OSS_ACCESS_KEY_ID 与 OSS_ACCESS_KEY_SECRET' });
  }
  const ext = (req.file.originalname || '').split('.').pop() || 'jpg';
  const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext : 'jpg';
  const objectName = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExt}`;
  const stream = Readable.from(req.file.buffer);
  const opts = { mime: req.file.mimetype, contentLength: req.file.size };
  client.putStream(objectName, stream, opts)
    .then(() => {
      const bucket = process.env.OSS_BUCKET || 'easy-travelling';
      const region = process.env.OSS_REGION || 'oss-cn-beijing';
      const url = `https://${bucket}.${region}.aliyuncs.com/${objectName}`;
      res.json({ success: true, url });
    })
    .catch((err) => {
      console.error('OSS 上传失败:', err);
      const msg = (err && (err.message || err.code)) ? String(err.message || err.code) : '上传失败';
      res.status(500).json({ success: false, message: msg });
    });
});

// ==========================================
// 我的酒店列表：GET /api/hotels/my（仅商户）
// ==========================================
app.get('/api/hotels/my', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') {
    return res.status(403).json({ success: false, message: '仅商户可查看' });
  }
  const sql = `SELECT id, merchant_id, name, city, address, phone, price, star_level, tags, image_url, description, status, create_time 
    FROM hotels WHERE merchant_id = ? ORDER BY create_time DESC`;
  
  const params = [req.user.userId];

  // ✅ 修改：添加详细错误日志
  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error('❌ 查询我的酒店失败:');
      console.error('   错误代码:', err.code);
      console.error('   错误信息:', err.message);
      console.error('   SQL语句:', sql);
      console.error('   参数:', params);
      console.error('   完整错误:', err);
      
      return res.status(500).json({ 
        success: false, 
        message: '查询酒店列表失败', 
        error: err.message,
        code: err.code 
      });
    }
    res.json(rows || []);
  })
});

// ==========================================
// 发布酒店：POST /api/hotels（仅商户，写入 hotels + room_types）
// ==========================================
app.post('/api/hotels', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') {
    return res.status(403).json({ success: false, message: '仅商户可发布酒店' });
  }
  const { name, city, address, phone, price, star_level, tags, image_url, description, roomTypes } = req.body;
  if (!name || !city || !address) {
    return res.status(400).json({ success: false, message: '请填写酒店名称、城市、地址' });
  }
  if (!roomTypes || !Array.isArray(roomTypes) || roomTypes.length === 0) {
    return res.status(400).json({ success: false, message: '请至少添加一个房型' });
  }
  for (const rt of roomTypes) {
    if (!rt.name || rt.price == null || rt.price === '') {
      return res.status(400).json({ success: false, message: '房型名称和价格必填' });
    }
  }

  const priceNum = price != null && price !== '' ? Number(price) : null;
  const starNum = star_level != null && star_level !== '' ? Number(star_level) : null;
  const tagsStr = typeof tags === 'string' ? tags.trim() : (Array.isArray(tags) ? tags.join(',') : null);
  const insSql = `INSERT INTO hotels (merchant_id, name, city, address, phone, price, star_level, tags, image_url, description, status, create_time) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())`;
  const insValues = [req.user.userId, String(name).trim(), String(city).trim(), String(address).trim(), phone ? String(phone).trim() : null, priceNum, starNum, tagsStr || null, image_url ? String(image_url).trim() : null, description ? String(description).trim() : null];

  // ✅ 修改1：插入酒店的错误处理
  db.query(insSql, insValues, (err, result) => {
    if (err) {
      console.error('❌ 发布酒店-插入hotels失败:');
      console.error('   错误代码:', err.code);
      console.error('   错误信息:', err.message);
      console.error('   SQL语句:', insSql);
      console.error('   参数:', insValues);
      console.error('   完整错误:', err);
      
      return res.status(500).json({ 
        success: false, 
        message: '发布酒店失败', 
        error: err.message,
        code: err.code 
      });
    }
    
    const hotelId = result.insertId;
    const rtSql = 'INSERT INTO room_types (hotel_id, name, price, description, image_url) VALUES (?, ?, ?, ?, ?)';
    let done = 0;
    let hasError = false;
    const total = roomTypes.length;
    
    if (total === 0) {
      return res.json({ success: true, message: '发布成功', hotelId });
    }
    
    for (const rt of roomTypes) {
      const rtDesc = rt.description ? String(rt.description).trim() : null;
      const rtImg = rt.image_url ? String(rt.image_url).trim() : null;
      const rtValues = [hotelId, String(rt.name).trim(), Number(rt.price), rtDesc, rtImg];
      
      // ✅ 修改2：插入房型的错误处理
      db.query(rtSql, rtValues, (errRt) => {
        if (errRt) {
          console.error('❌ 插入房型失败:');
          console.error('   错误代码:', errRt.code);
          console.error('   错误信息:', errRt.message);
          console.error('   SQL语句:', rtSql);
          console.error('   参数:', rtValues);
          console.error('   完整错误:', errRt);
          hasError = true;
        }
        
        done += 1;
        if (done === total) {
          if (hasError) {
            return res.status(500).json({ 
              success: false, 
              message: '部分房型插入失败，请检查数据',
              hotelId: hotelId 
            });
          }
          res.json({ success: true, message: '发布成功', hotelId });
        }
      });
    }
  });
});

// ==========================================
// 酒店详情（含房型）：GET /api/hotels/:id（仅商户本人）
// ==========================================
app.get('/api/hotels/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') {
    return res.status(403).json({ success: false, message: '仅商户可查看' });
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });
  const sql = 'SELECT * FROM hotels WHERE id = ? AND merchant_id = ?';
  db.query(sql, [id, req.user.userId], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: '服务器错误' });
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: '酒店不存在' });
    const hotel = rows[0];
    const cancellation = hotel.cancellation != null ? hotel.cancellation : (hotel.Cancellation != null ? hotel.Cancellation : null);
    db.query('SELECT id, name, price, description, image_url FROM room_types WHERE hotel_id = ?', [id], (errRt, roomRows) => {
      if (errRt) return res.status(500).json({ success: false, message: '服务器错误' });
      res.json({ ...hotel, cancellation, roomTypes: roomRows || [] });
    });
  });
});

// ==========================================
// 退回申请：PATCH /api/hotels/:id/status（status=2，cancellation 写为「商家自行退回申请」）
// ==========================================
app.patch('/api/hotels/:id/status', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') {
    return res.status(403).json({ success: false, message: '仅商户可操作' });
  }
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });
  if (status !== 2) return res.status(400).json({ success: false, message: '仅支持退回为已拒绝' });
  const sql = 'UPDATE hotels SET status = ? WHERE id = ? AND merchant_id = ?';
  const params = [status, id, req.user.userId];

  db.query(sql, params, (err, result) => {
    // ✅ 关键修改：显示真实数据库错误
    if (err) {
      console.error('❌ 酒店退回申请失败:');
      console.error('   错误代码:', err.code);
      console.error('   错误信息:', err.message);
      console.error('   SQL语句:', sql);
      console.error('   参数:', params);
      console.error('   完整错误:', err);
      
      // 根据错误类型返回更具体的提示
      if (err.code === 'ER_NO_SUCH_TABLE') {
        return res.status(500).json({ 
          success: false, 
          message: '数据库表不存在，请检查hotels表', 
          error: err.message 
        });
      }
      if (err.code === 'ER_BAD_FIELD_ERROR') {
        return res.status(500).json({ 
          success: false, 
          message: '数据库字段不存在，请检查cancellation字段', 
          error: err.message 
        });
      }
      if (err.code === 'ER_PARSE_ERROR') {
        return res.status(500).json({ 
          success: false, 
          message: 'SQL语法错误', 
          error: err.message 
        });
      }
      
      return res.status(500).json({ 
        success: false, 
        message: '数据库操作失败', 
        error: err.message,
        code: err.code 
      });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '酒店不存在或无权限操作' 
      });
    }
    
    res.json({ success: true, message: '已退回申请' });
  });
});

// ==========================================
// 删除/下架酒店：DELETE /api/hotels/:id（物理删除酒店及房型，并删除 OSS 中对应图片）
// ==========================================
app.delete('/api/hotels/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') {
    return res.status(403).json({ success: false, message: '仅商户可操作' });
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });
  db.query('SELECT id, image_url FROM hotels WHERE id = ? AND merchant_id = ?', [id, req.user.userId], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: '服务器错误' });
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: '酒店不存在' });
    const hotel = rows[0];
    db.query('SELECT id, image_url FROM room_types WHERE hotel_id = ?', [id], (errRt, roomRows) => {
      if (errRt) return res.status(500).json({ success: false, message: '服务器错误' });
      const urls = collectImageUrls(hotel, roomRows || []);
      if (urls.length) console.log('[OSS] 删除酒店: 共', urls.length, '个图片 URL');
      const client = getOSSClient();
      const afterOSS = client ? deleteOSSFiles(client, urls) : Promise.resolve();
      afterOSS.finally(() => {
        db.query('DELETE FROM room_types WHERE hotel_id = ?', [id], (err1) => {
          if (err1) return res.status(500).json({ success: false, message: '服务器错误' });
          db.query('DELETE FROM hotels WHERE id = ? AND merchant_id = ?', [id, req.user.userId], (err2, result) => {
            if (err2) return res.status(500).json({ success: false, message: '服务器错误' });
            if (result.affectedRows === 0) return res.status(404).json({ success: false, message: '酒店不存在' });
            res.json({ success: true, message: '已删除' });
          });
        });
      });
    });
  });
});

// ==========================================
// 更新酒店：PUT /api/hotels/:id（商户本人，更新酒店+房型；删除被替换的 OSS 图片）
// ==========================================
app.put('/api/hotels/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'merchant') {
    return res.status(403).json({ success: false, message: '仅商户可操作' });
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });
  const { name, city, address, phone, price, star_level, tags, image_url, description, roomTypes } = req.body;
  if (!name || !city || !address) {
    return res.status(400).json({ success: false, message: '请填写酒店名称、城市、地址' });
  }
  if (!roomTypes || !Array.isArray(roomTypes) || roomTypes.length === 0) {
    return res.status(400).json({ success: false, message: '请至少添加一个房型' });
  }
  // 先查出当前酒店与房型的图片 URL，用于更新后删除不再使用的 OSS 文件
  db.query('SELECT id, image_url FROM hotels WHERE id = ? AND merchant_id = ?', [id, req.user.userId], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: '服务器错误' });
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: '酒店不存在' });
    const oldHotel = rows[0];
    db.query('SELECT id, image_url FROM room_types WHERE hotel_id = ?', [id], (errRt, roomRows) => {
      if (errRt) return res.status(500).json({ success: false, message: '服务器错误' });
      const oldUrls = collectImageUrls(oldHotel, roomRows || []);
      const newUrls = [];
      if (image_url && String(image_url).trim()) newUrls.push(String(image_url).trim());
      roomTypes.forEach((rt) => {
        if (rt.image_url) String(rt.image_url).trim().split(',').forEach((u) => u && newUrls.push(u.trim()));
      });
      const newSet = new Set(newUrls);
      const toDelete = oldUrls.filter((u) => !newSet.has(u));
      if (toDelete.length) console.log('[OSS] 更新酒店: 需删除', toDelete.length, '个已替换的图片');

      const priceNum = price != null && price !== '' ? Number(price) : null;
      const starNum = star_level != null && star_level !== '' ? Number(star_level) : null;
      const tagsStr = typeof tags === 'string' ? tags.trim() : (Array.isArray(tags) ? tags.join(',') : null);
      const upSql = `UPDATE hotels SET name=?, city=?, address=?, phone=?, price=?, star_level=?, tags=?, image_url=?, description=?, status=0, create_time=create_time WHERE id=? AND merchant_id=?`;
      const upValues = [String(name).trim(), String(city).trim(), String(address).trim(), phone ? String(phone).trim() : null, priceNum, starNum, tagsStr || null, image_url ? String(image_url).trim() : null, description ? String(description).trim() : null, id, req.user.userId];
      db.query(upSql, upValues, (errUp) => {
        if (errUp) return res.status(500).json({ success: false, message: '更新失败' });
        db.query('DELETE FROM room_types WHERE hotel_id = ?', [id], () => {
          const rtSql = 'INSERT INTO room_types (hotel_id, name, price, description, image_url) VALUES (?, ?, ?, ?, ?)';
          let done = 0;
          const total = roomTypes.length;
          const finish = () => {
            const client = getOSSClient();
            if (client && toDelete.length) deleteOSSFiles(client, toDelete).finally(() => res.json({ success: true, message: '更新成功' }));
            else res.json({ success: true, message: '更新成功' });
          };
          if (total === 0) return finish();
          for (const rt of roomTypes) {
            const rtDesc = rt.description ? String(rt.description).trim() : null;
            const rtImg = rt.image_url ? String(rt.image_url).trim() : null;
            db.query(rtSql, [id, String(rt.name).trim(), Number(rt.price), rtDesc, rtImg], (errRt) => {
              if (errRt) console.error('插入房型失败:', errRt);
              done += 1;
              if (done === total) finish();
            });
          }
        });
      });
    });
  });
});

// ==========================================
// 管理员接口（需登录且 role=admin）
// ==========================================

// 已发布列表：status IN (1 已发布, 3 已下线)，关联商户名称，按创建时间倒序
app.get('/api/admin/hotels/published', authMiddleware, adminMiddleware, (req, res) => {
  // ✅ 修改：去掉 h.cancellation 字段
  const sql = `SELECT h.id, h.merchant_id, h.name, h.city, h.address, h.phone, h.price, h.star_level, h.tags, h.image_url, h.description, h.status, h.create_time, h.update_time,
    u.username AS merchant_name
    FROM hotels h
    LEFT JOIN sys_users u ON u.id = h.merchant_id
    WHERE h.status IN (1, 3) ORDER BY h.create_time DESC`;
  db.query(sql, [], (err, rows) => {
    if (err) {
      console.error('管理员-已发布列表失败:', err);
      return res.status(500).json({ success: false, message: '服务器错误' });
    }
    res.json(rows || []);
  });
});

// 待审核列表：status=0，关联商户名称
app.get('/api/admin/hotels/pending', authMiddleware, adminMiddleware, (req, res) => {
  // ✅ 这个接口本来就没有 cancellation，不用改，但可以加错误日志
  const sql = `SELECT h.id, h.merchant_id, h.name, h.city, h.address, h.phone, h.price, h.star_level, h.tags, h.image_url, h.description, h.status, h.create_time,
    u.username AS merchant_name
    FROM hotels h
    LEFT JOIN sys_users u ON u.id = h.merchant_id
    WHERE h.status = 0
    ORDER BY h.create_time DESC`;
  db.query(sql, [], (err, rows) => {
    if (err) {
      console.error('❌ 管理员-待审核列表失败:', err);
      return res.status(500).json({ 
        success: false, 
        message: '查询待审核列表失败', 
        error: err.message 
      });
    }
    res.json(rows || []);
  });
});

// 管理员查看酒店详情（任意酒店，用于「查看信息」）
app.get('/api/admin/hotels/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });
  const sql = 'SELECT * FROM hotels WHERE id = ?';
  db.query(sql, [id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: '服务器错误' });
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: '酒店不存在' });
    const hotel = rows[0];
    db.query('SELECT id, name, price, description, image_url FROM room_types WHERE hotel_id = ?', [id], (errRt, roomRows) => {
      if (errRt) return res.status(500).json({ success: false, message: '服务器错误' });
      res.json({ ...hotel, roomTypes: roomRows || [] });
    });
  });
});

// 通过审核：status=1
app.post('/api/admin/hotels/:id/approve', authMiddleware, adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });
  const sql = 'UPDATE hotels SET status = 1 WHERE id = ? AND status = 0';
  db.query(sql, [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: '服务器错误' });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: '酒店不存在或非待审核状态' });
    res.json({ success: true, message: '已通过' });
  });
});

// 拒绝：status=2，写入 cancellation
app.post('/api/admin/hotels/:id/reject', authMiddleware, adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { reason } = req.body || {};
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });
  // ✅ 暂时只更新 status，不更新 cancellation
  const sql = 'UPDATE hotels SET status = 2 WHERE id = ? AND status = 0';

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error('❌ 拒绝审核失败:', err);
      return res.status(500).json({ 
        success: false, 
        message: '拒绝失败', 
        error: err.message 
      });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '酒店不存在或非待审核状态' 
      });
    }
    res.json({ success: true, message: '已拒绝' });
  });

});

// 下线：仅将 status 置为 3、写入 cancellation、update_time 置为当前时间，不删除数据库与 OSS
app.post('/api/admin/hotels/:id/offline', authMiddleware, adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { reason } = req.body || {};
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });
  const upSql = 'UPDATE hotels SET status = 3, cancellation = ?, update_time = CURRENT_TIMESTAMP WHERE id = ? AND status = 1';
  db.query(upSql, [reason ? String(reason).trim() : null, id], (err, result) => {
    if (err) {
      console.error('下线-更新失败:', err.message);
      return res.status(500).json({ success: false, message: err.code === 'ER_BAD_FIELD_ERROR' ? '数据库缺少 update_time 字段，请执行 ALTER TABLE hotels ADD COLUMN update_time DATETIME DEFAULT NULL' : '服务器错误' });
    }
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: '酒店不存在或非已发布状态' });
    res.json({ success: true, message: '已下线' });
  });
});

// 管理员物理删除酒店（已下线或任意状态均可删）
app.delete('/api/admin/hotels/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, message: '无效的酒店ID' });
  db.query('SELECT id, image_url FROM hotels WHERE id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: '服务器错误' });
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: '酒店不存在' });
    const hotel = rows[0];
    db.query('SELECT id, image_url FROM room_types WHERE hotel_id = ?', [id], (errRt, roomRows) => {
      if (errRt) return res.status(500).json({ success: false, message: '服务器错误' });
      const urls = collectImageUrls(hotel, roomRows || []);
      const client = getOSSClient();
      const afterOSS = client ? deleteOSSFiles(client, urls) : Promise.resolve();
      afterOSS.finally(() => {
        db.query('DELETE FROM room_types WHERE hotel_id = ?', [id], (err1) => {
          if (err1) return res.status(500).json({ success: false, message: '服务器错误' });
          db.query('DELETE FROM hotels WHERE id = ?', [id], (err2, result) => {
            if (err2) return res.status(500).json({ success: false, message: '服务器错误' });
            if (result.affectedRows === 0) return res.status(404).json({ success: false, message: '酒店不存在' });
            res.json({ success: true, message: '已删除' });
          });
        });
      });
    });
  });
});

// ==========================================
// 写一个接口：创建新订单 (前端点"立即预订"时调这个)
// ==========================================
app.post('/api/bookings/create', (req, res) => {
  // 1. 从前端发来的数据里，把这些信息拿出来
  const { user_name, user_phone, user_id_card, hotel_id, hotel_name, check_in_date, check_out_date, total_price } = req.body;

  // 2. 准备 SQL 语句 (问号是占位符，防止黑客攻击)
  const sql = `
    INSERT INTO bookings 
    (user_name, user_phone, user_id_card, hotel_id, hotel_name, check_in_date, check_out_date, total_price) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  // 3. 执行 SQL
  const values = [user_name, user_phone, user_id_card, hotel_id, hotel_name, check_in_date, check_out_date, total_price];
  
  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('插入订单失败:', err);
      return res.status(500).send({ message: '服务器错误，预订失败' });
    }
    // 成功了！告诉前端好消息
    res.send({ 
      success: true, 
      message: '预订成功！', 
      orderId: result.insertId // 把生成的订单号返给前端
    });
  });
});

// ==========================================
// 写一个接口：查询我的订单列表
// ==========================================
app.get('/api/bookings/my-list', (req, res) => {
  // 简单起见，这里先查出所有订单 (实际项目中会根据用户ID查)
  const sql = 'SELECT * FROM bookings ORDER BY create_time DESC';

  db.query(sql, (err, results) => {
    if (err) return res.status(500).send('查询失败');
    res.send(results);
  });
});

// 统一错误处理（如 MulterError: File too large）返回 JSON，避免返回 HTML
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: '图片不能超过 20MB，请压缩后重试' });
  }
  if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ success: false, message: '请使用字段名 file 上传图片' });
  }
  console.error('请求错误:', err);
  res.status(500).json({ success: false, message: err.message || '服务器错误' });
});

// 启动服务器
app.listen(port, () => {
  console.log(`🚀 服务端正在运行: http://localhost:${port}`);
});