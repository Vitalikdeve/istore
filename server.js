/* iStore Server v11.0 - FINAL STABLE 🛠️ */
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const svgCaptcha = require('svg-captcha');

const app = express();
const PORT = 3000;

// Твои ключи
const TG_TOKEN = '8554713425:AAHeYxVZhwsku1ZinG1Z8WwzlfE5hFiMCnc'; 
const TG_CHAT_ID = '1599391998';
const bot = new TelegramBot(TG_TOKEN, {polling: false}); // polling выключен для Render

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// Настройка сессий (память сервера)
app.use(session({
    secret: 'super-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60000 * 30 }
}));

// ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ
mongoose.connect('mongodb+srv://vitalikzelenkoplay_db_user:OwVUT6Y46AyJVib1@cluster0.ohmyicg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')
    .then(() => console.log('✅ ОБЛАЧНАЯ БАЗА ПОДКЛЮЧЕНА'))
    .catch(err => console.error('❌ Ошибка БД:', err));

// --- СХЕМЫ ---
const UserSchema = new mongoose.Schema({ 
    email: { type: String, unique: true }, 
    passwordHash: String,
    isAdmin: { type: Boolean, default: false },
    telegramId: String
});
const User = mongoose.model('User', UserSchema);

const ProductSchema = new mongoose.Schema({ id: Number, name: String, price: Number, img: String, specs: String });
const Product = mongoose.model('Product', ProductSchema);

const OrderSchema = new mongoose.Schema({ 
    orderId: String, 
    userId: String, 
    total: Number, 
    date: Date, 
    status: { type: String, default: 'В обработке 🕒' },
    items: Array 
});
const Order = mongoose.model('Order', OrderSchema);

// --- API КАПЧИ ---
app.get('/api/captcha', (req, res) => {
    const captcha = svgCaptcha.create({ size: 4, noise: 2, color: true, background: '#f0f0f0' });
    req.session.captcha = captcha.text;
    res.type('svg');
    res.status(200).send(captcha.data);
});

