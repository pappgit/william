# William Gressklipp

Enkel mobil-webapp for gressklipping i nabolaget – med **sanntidssynk** mellom PC, din mobil og Williams mobil via **Supabase**.

## Funksjoner

- **Liste** – adresser med dato, størrelse, pris, flyer og notat
- **Kart** – markører og info-vindu ved hover/trykk
- **Sanntid** – endringer vises på alle enheter innen sekunder
- **Eksport / import** – backup som JSON

## Supabase-oppsett (én gang)

### 1. Prosjekt

Bruk et eksisterende Supabase-prosjekt, eller opprett nytt på [supabase.com](https://supabase.com).

### 2. Database-tabell

1. Gå til **SQL Editor** i Supabase Dashboard
2. Åpne filen `supabase/schema.sql` i dette repoet
3. Lim inn og kjør (**Run**)

### 3. Realtime

1. **Database → Replication**
2. Finn tabellen `gressklipp_data` og slå på **Realtime** (hvis den ikke ble aktivert av SQL-skriptet)

### 4. API-nøkler

1. **Project Settings → API**
2. Kopier **Project URL** og **anon public** key
3. Lim inn i `js/supabase-config.js`:

```javascript
window.SUPABASE_URL = 'https://xxxxx.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbG...';
window.SYNC_ROOM_ID = 'william-gressklipp';
```

`SYNC_ROOM_ID` må være **identisk** på PC og begge mobiler.

### 5. Deploy

Push til GitHub og bruk **GitHub Pages** (Settings → Pages → branch `main`, mappe `/`).

### 6. Test

- Grønn prikk i header = sanntid aktiv
- Legg inn adresse på én telefon → skal vises på den andre etter 1–2 sek

## Lokal utvikling

```bash
python3 -m http.server 8080
```

Åpne http://localhost:8080

## Backup

↓ eksporter JSON · ↑ importer (overskriver lokalt og i Supabase når synk er aktiv)

## Filstruktur

```
index.html
js/supabase-config.js
js/sync.js
js/storage.js
js/app.js
supabase/schema.sql
```

## Personvern

Kun adresser og jobbinfo dere legger inn. Ingen kundeinnlogging.
