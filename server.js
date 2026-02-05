/* iStore Server v9.0 - CAPTCHA SECURITY 🛡️ */
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const bcrypt = require('bcryptjs');
const session = require('express-session'); // <--- 1. Память для капчи
const svgCaptcha = require('svg-captcha');  // <--- 2. Генератор картинок

const app = express();
const PORT = 3000;

const TG_TOKEN = '8554713425:AAHeYxVZhwsku1ZinG1Z8WwzlfE5hFiMCnc'; 
const TG_CHAT_ID = '1599391998';
const bot = new TelegramBot(TG_TOKEN, {polling: true}); 

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// --- 3. НАСТРОЙКА СЕССИЙ ---
// Это позволяет серверу запоминать пользователя, пока он сидит на сайте
app.use(session({
    secret: 'super-secret-key', // Секретный ключ шифрования
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60000 * 30 } // Сессия живет 30 минут
}));

mongoose.connect('mongodb+srv://vitalikzelenkoplay_db_user:OwVUT6Y46AyJVib1@cluster0.ohmyicg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')
    .then(() => console.log('✅ ОБЛАЧНАЯ БАЗА ПОДКЛЮЧЕНА'))
    .catch(err => console.error('❌ Ошибка БД:', err));

// --- СХЕМЫ ---
const UserSchema = new mongoose.Schema({ 
    email: { type: String, unique: true }, 
    passwordHash: String,
    isAdmin: { type: Boolean, default: false }
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

// --- 4. API КАПЧИ (Новое!) ---
app.get('/api/captcha', (req, res) => {
    const captcha = svgCaptcha.create({
        size: 4, // 4 символа
        noise: 2, // Немного шума (линий)
        color: true,
        background: '#f0f0f0'
    });
    
    // Запоминаем правильный ответ в сессии пользователя
    req.session.captcha = captcha.text;
    
    // Отправляем картинку
    res.type('svg');
    res.status(200).send(captcha.data);
});

// --- АВТОРИЗАЦИЯ ---
app.post('/api/register', async (req, res) => {
    const { email, password, captchaAnswer } = req.body; // Получаем ответ пользователя
    
    // 5. ПРОВЕРКА КАПЧИ
    if (!req.session.captcha || req.session.captcha !== captchaAnswer) {
        return res.status(400).json({ error: 'Неверная капча! Попробуйте еще раз.' });
    }

    if(await User.findOne({ email })) return res.status(400).json({ error: 'Email занят' });
    
    const hash = await bcrypt.hash(password, 10);
    const newUser = new User({ email, passwordHash: hash, isAdmin: false });
    await newUser.save();
    
    // После успеха очищаем капчу
    req.session.captcha = null;
    
    res.json({ success: true, userId: newUser._id, isAdmin: false });
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
        return res.status(400).json({ error: 'Неверный логин или пароль' });
    }
    res.json({ success: true, userId: user._id, isAdmin: user.isAdmin });
});

// --- API ПРОДУКТОВ ---
app.get('/api/products', async (req, res) => { res.json(await Product.find()); });
app.post('/api/products', async (req, res) => { await new Product({ id: Date.now(), ...req.body }).save(); res.json({ success: true }); });
app.delete('/api/products/:id', async (req, res) => { await Product.deleteOne({ id: Number(req.params.id) }); res.json({ success: true }); });
app.put('/api/products/:id', async (req, res) => { await Product.updateOne({ id: Number(req.params.id) }, req.body); res.json({ success: true }); });

// --- API ЗАКАЗОВ ---
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
    const itemsText = cart.map(i => `▫️ ${i.name}`).join('\n');
    bot.sendMessage(TG_CHAT_ID, `🔥 Заказ ($${newOrder.total})\n${itemsText}`);
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

app.listen(PORT, () => console.log(`🚀 SERVER v9.0 (CAPTCHA) ЗАПУЩЕН`));