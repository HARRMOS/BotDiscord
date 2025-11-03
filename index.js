import { Client, GatewayIntentBits, AttachmentBuilder } from "discord.js";
import {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} from "@discordjs/voice";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import dotenv from "dotenv";
import { pipeline } from "stream";
import prism from "prism-media";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import screenshot from "screenshot-desktop";
import webcam from "node-webcam";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Initialiser Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

// Initialiser OpenAI pour TTS (comme dans votre code Python)
const openaiTTS = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// Configuration de la voix TTS
// Options disponibles : "alloy" (neutre), "echo" (masculine), "fable" (masculine), 
//                       "onyx" (masculine profonde), "nova" (féminine), "shimmer" (féminine douce)
const TTS_VOICE = process.env.JARVIS_TTS_VOICE || "echo";  // Voix masculine par défaut (comme Jarvis)
const TTS_SPEED = parseFloat(process.env.JARVIS_TTS_SPEED || "0.95");  // Vitesse de la voix

// Styles selon l'utilisateur
const userStyles = {
  "729630625518190603": "Répond de façon sarcastique.",
  "414754147556917258": "Répond avec respect comme un roi.",
};

client.once("ready", () => {
  console.log(`🤖 Connecté en tant que ${client.user.tag}`);
});

// Fonction pour transcrire l'audio avec Gemini
async function transcribeAudioWithGemini(audioBuffer) {
  try {
    // Convertir l'audio en base64
    const base64Audio = audioBuffer.toString("base64");
    
    // Sauvegarder temporairement pour conversion si nécessaire
    const tempPath = path.join(__dirname, `temp_transcribe_${Date.now()}.pcm`);
    fs.writeFileSync(tempPath, audioBuffer);
    
    // Convertir en format WAV pour meilleure compatibilité
    const wavPath = tempPath.replace(".pcm", ".wav");
    
    return new Promise((resolve, reject) => {
      ffmpeg(tempPath)
        .toFormat("wav")
        .audioFrequency(16000)
        .audioChannels(1)
        .audioCodec("pcm_s16le")
        .save(wavPath)
        .on("end", async () => {
          try {
            // Lire le fichier WAV et convertir en base64
            const wavBuffer = fs.readFileSync(wavPath);
            const base64Wav = wavBuffer.toString("base64");
            
            // Utiliser Gemini pour la transcription audio
            const result = await model.generateContent([
              {
                inlineData: {
                  mimeType: "audio/wav",
                  data: base64Wav,
                },
              },
              {
                text: "Transcris cet audio en texte français. Retourne uniquement le texte transcrit, sans commentaires supplémentaires.",
              },
            ]);

            const response = await result.response;
            const transcribedText = response.text().trim();
            
            // Nettoyer les fichiers temporaires
            fs.removeSync(tempPath);
            fs.removeSync(wavPath);
            
            resolve(transcribedText);
          } catch (err) {
            // Nettoyer même en cas d'erreur
            if (fs.existsSync(tempPath)) fs.removeSync(tempPath);
            if (fs.existsSync(wavPath)) fs.removeSync(wavPath);
            reject(err);
          }
        })
        .on("error", (err) => {
          // Si la conversion échoue, essayer directement avec le buffer original
          fs.removeSync(tempPath);
          
          const base64Audio = audioBuffer.toString("base64");
          model.generateContent([
            {
              inlineData: {
                mimeType: "audio/pcm",
                data: base64Audio,
              },
            },
            {
              text: "Transcris cet audio en texte français. Retourne uniquement le texte transcrit.",
            },
          ])
          .then((result) => result.response.text())
          .then(resolve)
          .catch(reject);
        });
    });
  } catch (error) {
    console.error("Erreur transcription Gemini:", error);
    throw new Error("Impossible de transcrire l'audio: " + error.message);
  }
}

