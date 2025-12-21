import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { getGroupTopicsFromDB, syncTopicsFromTelegram } from './topicsService';
import { checkBotPermissions, isGroupWithTopics } from '../utils/permissions';

/**
 * Показывает главное меню настроек
 */
export async function showSettingsMenu(ctx: Context) {
  if (!ctx.chat || !('id' in ctx.chat)) {
    await ctx.reply('❌ Эта команда доступна только в группах.');
    return;
  }

  // Проверяем права администратора пользователя
  if (ctx.from) {
    try {
      const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
      
      if (member.status !== 'administrator' && member.status !== 'creator') {
        const errorMsg = '❌ Эта команда доступна только администраторам.';
        try {
          if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
            await ctx.editMessageText(errorMsg);
          } else {
            await ctx.reply(errorMsg);
          }
        } catch (e) {
          await ctx.reply(errorMsg);
        }
        return;
      }
    } catch (error: any) {
      console.error('[SettingsService] Error checking admin:', error);
      const errorMsg = '❌ Ошибка при проверке прав администратора.';
      try {
        if (ctx.callbackQuery && 'message' in ctx.callbackQuery) {
          await ctx.editMessageText(errorMsg);
        } else {
          await ctx.reply(errorMsg);
        }
      } catch (e) {
        await ctx.reply(errorMsg);
      }
      return;
    }
  }

  const chat = ctx.chat;
  const isTopicsGroup = isGroupWithTopics(chat);
  const permissions = await checkBotPermissions(ctx);

  // Проверяем, достаточно ли прав
  if (!permissions.isAdmin) {
    await ctx.reply('❌ Бот должен быть администратором для доступа к настройкам.');
    return;
  }

  if (isTopicsGroup && !permissions.hasRequiredPermissions) {
    await ctx.reply(
      '⚠️ Для работы в группах с темами необходимы дополнительные права:\n' +
      permissions.missingPermissions.map(p => `• ${p}`).join('\n')
    );
    return;
  }

  // Формируем сообщение
  let message = '⚙️ **Раздел настроек бота AniCard Gods**\n\n';
  message += 'Здесь вы можете изменить параметры проверки активности, уведомлений и административных функций.\n\n';

  // Создаем клавиатуру
  const keyboard: any[] = [];

  // Интервалы сбора групп
  keyboard.push([
    Markup.button.callback('⏰ Интервалы сбора групп', 'menu:intervals')
  ]);

  // Варны
  keyboard.push([
    Markup.button.callback('⚠️ Варны', 'menu:warns')
  ]);

  // Режим тем (только для групп с темами)
  if (isTopicsGroup) {
    const topicsEnabled = true; // TODO: получить из базы/конфига
    const topicsIcon = topicsEnabled ? '✅' : '❌';
    keyboard.push([
      Markup.button.callback(`${topicsIcon} Режим тем`, 'menu:topics_toggle')
    ]);

    if (topicsEnabled) {
      keyboard.push([
        Markup.button.callback('📑 Настройка вкладок', 'menu:topics_config')
      ]);
    }
  }

  // Кнопка "Назад"
  keyboard.push([
    Markup.button.callback('◀️ Назад', 'menu:main')
  ]);

  // Проверяем, есть ли callback query (кнопка "Назад" или переход из меню)
  // Если есть - редактируем сообщение, если нет - отправляем новое (команда /settings)
  if (ctx.callbackQuery && ctx.callbackQuery.message && 'message_id' in ctx.callbackQuery.message) {
    try {
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    } catch (error: any) {
      // Если не удалось отредактировать (например, сообщение не изменилось), отправляем новое
      if (error.response?.error_code === 400 && 
          error.response?.description?.includes('message is not modified')) {
        return;
      }
      // Для других ошибок отправляем новое сообщение
      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      });
    }
  } else {
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
    });
  }
}

/**
 * Показывает меню выбора интервалов сбора групп
 */
