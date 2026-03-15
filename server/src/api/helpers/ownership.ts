import type { BotService } from '../../services/bot.service.js'

/**
 * Creates a bot ownership verifier bound to a BotService instance.
 * Returns the bot if found and owned; throws structured HTTP errors otherwise.
 */
export function createOwnershipVerifier(botService: BotService) {
  return function verifyOwnership(botId: number, playerId: number) {
    const bot = botService.getById(botId)
    if (!bot) throw Object.assign(new Error('Bot not found'), { statusCode: 404, code: 'BOT_NOT_FOUND' })
    if (bot.playerId !== playerId) throw Object.assign(new Error('Not your bot'), { statusCode: 403, code: 'NOT_OWNER' })
    return bot
  }
}
