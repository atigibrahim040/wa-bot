const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs-extra');
const qrcode = require('qrcode-terminal');
const handler = require('./handler');

// حماية قاعدة البيانات
let db = { users: [], banned: [] };
try {
    if (fs.existsSync('./database.json')) {
        const parsed = fs.readJsonSync('./database.json');
        if (Array.isArray(parsed.users) && Array.isArray(parsed.banned)) {
            db = parsed;
        } else {
            throw new Error('Invalid structure');
        }
    } else {
        fs.writeJsonSync('./database.json', db);
    }
} catch (e) {
    console.log('[⚠️] database.json خربق، جاري إصلاحه...');
    fs.writeJsonSync('./database.json', db);
}

async function startBot() {
    console.log('[1] بدء تشغيل البوت...');
    
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version, 
        logger: pino({ level: 'silent' }), 
        printQRInTerminal: false,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
        browser: Browsers.ubuntu('Chrome'), 
        markOnlineOnConnect: false, 
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('[5] ✅ البوت متصل بنجاح!');
        }
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
            
            const sender = msg.key.remoteJid;
            let currentDb = fs.readJsonSync('./database.json');
            if (!currentDb.users.includes(sender)) {
                currentDb.users.push(sender);
                fs.writeJsonSync('./database.json', currentDb, { spaces: 2 });
            }

            await handler(sock, msg).catch(err => console.error('[Crash Prevented]', err.message));
        }
    });
}
startBot().catch(console.error);