export async function showIntervalsMenu(ctx: Context) {
  if (!ctx.chat || !('id' in ctx.chat)) {
    return;
  }

  const groupId = ctx.chat.id;
  
  // Получаем текущие настройки из БД
  let currentHours = 2;
  let currentMinutes = 0;
  
  try {
    const { getGroupSettingsComplete } = await import('../types/crud/group_settings_complete_crud');
    const settings = await getGroupSettingsComplete(groupId);
    if (settings?.groupSettings) {
      // Используем проверку на undefined/null, так как 0 - валидное значение
      currentHours = settings.groupSettings.collectionIntervalHours !== undefined 
        ? settings.groupSettings.collectionIntervalHours 
        : 2;
      currentMinutes = settings.groupSettings.collectionIntervalMinutes !== undefined 
        ? settings.groupSettings.collectionIntervalMinutes 
        : 0;
    }
  } catch (error) {
    console.error('[SettingsService] Error loading settings:', error);
  }

  const message = `⏰ **Выберите интервал сбора групп:**\n\n` +
    `📊 **Текущий интервал:** ${currentHours}ч ${currentMinutes}м\n\n`;
  
  const keyboard: any[] = [];

  // Быстрые варианты
  keyboard.push([
    Markup.button.callback('1 час', 'interval:1h'),
    Markup.button.callback('2 часа', 'interval:2h'),
    Markup.button.callback('4 часа', 'interval:4h'),
  ]);

  // Матрица часов и минут
  keyboard.push([
    Markup.button.callback('🕐 Настроить часы (0-24)', 'interval:hours_menu')
  ]);
  keyboard.push([
    Markup.button.callback('🕐 Настроить минуты (0-60)', 'interval:minutes_menu')
  ]);

  // Назад
  keyboard.push([
    Markup.button.callback('◀️ Назад', 'menu:main')
  ]);

  try {
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
    });
  } catch (error: any) {
    // Игнорируем ошибку, если сообщение не изменилось (это нормально)
    if (error.response?.error_code === 400 && 
        error.response?.description?.includes('message is not modified')) {
      return;
    }
    // Для других ошибок пробрасываем дальше
    throw error;
  }
}

/**
 * Показывает меню выбора часов (0-24)
 */
export async function showHoursMenu(ctx: Context) {
  if (!ctx.chat || !('id' in ctx.chat)) {
    return;
  }

  const groupId = ctx.chat.id;
  
  // Получаем текущие настройки из БД
  let currentHours = 2;
  
  try {
    const { getGroupSettingsComplete } = await import('../types/crud/group_settings_complete_crud');
    const settings = await getGroupSettingsComplete(groupId);
    if (settings?.groupSettings) {
      // Используем проверку на undefined/null, так как 0 - валидное значение
      currentHours = settings.groupSettings.collectionIntervalHours !== undefined 
        ? settings.groupSettings.collectionIntervalHours 
        : 2;
    }
  } catch (error) {
    console.error('[SettingsService] Error loading settings:', error);
  }

  const message = `🕐 **Выберите количество часов:**\n\n` +
    `📊 **Текущее значение:** ${currentHours}ч\n\n`;
  
  const keyboard: any[] = [];
  
  // Большая кнопка "0" сверху
  keyboard.push([
    Markup.button.callback(
      currentHours === 0 ? '✅ 0ч' : '0ч',
      'interval:hour:0'
    )
  ]);

  const rows: any[] = [];
  // Создаем кнопки по 6 в ряд (1-24)
  for (let i = 1; i <= 24; i++) {
    const label = currentHours === i ? `✅ ${i}ч` : `${i}ч`;
    rows.push(Markup.button.callback(label, `interval:hour:${i}`));
    if (rows.length === 6 || i === 24) {
      keyboard.push([...rows]);
      rows.length = 0;
    }
  }

  // Назад
  keyboard.push([
    Markup.button.callback('◀️ Назад к интервалам', 'menu:intervals')
  ]);

  try {
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
    });
  } catch (error: any) {
    // Игнорируем ошибку, если сообщение не изменилось (это нормально)
    if (error.response?.error_code === 400 && 
        error.response?.description?.includes('message is not modified')) {
      return;
    }
    // Для других ошибок пробрасываем дальше
    throw error;
  }
}

/**
 * Показывает меню выбора минут (0-60)
 */
