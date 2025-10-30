process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

import { Client, GatewayIntentBits } from "discord.js";
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Stocke le prompt personnalisé par serveur
const serverPrompts = {};

client.once("ready", () => {
  console.log(`🤖 Connecté en tant que ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();

  // Commande pour définir le prompt du bot
  if (content.startsWith("!setprompt")) {
    const prompt = content.replace("!setprompt", "").trim();
    if (!prompt) {
      return message.reply(
        "💡 Utilise `!setprompt <ton prompt>` pour configurer le bot."
      );
    }

    // On stocke le prompt par serveur
    serverPrompts[message.guild.id] = prompt;
    return message.reply(`✅ Prompt configuré : "${prompt}"`);
  }

  // Commande pour poser une question au bot
  if (content.startsWith("!ask")) {
    const question = content.replace("!ask", "").trim();
    if (!question) {
      return message.reply(
        "💡 Utilise `!ask <ta question>` pour parler au bot."
      );
    }

    const systemPrompt =
      serverPrompts[message.guild.id] ||
      "Tu es un assistant IA serviable et amical.";

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
      });

      await message.reply(response.choices[0].message.content);
    } catch (err) {
      console.error(err);
      message.reply("❌ Une erreur est survenue avec l'IA !");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
