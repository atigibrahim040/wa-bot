const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs-extra');
const handler = require('./handler');

if (!fs.existsSync('./database.json')) fs.writeJsonSync('./database.json', { users: [], banned: [] });

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version, logger: pino({ level: 'silent' }), printQRInTerminal: false,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
        browser: Browsers.ubuntu('Chrome'), markOnlineOnConnect: false, syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') console.log('[✅] Connected!');
        if (connection === 'close') {
            const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) startBot();
            else process.exit(1);
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        for (const msg of m.messages) {
            if (!msg.message || msg.key.fromMe) continue;
            
            // حفظ رقم أي شخص يراسل البوت (باش الإذاعة توصل للجميع)
            const sender = msg.key.remoteJid;
            let db = await fs.readJson('./database.json');
            if (!db.users.includes(sender)) {
                db.users.push(sender);
                await fs.writeJson('./database.json', db, { spaces: 2 });
            }

            await handler(sock, msg).catch(err => console.error('[Crash Prevented]', err.message));
        }
    });
}
startBot().catch(console.error);
