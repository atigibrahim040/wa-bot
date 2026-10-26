const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs-extra');
const qrcode = require('qrcode-terminal');
const handler = require('./handler');

if (!fs.existsSync('./database.json')) fs.writeJsonSync('./database.json', { users: [], banned: [] });

async function startBot() {
    console.log('[1] بدء تشغيل البوت...');
    
    // التحقق من وجود الجلسة
    if (!fs.existsSync('./session/creds.json')) {
        console.log('[⚠️] ملف الجلسة creds.json ماشي موجود! البوت غادي يطلب QR.');
    } else {
        console.log('[✅] ملف الجلسة موجود، جاري الاتصال...');
    }

    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version } = await fetchLatestBaileysVersion();
    console.log('[2] إصدار Baileys:', version.join('.'));
    
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
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('[3] كود QR مطلوب! امسح الكود:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'connecting') console.log('[4] جاري الاتصال بواتساب...');
        
        if (connection === 'open') {
            console.log('[5] ✅ البوت متصل بنجاح!');
        }
        
        if (connection === 'close') {
            const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log('[6] ❌ الاتصال تقطع. كود الخطأ:', code);
            if (code !== DisconnectReason.loggedOut) {
                console.log('[7] إعادة المحاولة...');
                startBot();
            } else {
                console.log('[8] تم تسجيل الخروج، خاصك تمسح الجلسة وتعيد الربط.');
                process.exit(1);
            }
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        for (const msg of m.messages) {
            if (!msg.message || msg.key.fromMe) continue;
            
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
