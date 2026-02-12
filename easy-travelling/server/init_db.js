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
  multipleStatements: true // 允许执行多条 SQL 语句
};

async function initDb() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ 数据库连接成功');

    const sql = `
      -- 1) 用户与认证
      CREATE TABLE IF NOT EXISTS app_user (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        phone VARCHAR(20) NULL,
        email VARCHAR(128) NULL,
        nickname VARCHAR(64) NOT NULL DEFAULT '',
        avatar_url VARCHAR(255) NOT NULL DEFAULT '',
        status TINYINT NOT NULL DEFAULT 1,
        register_channel TINYINT NOT NULL DEFAULT 1,
        last_login_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_phone (phone),
        UNIQUE KEY uk_email (email),
        KEY idx_status_created (status, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_user_auth_identity (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        provider TINYINT NOT NULL,
        provider_uid VARCHAR(128) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_provider_uid (provider, provider_uid),
        KEY idx_user (user_id),
        CONSTRAINT fk_auth_user
          FOREIGN KEY (user_id) REFERENCES app_user(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_sms_code (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        phone VARCHAR(20) NOT NULL,
        code_hash VARCHAR(128) NOT NULL,
        scene TINYINT NOT NULL,
        expired_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_phone_scene (phone, scene, created_at),
        KEY idx_expired (expired_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      -- 2) 城市与标签
      CREATE TABLE IF NOT EXISTS app_city (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(64) NOT NULL,
        country_code CHAR(2) NOT NULL DEFAULT 'CN',
        province VARCHAR(64) NOT NULL DEFAULT '',
        timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
        lng DECIMAL(10,6) NULL,
        lat DECIMAL(10,6) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_country (country_code),
        KEY idx_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_dict_tag (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        tag_type TINYINT NOT NULL,
        name VARCHAR(32) NOT NULL,
        sort INT NOT NULL DEFAULT 0,
        status TINYINT NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_type_status (tag_type, status),
        UNIQUE KEY uk_type_name (tag_type, name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      -- 3) 酒店/民宿商品域
      CREATE TABLE IF NOT EXISTS app_hotel (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        hotel_type TINYINT NOT NULL DEFAULT 1,
        name VARCHAR(128) NOT NULL,
        brand VARCHAR(64) NOT NULL DEFAULT '',
        star_level TINYINT NOT NULL DEFAULT 0,
        city_id BIGINT UNSIGNED NOT NULL,
        address VARCHAR(255) NOT NULL DEFAULT '',
        lng DECIMAL(10,6) NULL,
        lat DECIMAL(10,6) NULL,
        check_in_time VARCHAR(16) NOT NULL DEFAULT '14:00',
        check_out_time VARCHAR(16) NOT NULL DEFAULT '12:00',
        min_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        score DECIMAL(2,1) NOT NULL DEFAULT 0.0,
        review_count INT NOT NULL DEFAULT 0,
        status TINYINT NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        KEY idx_city_status (city_id, status),
        KEY idx_city_price (city_id, status, min_price),
        KEY idx_city_score (city_id, status, score),
        KEY idx_name (name),
        CONSTRAINT fk_hotel_city
          FOREIGN KEY (city_id) REFERENCES app_city(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_hotel_image (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        hotel_id BIGINT UNSIGNED NOT NULL,
        url VARCHAR(255) NOT NULL,
        sort INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_hotel_sort (hotel_id, sort),
        CONSTRAINT fk_hotel_image_hotel
          FOREIGN KEY (hotel_id) REFERENCES app_hotel(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_hotel_tag_rel (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        hotel_id BIGINT UNSIGNED NOT NULL,
        tag_id BIGINT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_hotel_tag (hotel_id, tag_id),
        KEY idx_tag (tag_id),
        CONSTRAINT fk_hotel_tag_hotel
          FOREIGN KEY (hotel_id) REFERENCES app_hotel(id),
        CONSTRAINT fk_hotel_tag_tag
          FOREIGN KEY (tag_id) REFERENCES app_dict_tag(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_room_type (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        hotel_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(128) NOT NULL,
        area_sqm DECIMAL(6,2) NULL,
        bed_type TINYINT NOT NULL DEFAULT 0,
        bed_width_m DECIMAL(4,2) NULL,
        max_guests TINYINT NOT NULL DEFAULT 2,
        window_type TINYINT NOT NULL DEFAULT 0,
        smoke TINYINT NOT NULL DEFAULT 0,
        status TINYINT NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        KEY idx_hotel_status (hotel_id, status),
        KEY idx_hotel_capacity (hotel_id, max_guests),
        CONSTRAINT fk_room_hotel
          FOREIGN KEY (hotel_id) REFERENCES app_hotel(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_rate_plan (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        room_type_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(64) NOT NULL,
        breakfast_count TINYINT NOT NULL DEFAULT 0,
        cancel_policy_type TINYINT NOT NULL DEFAULT 0,
        pay_type TINYINT NOT NULL DEFAULT 1,
        refund_rule_json JSON NULL,
        status TINYINT NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        KEY idx_room_status (room_type_id, status),
        CONSTRAINT fk_plan_room
          FOREIGN KEY (room_type_id) REFERENCES app_room_type(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_rate_calendar (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        rate_plan_id BIGINT UNSIGNED NOT NULL,
        date DATE NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        market_price DECIMAL(10,2) NULL,
        currency CHAR(3) NOT NULL DEFAULT 'CNY',
        status TINYINT NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_plan_date (rate_plan_id, date),
        KEY idx_date (date),
        KEY idx_plan_date (rate_plan_id, date),
        CONSTRAINT fk_rate_plan
          FOREIGN KEY (rate_plan_id) REFERENCES app_rate_plan(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_inventory_calendar (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        rate_plan_id BIGINT UNSIGNED NOT NULL,
        date DATE NOT NULL,
        total_qty INT NOT NULL DEFAULT 0,
        reserved_qty INT NOT NULL DEFAULT 0,
        status TINYINT NOT NULL DEFAULT 1,
        version INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_plan_date (rate_plan_id, date),
        KEY idx_plan_date (rate_plan_id, date),
        CONSTRAINT fk_inv_plan
          FOREIGN KEY (rate_plan_id) REFERENCES app_rate_plan(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      -- 4) 收藏/看过/搜索历史
      CREATE TABLE IF NOT EXISTS app_favorite_hotel (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        hotel_id BIGINT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_user_hotel (user_id, hotel_id),
        KEY idx_user_created (user_id, created_at),
        KEY idx_hotel (hotel_id),
        CONSTRAINT fk_fav_user
          FOREIGN KEY (user_id) REFERENCES app_user(id),
        CONSTRAINT fk_fav_hotel
          FOREIGN KEY (hotel_id) REFERENCES app_hotel(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_view_history_hotel (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        hotel_id BIGINT UNSIGNED NOT NULL,
        last_viewed_at DATETIME NOT NULL,
        view_count INT NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_user_hotel (user_id, hotel_id),
        KEY idx_user_last (user_id, last_viewed_at),
        CONSTRAINT fk_hist_user
          FOREIGN KEY (user_id) REFERENCES app_user(id),
        CONSTRAINT fk_hist_hotel
          FOREIGN KEY (hotel_id) REFERENCES app_hotel(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_search_history (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NULL,
        device_id VARCHAR(64) NULL,
        city_id BIGINT UNSIGNED NOT NULL,
        keyword VARCHAR(128) NOT NULL DEFAULT '',
        check_in DATE NULL,
        check_out DATE NULL,
        guests TINYINT NOT NULL DEFAULT 2,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_user_created (user_id, created_at),
        KEY idx_device_created (device_id, created_at),
        KEY idx_city_created (city_id, created_at),
        CONSTRAINT fk_search_user
          FOREIGN KEY (user_id) REFERENCES app_user(id),
        CONSTRAINT fk_search_city
          FOREIGN KEY (city_id) REFERENCES app_city(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      -- 5) 订单与支付
      CREATE TABLE IF NOT EXISTS app_booking_order (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_no VARCHAR(32) NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        hotel_id BIGINT UNSIGNED NOT NULL,
        city_id BIGINT UNSIGNED NOT NULL,
        check_in DATE NOT NULL,
        check_out DATE NOT NULL,
        nights TINYINT NOT NULL,
        contact_name VARCHAR(64) NOT NULL DEFAULT '',
        contact_phone VARCHAR(20) NOT NULL DEFAULT '',
        order_status TINYINT NOT NULL DEFAULT 10,
        pay_status TINYINT NOT NULL DEFAULT 0,
        total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        pay_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        currency CHAR(3) NOT NULL DEFAULT 'CNY',
        cancel_reason VARCHAR(255) NULL,
        cancelled_at DATETIME NULL,
        paid_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_order_no (order_no),
        KEY idx_user_status_created (user_id, order_status, created_at),
        KEY idx_hotel_created (hotel_id, created_at),
        KEY idx_pay_status_created (pay_status, created_at),
        CONSTRAINT fk_order_user
          FOREIGN KEY (user_id) REFERENCES app_user(id),
        CONSTRAINT fk_order_hotel
          FOREIGN KEY (hotel_id) REFERENCES app_hotel(id),
        CONSTRAINT fk_order_city
          FOREIGN KEY (city_id) REFERENCES app_city(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_booking_order_item (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_id BIGINT UNSIGNED NOT NULL,
        room_type_id BIGINT UNSIGNED NOT NULL,
        rate_plan_id BIGINT UNSIGNED NOT NULL,
        room_name_snapshot VARCHAR(128) NOT NULL,
        rate_plan_snapshot VARCHAR(64) NOT NULL,
        room_qty INT NOT NULL DEFAULT 1,
        guest_count TINYINT NOT NULL DEFAULT 2,
        amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_order (order_id),
        CONSTRAINT fk_item_order
          FOREIGN KEY (order_id) REFERENCES app_booking_order(id),
        CONSTRAINT fk_item_room
          FOREIGN KEY (room_type_id) REFERENCES app_room_type(id),
        CONSTRAINT fk_item_plan
          FOREIGN KEY (rate_plan_id) REFERENCES app_rate_plan(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_booking_order_item_night (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_item_id BIGINT UNSIGNED NOT NULL,
        date DATE NOT NULL,
        night_price DECIMAL(10,2) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_item_date (order_item_id, date),
        KEY idx_item (order_item_id),
        CONSTRAINT fk_night_item
          FOREIGN KEY (order_item_id) REFERENCES app_booking_order_item(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_booking_order_guest (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(64) NOT NULL,
        id_type TINYINT NOT NULL DEFAULT 1,
        id_no_enc VARCHAR(256) NOT NULL,
        phone VARCHAR(20) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_order (order_id),
        CONSTRAINT fk_guest_order
          FOREIGN KEY (order_id) REFERENCES app_booking_order(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_payment (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_id BIGINT UNSIGNED NOT NULL,
        pay_no VARCHAR(32) NOT NULL,
        channel TINYINT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency CHAR(3) NOT NULL DEFAULT 'CNY',
        status TINYINT NOT NULL DEFAULT 0,
        third_trade_no VARCHAR(64) NULL,
        requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        paid_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_pay_no (pay_no),
        KEY idx_order (order_id),
        KEY idx_status_created (status, created_at),
        CONSTRAINT fk_pay_order
          FOREIGN KEY (order_id) REFERENCES app_booking_order(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_refund (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        payment_id BIGINT UNSIGNED NOT NULL,
        refund_no VARCHAR(32) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        status TINYINT NOT NULL DEFAULT 0,
        reason VARCHAR(255) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_refund_no (refund_no),
        KEY idx_payment (payment_id),
        CONSTRAINT fk_refund_payment
          FOREIGN KEY (payment_id) REFERENCES app_payment(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      -- 6) 优惠券
      CREATE TABLE IF NOT EXISTS app_coupon (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(64) NOT NULL,
        coupon_type TINYINT NOT NULL,
        discount_value DECIMAL(10,2) NOT NULL,
        threshold_amount DECIMAL(10,2) NULL,
        valid_from DATETIME NOT NULL,
        valid_to DATETIME NOT NULL,
        scope_type TINYINT NOT NULL DEFAULT 1,
        scope_ref_id BIGINT UNSIGNED NULL,
        total_quota INT NOT NULL DEFAULT 0,
        status TINYINT NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_valid (valid_from, valid_to),
        KEY idx_status (status),
        KEY idx_scope (scope_type, scope_ref_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_coupon_user (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        coupon_id BIGINT UNSIGNED NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        code VARCHAR(32) NULL,
        status TINYINT NOT NULL DEFAULT 0,
        received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        used_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_code (code),
        KEY idx_user_status (user_id, status, received_at),
        KEY idx_coupon (coupon_id),
        CONSTRAINT fk_cu_coupon
          FOREIGN KEY (coupon_id) REFERENCES app_coupon(id),
        CONSTRAINT fk_cu_user
          FOREIGN KEY (user_id) REFERENCES app_user(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_order_coupon (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_id BIGINT UNSIGNED NOT NULL,
        coupon_user_id BIGINT UNSIGNED NOT NULL,
        discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_order (order_id),
        KEY idx_coupon_user (coupon_user_id),
        CONSTRAINT fk_oc_order
          FOREIGN KEY (order_id) REFERENCES app_booking_order(id),
        CONSTRAINT fk_oc_coupon_user
          FOREIGN KEY (coupon_user_id) REFERENCES app_coupon_user(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      -- 7) 我的（常用旅客/地址/发票）
      CREATE TABLE IF NOT EXISTS app_user_traveler (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(64) NOT NULL,
        id_type TINYINT NOT NULL DEFAULT 1,
        id_no_enc VARCHAR(256) NOT NULL,
        phone VARCHAR(20) NULL,
        is_default TINYINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        KEY idx_user_default (user_id, is_default, created_at),
        CONSTRAINT fk_traveler_user
          FOREIGN KEY (user_id) REFERENCES app_user(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_user_address (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        receiver VARCHAR(64) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        province VARCHAR(64) NOT NULL DEFAULT '',
        city VARCHAR(64) NOT NULL DEFAULT '',
        district VARCHAR(64) NOT NULL DEFAULT '',
        detail VARCHAR(255) NOT NULL DEFAULT '',
        is_default TINYINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        KEY idx_user_default (user_id, is_default, created_at),
        CONSTRAINT fk_addr_user
          FOREIGN KEY (user_id) REFERENCES app_user(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_invoice_profile (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        title_type TINYINT NOT NULL DEFAULT 1,
        title_name VARCHAR(128) NOT NULL,
        tax_no_enc VARCHAR(256) NULL,
        email VARCHAR(128) NULL,
        is_default TINYINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        KEY idx_user_default (user_id, is_default, created_at),
        CONSTRAINT fk_inv_user
          FOREIGN KEY (user_id) REFERENCES app_user(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      -- 8) 运营位/消息
      CREATE TABLE IF NOT EXISTS app_banner (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        position TINYINT NOT NULL,
        title VARCHAR(64) NOT NULL DEFAULT '',
        image_url VARCHAR(255) NOT NULL,
        jump_type TINYINT NOT NULL,
        jump_ref VARCHAR(255) NOT NULL DEFAULT '',
        start_at DATETIME NOT NULL,
        end_at DATETIME NOT NULL,
        sort INT NOT NULL DEFAULT 0,
        status TINYINT NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_pos_status_time (position, status, start_at, end_at),
        KEY idx_sort (position, sort)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS app_user_message (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        msg_type TINYINT NOT NULL,
        title VARCHAR(64) NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        is_read TINYINT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_user_read_created (user_id, is_read, created_at),
        CONSTRAINT fk_msg_user
          FOREIGN KEY (user_id) REFERENCES app_user(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      -- 保留原有的 bookings 表 (如果需要)
      CREATE TABLE IF NOT EXISTS bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_name VARCHAR(255) NOT NULL,
        user_phone VARCHAR(50) NOT NULL,
        user_id_card VARCHAR(50),
        hotel_id VARCHAR(50) NOT NULL,
        hotel_name VARCHAR(255) NOT NULL,
        check_in_date VARCHAR(50),
        check_out_date VARCHAR(50),
        total_price DECIMAL(10, 2),
        create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    console.log('正在执行 SQL 脚本...');
    await connection.query(sql);
    console.log('✅ 数据库初始化/更新成功！');

  } catch (error) {
    console.error('❌ 初始化失败:', error);
  } finally {
    if (connection) connection.end();
  }
}

initDb();
