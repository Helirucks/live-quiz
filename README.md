# Live-Quiz für die Vorlesung 🖍️

Ein kleines Kahoot-ähnliches Quiz, das du selbst hostest. Alle Mitspieler:innen
öffnen einfach einen Link im Browser (Smartphone genügt) – keine Installation
nötig.

## Wie es funktioniert

- **Du** öffnest `/host` am Beamer/Projektor – dort steuerst du das Quiz
  (Fragen starten, weiterschalten, Ergebnisse anzeigen).
- **Deine Kommiliton:innen** öffnen `/play` auf ihrem Handy, geben einen
  Namen ein und beantworten die Fragen, indem sie auf eine von 4 farbigen
  Formen tippen (genau wie bei Kahoot: ▲ Dreieck, ◆ Raute, ● Kreis, ■ Quadrat).
- Wer **schneller richtig** antwortet, bekommt **mehr Punkte** (zwischen 500
  und 1000 Punkten pro richtiger Antwort).
- Die Verbindung läuft über **WebSockets** (Flask-SocketIO), sodass alle
  Geräte in Echtzeit synchron sind.

## Projektstruktur

```
quiz-app/
├── app.py              # Server: Spiellogik + WebSocket-Events
├── questions.json      # Deine Quizfragen (hier anpassen!)
├── requirements.txt    # Python-Abhängigkeiten
├── Procfile             # Startbefehl für Render/Hosting
├── templates/
│   ├── index.html      # Startseite (Auswahl Host/Spieler)
│   ├── host.html       # Ansicht für den Quizmaster (Beamer)
│   └── player.html      # Ansicht für die Mitspieler (Handy)
└── static/
    ├── css/style.css   # Design
    └── js/
        ├── host.js     # Logik der Host-Seite
        └── player.js   # Logik der Spieler-Seite
```

## 1. Lokal testen

Du brauchst Python 3.10+ installiert.

```bash
cd quiz-app
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Der Server läuft jetzt auf `http://localhost:5000`. Öffne:

- `http://localhost:5000/host` in einem Tab (Quizmaster)
- `http://localhost:5000/play` in einem zweiten Tab oder auf deinem Handy
  (gleiches WLAN! Statt `localhost` die lokale IP-Adresse deines Rechners
  verwenden, z. B. `http://192.168.1.42:5000/play`)

Tritt mit einem Namen bei, klicke auf der Host-Seite auf **"Quiz starten"** –
und teste den ganzen Ablauf einmal durch.

## 2. Eigene Fragen eintragen

Öffne `questions.json` und passe die Liste an. Jede Frage braucht **genau 4**
Antwortmöglichkeiten:

```json
{
  "question": "Deine Frage hier?",
  "answers": ["Antwort A", "Antwort B", "Antwort C", "Antwort D"],
  "correct": 0,
  "time_limit": 20
}
```

- `"correct"`: Index der richtigen Antwort (0 = erste, 1 = zweite, ...)
- `"time_limit"`: Zeit in Sekunden, die für diese Frage zur Verfügung steht
- Du kannst beliebig viele Fragen hinzufügen oder entfernen.

## 3. Kostenlos online stellen (Render.com)

Damit alle Kommiliton:innen während der Vorlesung über einen Link
beitreten können, muss der Server irgendwo erreichbar laufen. **Render.com**
bietet dafür einen kostenlosen Tarif mit WebSocket-Unterstützung.

### Schritt 1: Code zu GitHub hochladen

1. Erstelle einen kostenlosen Account auf [github.com](https://github.com),
   falls du noch keinen hast.
2. Erstelle ein neues, leeres Repository (z. B. `live-quiz`).
3. Lade den kompletten Inhalt des `quiz-app`-Ordners in dieses Repository
   hoch (entweder per Drag & Drop im Browser oder mit `git push`).

### Schritt 2: Render-Account erstellen

1. Gehe auf [render.com](https://render.com) und registriere dich
   (z. B. mit deinem GitHub-Account – dann ist Schritt 3 noch einfacher).

### Schritt 3: Web Service anlegen

1. Klicke auf **"New +"** → **"Web Service"**.
2. Wähle dein gerade hochgeladenes GitHub-Repository aus.
3. Trage folgende Einstellungen ein:
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn --worker-class gthread --threads 100 -w 1 app:app`
     (steht auch schon in der `Procfile`)
   - **Instance Type**: **Free**
4. Klicke auf **"Create Web Service"**.

Render baut das Projekt jetzt automatisch und gibt dir eine URL wie
`https://live-quiz-xyz.onrender.com`.

### Schritt 4: Links verteilen

- Quizmaster-Link (für dich am Beamer):
  `https://live-quiz-xyz.onrender.com/host`
- Spieler-Link (für deine Kommiliton:innen):
  `https://live-quiz-xyz.onrender.com/play`

Auf der Host-Seite wird automatisch ein **QR-Code** angezeigt, den du an die
Wand projizieren kannst – die Studierenden scannen ihn einfach mit der
Handykamera.

## ⚠️ Wichtig: Kostenloser Tarif "schläft" ein

Der kostenlose Render-Tarif legt den Server nach ca. 15 Minuten Inaktivität
schlafen. Beim nächsten Aufruf dauert es dann ca. 30–60 Sekunden, bis er
wieder reagiert.

**Tipp:** Rufe die Host-Seite ca. 2–3 Minuten **vor** Beginn der Vorlesung
einmal selbst auf, damit der Server "aufgewacht" ist, bevor alle anderen sich
verbinden.

## Bekannte Einschränkungen (bewusst einfach gehalten)

- Es läuft immer **eine** Quiz-Session gleichzeitig (passend für eine
  Vorlesung mit einer Gruppe). Es gibt keine Räume/Codes für mehrere
  parallele Quizze.
- Der Spielstand liegt nur im Arbeitsspeicher des Servers. Bei einem Neustart
  des Servers (z. B. nach langer Inaktivität bei Render) gehen aktuelle
  Punktestände verloren – für eine einzelne Quiz-Session in der Vorlesung ist
  das aber kein Problem.
- Bitte die **Host-Seite während des laufenden Quiz nicht neu laden** – sonst
  verliert sie den Überblick über die aktuelle Frage. Über **"Neue Runde
  starten"** am Ende kannst du jederzeit von vorn beginnen.

Viel Erfolg in der Vorlesung! 🎓
