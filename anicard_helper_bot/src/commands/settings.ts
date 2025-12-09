import { Context } from 'telegraf';
import { showSettingsMenu } from '../services/settingsService';

/**
 * Команда /settings - показывает меню настроек бота
 */
export async function settingsCommand(ctx: Context) {
  await showSettingsMenu(ctx);
}