export async function showMinutesMenu(ctx: Context) {
  if (!ctx.chat || !('id' in ctx.chat)) {
    return;
  }

  const groupId = ctx.chat.id;
  
  // Получаем текущие настройки из БД
  let currentMinutes = 0;
  
  try {
    const { getGroupSettingsComplete } = await import('../types/crud/group_settings_complete_crud');
    const settings = await getGroupSettingsComplete(groupId);
    if (settings?.groupSettings) {
      // Используем проверку на undefined/null, так как 0 - валидное значение
      currentMinutes = settings.groupSettings.collectionIntervalMinutes !== undefined 
        ? settings.groupSettings.collectionIntervalMinutes 
        : 0;
    }
  } catch (error) {
    console.error('[SettingsService] Error loading settings:', error);
  }

  const message = `🕐 **Выберите количество минут:**\n\n` +
    `📊 **Текущее значение:** ${currentMinutes}м\n\n`;
  
  const keyboard: any[] = [];
  const rows: any[] = [];

  // Начинаем с 0 (нельзя выставить меньше 0)
  for (let i = 0; i <= 60; i++) {
    const label = currentMinutes === i ? `✅ ${i}м` : `${i}м`;
    rows.push(Markup.button.callback(label, `interval:minute:${i}`));
    if (rows.length === 6 || i === 60) {
      keyboard.push([...rows]);
      rows.length = 0;
    }
  }

  // Назад
  keyboard.push([
    Markup.button.callback('◀️ Назад к интервалам', 'menu:intervals')
  ]);

  try {
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
    });
  } catch (error: any) {
    // Игнорируем ошибку, если сообщение не изменилось (это нормально)
    if (error.response?.error_code === 400 && 
        error.response?.description?.includes('message is not modified')) {
      return;
    }
    // Для других ошибок пробрасываем дальше
    throw error;
  }
}

/**
 * Показывает меню настройки вкладок (тем)
 */
export async function showTopicsConfigMenu(ctx: Context, page: number = 0) {
  if (!ctx.chat || !('id' in ctx.chat)) {
    return;
  }

  const groupId = ctx.chat.id;

  try {
    // Получаем темы из базы данных
    const { topics, total, hasMore } = await getGroupTopicsFromDB(groupId, page, 10);

    // Если тем нет, пытаемся синхронизировать из Telegram
    if (topics.length === 0 && page === 0) {
      console.log(`[SettingsService] No topics in DB for group ${groupId}, attempting sync...`);
      const syncedTopics = await syncTopicsFromTelegram(ctx, groupId);
      if (syncedTopics.length > 0) {
        // Перезагружаем после синхронизации
        const refreshed = await getGroupTopicsFromDB(groupId, 0, 10);
        return showTopicsConfigMenuWithData(ctx, refreshed.topics, refreshed.total, refreshed.hasMore, 0);
      } else {
        console.log(`[SettingsService] Sync returned 0 topics. Group may not have topics or API method unavailable.`);
      }
    }

    await showTopicsConfigMenuWithData(ctx, topics, total, hasMore, page);
  } catch (error: any) {
    // Игнорируем ошибку, если сообщение не изменилось
    if (error.response?.error_code === 400 && 
        error.response?.description?.includes('message is not modified')) {
      return;
    }
    
    console.error('[SettingsService] Error showing topics config:', error);
    try {
      await ctx.answerCbQuery('❌ Ошибка при загрузке тем');
    } catch (cbError) {
      // Игнорируем ошибки ответа на callback
    }
  }
}

/**
 * Вспомогательная функция для отображения меню с данными
 */
async function showTopicsConfigMenuWithData(
  ctx: Context,
  topics: any[],
  total: number,
  hasMore: boolean,
  page: number
) {
  let message = '📑 **Настройка вкладок**\n\n';
  
  if (topics.length === 0) {
    message += '⚠️ **Темы не найдены в базе данных.**\n\n';
    message += '📝 **Как синхронизировать темы:**\n';
    message += '1. Создайте новую тему в группе, или\n';
    message += '2. Отредактируйте название существующей темы\n\n';
    message += 'Бот автоматически сохранит темы при их создании или редактировании.\n\n';
    message += '💡 После этого нажмите "🔄 Синхронизировать темы" или откройте меню заново.';
  } else {
    message += '🎯 Выберите тему для настройки функционала:\n\n';
    message += `📊 Найдено тем: ${total}\n\n`;
  }

  const keyboard: any[] = [];

  // Иконки для тем (можно расширить)
  const topicIcons = ['💬', '⚔️', '📊', '📢', '🎮', '🏆', '📝', '🔔', '⭐', '🎯'];

  // Кнопки для каждой темы (максимум 10 на страницу)
  // Тема с ID = 1 уже отсортирована первой в getGroupTopicsFromDB
  topics.forEach((topic, index) => {
    const icon = topicIcons[index % topicIcons.length] || '📌';
    // selectQuery автоматически преобразует snake_case в camelCase
    // Используем название темы, если оно есть, иначе ID
    const topicId = topic.topicId || (topic as any).topic_id;
    const topicName = topic.topicName || (topic as any).topic_name;
    
    // Логируем для отладки
    if (!topicName || topicName.trim() === '' || topicName.includes('????')) {
      console.log(`[SettingsService] Topic ${topicId} has invalid name: "${topicName}"`);
    }
    
    // Если название пустое или содержит "????", используем ID
    // Для темы с ID = 1 всегда используем "Общий чат"
    const displayName = topicId === 1 
      ? 'Общий чат'
      : (topicName && topicName.trim() && !topicName.includes('????')) 
        ? topicName.trim() 
        : `Тема ${topicId}`;
    
    keyboard.push([
      Markup.button.callback(
        `${icon} ${displayName}`,
        `topic:config:${topicId}`
      )
    ]);
  });

  // Навигация по страницам
  const navRow: any[] = [];
  if (page > 0) {
    navRow.push(Markup.button.callback('◀️ Предыдущие', `menu:topics_config:page:${page - 1}`));
  }
  if (hasMore) {
    navRow.push(Markup.button.callback('Следующие ▶️', `menu:topics_config:page:${page + 1}`));
  }
  if (navRow.length > 0) {
    keyboard.push(navRow);
  }

  // Кнопка синхронизации (только на первой странице, если тем нет)
  if (page === 0 && topics.length === 0) {
    keyboard.push([
      Markup.button.callback('🔄 Проверить снова', 'menu:topics_config')
    ]);
  }

  // Назад
  keyboard.push([
    Markup.button.callback('◀️ Назад', 'menu:main')
  ]);

  try {
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
    });
  } catch (error: any) {
    // Игнорируем ошибку, если сообщение не изменилось (это нормально)
    if (error.response?.error_code === 400 && 
        error.response?.description?.includes('message is not modified')) {
      // Сообщение уже такое же - это нормально, просто игнорируем
      return;
    }
    // Для других ошибок пробрасываем дальше
    throw error;
  }
}

