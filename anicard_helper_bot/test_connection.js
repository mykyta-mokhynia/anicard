const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { ConnectionTCPObfuscated, ConnectionTCPFull, ConnectionTCPAbridged } = require('telegram/network');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Загружаем API из main/.env (относительно корня проекта)
const projectRoot = path.resolve(__dirname, '..');
const mainEnvPath = path.join(projectRoot, 'tg_accounts', 'session', 'main', '.env');
console.log(`[TEST] Loading API from: ${mainEnvPath}`);

if (!fs.existsSync(mainEnvPath)) {
  console.error(`[TEST] ❌ File not found: ${mainEnvPath}`);
  process.exit(1);
}

const envConfig = dotenv.config({ path: mainEnvPath });
const apiId = parseInt(envConfig.parsed?.TELEGRAM_API_ID || '0', 10);
const apiHash = envConfig.parsed?.TELEGRAM_API_HASH || '';

if (!apiId || !apiHash) {
  console.error(`[TEST] ❌ Invalid API credentials: API_ID=${apiId}, API_HASH=${apiHash ? '***' : 'empty'}`);
  process.exit(1);
}

console.log(`[TEST] ✅ API loaded: API_ID=${apiId}, API_HASH=${apiHash.substring(0, 8)}...`);

async function testConnection(connectionType, connectionName) {
  console.log(`\n[TEST] ========================================`);
  console.log(`[TEST] Testing connection type: ${connectionName}`);
  console.log(`[TEST] ========================================`);
  
  const session = new StringSession('');
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 2,
    timeout: 10000,
    connection: connectionType,
  });

  console.log(`[TEST] Creating TelegramClient with ${connectionName}...`);
  console.log(`[TEST] Attempting to connect...`);

  try {
    // Таймаут на подключение (15 секунд)
    await Promise.race([
      client.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout (15s)')), 15000)
      )
    ]);

    console.log(`[TEST] ✅ Connected successfully!`);
    
    // Проверяем авторизацию
    const isAuthorized = await client.checkAuthorization();
    console.log(`[TEST] Authorization status: ${isAuthorized ? 'Authorized' : 'Not authorized'}`);
    
    // Отключаемся
    await client.disconnect();
    console.log(`[TEST] ✅ Disconnected`);
    
    console.log(`[TEST] 🎉 SUCCESS - GramJS connection works!`);
    process.exit(0);
  } catch (error) {
    console.error(`[TEST] ❌ ERROR:`, error.message);
    console.error(`[TEST] Full error:`, error);
    
    if (client) {
      try {
        await client.disconnect();
      } catch (e) {
        // Ignore
      }
    }
    
    process.exit(1);
  }
}

async function runAllTests() {
  const connections = [
    { type: ConnectionTCPObfuscated, name: 'TCPObfuscated' },
    { type: ConnectionTCPFull, name: 'TCPFull' },
    { type: ConnectionTCPAbridged, name: 'TCPAbridged' },
  ];

  for (const conn of connections) {
    try {
      await testConnection(conn.type, conn.name);
      console.log(`[TEST] ✅ ${conn.name} works!`);
      process.exit(0);
    } catch (error) {
      console.log(`[TEST] ❌ ${conn.name} failed: ${error.message}`);
    }
  }
  
  console.log(`\n[TEST] ❌ All connection types failed!`);
  process.exit(1);
}

runAllTests();

