const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 10000;

// --- 1. ВАЖНЫЕ НАСТРОЙКИ СЕТИ ---
app.set('trust proxy', 1);

// --- 2. БЕЗОПАСНОСТЬ ---
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// Лимит запросов
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    validate: { trustProxy: false } 
});
app.use('/api', limiter);

// Раздача файлов сайта
app.use(express.static(__dirname));

// --- 3. БАЗА ДАННЫХ (ИСПРАВЛЕННЫЙ АДРЕС) ---
// Твой новый адрес: ohmyicg. Имя пользователя: vitalikzelenkoplay_db_user
const MONGO_URI = 'mongodb+srv://vitalikzelenkoplay_db_user:Zelenko2011@cluster0.ohmyicg.mongodb.net/istore?retryWrites=true&w=majority&appName=Cluster0';

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

// Подключение с Авто-Заполнением
mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('✅ MongoDB Успешно подключена!');
        
        // Проверка и добавление товаров
        const count = await Product.countDocuments();
        if (count === 0) {
            console.log('📦 База пустая. Добавляю товары...');
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
            console.log('🚀 Товары созданы!');
        }
    })
    .catch(err => {
        console.error('❌ Ошибка БД:', err.message);
    });

// --- 4. КЛЮЧИ ---
const TG_BOT_TOKEN = '8353105063:AAGk39ebC7Z8ao7hHykiKXY3XE5tchrpT8o';

// --- 5. API ---
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (e) {
        res.status(500).json({ error: 'Server Error' });
    }
});

app.post('/api/add-product', async (req, res) => {
    try {
        const { name, price, img, specs } = req.body;
        const newProduct = new Product({ id: Date.now(), name, price, img, specs });
        await newProduct.save();
        res.json({ status: 'ok', product: newProduct });
    } catch (e) {
        res.status(500).json({ error: 'Error' });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await Product.deleteOne({ id: req.params.id });
        res.json({ status: 'deleted' });
    } catch (e) {
        res.status(500).json({ error: 'Error' });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const { cart, userId } = req.body;
        if (!cart) return res.status(400).json({ error: 'No cart' });
        const total = cart.reduce((sum, i) => sum + i.price, 0);
        const newOrder = new Order({ userId, items: cart, total });
        await newOrder.save();
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(500).json({ error: 'Error' });
    }
});

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
        
        const response = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/createInvoiceLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoicePayload)
        });
        const data = await response.json();
        if (data.ok) res.json({ url: data.result });
        else res.status(500).json({ error: 'TG Error' });
    } catch (e) {
        res.status(500).json({ error: 'Server Error' });
    }
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});