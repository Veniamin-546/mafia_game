import telebot
import os

# Берем токен из настроек (чтобы не светить его в коде)
TOKEN = os.getenv('BOT_TOKEN')
bot = telebot.TeleBot(TOKEN)

@bot.message_handler(commands=['start'])
def send_welcome(message):
    bot.reply_to(message, "Привет! Я Мафия-бот. Твой игровой движок запущен и готов к работе!")

@bot.message_handler(func=lambda message: True)
def echo_all(message):
    bot.reply_to(message, "Я получил твое сообщение, но сейчас я больше занят игрой в Mini App!")

# Запуск бота
if __name__ == "__main__":
    bot.infinity_polling()