// Fonction pour générer du texte avec Gemini
async function generateTextWithGemini(text, userId) {
  try {
    const userPrompt =
      userStyles[userId] || "Répond de manière naturelle et respectueuse.";

    const prompt = `${userPrompt}\n\nUtilisateur: ${text}\nAssistant:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Erreur génération texte Gemini:", error);
    throw new Error("Impossible de générer une réponse");
  }
}

// Fonction pour créer un fichier audio TTS avec OpenAI TTS (comme dans votre code Python)
async function createTTSAudio(text, lang = "fr") {
  // Utiliser OpenAI TTS avec voix masculine (comme dans votre code Python)
  if (openaiTTS && process.env.OPENAI_API_KEY) {
    try {
      console.log(`🎤 Génération audio avec OpenAI TTS (voix: ${TTS_VOICE})...`);
      
      // Générer l'audio avec OpenAI TTS (comme dans votre code Python)
      const response = await openaiTTS.audio.speech.create({
        model: "tts-1",  // Modèle TTS rapide
        voice: TTS_VOICE,  // Voix configurée (echo, onyx, fable pour masculin)
        input: text,
        speed: TTS_SPEED,  // Vitesse configurée (0.25 à 4.0)
      });

      // Sauvegarder dans un fichier temporaire
      const mp3Path = path.join(__dirname, `temp_${Date.now()}.mp3`);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(mp3Path, buffer);

      console.log("✅ Audio généré avec OpenAI TTS");
      
      // Convertir MP3 en WAV 48kHz mono pour Discord
      const wavPath = mp3Path.replace(".mp3", ".wav");
      
      return new Promise((resolve, reject) => {
        ffmpeg(mp3Path)
          .toFormat("wav")
          .audioFrequency(48000)  // 48kHz pour Discord
          .audioChannels(1)  // Mono
          .audioCodec("pcm_s16le")
          
          .on("end", () => {
            // Nettoyer le fichier MP3
            if (fs.existsSync(mp3Path)) {
              fs.removeSync(mp3Path);
            }
            resolve(wavPath);
          })
          .on("error", (err) => {
            console.warn("⚠️ Erreur conversion WAV, utilisation du MP3:", err);
            // Utiliser le MP3 directement si la conversion échoue
            resolve(mp3Path);
          })
          .save(wavPath);
      });
    } catch (error) {
      console.error("❌ Erreur OpenAI TTS:", error);
      console.log("🔄 Fallback vers gTTS avec effets...");
      // Fallback vers gTTS avec effets
    }
  }

  // Fallback : utiliser gTTS avec effets audio pour rendre la voix masculine
  const { default: gTTS } = await import("gtts");
  return new Promise((resolve, reject) => {
    const outputPath = path.join(__dirname, `temp_${Date.now()}.mp3`);
    
    try {
      const gtts = new gTTS(text, lang);

      gtts.save(outputPath, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Convertir MP3 en WAV 48kHz mono avec effets pour voix masculine
        const wavPath = outputPath.replace(".mp3", ".wav");
        
        console.log("🔄 Conversion audio avec effets voix masculine (gTTS fallback)...");
        
        ffmpeg(outputPath)
          .toFormat("wav")
          .audioFrequency(48000)
          .audioChannels(1)
          .audioCodec("pcm_s16le")
          .audioFilters([
            'asetrate=48000*0.6',  // Voix beaucoup plus grave
            'aresample=48000',
            'atempo=0.9',  // Ralentir de 10%
            'aecho=0.8:0.88:60:0.4'  // Écho léger
          ])
          .on("end", () => {
            if (fs.existsSync(outputPath)) fs.removeSync(outputPath);
            resolve(wavPath);
          })
          .on("error", (err) => {
            console.error("❌ Erreur conversion:", err);
            if (fs.existsSync(outputPath)) fs.removeSync(outputPath);
            reject(err);
          })
          .save(wavPath);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Fonction Live : écoute + TTS dans le salon vocal
async function handleVoiceChannel(voiceChannel, guildId, userId) {
  console.log(`🔊 Connexion au salon vocal: ${voiceChannel.name}`);
  
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,  // Ne pas se mettre en sourdine
    selfMute: false,  // Ne pas se mettre en muet
  });

  const receiver = connection.receiver;
  const player = createAudioPlayer();

  // S'abonner au player avant de commencer
  connection.subscribe(player);
  console.log("✅ Player abonné à la connexion vocale");

  // Gestion des erreurs de connexion
  connection.on("error", (error) => {
    console.error("❌ Erreur connexion vocale:", error);
    // L'erreur d'encryption est souvent non-bloquante, on continue
    if (error.message && error.message.includes("encryption")) {
      console.warn("⚠️ Erreur d'encryption (peut être ignorée si la connexion fonctionne)");
    }
  });

  // Gestion de l'état de la connexion pour déboguer
  connection.on("stateChange", (oldState, newState) => {
    if (oldState.status !== newState.status) {
      console.log(`🔄 État connexion: ${oldState.status} → ${newState.status}`);
    }
  });

  // Gestion des erreurs du player
  player.on("error", (error) => {
    console.error("❌ Erreur player audio:", error);
  });

  // Message de salutation quand le bot rejoint
  // Attendre un peu que la connexion soit complètement établie
  setTimeout(async () => {
    try {
      console.log("✅ Connexion vocale établie, envoi du message de salutation...");
      
      const greetingMessage = "Salut ! Je suis prêt à discuter avec vous. Parlez-moi et je vous répondrai !";
      const greetingAudioPath = await createTTSAudio(greetingMessage, "fr");
      
      // Vérifier que la connexion est prête
      if (connection.state.status !== "ready") {
        console.warn(`⚠️ Connexion pas prête (état: ${connection.state.status}), attente...`);
        await new Promise((resolve) => {
          const checkReady = () => {
            if (connection.state.status === "ready") {
              connection.off("stateChange", checkReady);
              resolve();
            }
          };
          connection.on("stateChange", checkReady);
          setTimeout(() => {
            connection.off("stateChange", checkReady);
            resolve();
          }, 5000);
        });
      }

      const resource = createAudioResource(greetingAudioPath, {
        inputType: "file",
      });

      // S'assurer que le player est abonné
      connection.subscribe(player);
      console.log("✅ Player abonné pour le message de salutation");

      // Écouter les événements
      const greetingPlayingHandler = () => {
        console.log("▶️ Message de salutation en cours de lecture !");
      };
      const greetingIdleHandler = () => {
        console.log("⏹️ Message de salutation terminé");
        setTimeout(() => {
          if (fs.existsSync(greetingAudioPath)) {
            fs.removeSync(greetingAudioPath);
          }
        }, 1000);
        player.off(AudioPlayerStatus.Playing, greetingPlayingHandler);
        player.off(AudioPlayerStatus.Idle, greetingIdleHandler);
      };
      
      player.once(AudioPlayerStatus.Playing, greetingPlayingHandler);
      player.once(AudioPlayerStatus.Idle, greetingIdleHandler);

      console.log("🎵 Démarrage du message de salutation...");
      player.play(resource);
    } catch (error) {
      console.error("❌ Erreur message de salutation:", error);
    }
  }, 1500); // Attendre 1.5 secondes pour que la connexion soit stable

  receiver.speaking.on("start", async (userIdSpeaking) => {
    if (userIdSpeaking === client.user.id) {
      console.log("🔇 Ignoré: audio du bot lui-même");
      return; // Ignorer notre propre audio
    }

    const user = await client.users.fetch(userIdSpeaking).catch(() => null);
    console.log(`🎤 ${user?.username || userIdSpeaking} commence à parler...`);

    const audioStream = receiver.subscribe(userIdSpeaking, {
      end: { behavior: "silence", duration: 1000 },
    });

    const convert = new prism.opus.Decoder({
      frameSize: 960,
      channels: 1,
      rate: 48000,
    });

    pipeline(audioStream, convert, async (err) => {
      if (err) console.error("Pipeline error:", err);
    });

    let buffer = [];
    convert.on("data", (chunk) => buffer.push(chunk));
    convert.on("end", async () => {
      try {
        const audioBuffer = Buffer.concat(buffer);
        console.log(`📊 Audio reçu: ${audioBuffer.length} bytes`);

        if (audioBuffer.length === 0) {
          console.log("⚠️ Buffer audio vide, ignoré");
          return;
        }

        // Transcription avec Gemini
        console.log("🔄 Transcription en cours...");
        const text = await transcribeAudioWithGemini(audioBuffer);
        console.log("👤 Utilisateur dit:", text);

        if (!text || text.trim().length === 0) {
          console.log("⚠️ Transcription vide, ignoré");
          return;
        }

        // Génération réponse avec Gemini
        const answer = await generateTextWithGemini(text, userIdSpeaking);
        console.log("Réponse IA:", answer);

        // Créer fichier audio TTS
        console.log("🎤 Génération audio TTS...");
        const audioPath = await createTTSAudio(answer, "fr");
        console.log("✅ Audio généré:", audioPath);

        // Jouer l'audio dans le salon vocal
        console.log("🔊 Préparation de la lecture audio...");
        console.log(`📁 Fichier audio: ${audioPath}`);
        console.log(`📊 Taille fichier: ${fs.existsSync(audioPath) ? fs.statSync(audioPath).size : 0} bytes`);
        
        // Vérifier que la connexion est prête
        if (connection.state.status !== "ready") {
          console.warn(`⚠️ Connexion pas prête (état: ${connection.state.status}), attente...`);
          await new Promise((resolve) => {
            const checkReady = () => {
              if (connection.state.status === "ready") {
                connection.off("stateChange", checkReady);
                resolve();
              }
            };
            connection.on("stateChange", checkReady);
            // Timeout après 5 secondes
            setTimeout(() => {
              connection.off("stateChange", checkReady);
              resolve();
            }, 5000);
          });
        }

        // Créer la ressource audio
        // Discord.js peut décoder automatiquement WAV, MP3, etc.
        let resource;
        try {
          resource = createAudioResource(audioPath, {
            inputType: "file",
          });
          console.log(`✅ Ressource audio créée (format: ${audioPath.split('.').pop()})`);
        } catch (error) {
          console.error("❌ Erreur création ressource:", error);
          throw error;
        }

        // S'assurer que le player est toujours abonné
        connection.subscribe(player);
        console.log("✅ Player abonné à la connexion");

        // Écouter les événements du player pour débugger
        const playingHandler = () => {
          console.log("▶️ Audio en cours de lecture !");
        };
        const idleHandler = () => {
          console.log("⏹️ Audio terminé");
          // Nettoyer les fichiers temporaires
          setTimeout(() => {
            if (fs.existsSync(audioPath)) {
              fs.removeSync(audioPath);
              console.log("🗑️ Fichier audio nettoyé");
            }
          }, 1000);
          // Retirer les handlers
          player.off(AudioPlayerStatus.Playing, playingHandler);
          player.off(AudioPlayerStatus.Idle, idleHandler);
        };
        const errorHandler = (error) => {
          console.error("❌ Erreur lecture audio:", error);
          player.off("error", errorHandler);
        };

        player.once(AudioPlayerStatus.Playing, playingHandler);
        player.once(AudioPlayerStatus.Idle, idleHandler);
        player.once("error", errorHandler);

        // Lire l'audio
        console.log("🎵 Démarrage de la lecture...");
        player.play(resource);
      } catch (error) {
        console.error("Erreur traitement vocal:", error);
      }
    });
  });
}

// Fonction pour capturer l'écran
async function captureScreen() {
  try {
    console.log("📸 Capture de l'écran en cours...");
    const imgPath = path.join(__dirname, `temp_screen_${Date.now()}.png`);
    await screenshot({ filename: imgPath });
    
    // Vérifier que le fichier existe
    if (!fs.existsSync(imgPath)) {
      console.error("❌ Fichier de capture non créé");
      return null;
    }
    
    // Vérifier la taille du fichier
    const stats = fs.statSync(imgPath);
    console.log(`✅ Capture réussie: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    return imgPath;
  } catch (error) {
    console.error("❌ Erreur capture écran:", error);
    return null;
  }
}

