# Bot Discord avec Gemini et Support Vocal

Bot Discord qui utilise Google Gemini pour les conversations et supporte les interactions vocales.

## Fonctionnalités

- 🤖 **Chat avec Gemini** : Répond aux messages avec l'IA Gemini
- 🎤 **Salon vocal** : Rejoint un salon vocal et répond vocalement aux utilisateurs
- 📤 **Messages vocaux** : Envoie des messages vocaux dans les chats texte
- 🎯 **Styles personnalisés** : Styles de réponse différents selon l'utilisateur

## Installation

### Prérequis

1. **Node.js** (version 18 ou supérieure)
2. **FFmpeg** (pour la conversion audio)
   - macOS: `brew install ffmpeg`
   - Ubuntu/Debian: `sudo apt-get install ffmpeg`
   - Windows: Téléchargez depuis https://ffmpeg.org/

### Étapes d'installation

1. **Installer les dépendances** :
```bash
npm install
```

Si vous rencontrez des erreurs de permissions npm, exécutez :
```bash
sudo chown -R $(whoami) ~/.npm
npm install
```

2. **Configurer les variables d'environnement** :

Créez un fichier `.env` à la racine du projet :

```env
DISCORD_TOKEN=votre_token_discord
GEMINI_API_KEY=votre_clé_api_gemini
```

### Obtenir les clés API

- **Discord Token** : 
  1. Allez sur https://discord.com/developers/applications
  2. Créez une nouvelle application ou sélectionnez une existante
  3. Allez dans "Bot" et créez un bot
  4. Copiez le token

- **Gemini API Key** :
  1. Allez sur https://aistudio.google.com/app/apikey
  2. Créez une nouvelle clé API
  3. Copiez la clé

## Utilisation

### Commandes

- `!join` - Fait rejoindre le bot au salon vocal actuel
- `!leave` - Fait quitter le bot du salon vocal
- `!voice [message]` ou `!vocal [message]` - Envoie un message vocal dans le chat texte
- Mentionner le bot ou commencer un message par `!` - Génère une réponse texte avec Gemini

### Permissions Discord requises

Le bot a besoin des permissions suivantes :
- Send Messages
- Connect (rejoindre les salons vocaux)
- Speak (parler dans les salons vocaux)
- Attach Files (envoyer des messages vocaux)

## Structure du code

- `index.js` - Fichier principal du bot
- `package.json` - Dépendances du projet

## Notes importantes

- Les fichiers audio temporaires sont automatiquement nettoyés
- Le bot écoute en continu dans les salons vocaux après `!join`
- Les messages vocaux sont générés avec Google Text-to-Speech (gTTS)
- La transcription audio utilise Gemini 2.0 Flash

## Dépannage

### Le bot ne répond pas vocalement
- Vérifiez que FFmpeg est installé : `ffmpeg -version`
- Vérifiez les permissions du bot dans Discord
- Vérifiez que vous êtes dans un salon vocal

### Erreur de transcription
- Vérifiez que votre clé API Gemini est valide
- Vérifiez que l'audio est dans un format compatible

### Erreurs npm
- Nettoyez le cache : `npm cache clean --force`
- Réinstallez : `rm -rf node_modules package-lock.json && npm install`

