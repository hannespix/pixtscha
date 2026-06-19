# 🎨 PaintDrift — ein paper.io-artiges Mal-Spiel

Fahr mit deiner kleinen Figur über ein **riesiges Canvas**, umkreise Flächen und
verwandle sie in ein gewaltiges Gemälde. Je größer deine Schleifen, desto mehr
**Farbtropfen 💧** – und damit Pinsel, Muster, Upgrades & Skins zum Freischalten.

> Süchtig-Schleife: Umkreisen → Fläche füllen → Combo → Tropfen → Upgrade → noch
> coolere Kunst → 📸 teilen → wiederholen.

## ▶️ Spielen

Es ist ein reines Browser-Spiel ohne Build-Schritt. Zwei Wege:

```bash
# einfachster Weg – Datei direkt öffnen
xdg-open index.html        # Linux
open index.html            # macOS

# oder als lokaler Server (empfohlen, z.B. für sauberes Speichern)
python3 -m http.server 8000
# dann http://localhost:8000 im Browser öffnen
```

Funktioniert auf **Desktop und Handy**.

## 🕹️ Steuerung

| Aktion | Desktop | Touch |
|---|---|---|
| Lenken | Maus bewegen (Figur fährt zum Zeiger) / WASD / Pfeile | Finger ziehen |
| Zoomen | Mausrad | Pinch (2 Finger) |
| Werkstatt / Farbwähler / Teilen | Buttons oben rechts | dito |

## 🧠 Mechaniken

- **Fangen:** Verlässt du dein Gebiet, ziehst du eine Spur. Schließt du die
  Schleife (zurück ins eigene Gebiet), wird alles Eingeschlossene per Flood-Fill
  mit deinem aktiven **Pinsel** gefüllt – dauerhaft.
- **Tinte:** Begrenzt die Spurlänge, lädt auf eigenem Gebiet schnell wieder auf.
  Triff nicht deine eigene Spur, sonst ist sie weg!
- **Combos 🔥:** Mehrere Flächen schnell hintereinander → Multiplikator bis x8.
- **Sterne ✨:** Tauchen auf der Karte auf, geben Bonus-Tropfen (Magnet-Upgrade
  zieht sie an).
- **Pinsel:** Solid, Verlauf, Regenbogen, Neon, Pastell, Feuer, Ozean, Galaxie,
  Konfetti, Gold – jeder malt Flächen anders ein.
- **Muster/Upgrades:** Deckkraft (transparente Schichten), Tempo, Tinten-Tank,
  Wendigkeit, Stern-Magnet, Weitsicht (mehr Zoom), Glüh-Spur, Figur-Skins.
- **Farbwähler 🎨:** Voller HSV-Picker mit gemerkten Farben.
- **Fortschritt** wird automatisch im Browser gespeichert (`localStorage`).
- **Teilen 📸:** Exportiert dein Gemälde als PNG.

## 🗂️ Dateien

- `index.html` – Markup & UI-Panels
- `style.css` – Styling (dunkles, neon-iges UI)
- `game.js` – komplette Spiel-Logik (Render, Capture, Shop, Speichern)

Viel Spaß – und mal was Schönes! 🖌️

## 🌐 Live

Spiel online: https://hannespix.github.io/pixtscha/
