const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 10000;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// --- ПРОВЕРКА КЛЮЧЕЙ ПРИ ЗАПУСКЕ ---
const MONGO_URI = process.env.MONGO_URI;
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_PAY_TOKEN = process.env.TG_PAY_TOKEN;

console.log("--- ПРОВЕРКА НАСТРОЕК ---");
console.log("BOT TOKEN:", TG_BOT_TOKEN ? "Загружен (Длина: " + TG_BOT_TOKEN.length + ")" : "ОТСУТСТВУЕТ ❌");
console.log("PAY TOKEN:", TG_PAY_TOKEN ? "Загружен (Длина: " + TG_PAY_TOKEN.length + ")" : "ОТСУТСТВУЕТ ❌");
// -----------------------------------

const productSchema = new mongoose.Schema({ id: Number, name: String, price: Number, img: String, specs: String });
const Product = mongoose.model('Product', productSchema);

if (MONGO_URI) {
    mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB OK')).catch(e => console.error('❌ MongoDB Error:', e));
}

app.use(express.static(__dirname));

// API
app.get('/api/products', async (req, res) => {
    const products = await Product.find();
    res.json(products);
});

// ГЛАВНАЯ ФУНКЦИЯ ОПЛАТЫ (С ОТЛАДКОЙ)
app.post('/api/create-payment-link', async (req, res) => {
    console.log("💰 Получен запрос на оплату...");
    
    try {
        const { cart } = req.body;
        // Сумма в копейках (Telegram требует целое число!)
        const totalAmount = Math.ceil(cart.reduce((sum, item) => sum + item.price, 0) * 100);

        console.log(`🛒 Товаров: ${cart.length}, Сумма (копейки): ${totalAmount}`);

        const invoicePayload = {
            title: "Заказ iStore",
            description: `Оплата корзины`,
            payload: `order_${Date.now()}`,
            provider_token: TG_PAY_TOKEN,
            currency: "RUB",
            prices: [{ label: "Сумма заказа", amount: totalAmount }]
        };

        // Отправляем запрос
        const response = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/createInvoiceLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoicePayload)
        });

        const data = await response.json();

        // ЛОГИРУЕМ ОТВЕТ ТЕЛЕГРАМА
        if (data.ok) {
            console.log("✅ Ссылка создана:", data.result);
            res.json({ url: data.result });
        } else {
            console.error("❌ ОШИБКА ТЕЛЕГРАМ:", data);
            // Отправляем текст ошибки на фронтенд, чтобы ты увидел её в alert
            res.status(400).json({ error: data.description || "Ошибка API Telegram" });
        }

    } catch (e) {
        console.error("❌ ОШИБКА СЕРВЕРА:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(port, () => console.log(`🚀 Server on ${port}`));