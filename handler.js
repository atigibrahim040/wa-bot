const config = require('./config');
const fs = require('fs-extra');
const axios = require('axios');

const isOwner = (jid) => config.owner.some(o => o.includes(jid.split('@')[0]));

async function sendMsg(sock, jid, content, quoted) {
    try {
        const sent = await sock.sendMessage(jid, content, quoted ? { quoted } : {});
        return sent;
    } catch (e) { console.error(e.message); }
}

module.exports = async (sock, msg) => {
    const from = msg.key.remoteJid;
    const sender = from.endsWith('@g.us') ? msg.key.participant : from;
    const type = Object.keys(msg.message)[0];
    let text = msg.message[type]?.text || msg.message[type]?.caption || msg.message.conversation || '';
    text = text.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '').trim();

    if (!text.startsWith(config.prefix)) return;
    const args = text.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    // --- واجهة القائمة ---
    if (cmd === 'قائمة' || cmd === 'menu') {
        const menuText = `╭━━━━━━━•「 ⚡ 」•━━━━━━━╮
    *${config.botName}*
╰━━━━━━━•「 ⚡ 」•━━━━━━━╯

> مرحباً بك عزيزي 👋
> أرسل رابط الفيديو أو استخدم الأوامر.

╭━━━━━━━•「 📥 」•━━━━━━━╮
   *أوامر التحميل*
╰━━━━━━━•「 📥 」•━━━━━━━╯
  ➤ ${config.prefix}فديو [رابط]
  ➤ ${config.prefix}صوت [رابط]

╭━━━━━━━•「 👑 」•━━━━━━━╮
   *معلومات المطور*
╰━━━━━━━•「 👑 」•━━━━━━━╯
  ➤ المطور: ${config.ownerName}
  ➤ إنستغرام: ${config.socials.instagram}

───────────────────────
⏱️ *السرعة:* ⚡ عالية جداً
🧬 *الإصدار:* 1.0.0
───────────────────────`;
        await sock.sendMessage(from, { image: { url: config.menuImage }, caption: menuText }, { quoted: msg });
        return;
    }

    // --- أوامر التحميل ---
    if (cmd === 'فديو' || cmd === 'video' || cmd === 'صوت' || cmd === 'audio') {
        let url = args[0];
        if (!url || !url.startsWith('http')) return sendMsg(sock, from, { text: '❌ أرسل رابط صحيح.' }, msg);

        await sendMsg(sock, from, { text: '⏳ جاري جلب المعلومات...' }, msg);
        try {
            const res = await axios.post(config.api, { url }, { timeout: 60000 });
            const data = res.data;
            if (!data || !data.formats) return sendMsg(sock, from, { text: '❌ تعذر جلب الرابط.' }, msg);

            let format = data.formats[0];
            if (cmd === 'صوت' || cmd === 'audio') format = data.formats.find(f => f.type === 'audio' || f.ext === 'mp3') || data.formats[0];

            await sendMsg(sock, from, { text: `⬇️ جاري تحميل: ${format.label}\n📦 الحجم: ${(format.size/1024/1024).toFixed(1)}MB` }, msg);

            if (format.type === 'audio' || format.ext === 'mp3') {
                await sock.sendMessage(from, { audio: { url: format.url }, mimetype: 'audio/mp4' }, { quoted: msg });
            } else {
                await sock.sendMessage(from, { video: { url: format.url }, caption: `🎬 ${data.title}` }, { quoted: msg });
            }
        } catch (e) { await sendMsg(sock, from, { text: '❌ حدث خطأ أثناء التحميل.' }, msg); }
        return;
    }

    // --- لوحة التحكم والإذاعة الذكية (للمالك فقط) ---
    if (cmd === 'ادمن' || cmd === 'admin') {
        if (!isOwner(sender)) return sendMsg(sock, from, { text: '❌ للمطور فقط.' }, msg);
        
        let db = await fs.readJson('./database.json');
        const adminText = `╭━━━━━━━•「 👑 」•━━━━━━━╮
   *لوحة التحكم*
╰━━━━━━━•「 👑 」•━━━━━━━╯

📊 *الإحصائيات:*
➤ المستخدمون: ${db.users.length}
➤ المحظورون: ${db.banned.length}

⚙️ *الأوامر:*
➤ ${config.prefix}اذاعة [رسالة] (ترسل للجميع)
➤ ${config.prefix}حظر [رقم]`;
        return sendMsg(sock, from, { text: adminText }, msg);
    }

    // --- أمر الإذاعة (Broadcast) للجميع بدون استثناء ---
    if (cmd === 'اذاعة' || cmd === 'broadcast') {
        if (!isOwner(sender)) return;
        const message = args.join(' ');
        if (!message) return sendMsg(sock, from, { text: '❌ اكتب الرسالة بعد الأمر.' }, msg);

        let db = await fs.readJson('./database.json');
        await sendMsg(sock, from, { text: `⏳ جاري إرسال الإذاعة إلى ${db.users.length} شخص...` }, msg);

        let success = 0;
        for (const user of db.users) {
            try {
                await sock.sendMessage(user, { text: `📢 *رسالة إدارية:*\n\n${message}` });
                success++;
                await new Promise(r => setTimeout(r, 2000)); // تأخير ثانيتين لتجنب الحظر
            } catch (e) { }
        }
        return sendMsg(sock, from, { text: `✅ تم الإرسال بنجاح إلى ${success} شخص.` }, msg);
    }
};
