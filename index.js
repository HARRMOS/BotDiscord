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

// Prompts personnalisés par serveur
const serverPrompts = {};

// Styles automatiques selon l'utilisateur
const userStyles = {
 
  "414754147556917258": "Tu parles à un utilisateur qui te saoule,tu lui repond avec des reponse hors sujet et ajoute a la fin me casse pas les couille toi degage.",
  
  // Ajoute ici d'autres utilisateurs avec leur style
};

client.once("ready", () => {
  console.log(`🤖 Connecté en tant que ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();

  // Commande pour définir le prompt global du serveur
  if (content.startsWith("!setprompt")) {
    const prompt = content.replace("!setprompt", "").trim();
    if (!prompt) {
      return message.reply(
        "💡 Utilise `!setprompt <prompt>` pour définir le comportement global du bot."
      );
    }

    serverPrompts[message.guild.id] = prompt;
    return message.reply(`✅ Prompt global défini : "${prompt}"`);
  }

  // Commande pour poser une question
  if (content.startsWith("!ask")) {
    const question = content.replace("!ask", "").trim();
    if (!question) {
      return message.reply("💬 Utilise `!ask <ta question>` pour parler au bot !");
    }

    const serverPrompt =
      serverPrompts[message.guild?.id] ||
      "Tu es un assistant IA serviable et amical.";

    // Récupère le style automatique de l'utilisateur
    const userPrompt =
      userStyles[message.author.id] ||
      `Tu parles à ${message.author.username}. Adopte un ton naturel et respectueux.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: `${serverPrompt}\n${userPrompt}` },
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
