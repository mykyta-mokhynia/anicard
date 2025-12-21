/**
 * Скрипт для выполнения миграции добавления системы варнов
 * Запуск: node database/run_migration_warns.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

async function runMigration() {
  let connection;
  
  try {
    // Загружаем переменные окружения из .env
    dotenv.config({ path: path.resolve(__dirname, '../.env') });

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
    const migrationPath = path.join(__dirname, 'migration_add_warns.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Выполняю миграцию...');
    await connection.query(migrationSQL);
    
    console.log('✅ Миграция успешно выполнена!');
    console.log('📌 Созданы таблицы:');
    console.log('   - user_warns (варны пользователей)');
    console.log('   - group_warn_settings (настройки варнов для групп)');
    
  } catch (error) {
    console.error('❌ Ошибка при выполнении миграции:', error.message);
    if (error.code === 'ER_DUP_TABLE_NAME') {
      console.log('ℹ️  Таблицы уже существуют, миграция пропущена');
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

runMigration();

