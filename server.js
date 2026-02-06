const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// --- 1. ВАЖНЫЕ НАСТРОЙКИ СЕТИ (RENDER FIX) ---
// Доверяем прокси Render, чтобы не было ошибки X-Forwarded-For
app.set('trust proxy', 1);

// --- 2. БЕЗОПАСНОСТЬ ---
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// Лимит запросов (защита от DDOS)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300, // Увеличил лимит
    validate: { trustProxy: false } // Отключаем лишнюю проверку
});
app.use('/api', limiter);

// Раздача файлов сайта (frontend)
app.use(express.static(__dirname));

// --- 3. БАЗА ДАННЫХ (MONGO DB) ---
const MONGO_URI = 'mongodb+srv://vitalikzelenkoplay:Zelenko2011@cluster0.684a4.mongodb.net/istore?retryWrites=true&w=majority&appName=Cluster0';

// Схемы данных
const productSchema = new mongoose.Schema({
    id: Number, name: String, price: Number, img: String, specs: String
});
const Product = mongoose.model('Product', productSchema);

const orderSchema = new mongoose.Schema({
    userId: String, items: Array, total: Number,
    status: { type: String, default: 'В обработке' },
    date: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// Подключение с Авто-Заполнением (Seeder)
mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('✅ MongoDB Успешно подключена!');
        
        // --- МАГИЯ: АВТО-ДОБАВЛЕНИЕ ТОВАРОВ ---
        const count = await Product.countDocuments();
        if (count === 0) {
            console.log('📦 База пустая. Добавляю тестовые товары...');
            await Product.insertMany([
                {
                    id: 1,
                    name: "iPhone 15 Pro",
                    price: 120000,
                    img: "https://shop.mts.ru/upload/iblock/58c/4.jpg",
                    specs: "Titanium, 256GB"
                },
                {
                    id: 2,
                    name: "MacBook Air M2",
                    price: 150000,
                    img: "https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/macbook-air-midnight-select-20220606?wid=539&hei=312&fmt=jpeg&qlt=90&.v=1653084303665",
                    specs: "Midnight, 512GB"
                },
                {
                    id: 3,
                    name: "AirPods Pro 2",
                    price: 25000,
                    img: "https://store.storeimages.cdn-apple.com/4668/as-images.apple.com/is/MQD83?wid=572&hei=572&fmt=jpeg&qlt=95&.v=1660803972361",
                    specs: "Noise Cancellation"
                }
            ]);
            console.log('🚀 Товары успешно добавлены!');
        }
    })
    .catch(err => {
        console.error('❌ Ошибка подключения к БД:', err.message);
    });

// --- 4. КЛЮЧИ ---
const TG_BOT_TOKEN = '8353105063:AAGk39ebC7Z8ao7hHykiKXY3XE5tchrpT8o';

// --- 5. API (МАРШРУТЫ) ---

// Получить товары
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Ошибка сервера при получении товаров' });
    }
});

// Добавить товар (Админка)
app.post('/api/add-product', async (req, res) => {
    try {
        const { name, price, img, specs } = req.body;
        const newProduct = new Product({ id: Date.now(), name, price, img, specs });
        await newProduct.save();
        res.json({ status: 'ok', product: newProduct });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка сохранения' });
    }
});

// Удалить товар
app.delete('/api/products/:id', async (req, res) => {
    try {
        await Product.deleteOne({ id: req.params.id });
        res.json({ status: 'deleted' });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

// Создать заказ
app.post('/api/orders', async (req, res) => {
    try {
        const { cart, userId } = req.body;
        if (!cart) return res.status(400).json({ error: 'Пустая корзина' });
        const total = cart.reduce((sum, i) => sum + i.price, 0);
        const newOrder = new Order({ userId, items: cart, total });
        await newOrder.save();
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка заказа' });
    }
});

// Оплата
app.post('/api/create-payment-link', async (req, res) => {
    try {
        const { cart } = req.body;
        const totalAmount = cart.reduce((sum, item) => sum + item.price, 0);
        const invoicePayload = {
            title: "Заказ iStore",
            description: `Оплата (${cart.length} товаров)`,
            payload: `order_${Date.now()}`,
            provider_token: "", 
            currency: "XTR",
            prices: [{ label: "Сумма", amount: totalAmount }]
        };
        
        // Используем встроенный fetch (Node 18+)
        const response = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/createInvoiceLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoicePayload)
        });
        const data = await response.json();
        
        if (data.ok) res.json({ url: data.result });
        else res.status(500).json({ error: 'Ошибка Telegram API' });
    } catch (e) {
        res.status(500).json({ error: 'Ошибка создания оплаты' });
    }
});

// --- 6. МАРШРУТИЗАЦИЯ (ФРОНТЕНД) ---
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Любой другой запрос -> Главная страница
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- 7. ЗАПУСК ---
app.listen(port, () => {
    console.log(`🚀 Сервер запущен на порту ${port}`);
});