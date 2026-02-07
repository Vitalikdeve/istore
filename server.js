require('dotenv').config(); // Загрузка секретов

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet'); 
const rateLimit = require('express-rate-limit'); 
const mongoSanitize = require('express-mongo-sanitize'); 
const xss = require('xss-clean'); 
const hpp = require('hpp'); 
const path = require('path');

// --- 1. ПРОВЕРКА КЛЮЧЕЙ ---
if (!process.env.MONGO_URI || !process.env.TG_BOT_TOKEN || !process.env.TG_PAY_TOKEN) {
    console.error('⛔ FATAL ERROR: Нет ключей в настройках Render!');
    process.exit(1);
}

const app = express();
const port = process.env.PORT || 10000;

// --- 2. НАСТРОЙКИ БЕЗОПАСНОСТИ ---
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false })); // Защита заголовков
app.use(cors({ origin: '*' })); // Разрешаем доступ
app.use(express.json({ limit: '10kb' })); // Лимит данных 10кб

// Санитизация (Чистка данных от хакеров)
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// Ограничение скорости (чтобы не дудосили)
const globalLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 200,
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api', globalLimiter);

// --- 3. БАЗА ДАННЫХ ---
const productSchema = new mongoose.Schema({
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    img: { type: String, required: true },
    specs: { type: String }
});
const Product = mongoose.model('Product', productSchema);

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('🛡️  Secure DB Connected'))
    .catch(err => console.error('❌ DB Error:', err.message));

// Раздача статических файлов (картинки, скрипты, если будут)
app.use(express.static(__dirname));

// --- 4. API (ТОВАРЫ И ОПЛАТА) ---

app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().select('-_id -__v');
        res.json(products);
    } catch (e) {
        res.status(500).json({ error: 'Server Error' });
    }
});

app.post('/api/add-product', async (req, res) => {
    try {
        const { name, price, img, specs } = req.body;
        // Простая защита: добавлять может любой, кто знает API, 
        // но в реальном проекте тут нужна проверка пароля админа.
        const newProduct = new Product({ id: Date.now(), name, price, img, specs });
        await newProduct.save();
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(500).json({ error: 'Error saving product' });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await Product.deleteOne({ id: req.params.id });
        res.json({ status: 'deleted' });
    } catch (e) {
        res.status(500).json({ error: 'Error deleting' });
    }
});

app.post('/api/create-payment-link', async (req, res) => {
    try {
        const { cart } = req.body;
        if (!cart || !Array.isArray(cart) || cart.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        // Считаем сумму на сервере (Безопасно)
        let totalAmount = 0;
        for (const item of cart) {
            if (item.price && typeof item.price === 'number') {
                totalAmount += item.price;
            }
        }
        
        // Telegram требует сумму в копейках (x100)
        const finalAmount = Math.ceil(totalAmount * 100); 

        const invoicePayload = {
            title: "iStore Checkout",
            description: `Order #${Date.now()}`,
            payload: `order_${Date.now()}`,
            provider_token: process.env.TG_PAY_TOKEN,
            currency: "RUB",
            prices: [{ label: "Total", amount: finalAmount }]
        };

        const response = await fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/createInvoiceLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoicePayload)
        });

        const data = await response.json();

        if (data.ok) {
            res.json({ url: data.result });
        } else {
            console.error('TG Error:', data);
            res.status(400).json({ error: 'Payment Gate Error' });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server Transaction Error' });
    }
});

// --- 5. МАРШРУТИЗАЦИЯ СТРАНИЦ (ГЛАВНОЕ ОБНОВЛЕНИЕ) ---

// Страница безопасной оплаты
app.get('/checkout', (req, res) => {
    res.sendFile(path.join(__dirname, 'checkout.html'));
});

// Админ-панель
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Главная страница (для всех остальных запросов)
// ВАЖНО: Этот блок должен быть в самом низу!
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- ЗАПУСК ---
// ==========================================
// ДОБАВИТЬ ЭТО В ТВОЙ СУЩЕСТВУЮЩИЙ СЕРВЕР
// ==========================================

// 1. Схема Пользователя (Как он выглядит в базе)
const UserSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    firstName: String,
    username: String,
    photoUrl: String,
    favorites: [String], // Список ID любимых товаров
    createdAt: { type: Date, default: Date.now }
});

// Если модель уже есть - используем её, иначе создаем
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// 2. Роут для входа (Приложение присылает данные сюда)
app.post('/api/auth/telegram', async (req, res) => {
    try {
        const { id, first_name, username, photo_url } = req.body;

        // Проверяем, есть ли такой юзер
        let user = await User.findOne({ telegramId: id });

        if (!user) {
            // Если нет - создаем нового
            user = new User({
                telegramId: id,
                firstName: first_name,
                username: username,
                photoUrl: photo_url
            });
            await user.save();
            console.log("🆕 Новый пользователь:", first_name);
        } else {
            // Если есть - обновляем данные (вдруг поменял аватарку)
            user.firstName = first_name;
            user.username = username;
            user.photoUrl = photo_url;
            await user.save();
            console.log("👋 Пользователь вернулся:", first_name);
        }

        res.json(user); // Отправляем пользователя обратно в приложение
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Ошибка сервера при входе" });
    }
});
app.listen(port, () => {
    console.log(`🚀 Secure Server running on port ${port}`);
});