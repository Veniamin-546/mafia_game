import asyncio
from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart
from aiogram.types import WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton

# Вставь сюда токен, который выдал @BotFather
TOKEN = "8577050382:AAHOorg_1VdNppZJYkWSqscIl8d1GVeZkbM"
# Ссылка на твой развернутый index.html (например, на GitHub Pages или Vercel)
WEB_APP_URL = "https://veniamin-546.github.io/mafia_game/"

bot = Bot(token=TOKEN)
dp = Dispatcher()


@dp.message(CommandStart())
async def start_handler(message: types.Message):
    # Красивое приветствие с использованием имени пользователя
    user_name = message.from_user.first_name

    # Создаем кнопку WebApp
    markup = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(
                text="🎭 ВОЙТИ В ИГРУ",
                web_app=WebAppInfo(url=WEB_APP_URL)
            )
        ],
        [
            InlineKeyboardButton(text="📢 Канал проекта", url="https://t.me/Vens_Games")
        ]
    ])

    await message.answer(
        f"Привет, {user_name}! 🕵️‍♂️\n\n"
        "Добро пожаловать в **MAFIA**.\n"
        "Город засыпает, и только ты решаешь, кто проснется завтра.\n\n"
        "Нажми кнопку ниже, чтобы начать поиск игры или создать свое лобби.",
        parse_mode="Markdown",
        reply_markup=markup
    )


# Запуск бота
async def main():
    print("Бот запущен и готов к игре!")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
