import os
import asyncio
import aiohttp
import discord

TOKEN = os.environ.get("DISCORD_BOT_TOKEN")
LEADERBOARD_URL = os.environ.get("LEADERBOARD_URL", "https://wc2026-leaderboard.onrender.com/post")

intents = discord.Intents.default()
intents.message_content = True

client = discord.Client(intents=intents)


@client.event
async def on_ready():
    print(f"Logged in as {client.user}")


@client.event
async def on_message(message):
    if message.author.bot:
        return

    if message.content.strip().lower() == "-lead":
        msg = await message.channel.send("⏳ Fetching leaderboard...")
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(LEADERBOARD_URL, timeout=aiohttp.ClientTimeout(total=60)) as response:
                    data = await response.json()
                    if not data.get("ok"):
                        await msg.edit(content="❌ Failed to fetch leaderboard.")
                    else:
                        await msg.delete()
        except Exception as e:
            await msg.edit(content=f"❌ Error: {e}")


client.run(TOKEN)
