import express from 'express';
import cors from 'cors';
import router from './routes';

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));
app.use(express.json());
app.use(router);

app.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    service: 'payment-service',
    event: 'server_started',
    port: PORT,
    gateway_url: process.env.GATEWAY_URL || 'http://localhost:4001',
  }));
});
