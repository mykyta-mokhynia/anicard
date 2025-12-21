/**
 * Утилиты для работы со временем с учетом часового пояса
 */

/**
 * Получает начало текущего дня (00:00:00) в указанном часовом поясе в UTC
 * @param timezone - часовой пояс (например, 'Europe/Kiev', 'Europe/Moscow')
 */
export function getStartOfDayInTimezone(timezone: string = 'Europe/Kiev'): Date {
  const now = new Date();
  
  // Используем Intl.DateTimeFormat для получения компонентов даты в указанном часовом поясе
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  // Получаем дату в формате YYYY-MM-DD
  const dateStr = formatter.format(now);
  
  // Получаем строковое представление даты в указанном часовом поясе
  const parts = {
    year: now.toLocaleString('en-US', { timeZone: timezone, year: 'numeric' }),
    month: now.toLocaleString('en-US', { timeZone: timezone, month: '2-digit' }),
    day: now.toLocaleString('en-US', { timeZone: timezone, day: '2-digit' }),
  };
  
  // Создаем строку для 00:00:00 в указанном часовом поясе (в формате ISO, но без указания часового пояса)
  const dateTimeStr = `${parts.year}-${parts.month}-${parts.day}T00:00:00`;
  
  // Создаем временный объект Date для вычисления смещения
  // Используем текущее время для определения смещения часового пояса
  const testTime = new Date();
  const localHour = parseInt(now.toLocaleString('en-US', { timeZone: timezone, hour: '2-digit', hour12: false }));
  const utcHour = testTime.getUTCHours();
  
  // Вычисляем разницу в часах (с учетом возможного перехода через день)
  let offsetHours = localHour - utcHour;
  if (offsetHours > 12) offsetHours -= 24;
  if (offsetHours < -12) offsetHours += 24;
  
  // Создаем Date объект для начала дня, считая что это UTC
  const tempDate = new Date(dateTimeStr + 'Z');
  
  // Корректируем на смещение часового пояса
  const startOfDayUTC = new Date(tempDate.getTime() - offsetHours * 60 * 60 * 1000);
  
  return startOfDayUTC;
}

/**
 * Получает начало текущего дня (00:00:00) в часовом поясе Europe/Kiev в UTC
 * @deprecated Используйте getStartOfDayInTimezone с параметром timezone
 */
export function getStartOfDayInKiev(): Date {
  return getStartOfDayInTimezone('Europe/Kiev');
}

/**
 * Вычисляет ожидаемое время следующего созыва с учетом интервала
 * @param intervalHours - интервал в часах
 * @param intervalMinutes - интервал в минутах
 * @param timezone - часовой пояс группы (например, 'Europe/Kiev', 'Europe/Moscow')
 * @returns ожидаемое время следующего созыва
 */
export function calculateNextScheduledTime(
  intervalHours: number,
  intervalMinutes: number,
  timezone: string = 'Europe/Kiev'
): Date {
  const startOfDay = getStartOfDayInTimezone(timezone);
  const now = new Date();
  
  const intervalMs = (intervalHours * 60 + intervalMinutes) * 60 * 1000;
  
  // Вычисляем, сколько времени прошло с начала дня (00:00) в указанном часовом поясе
  const timeSinceStart = now.getTime() - startOfDay.getTime();
  
  // Проверяем, прошло ли нужное количество интервалов
  const intervalsPassed = Math.floor(timeSinceStart / intervalMs);
  const expectedScheduledTime = new Date(startOfDay.getTime() + intervalsPassed * intervalMs);
  
  return expectedScheduledTime;
}

/**
 * Проверяет, можно ли отправлять созыв сейчас (в пределах окна 30 секунд)
 * @param intervalHours - интервал в часах
 * @param intervalMinutes - интервал в минутах
 * @param timezone - часовой пояс группы (например, 'Europe/Kiev', 'Europe/Moscow')
 */
export function canSendCollectionNow(
  intervalHours: number,
  intervalMinutes: number,
  timezone: string = 'Europe/Kiev'
): { canSend: boolean; expectedTime: Date; timeSinceExpected: number } {
  const expectedTime = calculateNextScheduledTime(intervalHours, intervalMinutes, timezone);
  const now = new Date();
  const timeSinceExpected = now.getTime() - expectedTime.getTime();
  const timeWindow = 30 * 1000; // 30 секунд
  
  const canSend = Math.abs(timeSinceExpected) <= timeWindow;
  
  return {
    canSend,
    expectedTime,
    timeSinceExpected,
  };
}

