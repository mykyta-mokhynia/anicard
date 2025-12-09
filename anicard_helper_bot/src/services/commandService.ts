import { Telegraf } from 'telegraf';
import { startCommand } from '../commands/basic';
import { settingsCommand } from '../commands/settings';
import { pollsCommand } from '../commands/polls';
import { groupCommand } from '../commands/startInterval';
import { registerCommand } from '../commands/register';
import { unregisterCommand } from '../commands/unregister';
// Импорты других команд будут добавляться здесь

/**
 * Сервис для регистрации всех команд бота
 * Централизованная регистрация команд для поддержания чистоты index.ts
 */
export function registerCommands(bot: Telegraf) {
  // ============================================
  // БАЗОВЫЕ КОМАНДЫ
  // ============================================
  bot.command('start', startCommand);
  bot.command('settings', settingsCommand);
  bot.command('register', registerCommand);
  bot.command('unregister', unregisterCommand);

  // ============================================
  // КОМАНДЫ УПРАВЛЕНИЯ ГРУППАМИ
  // ============================================
  // Команды будут добавляться здесь

  // ============================================
  // КОМАНДЫ ОПРОСНИКОВ
  // ============================================
  bot.command('polls', pollsCommand);

  // ============================================
  // КОМАНДЫ ИНТЕРВАЛОВ
  // ============================================
  bot.command('group', groupCommand);
}

