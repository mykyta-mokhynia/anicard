/**
 * Скрипт для выполнения миграции добавления статуса 'off'
 * Запуск: node database/run_migration_status_off.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  let connection;
  
  try {
    // Создаем подключение к БД
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'anicard_bot',
      multipleStatements: true
    });

    console.log('✅ Подключение к БД установлено');

    // Читаем файл миграции
    const migrationPath = path.join(__dirname, 'migration_add_status_off.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Выполняю миграцию...');
    await connection.query(migrationSQL);
    
    console.log('✅ Миграция успешно выполнена!');
    console.log('📌 Статус "off" теперь добавлен в ENUM для поля status в таблице group_members');
    
  } catch (error) {
    console.error('❌ Ошибка при выполнении миграции:', error.message);
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️  Миграция уже была выполнена ранее');
    } else {
      process.exit(1);
    }
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Соединение с БД закрыто');
    }
  }
}

// Загружаем переменные окружения из .env если есть
const dotenv = require('dotenv');
const parentEnvPath = path.resolve(__dirname, '..', '..', '.env');
const currentEnvPath = path.resolve(__dirname, '..', '.env');

// Сначала пробуем загрузить из родительской директории
dotenv.config({ path: parentEnvPath });
// Затем из текущей (если есть, перезапишет значения)
dotenv.config({ path: currentEnvPath });

runMigration();

