/**
 * Утилиты для работы с датами с учетом часового пояса группы
 */

/**
 * Получает дату в формате YYYY-MM-DD для указанного часового пояса
 * @param timezone - часовой пояс (например, 'Europe/Kiev', 'Europe/Moscow')
 * @param date - опциональная дата, если не указана, используется текущая дата
 */
export function getDateStringInTimezone(timezone: string = 'Europe/Kiev', date?: Date): string {
  const targetDate = date || new Date();
  
  // Используем Intl.DateTimeFormat для более надежного получения даты
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  // en-CA формат возвращает YYYY-MM-DD
  return formatter.format(targetDate);
}

/**
 * Получает объект Date для начала дня (00:00:00) в указанном часовом поясе в UTC
 */
export function getStartOfDayInTimezone(timezone: string = 'Europe/Kiev'): Date {
  const dateStr = getDateStringInTimezone(timezone);
  // Создаем Date объект для 00:00:00 в указанном часовом поясе
  // Используем строку формата ISO с указанием времени и временной зоны
  const tempDate = new Date(`${dateStr}T00:00:00`);
  
  // Получаем смещение часового пояса
  const utcHours = tempDate.getUTCHours();
  const tzHours = parseInt(tempDate.toLocaleString('en-US', { timeZone: timezone, hour: '2-digit', hour12: false }));
  
  // Вычисляем смещение (приблизительно)
  let offsetHours = tzHours - utcHours;
  if (offsetHours > 12) offsetHours -= 24;
  if (offsetHours < -12) offsetHours += 24;
  
  // Корректируем на смещение
  const startOfDayUTC = new Date(tempDate.getTime() - offsetHours * 60 * 60 * 1000);
  
  return startOfDayUTC;
}

