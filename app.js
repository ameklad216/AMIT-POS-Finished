// تحميل إعدادات البيئة قبل إنشاء التطبيق واتصال قاعدة البيانات.
require('dotenv').config({ quiet: true });

const express = require('express');
const { createPool } = require('./database');
const { createApp } = require('./create-app');

// تجهيز تطبيق Express مرة واحدة؛ Vercel يتولى استقبال الطلبات دون فتح منفذ هنا.
const app = express();
createApp({ app, pool: createPool() });

// تصدير معالج الطلبات مباشرة بالشكل الذي يحتاجه Vercel.
module.exports = app;
