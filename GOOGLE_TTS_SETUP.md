# Configuration Google Cloud Text-to-Speech

Pour utiliser une vraie voix masculine au lieu des effets audio, vous devez configurer Google Cloud Text-to-Speech.

## Étape 1 : Créer un projet Google Cloud

1. Allez sur https://console.cloud.google.com/
2. Créez un nouveau projet ou sélectionnez un projet existant
3. Activez l'API "Cloud Text-to-Speech API"

## Étape 2 : Créer un compte de service

1. Dans la console Google Cloud, allez dans "IAM & Admin" > "Service Accounts"
2. Cliquez sur "Create Service Account"
3. Donnez un nom (ex: "discord-bot-tts")
4. Cliquez sur "Create and Continue"
5. Attribuez le rôle "Cloud Text-to-Speech API User"
6. Cliquez sur "Done"

## Étape 3 : Télécharger la clé JSON

1. Cliquez sur le compte de service créé
2. Allez dans l'onglet "Keys"
3. Cliquez sur "Add Key" > "Create new key"
4. Sélectionnez "JSON" et téléchargez le fichier
5. Sauvegardez le fichier dans le dossier de votre bot (ex: `google-credentials.json`)

## Étape 4 : Configurer le bot

Ajoutez dans votre fichier `.env` :

```env
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json
```

Ou placez le fichier JSON dans un autre emplacement et mettez le chemin complet.

## Étape 5 : Tester

Redémarrez votre bot. Vous devriez voir dans les logs :
```
✅ Google Cloud TTS client initialisé
🎤 Génération audio avec Google Cloud TTS (voix masculine)...
```

## Notes importantes

- **Coûts** : Google Cloud TTS a un coût (environ $4 par 1 million de caractères), mais il y a un quota gratuit de 1 à 4 millions de caractères par mois selon votre région
- **Fallback** : Si Google Cloud TTS n'est pas configuré, le bot utilisera automatiquement gTTS avec des effets audio pour rendre la voix masculine
- **Voix disponibles** : Le bot utilise "fr-FR-Standard-B" (voix masculine française). Vous pouvez changer la voix dans `index.js` ligne 176

## Voix alternatives disponibles

- `fr-FR-Standard-B` - Voix masculine Standard (actuelle)
- `fr-FR-Wavenet-B` - Voix masculine Wavenet (meilleure qualité, plus chère)
- `fr-FR-Neural2-B` - Voix masculine Neural2 (meilleure qualité, plus récente)

Pour changer, modifiez la ligne 176 dans `index.js` :
```javascript
name: "fr-FR-Wavenet-B",  // Remplacez par la voix souhaitée
```


