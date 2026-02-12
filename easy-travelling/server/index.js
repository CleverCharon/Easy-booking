// 1. 引入必要的工具包
const express = require('express'); // 搭建服务器的框架
const mysql = require('mysql2');    // 连接数据库的驱动
const cors = require('cors');       // 解决跨域问题的插件

const app = express();
const port = 3000;

// 2. 开启中间件 (允许跨域 + 允许读取 JSON 数据)
app.use(cors());
app.use(express.json());

// ==========================================
// 核心步骤：创建数据库连接池
// ==========================================
const db = mysql.createPool({
  host: '127.0.0.1',      // 数据库地址 (本机)
  user: 'root',           // 账号 (phpStudy默认是root)
  password: 'root',       // 密码 (phpStudy默认是root，如果改过请填你的)
  database: 'easy_travel_db', // 刚才我们建的数据库名字
  waitForConnections: true,
  connectionLimit: 10,    // 最多允许10个人同时连，多了排队
  queueLimit: 0
});

// ==========================================
// 城市相关接口
// ==========================================

// 获取所有城市
app.get('/api/cities', (req, res) => {
  const sql = 'SELECT * FROM app_city ORDER BY id ASC';
  db.query(sql, (err, results) => {
    if (err) return res.status(500).send({ message: '查询城市失败', error: err });
    res.send(results);
  });
});

// ==========================================
// 酒店相关接口
// ==========================================

// 获取酒店列表 (支持按城市筛选)
app.get('/api/hotels', (req, res) => {
  const { city_id, city_name } = req.query;
  let sql = 'SELECT h.* FROM app_hotel h';
  let values = [];
  let whereClauses = ['h.status = 1'];

  if (city_id) {
    whereClauses.push('h.city_id = ?');
    values.push(city_id);
  }
  
  if (city_name) {
    // Subquery or join to get city id by name, or simple join
    // Let's use a join for better performance
    sql += ' JOIN app_city c ON h.city_id = c.id';
    whereClauses.push('c.name LIKE ?');
    values.push(`%${city_name}%`);
  }

  if (whereClauses.length > 0) {
    sql += ' WHERE ' + whereClauses.join(' AND ');
  }

  // 连表查询图片 (简单取第一张)
  // 实际项目中可能需要更复杂的查询或分开查
  // 这里为了简单，先查出酒店，再在前端或者后续补充图片信息
  
  db.query(sql, values, (err, results) => {
    if (err) return res.status(500).send({ message: '查询酒店失败', error: err });
    
    // 如果没有酒店，直接返回空
    if (results.length === 0) return res.send([]);

    // 补充图片信息 (这里做一个简单的 N+1 查询演示，生产环境建议优化)
    const promises = results.map(hotel => {
      return new Promise((resolve) => {
        db.query('SELECT url FROM app_hotel_image WHERE hotel_id = ? ORDER BY sort ASC LIMIT 1', [hotel.id], (err, images) => {
          hotel.main_image = images && images.length > 0 ? images[0].url : '';
          resolve(hotel);
        });
      });
    });

    Promise.all(promises).then(finalResults => {
      res.send(finalResults);
    });
  });
});

// 获取酒店详情
app.get('/api/hotels/:id', (req, res) => {
  const hotelId = req.params.id;
  
  const hotelSql = 'SELECT * FROM app_hotel WHERE id = ?';
  const imagesSql = 'SELECT url FROM app_hotel_image WHERE hotel_id = ? ORDER BY sort ASC';
  const roomsSql = `
    SELECT rt.*, rp.id as plan_id, rp.name as plan_name, rp.breakfast_count, rp.cancel_policy_type, rp.pay_type 
    FROM app_room_type rt 
    LEFT JOIN app_rate_plan rp ON rt.id = rp.room_type_id 
    WHERE rt.hotel_id = ? AND rt.status = 1 AND rp.status = 1
  `;

  db.query(hotelSql, [hotelId], (err, hotels) => {
    if (err) return res.status(500).send(err);
    if (hotels.length === 0) return res.status(404).send({ message: '酒店不存在' });

    const hotel = hotels[0];

    // 并行查询图片和房型
    Promise.all([
      new Promise(resolve => db.query(imagesSql, [hotelId], (e, r) => resolve(r))),
      new Promise(resolve => db.query(roomsSql, [hotelId], (e, r) => resolve(r)))
    ]).then(([images, rooms]) => {
      hotel.images = images.map(img => img.url);
      
      // 整理房型数据结构
      const roomMap = {};
      rooms.forEach(row => {
        if (!roomMap[row.id]) {
          roomMap[row.id] = {
            id: row.id,
            name: row.name,
            area: row.area_sqm,
            max_guests: row.max_guests,
            plans: []
          };
        }
        if (row.plan_id) {
          roomMap[row.id].plans.push({
            id: row.plan_id,
            name: row.plan_name,
            breakfast: row.breakfast_count,
            cancel_policy: row.cancel_policy_type,
            price: 999 // 这里应该去查 app_rate_calendar，暂时给个假数据
          });
        }
      });
      
      hotel.rooms = Object.values(roomMap);
      res.send(hotel);
    }).catch(e => {
      res.status(500).send({ message: '查询详情失败', error: e });
    });
  });
});

// ==========================================
// 首页/运营位接口
// ==========================================

// 获取首页 Banner
app.get('/api/banners', (req, res) => {
  const sql = 'SELECT * FROM app_banner WHERE status = 1 AND NOW() BETWEEN start_at AND end_at ORDER BY sort ASC';
  db.query(sql, (err, results) => {
    if (err) return res.status(500).send({ message: '查询 Banner 失败', error: err });
    res.send(results);
  });
});

// ==========================================
// 用户相关接口 (简化版)
// ==========================================

// 模拟登录 (仅用于演示，实际应包含密码校验/Token生成)
app.post('/api/user/login', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).send({ message: '手机号不能为空' });

  const sql = 'SELECT * FROM app_user WHERE phone = ?';
  db.query(sql, [phone], (err, results) => {
    if (err) return res.status(500).send({ message: '登录失败', error: err });
    if (results.length === 0) {
      // 自动注册 (简化)
      const insertSql = 'INSERT INTO app_user (phone, nickname) VALUES (?, ?)';
      db.query(insertSql, [phone, `用户${phone.slice(-4)}`], (err, result) => {
        if (err) return res.status(500).send({ message: '注册失败', error: err });
        res.send({ id: result.insertId, phone, nickname: `用户${phone.slice(-4)}` });
      });
    } else {
      res.send(results[0]);
    }
  });
});

// 获取我的优惠券
app.get('/api/user/:id/coupons', (req, res) => {
  const userId = req.params.id;
  const sql = `
    SELECT c.*, uc.status as user_status, uc.received_at 
    FROM app_coupon_user uc 
    JOIN app_coupon c ON uc.coupon_id = c.id 
    WHERE uc.user_id = ?
  `;
  db.query(sql, [userId], (err, results) => {
    if (err) return res.status(500).send({ message: '查询优惠券失败', error: err });
    res.send(results);
  });
});

// 测试一下连接是否成功
db.getConnection((err, connection) => {
  if (err) {
    console.error('❌ 数据库连接失败！请检查账号密码或phpStudy是否启动。');
    console.error('错误信息:', err.message);
  } else {
    console.log('✅ 数据库连接成功！服务端已准备就绪。');
    connection.release(); // 用完记得释放连接
  }
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

// 启动服务器
app.listen(port, () => {
  console.log(`🚀 服务端正在运行: http://localhost:${port}`);
});