# Bot Discord avec OpenAI et Support Vocal

Bot Discord qui utilise OpenAI pour les conversations et supporte les interactions vocales.

## Fonctionnalités

- 🤖 **Chat avec OpenAI** : Répond aux messages avec l'IA OpenAI (GPT-4o-mini)
- 🎤 **Salon vocal** : Rejoint un salon vocal et répond vocalement aux utilisateurs
- 📤 **Messages vocaux** : Envoie des messages vocaux dans les chats texte
- 🎯 **Styles personnalisés** : Styles de réponse différents selon l'utilisateur
- 🖼️ **Analyse d'images** : Analyse les images avec OpenAI Vision
- 📷 **Capture d'écran/Caméra** : Capture et analyse depuis PC ou téléphone

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
OPENAI_API_KEY=votre_clé_api_openai
```

### Obtenir les clés API

- **Discord Token** : 
  1. Allez sur https://discord.com/developers/applications
  2. Créez une nouvelle application ou sélectionnez une existante
  3. Allez dans "Bot" et créez un bot
  4. Copiez le token

- **OpenAI API Key** :
  1. Allez sur https://platform.openai.com/api-keys
  2. Créez un compte ou connectez-vous
  3. Créez une nouvelle clé API
  4. Copiez la clé (elle ne sera affichée qu'une seule fois)

## Utilisation

### Commandes

- `!join` - Fait rejoindre le bot au salon vocal actuel
- `!leave` - Fait quitter le bot du salon vocal
- `!voice [message]` ou `!vocal [message]` - Envoie un message vocal dans le chat texte
- Mentionner le bot ou commencer un message par `!` - Génère une réponse texte avec OpenAI
- `!screen` ou `!ecran` - Capture et analyse l'écran (si script client actif)
- `!cam` ou `!camera` - Capture et analyse la caméra (si script client actif)
- Envoyer une image directement - Analyse automatique avec OpenAI Vision

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
- Les messages vocaux sont générés avec OpenAI TTS (voix masculine par défaut)
- La transcription audio utilise OpenAI Whisper
- L'analyse d'images utilise OpenAI Vision (GPT-4o-mini)
- Pour les captures depuis PC, lance `capture-client.js` (voir `CAPTURE_SETUP.md`)

## Dépannage

### Le bot ne répond pas vocalement
- Vérifiez que FFmpeg est installé : `ffmpeg -version`
- Vérifiez les permissions du bot dans Discord
- Vérifiez que vous êtes dans un salon vocal

### Erreur de transcription
- Vérifiez que votre clé API OpenAI est valide
- Vérifiez que l'audio est dans un format compatible
- Vérifiez que vous avez des crédits OpenAI disponibles

### Erreurs npm
- Nettoyez le cache : `npm cache clean --force`
- Réinstallez : `rm -rf node_modules package-lock.json && npm install`


