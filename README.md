# ADAM – AI Calling Agent for Career Point University, Kota
Student attendance + parent notifications, in Hinglish. Powered by Vapi. Dependencies included (no npm install).

## What ADAM does
1. OUTBOUND: calls a parent when their child is absent, tells them politely, asks the reason, saves it.
2. INBOUND: a parent calls (or uses the web page), gives roll number + last 4 digits of registered mobile,
   and ADAM tells the attendance (only after verification).
3. Anything else (fees, admission, teacher meeting): saves a callback request for the office.
4. Dashboard (/admin.html): mark students absent, call parents (one or all), see reasons, callbacks, call transcripts.

## Setup (10 minutes)
1. Install Node.js 18+ (nodejs.org).
2. Vapi account (vapi.ai) -> API Keys. Paste Private + Public keys into `.env`. Set ADMIN_KEY.
3. Public URL (REQUIRED for attendance lookups and logs): run `npx ngrok http 3000`, paste the https URL into PUBLIC_URL in `.env`.
4. Start: double-click `start.bat` (Windows) or `./start.sh`. ADAM is created on Vapi automatically.
5. Open http://localhost:3000 -> Start Call (test as a parent: roll CPU2026001, last 4 digits 0001).
6. Dashboard: http://localhost:3000/admin.html

## Real student data
Dashboard -> "Import students": paste CSV with columns
`rollNumber,name,course,parentName,parentPhone,attended,total`
(parentPhone like +919876543210; do NOT put commas inside course). Sample data is fake.

## Calling parents (phone)
Vapi dashboard -> Phone Numbers -> add a number -> copy ID to VAPI_PHONE_NUMBER_ID.
Mark students absent -> "Call" or "Call parents of all absent" (calls go out ~8 seconds apart; one call per student per day).
Check Vapi's current rules for calling Indian numbers, and call only parents who gave the university their number.

## Changing ADAM's behaviour
Edit `prompts/system-prompt.md`. Then clear VAPI_ASSISTANT_ID in `.env` and restart (creates a fresh ADAM).
The 75% attendance rule is in the prompt; change it there if CPU's rule differs.

## Voice
Male Hindi voice (Azure hi-IN-MadhurNeural), speech recognition Deepgram nova-3 multilingual.
If a voice/transcriber errors, pick another in the Vapi dashboard on the assistant.

## Privacy
Student data stays in the data/ folder on your server. Protect your ADMIN_KEY, deploy on HTTPS only, and move to a real database
(Supabase/PostgreSQL) before using with all students.

## Deploy
Render/Railway/VPS: upload folder, set same variables, PUBLIC_URL = live URL. Docker: `docker build -t adam . && docker run -p 3000:3000 --env-file .env adam`

## Files
server.js, lib/assistant.js, prompts/system-prompt.md, public/index.html (call page), public/admin.html (dashboard), data/*.json