// Fonction pour capturer la caméra
async function captureWebcam() {
  return new Promise((resolve, reject) => {
    try {
      const imgPath = path.join(__dirname, `temp_webcam_${Date.now()}.jpg`);
      
      // Vérifier si imagesnap est disponible (macOS)
      let hasImagesnap = false;
      try {
        execSync("which imagesnap", { stdio: "ignore" });
        hasImagesnap = true;
      } catch (e) {
        hasImagesnap = false;
      }

      if (!hasImagesnap) {
        // Essayer d'utiliser node-webcam avec une configuration différente
        console.log("⚠️ imagesnap non disponible, tentative avec node-webcam...");
      }

      // Configuration de la webcam
      const opts = {
        width: 1280,
        height: 720,
        quality: 90,
        delay: 0,
        saveShots: true,
        output: "jpeg",
        device: false, // Utiliser la caméra par défaut
        callbackReturn: "location",
        verbose: false
      };

      webcam.capture(imgPath, opts, (err, data) => {
        if (err) {
          console.error("❌ Erreur capture caméra:", err.message || err);
          
          // Si imagesnap n'est pas trouvé, donner des instructions
          if (err.message && err.message.includes("imagesnap")) {
            const errorMsg = "❌ imagesnap n'est pas installé. Pour installer sur macOS: `brew install imagesnap`\n" +
                           "💡 Alternative: Vous pouvez utiliser la capture d'écran avec `!screen`";
            reject(new Error(errorMsg));
          } else {
            reject(err);
          }
          return;
        }
        
        // Vérifier que le fichier existe
        if (fs.existsSync(imgPath)) {
          console.log("✅ Capture caméra réussie");
          resolve(imgPath);
        } else {
          reject(new Error("Fichier caméra non créé"));
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Fonction pour convertir une image en base64
async function imageToBase64(imagePath) {
  try {
    // Lire directement le fichier et convertir en base64
    const buffer = fs.readFileSync(imagePath);
    return buffer.toString("base64");
  } catch (error) {
    console.error("❌ Erreur conversion image:", error);
    throw error;
  }
}

// Fonction pour analyser une image avec Gemini Vision (avec retry pour erreur 429)
async function analyzeImageWithGemini(imagePath, question = null, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔍 Analyse de l'image avec Gemini Vision... (tentative ${attempt}/${retries})`);
      
      // Convertir l'image en base64
      const imageBase64 = await imageToBase64(imagePath);
      
      // Construire le prompt selon la question
      let prompt;
      if (question) {
        prompt = `Tu es Jarvis, un assistant intelligent. L'utilisateur te demande : "${question}". 

Regarde attentivement cette image et réponds-lui directement en utilisant "tu" ou "ton", comme si tu lui parlais en face. 

Réponds de manière précise, naturelle et conversationnelle. Décris ce que tu vois et réponds à sa question. Utilise des phrases complètes et fluides, JAMAIS de listes ou formatage markdown.`;
      } else {
        prompt = `Tu es Jarvis, un assistant intelligent. Tu regardes une image et tu veux décrire ce que tu vois.

Parle directement à l'utilisateur en utilisant "tu" ou "ton", comme si tu lui parlais en face. Décris ce que tu vois sur l'image de manière naturelle et conversationnelle.

Commence par décrire exactement ce qui est visible, puis si tu détectes des problèmes ou opportunités, parle-lui en de manière naturelle.

Utilise des phrases fluides, comme si tu racontais ce que tu vois à un ami. JAMAIS de listes numérotées ou formatage markdown.

Sois spontané et naturel dans ta description.`;
      }

      // Déterminer le type MIME selon l'extension du fichier
      const ext = path.extname(imagePath).toLowerCase();
      let mimeType = "image/png";
      if (ext === ".jpg" || ext === ".jpeg") {
        mimeType = "image/jpeg";
      } else if (ext === ".png") {
        mimeType = "image/png";
      }

      // Utiliser Gemini Vision pour analyser l'image
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: mimeType,
            data: imageBase64,
          },
        },
        {
          text: prompt,
        },
      ]);

      const response = await result.response;
      const description = response.text().trim();
      
      console.log("✅ Analyse terminée");
      return description;
    } catch (error) {
      // Si erreur 429 (trop de requêtes), attendre et réessayer
      if (error.status === 429 && attempt < retries) {
        const waitTime = Math.pow(2, attempt) * 1000; // Backoff exponentiel: 2s, 4s, 8s
        console.warn(`⚠️ Erreur 429 (trop de requêtes). Attente de ${waitTime/1000}s avant réessai...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // Si c'est la dernière tentative ou une autre erreur, lancer l'erreur
      if (attempt === retries) {
        console.error("❌ Erreur analyse image après", retries, "tentatives:", error);
        throw error;
      }
    }
  }
}

// Fonction pour envoyer un message vocal dans un chat texte
async function sendVoiceMessage(channel, text, userId) {
  try {
    // Générer la réponse avec Gemini
    const answer = await generateTextWithGemini(text, userId);

    // Créer le fichier audio
    const audioPath = await createTTSAudio(answer, "fr");

    // Envoyer le fichier audio comme pièce jointe
    const attachment = new AttachmentBuilder(audioPath, {
      name: "message_vocal.opus",
      description: answer,
    });

    await channel.send({
      files: [attachment],
      content: `🎤 **Réponse vocale:**\n${answer}`,
    });

    // Nettoyer le fichier temporaire
    setTimeout(() => {
      if (fs.existsSync(audioPath)) {
        fs.removeSync(audioPath);
      }
    }, 5000);
  } catch (error) {
    console.error("Erreur envoi message vocal:", error);
    channel.send("❌ Erreur lors de la génération du message vocal.");
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Commande pour rejoindre un salon vocal
  if (message.content.startsWith("!join")) {
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel)
      return message.reply("🔊 Rejoins d'abord un salon vocal !");
    
    await handleVoiceChannel(voiceChannel, message.guild.id, message.author.id);
    message.reply("✅ Bot prêt à écouter et parler !");
    return;
  }

  // Commande pour quitter le salon vocal
  if (message.content.startsWith("!leave")) {
    const connection = getVoiceConnection(message.guild.id);
    if (connection) {
      connection.destroy();
      message.reply("👋 J'ai quitté le salon vocal.");
    } else {
      message.reply("❌ Je ne suis dans aucun salon vocal.");
    }
    return;
  }

  // Commande pour envoyer un message vocal dans le chat
  if (message.content.startsWith("!voice") || message.content.startsWith("!vocal")) {
    const text = message.content.slice(message.content.indexOf(" ") + 1).trim();
    if (!text) {
      return message.reply("❌ Utilise: `!voice [votre message]` ou `!vocal [votre message]`");
    }
    
    await sendVoiceMessage(message.channel, text, message.author.id);
    return;
  }

  // Commande pour voir la caméra
  if (message.content.startsWith("!camera") || message.content.startsWith("!cam") || message.content.startsWith("!visio")) {
    const question = message.content.slice(message.content.indexOf(" ") + 1).trim();
    
    await message.reply("📷 Capture de la caméra en cours...");
    
    try {
      const imagePath = await captureWebcam();
      
      if (!imagePath) {
        return message.reply("❌ Impossible de capturer la caméra. Vérifie que ta caméra est connectée et autorisée.");
      }

      // Analyser l'image avec Gemini
      const description = await analyzeImageWithGemini(imagePath, question || null);
      
      // Envoyer l'image et la description
      const attachment = new AttachmentBuilder(imagePath, {
        name: "camera.jpg",
        description: "Capture de la caméra",
      });

      await message.channel.send({
        files: [attachment],
        content: `📷 **Ce que je vois :**\n${description}`,
      });

      // Nettoyer le fichier temporaire
      setTimeout(() => {
        if (fs.existsSync(imagePath)) {
          fs.removeSync(imagePath);
        }
      }, 60000); // Garder 1 minute au cas où
    } catch (error) {
      console.error("Erreur capture caméra:", error);
      let errorMsg = "❌ Erreur lors de la capture de la caméra.";
      
      if (error.message && error.message.includes("imagesnap")) {
        errorMsg = error.message;
      } else if (error.message && error.message.includes("Command failed")) {
        errorMsg = "❌ imagesnap n'est pas installé.\n💡 Pour installer sur macOS: `brew install imagesnap`\n💡 Alternative: Utilisez `!screen` pour capturer l'écran";
      } else {
        errorMsg += " Vérifie que ta caméra est disponible et autorisée.";
      }
      
      message.reply(errorMsg);
    }
    return;
  }

  // Commande pour voir l'écran
  if (message.content.startsWith("!screen") || message.content.startsWith("!ecran") || message.content.startsWith("!analyse")) {
    const question = message.content.slice(message.content.indexOf(" ") + 1).trim();
    
    await message.reply("📸 Capture de l'écran en cours...");
    
    try {
      const imagePath = await captureScreen();
      
      if (!imagePath) {
        return message.reply("❌ Impossible de capturer l'écran.");
      }

      // Analyser l'image avec Gemini
      const description = await analyzeImageWithGemini(imagePath, question || null);
      
      // Envoyer l'image et la description
      const attachment = new AttachmentBuilder(imagePath, {
        name: "screen.png",
        description: "Capture d'écran",
      });

      await message.channel.send({
        files: [attachment],
        content: `🖥️ **Ce que je vois sur l'écran :**\n${description}`,
      });

      // Nettoyer le fichier temporaire
      setTimeout(() => {
        if (fs.existsSync(imagePath)) {
          fs.removeSync(imagePath);
        }
      }, 60000);
    } catch (error) {
      console.error("Erreur capture écran:", error);
      let errorMsg = "❌ Erreur lors de la capture de l'écran.";
      
      if (error.status === 429) {
        errorMsg = "❌ Trop de requêtes vers Gemini API. Attends quelques secondes et réessaye.";
      } else if (error.message) {
        errorMsg += ` ${error.message}`;
      }
      
      message.reply(errorMsg);
    }
    return;
  }

  // Répondre aux messages mentionnant le bot ou commençant par "!"
  const mentioned = message.mentions.has(client.user);
  const isCommand = message.content.startsWith("!");
  
  if (mentioned || (isCommand && !message.content.startsWith("!join") && !message.content.startsWith("!leave") && !message.content.startsWith("!voice") && !message.content.startsWith("!vocal") && !message.content.startsWith("!camera") && !message.content.startsWith("!cam") && !message.content.startsWith("!visio") && !message.content.startsWith("!screen") && !message.content.startsWith("!ecran") && !message.content.startsWith("!analyse"))) {
    try {
      const userMessage = message.content.replace(`<@${client.user.id}>`, "").trim();
      const answer = await generateTextWithGemini(userMessage, message.author.id);
      await message.reply(answer);
    } catch (error) {
      console.error("Erreur réponse texte:", error);
      message.reply("❌ Désolé, une erreur s'est produite.");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
