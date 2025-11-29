const { Telegraf, Markup, Scenes, session } = require('telegraf');
const fs = require('fs');
const path = require('path');

// Configuration - replace these with your actual values
const BOT_TOKEN = '8536113611:AAEjQdw8GjISNG5UpuN4U6MddP2n5T9bf_0';
const ADMIN_ID = '7787131118'; // Your Telegram user ID as string

// Initialize JSON files if they don't exist
if (!fs.existsSync('movies.json')) {
  fs.writeFileSync('movies.json', '{}');
}

if (!fs.existsSync('users.json')) {
  fs.writeFileSync('users.json', '[]');
}

// Helper functions for data management
const getMovies = () => JSON.parse(fs.readFileSync('movies.json', 'utf-8'));
const saveMovies = (movies) => fs.writeFileSync('movies.json', JSON.stringify(movies, null, 2));

const getUsers = () => JSON.parse(fs.readFileSync('users.json', 'utf-8'));
const saveUser = (user) => {
  const users = getUsers();
  if (!users.some(u => u.id === user.id)) {
    users.push({
      id: user.id,
      firstName: user.first_name,
      username: user.username || '',
      date: new Date().toISOString()
    });
    fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
  }
};

// Create scenes for admin functions
const addMovieScene = new Scenes.WizardScene(
  'addMovieScene',
  (ctx) => {
    ctx.reply('Iltimos, kino kodini yuboring:');
    return ctx.wizard.next();
  },
  (ctx) => {
    if (!ctx.message.text) {
      ctx.reply('Iltimos, faqat matn yuboring!');
      return ctx.scene.reenter();
    }
    
    ctx.wizard.state.code = ctx.message.text.trim();
    const movies = getMovies();
    
    if (movies[ctx.wizard.state.code]) {
      ctx.reply('Bu kod allaqachon mavjud. Iltimos, boshqa kod kiriting.');
      return ctx.scene.reenter();
    }
    
    ctx.reply('Endi kino faylini yuboring (video, rasm, yoki dokument) VA agar caption qo\'shmoqchi bo\'lsangiz, fayl bilan birga yuboring:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    try {
      const { code } = ctx.wizard.state;
      let fileId, type, caption = '';
      
      if (ctx.message.video) {
        fileId = ctx.message.video.file_id;
        type = 'video';
        caption = ctx.message.caption || '';
      } else if (ctx.message.photo) {
        fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        type = 'photo';
        caption = ctx.message.caption || '';
      } else if (ctx.message.document) {
        fileId = ctx.message.document.file_id;
        type = 'document';
        caption = ctx.message.caption || '';
      } else {
        ctx.reply('Noto\'g\'ri format. Iltimos, video, rasm yoki dokument yuboring.');
        return ctx.scene.reenter();
      }
      
      const movies = getMovies();
      movies[code] = { fileId, type, caption };
      saveMovies(movies);
      
      await ctx.reply(`✅ Kino muvaffaqiyatli qo'shildi!\nKod: ${code}\nCaption: ${caption || 'Yo\'q'}`);
    } catch (error) {
      console.error('Add movie error:', error);
      await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
    return ctx.scene.leave();
  }
);

const removeMovieScene = new Scenes.WizardScene(
  'removeMovieScene',
  (ctx) => {
    ctx.reply('O\'chirish uchun kino kodini yuboring:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    try {
      const code = ctx.message.text.trim();
      const movies = getMovies();
      
      if (!movies[code]) {
        await ctx.reply('❌ Bu kod bilan kino topilmadi.');
        return ctx.scene.leave();
      }
      
      delete movies[code];
      saveMovies(movies);
      await ctx.reply(`✅ Kino muvaffaqiyatli o'chirildi!\nKod: ${code}`);
    } catch (error) {
      console.error('Remove movie error:', error);
      await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
    return ctx.scene.leave();
  }
);

// Yangi scene: foydalanuvchilarga xabar yuborish
const sendMessageScene = new Scenes.WizardScene(
  'sendMessageScene',
  (ctx) => {
    ctx.reply('Xabar yuborish uchun kontent yuboring (video, rasm, dokument yoki matn):');
    return ctx.wizard.next();
  },
  async (ctx) => {
    try {
      const users = getUsers();
      let sentCount = 0;
      let failedCount = 0;
      
      // Xabarni kanalga yuborish
      try {
        if (ctx.message.video) {
          await ctx.telegram.sendVideo(CHANNEL_ID, ctx.message.video.file_id, {
            caption: ctx.message.caption || ''
          });
        } else if (ctx.message.photo) {
          await ctx.telegram.sendPhoto(CHANNEL_ID, ctx.message.photo[ctx.message.photo.length - 1].file_id, {
            caption: ctx.message.caption || ''
          });
        } else if (ctx.message.document) {
          await ctx.telegram.sendDocument(CHANNEL_ID, ctx.message.document.file_id, {
            caption: ctx.message.caption || ''
          });
        } else if (ctx.message.text) {
          await ctx.telegram.sendMessage(CHANNEL_ID, ctx.message.text);
        }
      } catch (channelError) {
        console.error('Channel send error:', channelError);
        await ctx.reply('❌ Kanalga xabar yuborishda xatolik yuz berdi.');
      }
      
      // Har bir foydalanuvchiga xabar yuborish
      for (const user of users) {
        try {
          if (ctx.message.video) {
            await ctx.telegram.sendVideo(user.id, ctx.message.video.file_id, {
              caption: ctx.message.caption || ''
            });
          } else if (ctx.message.photo) {
            await ctx.telegram.sendPhoto(user.id, ctx.message.photo[ctx.message.photo.length - 1].file_id, {
              caption: ctx.message.caption || ''
            });
          } else if (ctx.message.document) {
            await ctx.telegram.sendDocument(user.id, ctx.message.document.file_id, {
              caption: ctx.message.caption || ''
            });
          } else if (ctx.message.text) {
            await ctx.telegram.sendMessage(user.id, ctx.message.text);
          }
          sentCount++;
        } catch (error) {
          console.error(`Failed to send to user ${user.id}:`, error);
          failedCount++;
        }
        
        // Har 10 ta xabardan keyin 1 sekund kutish (rate limit uchun)
        if (sentCount % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      await ctx.reply(`✅ Xabar muvaffaqiyatli yuborildi!\n\nJami yuborildi: ${sentCount}\nYuborilmadi: ${failedCount}\n\nKanalga ham yuborildi.`);
    } catch (error) {
      console.error('Send message error:', error);
      await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
    return ctx.scene.leave();
  }
);

// Initialize bot and stage
const stage = new Scenes.Stage([addMovieScene, removeMovieScene, sendMessageScene]);
const bot = new Telegraf(BOT_TOKEN);

// Middleware
bot.use(session());
bot.use(stage.middleware());

// Channel subscription check function
async function checkSubscription(ctx) {
  try {
    const member = await ctx.telegram.getChatMember(CHANNEL_ID, ctx.from.id);
    return member.status !== 'left';
  } catch (error) {
    console.error('Subscription check error:', error);
    return false;
  }
}

// Start command handler
bot.start(async (ctx) => {
  saveUser(ctx.from);
  
  if (ctx.from.id.toString() === ADMIN_ID) {
    await ctx.reply(
      `🎬 Salom, ${ctx.from.first_name}! Admin panelga xush kelibsiz.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🎥 Kino qo\'shish', 'add_movie')],
        [Markup.button.callback('🗑 Kino o\'chirish', 'remove_movie')],
        [Markup.button.callback('📩 Foydalanuvchilarga xabar yuborish', 'send_message')],
        [Markup.button.callback('📊 Statistika', 'stats')]
      ])
    );
  } else {
    const isSubscribed = await checkSubscription(ctx);
    
    if (!isSubscribed) {
      await ctx.replyWithHTML(
        `<i>❗ Iltimos, avval kanalimizga obuna bo'ling:</i>`,
        Markup.inlineKeyboard([
          [Markup.button.url('📢 Kanalga obuna bo\'lish', `https://t.me/${CHANNEL_ID.replace('@', '')}`)],
          [Markup.button.callback('✅ Obunani tekshirish', 'check_subscription')]
        ])
      );
    } else {
      await ctx.replyWithHTML(
        `<i>🎬 Hurmatli ${ctx.from.first_name}, kino kodini kiriting:</i>`
      );
    }
  }
});

// Subscription check handler
bot.action('check_subscription', async (ctx) => {
  try {
    const isSubscribed = await checkSubscription(ctx);
    
    if (isSubscribed) {
      await ctx.replyWithHTML(
        `<i>Salom ${ctx.from.first_name}\nKino kodini kiriting</i>`
      );
      await ctx.deleteMessage();
    } else {
      await ctx.replyWithHTML(
        `<i>❗ Siz hali kanalga obuna bo'lmagansiz. Iltimos, obuna bo'ling:</i>`,
        Markup.inlineKeyboard([
          [Markup.button.url('📢 Kanalga obuna bo\'lish', `https://t.me/${CHANNEL_ID.replace('@', '')}`)],
          [Markup.button.callback('✅ Obunani tekshirish', 'check_subscription')]
        ])
      );
    }
  } catch (error) {
    console.error('Subscription check error:', error);
    await ctx.reply('❌ Xatolik yuz berdi. Iltimos, keyinroq urinib ko\'ring.');
  }
});

// Admin action handlers
bot.action('add_movie', (ctx) => ctx.scene.enter('addMovieScene'));
bot.action('remove_movie', (ctx) => ctx.scene.enter('removeMovieScene'));
bot.action('send_message', (ctx) => ctx.scene.enter('sendMessageScene'));
bot.action('stats', async (ctx) => {
  const users = getUsers();
  let message = `📊 <b>Statistika</b>\n\nJami foydalanuvchilar: ${users.length}\n\n`;
  
  users.slice(0, 50).forEach(user => {
    message += `👤 <b>${user.firstName}</b> (@${user.username || 'foydalanuvchi'}) - ${new Date(user.date).toLocaleDateString()}\n`;
  });
  
  if (users.length > 50) {
    message += `\n...va yana ${users.length - 50} ta foydalanuvchi`;
  }
  
  await ctx.replyWithHTML(message);
});

// Movie code handler for users
bot.on('text', async (ctx) => {
  if (ctx.from.id.toString() === ADMIN_ID) return;
  
  try {
    const isSubscribed = await checkSubscription(ctx);
    
    if (!isSubscribed) {
      return await ctx.replyWithHTML(
        `<i>❗ Iltimos, avval kanalimizga obuna bo'ling:</i>`,
        Markup.inlineKeyboard([
          [Markup.button.url('📢 Kanalga obuna bo\'lish', `https://t.me/${CHANNEL_ID.replace('@', '')}`)],
          [Markup.button.callback('✅ Obunani tekshirish', 'check_subscription')]
        ])
      );
    }
    
    const code = ctx.message.text.trim();
    const movies = getMovies();
    
    if (!movies[code]) {
      return await ctx.replyWithHTML('<i>❌ Kino topilmadi. Iltimos, to\'g\'ri kod kiriting.</i>');
    }
    
    const movie = movies[code];
    try {
      if (movie.type === 'video') {
        await ctx.replyWithVideo(movie.fileId, { caption: movie.caption || '' });
      } else if (movie.type === 'photo') {
        await ctx.replyWithPhoto(movie.fileId, { caption: movie.caption || '' });
      } else if (movie.type === 'document') {
        await ctx.replyWithDocument(movie.fileId, { caption: movie.caption || '' });
      }
    } catch (error) {
      console.error('Movie send error:', error);
      await ctx.reply('❌ Kino yuborishda xatolik. Iltimos, keyinroq urinib ko\'ring.');
    }
  } catch (error) {
    console.error('Text handler error:', error);
    await ctx.reply('❌ Xatolik yuz berdi. Iltimos, keyinroq urinib ko\'ring.');
  }
});

// Admin media handler
bot.on(['video', 'photo', 'document'], (ctx) => {
  if (ctx.from.id.toString() === ADMIN_ID) {
    ctx.reply('ℹ️ Media qabul qilindi. Kino qo\'shish uchun "Kino qo\'shish" tugmasini bosing yoki foydalanuvchilarga yuborish uchun "Foydalanuvchilarga xabar yuborish" tugmasini bosing.');
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ Botda xatolik yuz berdi. Iltimos, keyinroq urinib ko\'ring.');
});

// Express server setup
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🤖 Bot is running!');
});

// Start the server and bot
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

bot.launch()
  .then(() => console.log('🤖 Bot ishga tushdi!'))
  .catch(err => console.error('Botni ishga tushirishda xatolik:', err));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));


