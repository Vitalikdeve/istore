const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 10000;

// --- 1. БЕЗОПАСНОСТЬ И НАСТРОЙКИ ---
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10kb' }));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    validate: { trustProxy: false } 
});
app.use('/api', limiter);
app.use(express.static(__dirname));

// --- 2. СЕКРЕТНЫЕ КЛЮЧИ (Берем из Render) ---
const MONGO_URI = process.env.MONGO_URI;
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_PAY_TOKEN = process.env.TG_PAY_TOKEN;

// Проверка: Если ключей нет, сервер не запустится (защита от ошибок)
if (!MONGO_URI || !TG_BOT_TOKEN || !TG_PAY_TOKEN) {
    console.error('❌ ОШИБКА: Не найдены переменные окружения! Добавь их в настройках Render.');
    // Мы не выключаем сервер, чтобы ты мог увидеть логи, но работать он не будет корректно без ключей
}

// --- 3. БАЗА ДАННЫХ ---
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

if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('✅ MongoDB Connected (Secure)'))
        .catch(err => console.error('❌ MongoDB Error:', err.message));
}

// --- 4. API (ТОВАРЫ И ОПЛАТА) ---

app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (e) { res.status(500).json({ error: 'DB Error' }); }
});

app.post('/api/add-product', async (req, res) => {
    try {
        const { name, price, img, specs } = req.body;
        const newProduct = new Product({ id: Date.now(), name, price, img, specs });
        await newProduct.save();
        res.json({ status: 'ok' });
    } catch (e) { res.status(500).json({ error: 'Save Error' }); }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await Product.deleteOne({ id: req.params.id });
        res.json({ status: 'deleted' });
    } catch (e) { res.status(500).json({ error: 'Delete Error' }); }
});

// ГЛАВНАЯ ФУНКЦИЯ ОПЛАТЫ
app.post('/api/create-payment-link', async (req, res) => {
    try {
        const { cart } = req.body;
        // Сумма в копейках (x100)
        const totalAmount = cart.reduce((sum, item) => sum + item.price, 0) * 100;

        const invoicePayload = {
            title: "Заказ iStore",
            description: `Оплата (${cart.length} товаров)`,
            payload: `order_${Date.now()}`,
            provider_token: TG_PAY_TOKEN, // Берем секретный токен из настроек
            currency: "RUB",
            prices: [{ label: "Сумма заказа", amount: totalAmount }]
        };
        
        const response = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/createInvoiceLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoicePayload)
        });
        
        const data = await response.json();
        
        if (data.ok) res.json({ url: data.result });
        else {
            console.error('Telegram API Error:', data);
            res.status(500).json({ error: 'TG Error' });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server Error' });
    }
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(port, () => console.log(`🚀 Server running on port ${port}`));