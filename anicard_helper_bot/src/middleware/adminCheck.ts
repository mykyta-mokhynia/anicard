import { Context } from 'telegraf';

export async function adminCheck(ctx: Context, next: () => Promise<void>) {
  if (!ctx.chat || !('id' in ctx.chat)) {
    return next();
  }

  try {
    const chatMember = await ctx.getChatMember(ctx.from!.id);
    
    if (
      chatMember.status === 'administrator' ||
      chatMember.status === 'creator'
    ) {
      return next();
    }
    
    await ctx.reply('❌ У вас нет прав администратора для выполнения этой команды.');
  } catch (error) {
    console.error('Error checking admin status:', error);
    await ctx.reply('❌ Ошибка при проверке прав доступа.');
  }
}


