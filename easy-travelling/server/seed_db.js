const mysql = require('mysql2/promise');

// 数据库配置
const dbConfig = {
  host: '127.0.0.1',
  user: 'root',
  password: 'root',
  database: 'easy_travel_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true
};

async function seedDb() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ 数据库连接成功');

    // 1. 插入城市数据
    console.log('正在插入城市数据...');
    const [cityResult] = await connection.query(`
      INSERT INTO app_city (name, province, lng, lat) VALUES 
      ('上海', '上海市', 121.473701, 31.230416),
      ('北京', '北京市', 116.4074, 39.9042),
      ('广州', '广东省', 113.2644, 23.1291),
      ('深圳', '广东省', 114.0579, 22.5431),
      ('杭州', '浙江省', 120.1551, 30.2741),
      ('成都', '四川省', 104.0665, 30.5723),
      ('三亚', '海南省', 109.511909, 18.252847),
      ('西安', '四川省', 108.9398, 34.3416),
      ('重庆', '重庆市', 106.5516, 29.5630),
      ('南京', '浙江省', 118.7969, 32.0603),
      ('苏州', '浙江省', 120.5853, 31.2989),
      ('武汉', '湖北省', 114.3055, 30.5928),
      ('长沙', '湖南省', 112.9388, 28.2282),
      ('天津', '天津市', 117.2008, 39.0840),
      ('郑州', '陕西省', 113.6253, 34.7466),
      ('青岛', '山东省', 120.3826, 36.0671),
      ('厦门', '山东省', 118.0894, 24.4798),
      ('大连', '辽宁省', 121.6147, 38.9140),
      ('昆明', '云南省', 102.8329, 24.8801),
      ('哈尔滨', '黑龙江省', 126.5349, 45.8038)
      ON DUPLICATE KEY UPDATE name=name;
    `);
    
    // 获取城市ID
    const [cities] = await connection.query('SELECT id, name FROM app_city');
    const shanghaiId = cities.find(c => c.name === '上海')?.id;
    const beijingId = cities.find(c => c.name === '北京')?.id;

    // 2. 插入标签
    console.log('正在插入标签数据...');
    await connection.query(`
      INSERT INTO app_dict_tag (tag_type, name, sort) VALUES 
      (1, '免费WIFI', 1), (1, '含早', 2), (1, '停车场', 3),
      (2, '商务出行', 1), (2, '亲子游', 2)
      ON DUPLICATE KEY UPDATE name=name;
    `);

    if (shanghaiId) {
      // 3. 插入酒店数据
      console.log('正在插入酒店数据...');
      
      const [hotelResult] = await connection.query(`
        INSERT INTO app_hotel (name, brand, star_level, city_id, address, min_price, score, review_count) VALUES 
        ('上海中心J酒店', '锦江', 5, ?, '上海市浦东新区东泰路126号', 3888.00, 4.9, 1200),
        ('上海和平饭店', '费尔蒙', 5, ?, '上海市黄浦区南京东路20号', 2888.00, 4.8, 3500),
        ('全季酒店(上海南京东路步行街店)', '全季', 3, ?, '上海市黄浦区山西南路', 450.00, 4.6, 5000)
        ON DUPLICATE KEY UPDATE name=name;
      `, [shanghaiId, shanghaiId, shanghaiId]);

      // 获取刚才插入的酒店ID
      const [hotels] = await connection.query('SELECT id, name FROM app_hotel WHERE city_id = ?', [shanghaiId]);
      const jHotelId = hotels.find(h => h.name === '上海中心J酒店')?.id;

      if (jHotelId) {
        // 4. 插入图片
        await connection.query(`
          INSERT INTO app_hotel_image (hotel_id, url, sort) VALUES 
          (?, 'https://img.example.com/j-hotel-1.jpg', 1),
          (?, 'https://img.example.com/j-hotel-2.jpg', 2)
          ON DUPLICATE KEY UPDATE url=url;
        `, [jHotelId, jHotelId]);

        // 5. 插入房型
        console.log('正在插入房型数据...');
        await connection.query(`
          INSERT INTO app_room_type (hotel_id, name, area_sqm, max_guests, status) VALUES 
          (?, '祥云客房', 60.00, 2, 1),
          (?, '云上套房', 90.00, 2, 1)
          ON DUPLICATE KEY UPDATE name=name;
        `, [jHotelId, jHotelId]);
        
        const [rooms] = await connection.query('SELECT id FROM app_room_type WHERE hotel_id = ?', [jHotelId]);
        const roomId = rooms[0]?.id;

        if (roomId) {
           // 6. 插入价格计划
           console.log('正在插入价格计划...');
           await connection.query(`
             INSERT INTO app_rate_plan (room_type_id, name, breakfast_count, cancel_policy_type) VALUES 
             (?, '含单早/不可取消', 1, 1),
             (?, '含双早/免费取消', 2, 0)
             ON DUPLICATE KEY UPDATE name=name;
           `, [roomId, roomId]);
        }
      }

      // 7. 插入 Banner 数据
      console.log('正在插入 Banner 数据...');
      await connection.query(`
        DELETE FROM app_banner;
      `);
      
      await connection.query(`
        INSERT INTO app_banner (position, title, image_url, jump_type, jump_ref, start_at, end_at, sort) VALUES 
        (1, '山水田园', 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80', 1, '', NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), 1),
        (1, '高原湖泊', 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=800&q=80', 1, '', NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), 2),
        (1, '雪山倒影', 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=80', 1, '', NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), 3);
      `);

      // 8. 插入用户数据 (模拟登录用户)
      console.log('正在插入用户数据...');
      await connection.query(`
        INSERT INTO app_user (phone, nickname, avatar_url) VALUES 
        ('13800138000', '测试用户', 'https://img.example.com/avatar.jpg')
        ON DUPLICATE KEY UPDATE nickname=nickname;
      `);

      // 9. 插入优惠券数据
      console.log('正在插入优惠券数据...');
      await connection.query(`
        INSERT INTO app_coupon (name, coupon_type, discount_value, threshold_amount, valid_from, valid_to, total_quota) VALUES 
        ('新用户红包', 2, 50.00, 500.00, NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), 1000)
        ON DUPLICATE KEY UPDATE name=name;
      `);
    }

    console.log('✅ 演示数据注入成功！');

  } catch (error) {
    console.error('❌ 数据注入失败:', error);
  } finally {
    if (connection) connection.end();
  }
}

seedDb();
