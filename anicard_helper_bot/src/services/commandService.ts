import { Telegraf } from 'telegraf';
import { startCommand } from '../commands/basic';
import { settingsCommand } from '../commands/settings';
import { menuCommand } from '../commands/menu';
import { pollsCommand } from '../commands/polls';
import { groupCommand } from '../commands/startInterval';
import { startCycleCommand } from '../commands/startCycle';
import { registerCommand } from '../commands/register';
import { unregisterCommand } from '../commands/unregister';
import { unregCommand } from '../commands/unreg';
import { timeCommand } from '../commands/time';
import { usersCommand } from '../commands/users';
import { sendMessageCommand } from '../commands/sendMessage';
import { topCommand } from '../commands/top';
// Импорты других команд будут добавляться здесь

/**
 * Сервис для регистрации всех команд бота
 * Централизованная регистрация команд для поддержания чистоты index.ts
 */
export function registerCommands(bot: Telegraf) {
  // Сохраняем bot для использования в командах, которым нужен bot объект
  (global as any).__bot = bot;
  // ============================================
  // БАЗОВЫЕ КОМАНДЫ
  // ============================================
  bot.command('start', startCommand);
  bot.command('settings', settingsCommand);
  bot.command('menu', menuCommand);
  bot.command('time', timeCommand);
  bot.command('register', registerCommand);
  bot.command('unregister', unregisterCommand);
  bot.command('unreg', unregCommand);
  // Команды "Анрег" и "анрег" (без слэша) обрабатываются как текст в index.ts
  bot.command('users', usersCommand);
  bot.command('send', sendMessageCommand);
  bot.command('top', topCommand);

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
  bot.command('startcycle', startCycleCommand);
}