/**
 * Показывает настройки для конкретной темы
 */
export async function showTopicSettings(ctx: Context, topicId: number, topicName: string) {
  if (!ctx.chat || !('id' in ctx.chat)) {
    return;
  }

  const groupId = ctx.chat.id;
  const message = `📌 **Настройки темы: ${topicName}**\n\n` +
    '⚙️ Выберите функционал, который будет использоваться в этой теме:\n\n' +
    '💡 Включите нужные функции для автоматической работы бота\n\n';

  // Загружаем текущие настройки из базы данных
  const { getTopicComplete } = await import('../types/crud/topic_complete_crud');
  const topicComplete = await getTopicComplete(groupId, topicId);

  // Определяем текущее состояние функций
  const currentFeatures = topicComplete?.topicFeature;
  // Получаем текущие настройки варнов для этой группы
  const { getWarnSettings } = await import('./warnService');
  const warnSettings = await getWarnSettings(groupId);
  const currentWarnTopicId = warnSettings?.reportTopicId;
  const isCurrentWarnTopic = currentWarnTopicId === topicId;

  const features = [
    { 
      id: 'polls', 
      name: 'Опросники', 
      icon: '📊', 
      description: 'Автоматические опросы активности', 
      enabled: currentFeatures?.featurePolls || false 
    },
    { 
      id: 'top', 
      name: 'Топ', 
      icon: '🏆', 
      description: 'Рейтинги и статистика', 
      enabled: currentFeatures?.featureTop || false 
    },
    { 
      id: 'group_collection', 
      name: 'Сбор групп', 
      icon: '👥', 
      description: 'Сбор информации о группах', 
      enabled: currentFeatures?.featureGroupCollection || false 
    },
    { 
      id: 'warn_reports', 
      name: 'Отчеты о варнах', 
      icon: '⚠️', 
      description: 'Отправка отчетов о варнах в эту тему', 
      enabled: isCurrentWarnTopic 
    },
  ];

  const keyboard: any[] = [];

  features.forEach(feature => {
    const statusIcon = feature.enabled ? '✅' : '❌';
    keyboard.push([
      Markup.button.callback(
        `${statusIcon} ${feature.icon} ${feature.name}`,
        `topic:feature:toggle:${topicId}:${feature.id}`
      )
    ]);
  });

  // Назад
  keyboard.push([
    Markup.button.callback('◀️ Назад к вкладкам', 'menu:topics_config')
  ]);

  try {
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
    });
  } catch (error: any) {
    // Игнорируем ошибку, если сообщение не изменилось (это нормально)
    if (error.response?.error_code === 400 && 
        error.response?.description?.includes('message is not modified')) {
      // Сообщение уже такое же - это нормально, просто игнорируем
      return;
    }
    // Для других ошибок пробрасываем дальше
    throw error;
  }
}

