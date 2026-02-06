const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// --- ЗАЩИТА ---
app.use(helmet({ contentSecurityPolicy: false }));
// Лимит запросов (немного увеличил для админки)
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api', limiter);
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// Раздача файлов (сайт и админка)
app.use(express.static(__dirname));

// --- БАЗА ДАННЫХ ---
const MONGO_URI = 'mongodb+srv://vitalikzelenkoplay:Zelenko2011@cluster0.684a4.mongodb.net/istore?retryWrites=true&w=majority&connectTimeoutMS=30000';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err.message));

// --- СХЕМЫ ---
const productSchema = new mongoose.Schema({
    id: Number, 
    name: String,
    price: Number,
    img: String,
    specs: String
});
const Product = mongoose.model('Product', productSchema);

const orderSchema = new mongoose.Schema({
    userId: String,
    items: Array,
    total: Number,
    status: { type: String, default: 'В обработке' },
    date: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// --- КЛЮЧИ ---
const TG_BOT_TOKEN = '8353105063:AAGk39ebC7Z8ao7hHykiKXY3XE5tchrpT8o';

// --- API (ФУНКЦИОНАЛ) ---

// 1. Получить все товары
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (e) {
        res.status(500).json({ error: 'DB Error' });
    }
});

// 2. ДОБАВИТЬ ТОВАР (ДЛЯ АДМИНКИ)
app.post('/api/add-product', async (req, res) => {
    try {
        const { name, price, img, specs } = req.body;
        // Генерируем случайный ID
        const newProduct = new Product({ 
            id: Date.now(), 
            name, 
            price, 
            img, 
            specs 
        });
        await newProduct.save();
        res.json({ status: 'ok', product: newProduct });
    } catch (e) {
        res.status(500).json({ error: 'Save Error' });
    }
});

// 3. УДАЛИТЬ ТОВАР (ДЛЯ АДМИНКИ)
app.delete('/api/products/:id', async (req, res) => {
    try {
        await Product.deleteOne({ id: req.params.id });
        res.json({ status: 'deleted' });
    } catch (e) {
        res.status(500).json({ error: 'Delete Error' });
    }
});

// 4. Создать заказ
app.post('/api/orders', async (req, res) => {
    try {
        const { cart, userId } = req.body;
        if (!cart) return res.status(400).json({ error: 'No cart' });
        const total = cart.reduce((sum, i) => sum + i.price, 0);
        const newOrder = new Order({ userId, items: cart, total });
        await newOrder.save();
        res.json({ status: 'ok' });
    } catch (e) {
        res.status(500).json({ error: 'Order Error' });
    }
});

// 5. Оплата
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

// Маршрутизация (чтобы открывался сайт и админка)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ЗАПУСК
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});