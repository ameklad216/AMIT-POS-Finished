// 01 | سكربت تهيئة مستقل؛ يشغّل مرة عند تجهيز قاعدة بيانات جديدة.
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { databaseConfig } = require('../database');

// 02 | تهيئة القاعدة والجداول داخل transaction حتى لا تبقى تهيئة جزئية عند حدوث خطأ.
async function init() {
  const config = databaseConfig();

  // للاتصال المحلي فقط: إنشاء قاعدة البيانات عند غيابها. Neon يوفر قاعدة موجودة بالفعل.
  if (!config.connectionString) {
    if (!config.database || !/^[a-z][a-z0-9_]*$/.test(config.database))
      throw new Error('DB_NAME must be a lowercase database identifier.');
    const admin = new Client({ ...config, database: 'postgres' });
    try {
      await admin.connect();
      const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
        config.database,
      ]);
      if (!exists.rowCount)
        await admin.query('CREATE DATABASE "' + config.database + '"');
    } finally {
      await admin.end();
    }
  }

  // 03 | Client واحد يضمن تنفيذ BEGIN والاستعلامات وCOMMIT على نفس الاتصال.
  const client = new Client(config);
  try {
    await client.connect();

    // بدء المعاملة؛ لا تثبت التغييرات إلا بعد COMMIT.
    await client.query('BEGIN');

    // قراءة seed.sql لإنشاء users وproducts وsessions وحساب التدريب إن لم يكن موجودًا.
    await client.query(readFileSync(join(__dirname, '../seed.sql'), 'utf8'));

    // سجل بسيط يمنع تكرار إضافة بيانات البداية في كل تشغيل.
    await client.query(
      'CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY)',
    );
    const seeded = await client.query(
      "SELECT 1 FROM app_migrations WHERE name='initial-catalogue'",
    );
    if (!seeded.rowCount) {
      // 04 | منتجات تدريبية أولية؛ لا تمثل بيانات المستخدم المحلي التي قد تحتاج ترحيلًا منفصلًا.
      const samples = [
        ['Wireless Mouse', 'Ergonomic wireless mouse with USB receiver', 29.99],
        ['Mechanical Keyboard', 'RGB backlit mechanical keyboard', 89.99],
        ['24-inch Monitor', 'Full HD IPS monitor with HDMI and VGA ports', 199.99],
        ['USB-C Hub', '7-in-1 USB-C hub with HDMI and card reader', 45.99],
        ['Webcam HD', '1080p HD webcam with a built-in microphone', 59.99],
        ['Desk Lamp', 'LED desk lamp with adjustable brightness', 34.99],
        ['Laptop Stand', 'Adjustable aluminium laptop stand', 39.99],
        [
          'Noise Cancelling Headphones',
          'Over-ear headphones with active noise cancellation',
          149.99,
        ],
        ['Portable Charger', 'Fast charging power bank with dual USB ports', 24.99],
        ['Wireless Charging Pad', 'Qi-compatible 15W wireless charger', 19.99],
      ];

      // لا نضيف العينات إذا كانت القاعدة تحتوي منتجات بالفعل.
      const count = await client.query('SELECT count(*)::int AS count FROM products');
      if (!count.rows[0].count)
        for (const [name, description, price] of samples)
          await client.query(
            'INSERT INTO products(name,description,price) VALUES ($1,$2,$3)',
            [name, description, price],
          );
      await client.query(
        "INSERT INTO app_migrations(name) VALUES ('initial-catalogue')",
      );
    }

    // تثبيت التهيئة بعد نجاح جميع الخطوات. عند الفشل ينفذ catch عملية ROLLBACK.
    await client.query('COMMIT');
    console.log(
      'Application database tables are ready (' +
        (config.connectionString ? 'DATABASE_URL' : config.database) +
        ').',
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

// 05 | تشغيل السكربت وإرجاع exit code غير صفري إذا فشلت التهيئة.
init().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
