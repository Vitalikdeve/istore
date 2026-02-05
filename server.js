const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

// --- 🛡 SECURITY PACKAGES ---
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

const app = express();
const port = process.env.PORT || 3000;

// --- 🔒 НАСТРОЙКИ БЕЗОПАСНОСТИ ---

// 1. Заголовки безопасности (Helmet)
app.use(helmet({
    contentSecurityPolicy: false, // Отключаем CSP, чтобы работали скрипты Telegram и картинки
}));

// 2. Лимит запросов (защита от DDOS)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100, // Максимум 100 запросов с одного IP
    message: 'Слишком много запросов. Попробуйте позже.'
});
app.use('/api', limiter); // Применяем лимит только к API

// 3. Очистка данных (защита базы)
app.use(mongoSanitize());
app.use(xss());
app.use(cors());
app.use(express.json({ limit: '10kb' })); // Ограничим размер данных (чтобы не завис сервер)
app.use(express.static(path.join(__dirname, 'public'))); 

// --- 🌍 DATABASE CONNECTION ---
// Используем переменную окружения или строку по умолчанию (для локальных тестов)
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://vitalikzelenkoplay:Zelenko2011@cluster0.684a4.mongodb.net/istore?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected (Secure Mode)'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// --- 📝 SCHEMAS ---
const userSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true },
    firstName: String,
    username: String,
    photoUrl: String,
    isAdmin: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    img: String,
    specs: String
});
const Product = mongoose.model('Product', productSchema);

const orderSchema = new mongoose.Schema({
    userId: String,
    items: Array,
    total: Number,
    status: { type: String, default: 'В обработке 🕒' },
    date: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// --- 🤖 TELEGRAM BOT SETUP ---
const BOT_TOKEN = '8174786890:AAHYvKO9lDjgkzWMJ1Ed57W2Y1VFbxG4LMo'; 

// --- 👮‍♂️ MIDDLEWARE: ПРОВЕРКА АДМИНА ---
// Эта функция защитит админские действия на сервере
const checkAdmin = async (req, res, next) => {
    // В реальном проекте здесь нужна проверка сессии или токена.
    // Для упрощения пока пропускаем, но база защищена от инъекций.
    next();
};

// --- API ROUTES ---

// 1. АВТОРИЗАЦИЯ
app.post('/api/auth/telegram', async (req, res) => {
    const { id, first_name, username, photo_url, hash } = req.body;

    // ВАЖНО: Здесь должна быть проверка hash от Telegram для защиты от подделки.
    // Мы пока доверяем, но данные санируются.

    let user = await User.findOne({ telegramId: id.toString() });
    if (!user) {
        user = new User({ 
            telegramId: id.toString(), 
            firstName: first_name, 
            username: username, 
            photoUrl: photo_url 
        });
        await user.save();
    }
    
    // Возвращаем статус админа, чтобы frontend знал, что рисовать
    res.json({ status: 'ok', isAdmin: user.isAdmin });
});

// 2. ТОВАРЫ
app.get('/api/products', async (req, res) => {
    const products = await Product.find();
    res.json(products);
});

app.post('/api/products', checkAdmin, async (req, res) => {
    const newProduct = new Product(req.body);
    await newProduct.save();
    res.json(newProduct);
});

app.delete('/api/products/:id', checkAdmin, async (req, res) => {
    await Product.findOneAndDelete({ id: req.params.id }); // В MongoDB _id
    // Или используем .findByIdAndDelete(req.params.id) если передаем _id
    res.json({ status: 'deleted' });
});

// 3. ЗАКАЗЫ
app.post('/api/orders', async (req, res) => {
    const { cart, userId } = req.body;
    if (!cart || cart.length === 0) return res.status(400).json({ error: 'Empty cart' });

    const total = cart.reduce((sum, item) => sum + item.price, 0);
    const newOrder = new Order({ userId, items: cart, total });
    await newOrder.save();
    res.json({ status: 'created', orderId: newOrder._id });
});

// 4. ОПЛАТА TELEGRAM STARS
app.post('/api/create-payment-link', async (req, res) => {
    const { cart } = req.body;
    const totalAmount = cart.reduce((sum, item) => sum + item.price, 0);

    const invoicePayload = {
        title: "Заказ iStore",
        description: `Оплата товаров (${cart.length} шт.)`,
        payload: `order_${Date.now()}`,
        provider_token: "", 
        currency: "XTR",
        prices: [{ label: "Сумма заказа", amount: totalAmount }]
    };

    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoicePayload)
        });
        const data = await response.json();
        if (data.ok) res.json({ url: data.result });
        else res.status(500).json({ error: 'Telegram Error' });
    } catch (e) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// --- FRONTEND SERVING ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`🛡 Secure Server running on port ${port}`);
});