// --- ВХОД ЧЕРЕЗ ТЕЛЕГРАМ (ИСПРАВЛЕННЫЙ) ---
app.get('/api/auth/telegram', async (req, res) => {
    try {
        const { id, first_name, username } = req.query; 
        
        if (!id) return res.send("Ошибка: Нет ID от Telegram");

        // Ищем или создаем пользователя
        let user = await User.findOne({ telegramId: id });
        if (!user) {
            user = new User({
                telegramId: id,
                email: username ? `${username}@telegram.com` : `${id}@telegram.com`,
                isAdmin: false
            });
            await user.save();
        }

        // Отправляем страницу с кнопкой (чтобы избежать белого экрана)
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Вход выполнен</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f2f2f7; margin: 0; text-align: center;}
                    .card { background: white; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
                    .btn { display: inline-block; background: #0071e3; color: white; padding: 15px 30px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 18px; margin-top: 20px; transition: 0.2s; }
                    .btn:hover { background: #005bb5; }
                    h1 { color: #1d1d1f; margin-bottom: 10px; }
                    p { color: #86868b; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>✅ Вход разрешен!</h1>
                    <p>Добро пожаловать, ${first_name || 'Пользователь'}!</p>
                    <p>Нажмите кнопку ниже, чтобы продолжить:</p>
                    
                    <a href="/profile.html" class="btn" id="loginBtn">ПЕРЕЙТИ В МАГАЗИН &rarr;</a>
                </div>

                <script>
                    // 1. Сохраняем ключи доступа
                    localStorage.setItem('userId', '${user._id}');
                    localStorage.setItem('isAdmin', '${user.isAdmin}');
                    
                    // 2. Пытаемся перейти автоматически через 1.5 секунды
                    setTimeout(() => {
                        window.location.href = '/profile.html';
                    }, 1500);
                </script>
            </body>
            </html>
        `);
    } catch (e) {
        console.error(e);
        res.send("Ошибка сервера: " + e.message);
    }
});

// --- ОБЫЧНАЯ РЕГИСТРАЦИЯ ---
app.post('/api/register', async (req, res) => {
    const { email, password, captchaAnswer } = req.body;
    
    if (!req.session.captcha || req.session.captcha !== captchaAnswer) {
        return res.status(400).json({ error: 'Неверная капча!' });
    }

    if(await User.findOne({ email })) return res.status(400).json({ error: 'Email занят' });
    
    const hash = await bcrypt.hash(password, 10);
    const newUser = new User({ email, passwordHash: hash });
    await newUser.save();
    
    req.session.captcha = null;
    res.json({ success: true, userId: newUser._id, isAdmin: false });
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.passwordHash || !await bcrypt.compare(password, user.passwordHash)) {
        return res.status(400).json({ error: 'Неверный логин или пароль' });
    }
    res.json({ success: true, userId: user._id, isAdmin: user.isAdmin });
});

// --- ПРОДУКТЫ И ЗАКАЗЫ ---
app.get('/api/products', async (req, res) => { res.json(await Product.find()); });
app.post('/api/products', async (req, res) => { await new Product({ id: Date.now(), ...req.body }).save(); res.json({ success: true }); });
app.delete('/api/products/:id', async (req, res) => { await Product.deleteOne({ id: Number(req.params.id) }); res.json({ success: true }); });
app.put('/api/products/:id', async (req, res) => { await Product.updateOne({ id: Number(req.params.id) }, req.body); res.json({ success: true }); });

app.post('/api/orders', async (req, res) => {
    const { cart, userId } = req.body;
    const newOrder = new Order({
        orderId: "ORD-" + Date.now(),
        userId: userId || 'guest',
        total: cart.reduce((sum, item) => sum + item.price, 0),
        date: new Date(),
        items: cart
    });
    await newOrder.save();
    
    try {
        const itemsText = cart.map(i => `▫️ ${i.name}`).join('\n');
        bot.sendMessage(TG_CHAT_ID, `🔥 Новый заказ ($${newOrder.total})\n${itemsText}`);
    } catch(e) { console.log('Ошибка бота', e); }

    res.json({ success: true });
});

app.get('/api/my-orders', async (req, res) => {
    const userId = req.headers['userid'];
    const orders = await Order.find({ userId: userId });
    res.json(orders);
});

app.get('/api/admin/orders', async (req, res) => {
    const orders = await Order.find();
    res.json(orders);
});

app.put('/api/orders/:id/status', async (req, res) => {
    const { status } = req.body;
    await Order.updateOne({ orderId: req.params.id }, { status: status });
    res.json({ success: true });
});
// --- ОПЛАТА TELEGRAM STARS (INTEGRATED) --- //

const BOT_TOKEN = '8174786890:AAHYvKO9lDjgkzWMJ1Ed57W2Y1VFbxG4LMo'; 

app.post('/api/create-payment-link', async (req, res) => {
    const { cart } = req.body;

    // Считаем сумму (1 звезда = 1 доллар для теста)
    const totalAmount = cart.reduce((sum, item) => sum + item.price, 0);

    const invoicePayload = {
        title: "Заказ iStore",
        description: `Оплата товаров: ${cart.map(i => i.name).join(', ')}`,
        payload: `order_${Date.now()}`, // Уникальный ID заказа
        provider_token: "", // ДЛЯ ЗВЕЗД ЭТО ПОЛЕ ПУСТОЕ!
        currency: "XTR", // Валюта Telegram Stars
        prices: [
            { label: "Сумма заказа", amount: totalAmount } 
        ]
    };

    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoicePayload)
        });

        const data = await response.json();

        if (data.ok) {
            res.json({ url: data.result });
        } else {
            console.error('Ошибка Telegram:', data);
            res.status(500).json({ error: 'Ошибка создания ссылки' });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});
app.listen(PORT, () => console.log(`🚀 SERVER v11.0 ЗАПУЩЕН`));
