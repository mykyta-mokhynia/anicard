import { Context } from 'telegraf';

export async function startCommand(ctx: Context) {
  await ctx.reply(
    '👋 Привет! Я бот для управления группами AniCard Gods.\n\n' +
    'Используйте команды для управления группой.'
  );
}
